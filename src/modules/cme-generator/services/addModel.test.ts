import { describe, it, expect } from 'vitest';
import type { Elemento, PrezzarioVoce, ResultadoItem, SubItem } from '../types';
import { buildModelResults, planModel, modelNameFromFile, modelSlug } from './addModel';
import { groupNvp, nvpIssues, describeNvpIssues } from './nvpGroups';
import { groupVoci, recomputeResult, type NvpDetails } from './pricing';
import { defaultHierarchy, resolveHierarchy, hierarchyPath } from '../lib/hierarchy';
import type { NvpAnalysis } from './cmeBuilder';

const voci: PrezzarioVoce[] = [
  { prezzarioId: 3, codice: 'A1', descrizione: 'Voce A', valore: 10, um: 'cad', categoria: 'X' },
  { prezzarioId: 3, codice: 'B2', descrizione: 'Voce B', valore: 5, um: 'cad', categoria: 'X' },
];
const nvp = (price: number): NvpDetails => ({
  materiali: [{ id: 'x', descrizione: 'm', um: 'cad', quantita: 1, prezzoUnitario: price }], scontoPercentuale: 0,
  manoDOpera: [], noleggi: [], trasportiPercentuale: 0, speseGeneraliPercentuale: 0, utiliPercentuale: 0, fonte: 'T',
});
const el = (id: string, desc: string, codes: [string, number][], qty: number, cat: string, wbs: string[] = ['Piano', 'Camera 01']): Elemento => ({
  idUnico: id, edificio: wbs[0], livello: wbs[1], zona: '', wbs, descricao: desc, tariffa: codes[0][0], quantita: qty, fatorWBS: 1, countRevit: qty,
  categoriaCme: cat, bimStatus: 'BIM ON', componenti: codes.map(([codice, fattore]) => ({ codice, fattore, isNvp: /nvp|np/i.test(codice) })),
});
const ask = (price = 100) => {
  const asked: string[] = [];
  return { asked, fn: async (p: Elemento): Promise<NvpAnalysis> => { asked.push(p.tariffa); return { valoreUnitario: price, originePrezzo: 'T', nvpDetails: nvp(price) }; } };
};

const run = (existing: ResultadoItem[], nome: string, elementos: Elemento[], a = ask(), existingModelName?: string) =>
  buildModelResults({ existing, model: { nome, elementos }, voci, prezzarioName: 'DEI', existingModelName, askNvp: a.fn });

describe('unione di più modelli', () => {
  it('nomi e id: il nome del file propone il modello e gli id sono univoci tra modelli', async () => {
    expect(modelNameFromFile('CME_FM.xlsx')).toBe('CME_FM');
    expect(modelSlug(' Luce Ordinaria ')).toBe('luce-ordinaria');
    const fm = await run([], 'FM', [el('1', 'Presa', [['A1', 1]], 2, 'FM')]);
    const luce = await run(fm.results, 'LUCE', [el('1', 'Plafoniera', [['B2', 1]], 3, 'Luce')]);
    expect(fm.results[0].idElemento).not.toBe(luce.results[0].idElemento);
    expect(luce.results[0].modello).toBe('LUCE');
    expect(luce.remove).toEqual([]);
  });

  it('i totali si sommano e le categorie nuove si integrano', async () => {
    const fm = await run([], 'FM', [el('1', 'Presa', [['A1', 1]], 2, 'Forza Motrice')]);
    const luce = await run(fm.results, 'LUCE', [el('1', 'Plafoniera', [['B2', 1]], 3, 'Illuminazione')]);
    const all = [...fm.results, ...luce.results];
    expect(all.reduce((s, r) => s + r.total, 0)).toBe(2 * 10 + 3 * 5);
    expect(new Set(all.map(r => r.categoria))).toEqual(new Set(['Forza Motrice', 'Illuminazione']));
  });

  it('NVP con tariffa già nel progetto: riusa l\'analisi, chiede solo quelle nuove', async () => {
    const a1 = ask(100);
    const fm = await run([], 'FM', [el('1', 'Sensore', [['NVP.ELE.01', 1]], 2, 'FM')], a1);
    expect(a1.asked).toEqual(['NVP.ELE.01']);
    const a2 = ask(999);
    const luce = await run(fm.results, 'LUCE', [
      el('1', 'Sensore', [['nvp.ele.01', 1]], 4, 'Luce'),          // stessa tariffa (maiuscole diverse): riusata
      el('2', 'Quadro', [['NVP.NEW', 1]], 1, 'Luce'),               // nuova: richiesta
    ], a2);
    expect(a2.asked).toEqual(['NVP.NEW']);
    expect(luce.plan.nvpRiusate).toEqual(['nvp.ele.01']);
    expect(luce.plan.nvpNuove).toEqual(['NVP.NEW']);
    const reused = luce.results.find(r => r.tariffaOriginal === 'nvp.ele.01')!;
    expect(reused.valoreUnitario).toBe(100); // prezzo dell'analisi esistente, non quello del nuovo askNvp
    // dopo l'unione le due NVP uguali formano un solo gruppo (una correzione vale per entrambe)
    const g = groupNvp([...fm.results, ...luce.results]).find(x => x.codice.toLowerCase() === 'nvp.ele.01')!;
    expect(g.entries).toHaveLength(2);
    expect(g.analisiDiverse).toBe(false);
  });

  it('lo stesso modello reimportato sostituisce i suoi elementi senza raddoppiare i totali', async () => {
    const first = await run([], 'FM', [el('1', 'Presa', [['A1', 1]], 2, 'FM'), el('2', 'Presa 2', [['A1', 1]], 1, 'FM')]);
    const plan = planModel(first.results, { nome: ' fm ', elementos: [] });
    expect(plan.daSostituire).toBe(2);
    const again = await run(first.results, 'FM', [el('1', 'Presa', [['A1', 1]], 5, 'FM')]);
    expect(again.remove.sort()).toEqual(first.results.map(r => r.idElemento).sort());
    const final = again.results; // dopo la rimozione dei vecchi
    expect(final.reduce((s, r) => s + r.total, 0)).toBe(50);
  });

  it('gli elementi senza modello (primo file) prendono il nome indicato, una sola volta', async () => {
    const legacy: ResultadoItem[] = [recomputeResult({
      idElemento: 'old', edificio: 'P', livello: 'C', zona: '', categoria: 'X', descrizioneElemento: 'Vecchio', tipoPrezzo: '',
      quantitaElemento: 1, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK',
      subItems: [{ codiceDeiOriginal: 'A1', descrizioneDei: 'd', codicePrezzarioTarget: 'A1', descrizionePrezzarioTarget: 'Voce A', confiancaMatch: 1, quantitaComposizione: 1, valoreUnitario: 10, status: 'OK' } as SubItem],
    })];
    const out = await run(legacy, 'LUCE', [el('1', 'Plafoniera', [['B2', 1]], 1, 'Luce')], ask(), 'FM');
    expect(out.retag).toHaveLength(1);
    expect(out.retag[0].modello).toBe('FM');
  });

  it('codici non trovati nel nuovo modello: NON TROVATO con la categoria della scheda', async () => {
    const out = await run([], 'FM', [el('1', 'Strano', [['ZZ9', 1]], 1, 'Cat')]);
    expect(out.nonTrovati).toBe(1);
    expect(out.results[0].categoria).toBe('Cat');
  });
});

describe('controlli sulle NVP dopo l\'unione', () => {
  const nvpEl = (id: string, code: string, desc: string, price = 100): ResultadoItem => recomputeResult({
    idElemento: id, edificio: 'P', livello: 'C', zona: '', categoria: 'X', descrizioneElemento: desc, tipoPrezzo: '',
    quantitaElemento: 1, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'NVP',
    subItems: [], tariffaOriginal: code, nvpDetails: nvp(price),
  });

  it('stessa tariffa con testi diversi (due modelli) = conflitto', () => {
    const i = nvpIssues([nvpEl('a', 'NVP.X', 'Quadro FM'), nvpEl('b', 'NVP.X', 'Quadro luce')]);
    expect(i.tariffe).toHaveLength(1);
    expect(i.totale).toBe(1);
    expect(describeNvpIssues(i)[0]).toContain('NVP.X');
  });

  it('stessa descrizione con tariffe diverse = possibile duplicato', () => {
    const i = nvpIssues([nvpEl('a', 'NVP.FM.1', 'Quadro di zona'), nvpEl('b', 'NVP.LUCE.7', 'quadro  di zona')]);
    expect(i.duplicati).toHaveLength(1);
    expect(i.duplicati[0].gruppi.map(g => g.codice).sort()).toEqual(['NVP.FM.1', 'NVP.LUCE.7']);
  });

  it('due NVP diverse nello stesso elemento (componenti di una composizione) non sono duplicati', () => {
    const sub = (code: string): SubItem => ({
      codiceDeiOriginal: code, descrizioneDei: 'd', codicePrezzarioTarget: code, descrizionePrezzarioTarget: 'x', confiancaMatch: 1,
      quantitaComposizione: 1, valoreUnitario: 50, status: 'NVP', unidade: 'cad', nvpDetails: nvp(50),
    });
    const r = recomputeResult({
      idElemento: 'm', edificio: 'P', livello: 'C', zona: '', categoria: 'X', descrizioneElemento: 'Torretta', tipoPrezzo: '',
      quantitaElemento: 1, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK', subItems: [sub('NVP.A'), sub('NVP.B')],
    });
    expect(nvpIssues([r]).totale).toBe(0);
  });

  it('un progetto pulito non ha problemi', () => {
    expect(nvpIssues([nvpEl('a', 'NVP.X', 'Quadro'), nvpEl('b', 'NVP.X', 'Quadro'), nvpEl('c', 'NVP.Y', 'Altro')]).totale).toBe(0);
    expect(groupVoci([nvpEl('a', 'NVP.X', 'Quadro')]).length).toBe(1);
  });
});

describe('il modello come livello della gerarchia', () => {
  const tagged = (id: string, modello: string): ResultadoItem => recomputeResult({
    idElemento: id, edificio: 'P', livello: 'C', zona: '', wbs: ['P', 'C'], categoria: 'EVAC', modello, descrizioneElemento: id, tipoPrezzo: '',
    quantitaElemento: 1, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK',
    subItems: [{ codiceDeiOriginal: 'A1', descrizioneDei: 'd', codicePrezzarioTarget: 'A1', descrizionePrezzarioTarget: 'v', confiancaMatch: 1, quantitaComposizione: 1, valoreUnitario: 10, status: 'OK' } as SubItem],
  });
  it('compare solo se ci sono modelli, ed è disattivato di default', () => {
    expect(defaultHierarchy([tagged('a', 'FM')]).map(i => [i.id, i.enabled])).toEqual([['modello', false], ['wbs1', true], ['wbs2', true], ['cat', true]]);
    expect(defaultHierarchy([{ ...tagged('a', ''), modello: undefined }]).some(i => i.id === 'modello')).toBe(false);
  });
  it('attivato e spostato, guida i percorsi; una configurazione salvata riceve il livello nuovo in testa', () => {
    const items = [tagged('a', 'FM')];
    const saved = [{ id: 'wbs1', label: 'Edificio', enabled: true }, { id: 'wbs2', label: 'WBS2', enabled: true }, { id: 'cat', label: 'Categoria', enabled: true }];
    const r = resolveHierarchy(saved, items);
    expect(r[0]).toMatchObject({ id: 'modello', enabled: false });
    const on = r.map(i => (i.id === 'modello' ? { ...i, enabled: true } : i));
    expect(hierarchyPath(items[0], on)).toEqual(['FM', 'P', 'C', 'EVAC']);
  });
});
