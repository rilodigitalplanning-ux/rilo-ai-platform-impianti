// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/prezzarioService.ts
// CRUD for prezzarios stored in Supabase.
//
// Security model:
//   - All authenticated users: READ (SELECT)
//   - Admins only (role='admin'): INSERT, DELETE (enforced by RLS)
//
// Large prezzarios (up to 30k voci) are bulk-inserted in batches of 500
// to avoid timeouts and stay within Supabase's request size limits.
//
// NOTE: Uses SheetJS (xlsx) for Excel parsing — 100% browser-native.
// ExcelJS cannot be used for reading in the browser (Node stream deps).
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../lib/supabase';
import { parseItNumber } from '../lib/parseNumber';
import type { PrezzarioRecord, PrezzarioVoce } from '../types';

const BATCH_SIZE = 500;

// ── Column aliases for prezzario Excel/CSV parsing ────────────────────────────
// TARIFFA is the primary match key — it's what the Revit CSV references.
// We check for it FIRST before generic 'codice' names.
const TARIFFA_ALIASES   = ['tariffa', 'tariff', 'cod_tariffa', 'codicetariffa'];
const CODICE_ALIASES    = ['codice', 'cod', 'code', 'articolo', 'cod_voce', 'id_voce', 'voce_id'];
const DESC_ALIASES      = ['descrizione', 'descrizione_dell', 'descrip', 'description', 'desc', 'voce', 'lavoro', 'lavorazione'];
const VALORE_ALIASES    = ['prezzo_unitario', 'valore_unitario', 'valore', 'prezzo', 'price', 'importo', 'costo', 'euro'];
const UM_ALIASES        = ['um', 'u.m.', 'unità', 'unita', 'unit', 'udm', 'misura'];
// categoria is NOT from the prezzario — it comes from the Revit CSV export
const CATEGORIA_ALIASES = ['categoria', 'category', 'cat', 'tipo', 'capitolo', 'sezione', 'gruppo'];

function findCol(headers: string[], aliases: string[]): string | undefined {
  const lower = headers.map(h => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));
  for (const alias of aliases) {
    // Exact match first
    const exact = lower.findIndex(h => h === alias);
    if (exact >= 0) return headers[exact];
  }
  for (const alias of aliases) {
    // Partial match fallback
    const idx = lower.findIndex(h => h.includes(alias));
    if (idx >= 0) return headers[idx];
  }
  return undefined;
}

// Returns the codice column: TARIFFA takes absolute priority over generic 'codice'
function findCodiceCol(headers: string[]): string | undefined {
  return findCol(headers, TARIFFA_ALIASES) ?? findCol(headers, CODICE_ALIASES);
}

// ── Lettura delle righe di un foglio ──────────────────────────────────────────
// Due formati:
//  1) una riga per voce: tariffa, descrizione, UM e prezzo sulla stessa riga;
//  2) due righe per voce (esportazione di PriMus): la riga della tariffa ha la descrizione e prezzo/UM vuoti,
//     la riga successiva (senza tariffa) ha "euro (importo in lettere)", l'UM e il prezzo.
// Nel secondo formato le righe di titolo con rientro (senza tariffa né prezzo) danno la categoria della voce.
const isEmpty = (v: unknown) => v === '' || v == null || (typeof v === 'string' && v.trim() === '');
const isEuroLine = (v: unknown) => /^euro\s*\(/i.test(String(v ?? '').trim());

function findHeaderRow(rows: any[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const headers = (rows[i] ?? []).map(h => String(h ?? ''));
    if (findCodiceCol(headers) && findCol(headers, DESC_ALIASES) && findCol(headers, VALORE_ALIASES)) return i;
  }
  return 0;
}

export function parseSheetRows(rows: any[][]): PrezzarioVoce[] {
  if (rows.length < 2) throw new Error('Il file non contiene dati sufficienti.');

  const h = findHeaderRow(rows);
  const headers = (rows[h] as any[]).map(x => String(x ?? ''));

  // TARIFFA is the primary codice — stored as `codice` in our DB for uniform lookup
  const colCodice    = findCodiceCol(headers);
  const colDesc      = findCol(headers, DESC_ALIASES);
  const colValore    = findCol(headers, VALORE_ALIASES);
  const colUm        = findCol(headers, UM_ALIASES);
  const colCategoria = findCol(headers, CATEGORIA_ALIASES);

  if (!colCodice || !colDesc || !colValore) {
    const found = headers.filter(Boolean).join(', ');
    throw new Error(
      `Il file deve contenere le colonne: TARIFFA, DESCRIZIONE, PREZZO e UM.\nColonne trovate: ${found}`
    );
  }

  const iCod = headers.indexOf(colCodice), iDesc = headers.indexOf(colDesc), iVal = headers.indexOf(colValore);
  const iUm = colUm ? headers.indexOf(colUm) : -1, iCat = colCategoria ? headers.indexOf(colCategoria) : -1;

  const voci: PrezzarioVoce[] = [];
  const paths: string[] = [];          // categoria ricavata dai titoli, per voce
  let twoLine = 0;
  const stack: string[] = [];          // titoli correnti per livello di rientro

  for (let r = h + 1; r < rows.length; r++) {
    const row = rows[r] as any[];
    if (!row || row.every(isEmpty)) continue;

    const codice = String(row[iCod] ?? '').trim();
    if (!codice) {
      // riga di titolo: descrizione con rientro, senza prezzo e senza "euro (…)"
      const raw = String(row[iDesc] ?? '');
      if (raw.trim() && isEmpty(row[iVal]) && !isEuroLine(raw)) {
        const level = Math.round((raw.length - raw.trimStart().length) / 4);
        stack.length = Math.min(stack.length, level);
        stack[level] = raw.trim();
      }
      continue;
    }

    let valoreRaw = row[iVal];
    let um = iUm >= 0 ? String(row[iUm] ?? '').trim() : 'cad';
    if (isEmpty(valoreRaw)) {
      // formato a due righe: prezzo e UM stanno nella riga successiva, che non ha tariffa
      const next = rows[r + 1] as any[] | undefined;
      if (next && isEmpty(next[iCod]) && !isEmpty(next[iVal])) {
        valoreRaw = next[iVal];
        if (iUm >= 0 && !um) um = String(next[iUm] ?? '').trim();
        twoLine++;
      }
    }

    voci.push({
      prezzarioId: 0,
      codice,
      descrizione: String(row[iDesc] ?? '').trim(),
      valore: parseItNumber(valoreRaw, true),
      um,
      categoria: iCat >= 0 ? String(row[iCat] ?? '').trim() : '',
    });
    paths.push(stack.filter((t, i) => i > 0 && t && !/^<.*>$/.test(t)).filter((t, i, arr) => arr.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i).join(' › '));
  }

  // Categoria dai titoli: solo nel formato a due righe e se il file non ha una colonna categoria
  if (iCat < 0 && voci.length > 0 && twoLine / voci.length > 0.5) {
    voci.forEach((v, i) => { v.categoria = paths[i]; });
  }
  return voci;
}

/** Riepilogo di controllo di un prezzario letto: voci, prezzi a zero, UM e categorie mancanti */
export interface VociStats { total: number; zeroPrice: number; noUm: number; withCategoria: number }
export function summarizeVoci(voci: PrezzarioVoce[]): VociStats {
  return {
    total: voci.length,
    zeroPrice: voci.filter(v => !(v.valore > 0)).length,
    noUm: voci.filter(v => !v.um).length,
    withCategoria: voci.filter(v => !!v.categoria).length,
  };
}

// ── Parse an uploaded Excel (.xlsx/.xls) or CSV file into PrezzarioVoce[] ────
// Uses SheetJS (xlsx) — 100% browser-native, no Node.js stream dependencies.
export async function parsePrezzarioFile(file: File): Promise<PrezzarioVoce[]> {
  const buffer = await file.arrayBuffer();

  if (file.name.toLowerCase().endsWith('.csv')) {
    return parseCsvText(new TextDecoder().decode(buffer));
  }

  // SheetJS: works natively in the browser
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'array' });

  const wsName = wb.SheetNames[0];
  if (!wsName) throw new Error('Nessun foglio trovato nel file.');
  const ws = wb.Sheets[wsName];

  // Convert sheet to array of arrays (raw values)
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  return parseSheetRows(rows);
}

function parseCsvText(text: string): PrezzarioVoce[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^[\"']|[\"']$/g, ''));

  // TARIFFA takes priority as primary codice — same logic as the XLSX path
  const colCodice    = findCodiceCol(headers) ?? headers[0];
  const colDesc      = findCol(headers, DESC_ALIASES)   ?? headers[1];
  const colValore    = findCol(headers, VALORE_ALIASES) ?? headers[2];
  const colUm        = findCol(headers, UM_ALIASES);
  const colCategoria = findCol(headers, CATEGORIA_ALIASES);
  const idx = (n: string | undefined) => n ? headers.indexOf(n) : -1;

  return lines.slice(1).map(line => {
    const cells = line.split(sep).map(c => c.trim().replace(/^[\"']|[\"']$/g, ''));
    return {
      prezzarioId: 0,
      codice:      cells[idx(colCodice)]   ?? '',
      descrizione: cells[idx(colDesc)]     ?? '',
      valore:      parseItNumber(cells[idx(colValore)], true),
      um:          colUm        ? (cells[idx(colUm)]        ?? 'cad') : 'cad',
      categoria:   colCategoria ? (cells[idx(colCategoria)] ?? '')    : '',
    };
  }).filter(v => v.codice);
}

// ── Save prezzario header + voci to Supabase ──────────────────────────────────
// Voci are inserted in batches to handle up to 30k rows efficiently.
export async function savePrezzario(
  nome: string,
  voci: PrezzarioVoce[],
  userId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  // 1. Insert header row
  const { data: header, error: hErr } = await supabase
    .from('cme_prezzarios')
    .insert({ nome, total_voci: voci.length, uploaded_by: userId })
    .select('id')
    .single();

  if (hErr || !header) throw new Error(`Errore nel salvataggio del prezzario: ${hErr?.message}`);
  const prezzarioId = header.id as number;

  // 2. Bulk-insert voci in batches of BATCH_SIZE
  const rows = voci.map(v => ({
    prezzario_id: prezzarioId,
    codice:       v.codice,
    descrizione:  v.descrizione,
    valore:       v.valore,
    um:           v.um,
    categoria:    v.categoria,
  }));

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error: vErr } = await supabase.from('cme_prezzario_voci').insert(batch);
    if (vErr) {
      // Evita un prezzario "a metà": rimuove l'intestazione (le voci inserite cadono in cascata)
      await supabase.from('cme_prezzarios').delete().eq('id', prezzarioId);
      throw new Error(`Errore nell'inserimento delle voci (blocco ${Math.floor(i / BATCH_SIZE) + 1}): ${vErr.message}`);
    }
    onProgress?.(Math.min(i + BATCH_SIZE, rows.length), rows.length);
  }

  return prezzarioId;
}

// ── List all prezzarios (shared — visible to every authenticated user) ─────────
export async function listPrezzarios(): Promise<PrezzarioRecord[]> {
  const { data, error } = await supabase
    .from('cme_prezzarios')
    .select('id, nome, data_import, total_voci')
    .order('data_import', { ascending: false });

  if (error) throw new Error(`Errore nel caricamento dell'elenco prezzari: ${error.message}`);

  return (data ?? []).map(r => ({
    id:         r.id,
    nome:       r.nome,
    dataImport: r.data_import,
    totalVoci:  r.total_voci,
  }));
}

// ── Delete a prezzario and all its voci (admin only — RLS enforces) ────────────
export async function deletePrezzario(id: number): Promise<void> {
  // voci are deleted by CASCADE on the FK
  const { error } = await supabase.from('cme_prezzarios').delete().eq('id', id);
  if (error) throw new Error(`Errore nell'eliminazione del prezzario: ${error.message}`);
}

// ── Load all voci for a prezzario (paginated to handle 30k rows) ───────────────
export async function loadVoci(prezzarioId: number): Promise<PrezzarioVoce[]> {
  const PAGE = 1000;
  const all: PrezzarioVoce[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from('cme_prezzario_voci')
      .select('id, prezzario_id, codice, descrizione, valore, um, categoria')
      .eq('prezzario_id', prezzarioId)
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Errore nel caricamento delle voci: ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...data.map(r => ({
      id:          r.id,
      prezzarioId: r.prezzario_id,
      codice:      r.codice,
      descrizione: r.descrizione,
      valore:      Number(r.valore),
      um:          r.um,
      categoria:   r.categoria,
    })));

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

// ── Config: per-user key-value store (solo scrittura: la lettura passa da templateService) ──────────────────────────────────────────
export async function setConfig(userId: string, chave: string, valor: string): Promise<void> {
  await supabase
    .from('cme_config')
    .upsert({ user_id: userId, chave, valor }, { onConflict: 'user_id,chave' });
}
