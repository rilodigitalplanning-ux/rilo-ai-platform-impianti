import { describe, it, expect } from 'vitest';
import type { ResultadoItem } from '../types';
import { filterResults, groupTotals, dimValue, sumTotal } from './dashboard';

const r = (id: string, wbs: string[], categoria: string, total: number): ResultadoItem => ({
  idElemento: id, edificio: '', livello: '', zona: '', wbs, categoria, descrizioneElemento: id, tipoPrezzo: '',
  quantitaElemento: 1, unidade: 'cad', valoreUnitario: total, total, originePrezzo: '', status: 'OK', subItems: [],
});
const data = [
  r('1', ['P', 'Camera 01'], 'EVAC', 100), r('2', ['P', 'Camera 01'], 'IRAI', 50),
  r('3', ['P', 'Camera 02'], 'EVAC', 30), r('4', ['P', 'Camera 03'], 'EVAC', 20), r('5', ['Q'], 'IRAI', 10),
];

describe('dashboard', () => {
  it('somma di due livelli WBS dentro una categoria', () => {
    const sel = { wbs2: ['Camera 01', 'Camera 02'], cat: ['EVAC'] };
    expect(sumTotal(filterResults(data, sel))).toBe(130);
  });
  it('nessuna spunta = nessun filtro; più valori della stessa dimensione = OR, dimensioni diverse = AND', () => {
    expect(filterResults(data, {})).toHaveLength(5);
    expect(filterResults(data, { cat: [] })).toHaveLength(5);
    expect(filterResults(data, { wbs2: ['Camera 01', 'Camera 03'] })).toHaveLength(3);
  });
  it('conteggi a faccette: ignora la dimensione che si sta elencando', () => {
    const sel = { cat: ['EVAC'], wbs2: ['Camera 01'] };
    const cams = groupTotals(filterResults(data, sel, 'wbs2'), 'wbs2');
    expect(cams.map(g => [g.key, g.total])).toEqual([['Camera 01', 100], ['Camera 02', 30], ['Camera 03', 20]]);
  });
  it('livello WBS mancante = "—"', () => {
    expect(dimValue(data[4], 'wbs2')).toBe('—');
    expect(groupTotals(data, 'wbs2').find(g => g.key === '—')!.total).toBe(10);
  });
});
