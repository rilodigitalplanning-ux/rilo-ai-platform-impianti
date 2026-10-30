// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/csvParser.ts
// Parse the Revit CSV export into Elemento[]
//
// REVIT CSV SCHEMA (v1 — first test format):
//   Descricao  — element description used in the computo metrico
//   WBSt_1     — TARIFFA code (primary prezzario match key)
//   WBSt_2     — multiplicative factor for WBSt_1
//   WBSt_3     — TARIFFA code for a second computo item (optional)
//   WBSt_4     — multiplicative factor for WBSt_3 (optional)
//   WBSs_1     — building identifier
//   WBSs_2     — floor / level identifier
//   WBSs_3     — space identifier within the floor
//   Count      — element quantity
//
// One Revit row → 1 or 2 Elemento lines in the computo:
//   Line 1: tariffa = WBSt_1,  qty = Count × WBSt_2
//   Line 2: tariffa = WBSt_3,  qty = Count × WBSt_4   (only when WBSt_3 ≠ empty)
// ─────────────────────────────────────────────────────────────────────────────
import Papa from 'papaparse';
import { parseItNumber } from '../lib/parseNumber';
import type { Elemento } from '../types';

// ── Required columns ──────────────────────────────────────────────────────────
const COL_DESC    = 'Descricao';
const COL_WBSt1   = 'WBSt_1';
const COL_WBSt2   = 'WBSt_2';
const COL_WBSt3   = 'WBSt_3';
const COL_WBSt4   = 'WBSt_4';
const COL_WBSs1   = 'WBSs_1';
const COL_WBSs2   = 'WBSs_2';
const COL_WBSs3   = 'WBSs_3';
const COL_COUNT   = 'Count';
const COL_TIPO    = 'TipoPrezzo'; // optional — 'PREZZARIO' | 'NVP'

// ── Flexible column finder (case-insensitive, trims whitespace) ───────────────
function resolveCol(headers: string[], target: string): string | undefined {
  const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = cleanStr(target);
  if (!t) return undefined;

  const exact = headers.find(h => cleanStr(h) === t);
  if (exact) return exact;

  if (t.length > 2) {
    return headers.find(h => cleanStr(h).includes(t) || t.includes(cleanStr(h)));
  }
  return undefined;
}

let _counter = 0;
function makeId(edificio: string, livello: string, zona: string): string {
  _counter++;
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'X';
  return `${safe(edificio)}_${safe(livello)}_${safe(zona)}_${String(_counter).padStart(5, '0')}`;
}

function num(raw: string | undefined): number {
  if (!raw) return 0;
  return parseItNumber(raw);
}

function clean(raw: string | undefined): string {
  return raw?.trim() ?? '';
}

function isBlank(v: string | undefined): boolean {
  const s = clean(v);
  return s === '' || s.toLowerCase() === 'nan' || s === '-';
}

export interface ParseResult {
  elementos: Elemento[];
  warnings: string[];
  /** Raw column names resolved from the CSV header */
  detectedColumns: Record<string, string | undefined>;
}

export function parseRevitCsv(text: string): ParseResult {
  _counter = 0;
  const warnings: string[] = [];

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: h => h.trim(),
  });

  if (result.errors.length > 0) {
    warnings.push(...result.errors.slice(0, 5).map(e => e.message));
  }

  const headers = result.meta.fields ?? [];

  // ── Resolve every expected column ─────────────────────────────────────────
  const cDesc  = resolveCol(headers, COL_DESC);
  const cT1    = resolveCol(headers, COL_WBSt1);
  const cF1    = resolveCol(headers, COL_WBSt2);
  const cT2    = resolveCol(headers, COL_WBSt3);
  const cF2    = resolveCol(headers, COL_WBSt4);
  const cEdif  = resolveCol(headers, COL_WBSs1);
  const cLiv   = resolveCol(headers, COL_WBSs2);
  const cZona  = resolveCol(headers, COL_WBSs3);
  const cCount = resolveCol(headers, COL_COUNT);
  const cTipo  = resolveCol(headers, COL_TIPO); // optional
  const cUm    = resolveCol(headers, 'UM') ?? resolveCol(headers, 'Unidade') ?? resolveCol(headers, 'Unita') ?? resolveCol(headers, 'Unit');
  const cTipoImp = resolveCol(headers, 'Tipo di Impianti') ?? resolveCol(headers, 'Tipo di Impianto') ?? resolveCol(headers, 'TipoImpianto') ?? resolveCol(headers, 'TipoImpianti') ?? resolveCol(headers, 'Impianto') ?? resolveCol(headers, 'Impianti') ?? resolveCol(headers, 'Tipo de Instalação') ?? resolveCol(headers, 'Tipo de Instalacao');

  // ── Validate required columns ──────────────────────────────────────────────
  const missing: string[] = [];
  if (!cDesc)  missing.push(COL_DESC);
  if (!cT1)    missing.push(COL_WBSt1);
  if (!cCount) missing.push(COL_COUNT);

  if (missing.length > 0) {
    throw new Error(
      `CSV Revit: colonne obbligatorie mancanti:${missing.join(', ')}.\n` +
      `Colonne trovate: ${headers.join(', ')}`
    );
  }

  // ── Optional columns — warn if missing ────────────────────────────────────
  if (!cEdif) warnings.push('WBSs_1 (Edificio) non trovata — verrà usato "SENZA_EDIFICIO".');
  if (!cLiv)  warnings.push('WBSs_2 (Livello) non trovata — verrà usato "SENZA_PIANO".');
  if (!cZona) warnings.push('WBSs_3 (Zona) non trovata — verrà usato "SENZA_SPAZIO".');
  if (!cF1)   warnings.push('WBSt_2 (fattore 1) non trovata — fattore 1 assunto pari a 1,0.');
  if (!cT2)   warnings.push('WBSt_3 (tariffa 2) non trovata — una sola voce per riga.');

  warnings.push(
    `✓ Colonne mappate: Descrizione="${cDesc}", WBSt_1="${cT1}", Count="${cCount}", ` +
    `WBSs_1="${cEdif ?? '—'}", WBSs_2="${cLiv ?? '—'}", WBSs_3="${cZona ?? '—'}"`
  );

  const elementos: Elemento[] = [];

  for (const row of result.data) {
    const descricao = clean(row[cDesc!]);
    if (isBlank(descricao)) continue;

    const count    = num(row[cCount!]);
    const edificio = cEdif ? clean(row[cEdif]) : 'SENZA_EDIFICIO';
    const livello  = cLiv  ? clean(row[cLiv])  : 'SENZA_PIANO';
    const zona     = cZona ? clean(row[cZona]) : 'SENZA_SPAZIO';
    const unidade  = cUm   ? clean(row[cUm])   : undefined;
    const tipoImpianto = cTipoImp ? clean(row[cTipoImp]) : undefined;

    // ── Line 1: WBSt_1 × WBSt_2 × Count (Unified with composition) ───────
    const tariffa1   = cT1 ? clean(row[cT1]) : '';
    const tipoPrezzo = cTipo ? (clean(row[cTipo]).toUpperCase() || undefined) : undefined;
    if (!isBlank(tariffa1) || tipoPrezzo === 'NVP') {
      const finalTariffa = isBlank(tariffa1) && tipoPrezzo === 'NVP' ? 'NVP' : tariffa1;
      const fator1  = cF1 ? num(row[cF1]) : 1;
      const qty1    = count * (fator1 || 1);  // fator 0 treated as 1

      const tariffa2 = cT2 ? clean(row[cT2]) : '';
      const fator2  = cF2 ? num(row[cF2]) : 1;

      elementos.push({
        idUnico:     makeId(edificio, livello, zona),
        edificio,
        livello,
        zona,
        descricao,
        tariffa:     finalTariffa,
        quantita:    qty1,
        fatorWBS:    fator1,
        countRevit:  count,
        tipoPrezzo,
        tariffa2:    !isBlank(tariffa2) ? tariffa2 : undefined,
        fatorWBS2:   !isBlank(tariffa2) ? (fator2 || 1) : undefined,
        unidade,
        tipoImpianto,
      });
    } else {
      warnings.push(`Linha ignorada (WBSt_1 vazio): "${descricao}"`);
    }
  }

  return {
    elementos,
    warnings,
    detectedColumns: {
      descricao: cDesc,
      wbst1: cT1,
      wbst2: cF1,
      wbst3: cT2,
      wbst4: cF2,
      wbss1: cEdif,
      wbss2: cLiv,
      wbss3: cZona,
      count: cCount,
    },
  };
}
