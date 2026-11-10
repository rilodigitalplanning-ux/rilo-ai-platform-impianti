import { describe, it, expect } from 'vitest';
import type { ResultadoItem, SubItem } from '../types';
import { groupNvp, applyNvpToGroup } from './nvpGroups';
import { groupVoci, recomputeResult, replaceVoce, computeNvpTotal, type NvpDetails } from './pricing';

const nvp = (price: number): NvpDetails => ({
  materiali: [{ id: 'x', descrizione: 'm', um: 'cad', quantita: 1, prezzoUnitario: price }], scontoPercentuale: 0,
  manoDOpera: [], noleggi: [], trasportiPercentuale: 0, speseGeneraliPercentuale: 0, utiliPercentuale: 0, fonte: 'T',
});
const sub = (code: string, valore: number, extra: Partial<SubItem> = {}): SubItem => ({
  codiceDeiOriginal: code, descrizioneDei: 'd', codicePrezzarioTarget: code, descrizionePrezzarioTarget: `Voce ${code}`,
  confiancaMatch: 1, quantitaComposizione: 1, valoreUnitario: valore, status: 'OK', unidade: 'cad', ...extra,
});
const base = (id: string, desc: string, extra: Partial<ResultadoItem>): ResultadoItem => recomputeResult({
  idElemento: id, edificio: 'P', livello: 'C', zona: '', categoria: 'X', descrizioneElemento: desc, tipoPrezzo: '',
  quantitaElemento: 2, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK', subItems: [], ...extra,
});
const nvpEl = (id: string, code: string, desc: string, price = 100) =>
  base(id, desc, { status: 'NVP', tariffaOriginal: code, nvpDetails: nvp(price) });
const nvpSubEl = (id: string, code: string, desc: string, price = 100) =>
  base(id, desc, { subItems: [sub('A1', 10), sub(code, computeNvpTotal(nvp(price)), { status: 'NVP', nvpDetails: nvp(price) })] });

describe('NVP raggruppate per tariffa', () => {
  const data = [
    nvpEl('a', 'NVP.ELE.01', 'Sensore di presenza'),
    nvpSubEl('b', 'nvp.ele.01', 'Sensore di presenza'),   // maiuscole diverse: stessa tariffa
    nvpEl('c', 'NVP. ELE.01', 'Sensore di presenza'),    // spazio nel codice: stessa tariffa
    nvpEl('d', 'NVP.QE', 'Quadro A'),
  ];
  it('stessa tariffa (senza maiuscole e spazi) = un unico gruppo, anche tra elementi e sottovoci', () => {
    const g = groupNvp(data);
    expect(g).toHaveLength(2);
    const ele = g.find(x => x.key.includes('NVP.ELE.01'))!;
    expect(ele.entries).toHaveLength(3);
    expect(ele.conflitto).toBe(false);
    expect(ele.qty).toBe(6);
  });

  it('stessa tariffa con testi descrittivi diversi = conflitto', () => {
    const g = groupNvp([nvpEl('a', 'NVP.X', 'Quadro A'), nvpEl('b', 'NVP.X', 'Quadro B'), nvpEl('c', 'NVP.X', ' quadro   a ')]);
    expect(g).toHaveLength(1);
    expect(g[0].conflitto).toBe(true);
    expect(g[0].descrizioni).toEqual(['Quadro A', 'Quadro B']); // il confronto ignora maiuscole e spazi
  });

  it('analisi diverse tra le copie e prezzo "vari"', () => {
    const g = groupNvp([nvpEl('a', 'NVP.Y', 'T', 100), nvpEl('b', 'NVP.Y', 'T', 150)])[0];
    expect(g.analisiDiverse).toBe(true);
    expect(g.prezzo).toBeNull();
    expect(groupNvp([nvpEl('a', 'NVP.Y', 'T'), nvpEl('b', 'NVP.Y', 'T')])[0].analisiDiverse).toBe(false);
  });

  it('una correzione sul gruppo si applica a tutti gli elementi (elemento e sottovoce) e ricalcola i totali', () => {
    const items = [nvpEl('a', 'NVP.Z', 'T', 100), nvpSubEl('b', 'NVP.Z', 'T', 100)];
    const g = groupNvp(items)[0];
    const { upsert } = applyNvpToGroup(g, nvp(300), 'Fonte nuova');
    expect(upsert).toHaveLength(2);
    const a = upsert.find(r => r.idElemento === 'a')!;
    const b = upsert.find(r => r.idElemento === 'b')!;
    expect(a.valoreUnitario).toBe(300);
    expect(a.total).toBe(600);
    expect(b.subItems[1].valoreUnitario).toBe(300);
    expect(b.valoreUnitario).toBe(10 + 300);
    // dopo la correzione tutte le copie coincidono
    expect(groupNvp(upsert)[0].analisiDiverse).toBe(false);
  });

  it('un elemento con due sottovoci della stessa NVP viene aggiornato una sola volta con entrambe', () => {
    const r = base('m', 'T', { subItems: [sub('NVP.Z', 100, { status: 'NVP', nvpDetails: nvp(100) }), sub('NVP.Z', 100, { status: 'NVP', nvpDetails: nvp(100) })] });
    const { upsert } = applyNvpToGroup(groupNvp([r])[0], nvp(50), 'F');
    expect(upsert).toHaveLength(1);
    expect(upsert[0].subItems.map(s => s.valoreUnitario)).toEqual([50, 50]);
  });
});

describe('Elenco Prezzi: la tariffa identifica la voce', () => {
  it('le NVP con la stessa tariffa formano una sola riga, con conflitto se i testi differiscono', () => {
    const rows = groupVoci([nvpEl('a', 'NVP.Q', 'Quadro A'), nvpEl('b', 'NVP.Q', 'Quadro B'), nvpEl('c', 'NVP.Q', 'Quadro A')]);
    const nvpRows = rows.filter(r => r.kind === 'nvp');
    expect(nvpRows).toHaveLength(1);
    expect(nvpRows[0].nElementi).toBe(3);
    expect(nvpRows[0].conflitto).toBe(true);
  });
  it('la stessa tariffa di prezzario con descrizioni diverse segnala il conflitto', () => {
    const a = base('a', 'x', { subItems: [sub('A1', 10, { descrizionePrezzarioTarget: 'Canale 100' })] });
    const b = base('b', 'y', { subItems: [sub('A1', 10, { descrizionePrezzarioTarget: 'Canale 200' })] });
    const rows = groupVoci([a, b]).filter(r => r.kind === 'voce');
    expect(rows).toHaveLength(2);
    expect(rows.every(r => r.conflitto)).toBe(true);
    expect(groupVoci([a, a]).every(r => !r.conflitto)).toBe(true);
  });
  it('sostituire una NVP dall\'Elenco agisce su tutti gli elementi con quella tariffa', () => {
    const items = [nvpEl('a', 'NVP.Q', 'Quadro A'), nvpEl('b', 'NVP.Q', 'Quadro B')];
    const row = groupVoci(items).find(r => r.kind === 'nvp')!;
    const { upsert } = replaceVoce(items, row.key, { kind: 'voce', voce: { codice: 'B2', descrizione: 'Voce B', um: 'cad', valore: 20, prezzarioNome: 'DEI' } });
    expect(upsert).toHaveLength(2);
  });
});
