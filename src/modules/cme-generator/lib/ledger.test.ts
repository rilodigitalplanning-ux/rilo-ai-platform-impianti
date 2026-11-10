import { describe, it, expect } from 'vitest';
import type { ResultadoItem } from '../types';
import { buildLedgerRows, allGroupKeys } from './ledger';
import type { HierarchyItem } from './hierarchy';

const r = (id: string, wbs: string[], categoria: string, total: number, modello?: string): ResultadoItem => ({
  idElemento: id, edificio: wbs[0] ?? '', livello: wbs[1] ?? '', zona: '', wbs, categoria, modello, descrizioneElemento: id, tipoPrezzo: '',
  quantitaElemento: 1, unidade: 'cad', valoreUnitario: total, total, originePrezzo: '', status: 'OK', subItems: [],
});
const levels: HierarchyItem[] = [
  { id: 'wbs1', label: 'Edificio', enabled: true },
  { id: 'wbs2', label: 'Stanza', enabled: true },
  { id: 'cat', label: 'Impianto', enabled: true },
];
const data = [
  r('a', ['P', 'Camera 02'], 'EVAC', 30),
  r('b', ['P', 'Camera 01'], 'EVAC', 100),
  r('c', ['P', 'Camera 01'], 'IRAI', 50),
  r('d', ['P', 'Camera 10'], 'EVAC', 5),
];
const groups = (rows: ReturnType<typeof buildLedgerRows>) =>
  rows.filter(x => x.kind === 'group').map(x => (x as any).label + ':' + (x as any).total + ':' + (x as any).count);

describe('righe del computo per livelli', () => {
  it('gruppi annidati con numero di elementi e subtotale, in ordine naturale', () => {
    const rows = buildLedgerRows(data, levels, new Set());
    expect(groups(rows)).toEqual([
      'P:185:4',
      'Camera 01:150:2', 'EVAC:100:1', 'IRAI:50:1',
      'Camera 02:30:1', 'EVAC:30:1',
      'Camera 10:5:1', 'EVAC:5:1',
    ]);
    // gli elementi stanno sotto il gruppo foglia, con la sua profondità
    const item = rows.find(x => x.kind === 'item' && x.result.idElemento === 'c')!;
    expect(item.depth).toBe(3);
  });

  it("l'ordine dei livelli configurato cambia l'annidamento", () => {
    const reordered = [levels[2], levels[0], levels[1]];
    const rows = buildLedgerRows(data, reordered, new Set());
    expect(groups(rows).slice(0, 3)).toEqual(['EVAC:135:3', 'P:135:3', 'Camera 01:100:1']);
    expect((rows[0] as any).level).toBe('Impianto');
  });

  it('livelli disattivati o vuoti non creano gruppi', () => {
    const rows = buildLedgerRows([...data, r('e', ['P'], '', 7)], levels.map(l => (l.id === 'wbs2' ? { ...l, enabled: false } : l)).filter(l => l.enabled), new Set());
    expect(groups(rows)[0]).toBe('P:192:5');
    const e = rows.find(x => x.kind === 'item' && x.result.idElemento === 'e')!;
    expect(e.depth).toBe(1); // elemento senza categoria: sotto "P"
  });

  it('un gruppo compresso nasconde i suoi elementi ma tiene il subtotale', () => {
    const keys = allGroupKeys(data, levels);
    const cam01 = keys.find(k => k.endsWith('Camera 01'))!;
    const rows = buildLedgerRows(data, levels, new Set([cam01]));
    expect(groups(rows)).toContain('Camera 01:150:2');
    expect(groups(rows)).not.toContain('IRAI:50:1');
    expect(rows.some(x => x.kind === 'item' && x.result.idElemento === 'b')).toBe(false);
    expect((rows.find(x => x.kind === 'group' && x.label === 'Camera 01') as any).open).toBe(false);
  });

  it('il totale dei gruppi di primo livello coincide con quello del computo', () => {
    const rows = buildLedgerRows(data, levels, new Set());
    const top = rows.filter(x => x.kind === 'group' && x.depth === 0).reduce((s, x) => s + (x as any).total, 0);
    expect(top).toBe(185);
  });
});
