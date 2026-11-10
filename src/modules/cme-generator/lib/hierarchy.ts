// Gerarchia di voce del progetto: elenco ordinato di "dimensioni" (livelli WBS e categoria) con un nome
// personalizzabile. L'ordine e i nomi valgono ovunque (tabella, Excel, XPWE, dashboard) e si salvano col progetto.
import type { ResultadoItem } from '../types';
import { wbsDepth, wbsLevels } from './wbs';

export interface HierarchyItem {
  /** 'wbs1', 'wbs2', … oppure 'cat' (CME_CATEGORIE) */
  id: string;
  /** Nome mostrato in tabelle e documenti (es. "Edificio" al posto di "WBS1") */
  label: string;
  /** Un livello disattivato non compare nella gerarchia */
  enabled: boolean;
}

export const CAT_ID = 'cat';
export const MODELLO_ID = 'modello';

export const defaultLabel = (id: string) => (id === CAT_ID ? 'Categoria' : id === MODELLO_ID ? 'Modello' : `WBS${id.slice(3)}`);
export const wbsLevelOf = (id: string) => (id.startsWith('wbs') ? Number(id.slice(3)) : 0);

type Dimensioned = Pick<ResultadoItem, 'wbs' | 'edificio' | 'livello' | 'zona' | 'wbs4' | 'categoria'> & { modello?: string };

/** Valore (testo) di una dimensione per un elemento; '' se manca */
export function dimensionValue(r: Dimensioned, id: string): string {
  if (id === CAT_ID) return (r.categoria || '').trim();
  if (id === MODELLO_ID) return (r.modello || '').trim();
  return wbsLevels(r)[wbsLevelOf(id) - 1] ?? '';
}

/** Gerarchia predefinita: i livelli WBS presenti nei dati, in ordine, poi la categoria */
export function defaultHierarchy(results: Dimensioned[]): HierarchyItem[] {
  const depth = wbsDepth(results);
  const hasModello = results.some(r => (r.modello || '').trim());
  // il modello (FM, LUCE…) è un livello facoltativo: esiste solo se il computo unisce più file e parte disattivato
  return [...(hasModello ? [MODELLO_ID] : []), ...Array.from({ length: depth }, (_, i) => `wbs${i + 1}`), CAT_ID]
    .map(id => ({ id, label: defaultLabel(id), enabled: id !== MODELLO_ID }));
}

/**
 * Applica la configurazione salvata ai dati correnti: conserva ordine, nomi e attivazione, toglie i livelli WBS
 * che non esistono più e aggiunge in coda (prima della categoria, se è l'ultimo) i livelli nuovi.
 */
export function resolveHierarchy(saved: HierarchyItem[] | undefined, results: Dimensioned[]): HierarchyItem[] {
  const base = defaultHierarchy(results);
  if (!saved || saved.length === 0) return base;
  const available = new Set(base.map(b => b.id));
  const kept = saved
    .filter(s => available.has(s.id))
    .map(s => ({ id: s.id, label: (s.label ?? '').trim() || defaultLabel(s.id), enabled: s.enabled !== false }));
  const have = new Set(kept.map(k => k.id));
  for (const b of base) {
    if (have.has(b.id)) continue;
    // livello WBS mancante: dopo l'ultimo WBS già presente; categoria mancante: in fondo
    const idx = b.id === CAT_ID ? kept.length : b.id === MODELLO_ID ? 0 : (() => {
      let last = -1;
      kept.forEach((k, i) => { if (k.id !== CAT_ID && wbsLevelOf(k.id) < wbsLevelOf(b.id)) last = i; });
      return last + 1;
    })();
    kept.splice(idx, 0, b);
  }
  return kept;
}

export const activeItems = (h: HierarchyItem[]) => h.filter(i => i.enabled);

/** Percorso di un elemento nell'ordine configurato (solo livelli attivi); i livelli vuoti si saltano */
export function hierarchyPath(r: Dimensioned, h: HierarchyItem[]): string[] {
  return activeItems(h).map(i => dimensionValue(r, i.id)).filter(Boolean);
}

export const labelOf = (h: HierarchyItem[], id: string) => h.find(i => i.id === id)?.label ?? defaultLabel(id);

/** Nome utilizzabile come nome di foglio Excel (max 31 caratteri, senza \ / ? * [ ] :), unico nell'elenco */
export function sheetName(label: string, used: Set<string>): string {
  const clean = label.replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || 'Foglio';
  let name = clean, n = 2;
  while (used.has(name.toLowerCase())) name = `${clean.slice(0, 26)} ${n++}`;
  used.add(name.toLowerCase());
  return name;
}
