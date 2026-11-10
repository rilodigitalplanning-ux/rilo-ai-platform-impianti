import type { Elemento, ResultadoItem } from '../types';

// Percorso WBS di un elemento: N livelli (non solo 4). I dati senza `wbs` (progetti salvati,
// vecchio formato) usano edificio/livello/zona/wbs4 come WBS1..WBS4.
export function wbsLevels(r: Pick<ResultadoItem, 'wbs' | 'edificio' | 'livello' | 'zona' | 'wbs4'> | Pick<Elemento, 'wbs' | 'edificio' | 'livello' | 'zona' | 'wbs4'>): string[] {
  const lv = r.wbs ?? [r.edificio, r.livello, r.zona, r.wbs4 ?? ''];
  return lv.map(s => (s ?? '').trim()).filter(Boolean);
}

// Numero di colonne WBS da mostrare/esportare (almeno 1)
export function wbsDepth(items: Parameters<typeof wbsLevels>[0][]): number {
  return Math.max(1, ...items.map(i => wbsLevels(i).length));
}

// Primi 4 livelli nei campi storici (aggregazioni per WBS1/WBS2 e template)
export function legacyWbsFields(levels: string[]) {
  return { edificio: levels[0] ?? '', livello: levels[1] ?? '', zona: levels[2] ?? '', wbs4: levels[3] ?? '' };
}
