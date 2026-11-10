// Lettura della scheda CME esportata da Revit:
//   RDP_WBS1..4 | CME_CATEGORIE | Nome Tipo | CME_ELE01..10 (coppie codice/fattore) | Quantita | Unita misura
import { parseItNumber } from '../lib/parseNumber';
import type { Componente, Elemento } from '../types';

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Una voce è una NVP se il codice contiene "NVP" o "NP" come sigla (es. NVP.ELE.01, NVP_QE_MUR, NP_01, QE.NP.02)
export function isNvpCode(codice: string): boolean {
  const up = codice.trim().toUpperCase();
  if (!up) return false;
  if (up.includes('NVP')) return true;
  return up.split(/[^A-Z0-9]+/).some(tok => tok === 'NP' || /^NP\d+$/.test(tok));
}

export function isBlankCell(v: unknown): boolean {
  const s = String(v ?? '').trim();
  return s === '' || s.toLowerCase() === 'nan' || s === '-';
}

// Numeri della scheda: "39.39" (punto decimale del file Revit) oppure "1.250,00" (formato italiano)
export function toNumber(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fallback;
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  const n = parseItNumber(s);
  return Number.isFinite(n) ? n : fallback;
}

export interface CmeColumns {
  wbs: number[];        // indici di RDP_WBS1..4 (-1 se assente)
  categoria: number;
  nome: number;
  ele: number[];        // indici di CME_ELE01.. in ordine
  quantita: number;
  um: number;
}

// Riconosce il formato dalle intestazioni; null se non è una scheda CME
export function detectCmeColumns(headers: unknown[]): CmeColumns | null {
  const h = headers.map(norm);
  const wbs = [1, 2, 3, 4].map(n => h.findIndex(x => x === `rdpwbs${n}` || x === `wbs${n}`));
  const eleIdx = h
    .map((x, i) => ({ m: /^cmeele(\d+)$/.exec(x), i }))
    .filter(e => e.m)
    .sort((a, b) => Number(a.m![1]) - Number(b.m![1]))
    .map(e => e.i);
  if (eleIdx.length < 2 || wbs.every(i => i === -1)) return null;
  const find = (...names: string[]) => h.findIndex(x => names.includes(x));
  return {
    wbs,
    categoria: find('cmecategorie', 'cmecategoria'),
    nome: find('nometipo', 'nome'),
    ele: eleIdx,
    quantita: find('quantita'),
    um: find('unitamisura', 'um'),
  };
}

export interface CmeParseOutput {
  elementos: Elemento[];
  warnings: string[];
}

// rows[0] = intestazioni. `nextId` genera l'id univoco di ogni elemento.
export function parseCmeRows(
  rows: unknown[][],
  cols: CmeColumns,
  bimStatus: 'BIM ON' | 'BIM OFF',
  nextId: (wbs1: string, wbs2: string, wbs3: string) => string,
  sheetName = '',
): CmeParseOutput {
  const warnings: string[] = [];
  const elementos: Elemento[] = [];
  const cell = (r: unknown[], i: number) => (i >= 0 ? r[i] : '');
  const text = (r: unknown[], i: number) => String(cell(r, i) ?? '').trim();
  const where = sheetName ? ` [${sheetName}]` : '';

  for (let ri = 1; ri < rows.length; ri++) {
    const r = rows[ri] ?? [];
    if (r.every(isBlankCell)) continue;

    const nome = text(r, cols.nome);
    const componenti: Componente[] = [];
    for (let k = 0; k + 1 < cols.ele.length + 1; k += 2) {
      const codice = text(r, cols.ele[k] ?? -1);
      if (isBlankCell(codice)) continue;
      const fRaw = cell(r, cols.ele[k + 1] ?? -1);
      componenti.push({ codice, fattore: isBlankCell(fRaw) ? 1 : toNumber(fRaw, 1), isNvp: isNvpCode(codice) });
    }
    if (componenti.length === 0) {
      warnings.push(`Riga ${ri + 1}${where}: "${nome || 'senza nome'}" senza codici in CME_ELE, ignorata.`);
      continue;
    }

    const wbs = cols.wbs.map(i => text(r, i));
    const quantita = toNumber(cell(r, cols.quantita), 0);
    if (!(quantita > 0)) warnings.push(`Riga ${ri + 1}${where}: "${nome}" con quantità non valida (${text(r, cols.quantita) || 'vuota'}).`);

    elementos.push({
      idUnico: nextId(wbs[0], wbs[1], wbs[2]),
      edificio: wbs[0],
      livello: wbs[1],
      zona: wbs[2],
      wbs4: wbs[3],
      wbs: wbs.filter(Boolean),
      descricao: nome || componenti[0].codice,
      tariffa: componenti[0].codice,
      fatorWBS: componenti[0].fattore,
      quantita,
      countRevit: quantita,
      unidade: text(r, cols.um) || undefined,
      categoriaCme: text(r, cols.categoria) || undefined,
      componenti,
      bimStatus,
    });
  }
  return { elementos, warnings };
}
