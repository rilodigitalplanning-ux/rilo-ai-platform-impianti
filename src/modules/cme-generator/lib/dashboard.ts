import type { ResultadoItem } from '../types';
import { dimensionValue, defaultLabel } from './hierarchy';

// Dimensioni di analisi del riepilogo: 'cat' (categoria) oppure 'wbs1', 'wbs2', …
export type DashDim = string;
/** Valori spuntati per dimensione; dimensione assente o vuota = nessun filtro */
export type Selection = Record<DashDim, string[]>;

const NONE = '—';

export const dimLabel = (dim: DashDim) => defaultLabel(dim);

export function dimValue(r: ResultadoItem, dim: DashDim): string {
  return dimensionValue(r, dim) || NONE;
}

/** Elementi che rispettano la selezione (opzionalmente ignorando una dimensione, per i conteggi "a faccette") */
export function filterResults(results: ResultadoItem[], sel: Selection, except?: DashDim): ResultadoItem[] {
  const active = Object.entries(sel).filter(([dim, vals]) => dim !== except && vals.length > 0);
  if (!active.length) return results;
  return results.filter(r => active.every(([dim, vals]) => vals.includes(dimValue(r, dim))));
}

export interface Group { key: string; total: number; n: number }

export function groupTotals(results: ResultadoItem[], dim: DashDim): Group[] {
  const m = new Map<string, Group>();
  for (const r of results) {
    const k = dimValue(r, dim);
    const g = m.get(k) ?? { key: k, total: 0, n: 0 };
    g.total += r.total; g.n++; m.set(k, g);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

export const sumTotal = (results: ResultadoItem[]) => results.reduce((s, r) => s + r.total, 0);
