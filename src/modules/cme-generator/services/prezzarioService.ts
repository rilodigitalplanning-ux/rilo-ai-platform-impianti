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
  if (rows.length < 2) throw new Error('Il file non contiene dati sufficienti.');

  const headers = (rows[0] as any[]).map(h => String(h ?? ''));

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

  const idxOf = (name: string) => headers.indexOf(name);
  const voci: PrezzarioVoce[] = [];

  for (let rowIdx = 1; rowIdx < rows.length; rowIdx++) {
    const row = rows[rowIdx] as any[];
    if (!row || row.every(c => c === '' || c == null)) continue;

    const codice = String(row[idxOf(colCodice)] ?? '').trim();
    if (!codice) continue;

    voci.push({
      prezzarioId: 0,
      codice,
      descrizione: String(row[idxOf(colDesc)] ?? '').trim(),
      valore: parseItNumber(row[idxOf(colValore)], true),
      um:       colUm        ? String(row[idxOf(colUm)]        ?? 'cad').trim() : 'cad',
      categoria: colCategoria ? String(row[idxOf(colCategoria)] ?? '').trim()  : '',
    });
  }

  return voci;
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
