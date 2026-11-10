// Righe della tabella del computo: gruppi annidati per i livelli attivi (nell'ordine impostato nei Livelli),
// ognuno con numero di elementi e subtotale, seguiti dagli elementi.
import type { ResultadoItem } from '../types';
import { dimensionValue, type HierarchyItem } from './hierarchy';

export type LedgerRow =
  | { kind: 'group'; key: string; depth: number; label: string; level: string; count: number; total: number; open: boolean }
  | { kind: 'item'; depth: number; result: ResultadoItem };

interface Node {
  key: string;
  label: string;
  level: string;
  children: Map<string, Node>;
  items: ResultadoItem[];
  count: number;
  total: number;
}

const SEP = '\u0001';
const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

export function buildLedgerRows(results: ResultadoItem[], levels: HierarchyItem[], collapsed: Set<string>): LedgerRow[] {
  const root: Node = { key: '', label: '', level: '', children: new Map(), items: [], count: 0, total: 0 };

  for (const r of results) {
    let node = root;
    node.count++; node.total += r.total;
    for (const lv of levels) {
      const v = dimensionValue(r, lv.id);
      if (!v) continue; // i livelli vuoti si saltano
      const key = node.key + SEP + lv.id + ':' + v;
      let child = node.children.get(key);
      if (!child) {
        child = { key, label: v, level: lv.label, children: new Map(), items: [], count: 0, total: 0 };
        node.children.set(key, child);
      }
      child.count++; child.total += r.total;
      node = child;
    }
    node.items.push(r);
  }

  const rows: LedgerRow[] = [];
  const walk = (node: Node, depth: number) => {
    node.items.forEach(result => rows.push({ kind: 'item', depth, result }));
    const kids = [...node.children.values()].sort((a, b) => collator.compare(a.label, b.label));
    for (const g of kids) {
      const open = !collapsed.has(g.key);
      rows.push({ kind: 'group', key: g.key, depth, label: g.label, level: g.level, count: g.count, total: g.total, open });
      if (open) walk(g, depth + 1);
    }
  };
  walk(root, 0);
  return rows;
}

/** Chiavi di tutti i gruppi (per "comprimi tutto") */
export function allGroupKeys(results: ResultadoItem[], levels: HierarchyItem[]): string[] {
  return buildLedgerRows(results, levels, new Set()).filter(r => r.kind === 'group').map(r => (r as Extract<LedgerRow, { kind: 'group' }>).key);
}
