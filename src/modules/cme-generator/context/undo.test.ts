import { describe, it, expect } from 'vitest';
import { cmeReducer } from './CmeContext';
import type { CmeState, ResultadoItem } from '../types';

const r = (id: string, q = 1): ResultadoItem => ({
  idElemento: id, edificio: 'E', livello: 'L', zona: 'Z', categoria: 'C', descrizioneElemento: id, quantitaElemento: q,
  unidade: 'cad', tipoPrezzo: 'PREZZARIO', valoreUnitario: 10, total: 10 * q, originePrezzo: 'P', status: 'OK', subItems: [],
} as ResultadoItem);

const base = (): CmeState => ({
  elementos: [], resultados: new Map([['a', r('a')], ['b', r('b')]]), overrides: new Map(), chatHistory: new Map(),
  isProcessing: false, progress: { current: 0, total: 0, message: '' }, dirty: false,
} as CmeState);

describe('annulla / ripeti di ogni modifica', () => {
  it('cancellazione e modifica di quantità si annullano in sequenza', () => {
    let s = cmeReducer(base(), { type: 'APPLY_CHANGES', payload: { upsert: [r('a', 5)], remove: [], label: 'qta' } });
    s = cmeReducer(s, { type: 'APPLY_CHANGES', payload: { upsert: [], remove: ['b'], label: 'del' } });
    expect([...s.resultados.keys()]).toEqual(['a']);
    s = cmeReducer(s, { type: 'UNDO' });
    expect([...s.resultados.keys()].sort()).toEqual(['a', 'b']);
    expect(s.resultados.get('a')!.quantitaElemento).toBe(5);
    s = cmeReducer(s, { type: 'UNDO' });
    expect(s.resultados.get('a')!.quantitaElemento).toBe(1);
    s = cmeReducer(s, { type: 'REDO' });
    expect(s.resultados.get('a')!.quantitaElemento).toBe(5);
  });
  it('una nuova modifica svuota il ripeti', () => {
    let s = cmeReducer(base(), { type: 'APPLY_CHANGES', payload: { upsert: [], remove: ['a'] } });
    s = cmeReducer(s, { type: 'UNDO' });
    s = cmeReducer(s, { type: 'APPLY_OVERRIDE', payload: { id: 'a', changes: { quantitaElemento: 2 } } });
    expect(s.redoStack).toEqual([]);
    expect(s.undoStack).toHaveLength(1);
  });
});
