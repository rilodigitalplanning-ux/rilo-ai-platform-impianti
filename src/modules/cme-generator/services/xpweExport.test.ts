import { describe, it, expect } from 'vitest';
import fs from 'fs';
import type { ResultadoItem, SubItem } from '../types';
import { buildXpwe } from './xpweExport';
import { parseXml, parseXpwe, xpweToResults, type XNode } from './xpwe';
import { computeNvpTotal, recomputeResult, type NvpDetails } from './pricing';

const nvp: NvpDetails = {
  materiali: [{ id: '1', descrizione: 'Quadro', um: 'cadauno', quantita: 1, prezzoUnitario: 10000 }], scontoPercentuale: 0,
  manoDOpera: [{ id: '2', descrizione: 'Installatore', um: 'ora', quantita: 8, prezzoUnitario: 29.67, codice: 'M01025a', prezzario: 'DEI' }],
  noleggi: [], trasportiPercentuale: 4, speseGeneraliPercentuale: 15, utiliPercentuale: 10, fonte: 'T',
};
const sub = (codice: string, valore: number, qc = 1, extra: Partial<SubItem> = {}): SubItem => ({
  codiceDeiOriginal: codice, descrizioneDei: 'd', codicePrezzarioTarget: codice, descrizionePrezzarioTarget: `Voce ${codice} & "co" <x>`,
  confiancaMatch: 1, quantitaComposizione: qc, valoreUnitario: valore, status: 'OK', unidade: 'cad', ...extra,
});
const res = (id: string, extra: Partial<ResultadoItem> = {}): ResultadoItem => recomputeResult({
  idElemento: id, edificio: 'Piano', livello: 'Camera 01', zona: '', categoria: 'EVAC', descrizioneElemento: `Elemento ${id}`,
  tipoPrezzo: 'misura', quantitaElemento: 2, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK',
  subItems: [sub('A1', 10)], tariffaOriginal: 'A1', ...extra,
});

const items = () => [
  res('a', { subItems: [sub('A1', 10, 1), sub('B2', 5, 10)] }),                              // composizione 2 voci
  res('b', { livello: 'Camera 02', subItems: [sub('A1', 10)], quantitaElemento: 3 }),        // stessa voce, altra WBS
  res('c', { status: 'NVP', subItems: [], tariffaOriginal: 'NVP_QE', nvpDetails: nvp, categoria: 'Quadri', quantitaElemento: 1 }),
  res('d', { subItems: [sub('A1', 10), sub('NVP.X', computeNvpTotal(nvp), 1, { status: 'NVP', nvpDetails: nvp, codiceDeiOriginal: 'NVP.X' })] }),
  res('e', { status: 'NAO_ENCONTRADO', subItems: [], total: 0, valoreUnitario: 0 }),
];

describe('buildXpwe', () => {
  const out = buildXpwe(items(), { projectName: "Progetto 'Test' & C.", today: new Date(2026, 10, 10) });
  const doc = parseXpwe(out.xml);

  it('produce XML ben formato leggibile dal nostro parser', () => {
    expect(() => parseXml(out.xml)).not.toThrow();
    expect(doc.oggetto).toBe("Progetto 'Test' & C.");
    expect(out.stats.elementiSaltati).toBe(1);
    expect(out.warnings[0]).toMatch(/NON TROVATO/);
  });

  it('elenco prezzi: una voce per codice, NP con analisi e flag NP, risorse come riferimenti', () => {
    const tariffe = [...doc.ep.values()].map(e => e.tariffa);
    expect(tariffe.filter(t => t === 'A1')).toHaveLength(1);
    const np = [...doc.ep.values()].find(e => e.tariffa === 'NVP_QE')!;
    expect(np.isNp).toBe(true);
    expect(np.analisi.map(a => a.tipo)).toEqual([0, 1, 1]); // materiale, manodopera (rif.), trasporto (rif.)
    expect(doc.ep.get(np.analisi[1].idep)!.tariffa).toBe('M01025a');
    expect(np.prezzo).toBeCloseTo(computeNvpTotal(nvp), 2);
    expect(doc.ep.get(np.analisi[2].idep)!.um).toBe('%');
  });

  it('gerarchia: livelli WBS + categoria come ultimo livello', () => {
    expect(doc.superCategorie.get(1)).toBe('Piano');
    expect([...doc.categorie.values()]).toEqual(['Camera 01', 'Camera 02']);
    expect([...doc.sottoCategorie.values()]).toEqual(['EVAC', 'Quadri']);
  });

  it('composizione scomposta in voce × fattore × quantità', () => {
    const b2 = [...doc.ep.values()].find(e => e.tariffa === 'B2')!;
    const vc = doc.voci.find(v => v.idep === b2.id)!;
    expect(vc.quantita).toBe(20); // 2 elementi × fattore 10
    expect(vc.righe[0].quantita).toBe(20);
  });

  it('round trip: stesso totale (a meno dei centesimi) e stesse categorie', () => {
    const { resultados } = xpweToResults(doc);
    const original = items().filter(r => r.status !== 'NAO_ENCONTRADO').reduce((s, r) => s + r.total, 0);
    const back = resultados.reduce((s, r) => s + r.total, 0);
    expect(Math.abs(back - original)).toBeLessThan(0.5);
    expect(new Set(resultados.map(r => r.categoria))).toEqual(new Set(['EVAC', 'Quadri']));
    expect(resultados.filter(r => r.status === 'NVP').length).toBe(2); // NVP elemento + NVP in composizione
  });
});

describe('buildXpwe — gerarchie', () => {
  it('non duplica la categoria se coincide con l\'ultimo livello WBS (progetti da PriMus)', () => {
    const r = res('a', { wbs: ['Via Roma', 'Distribuzione'], categoria: 'Distribuzione' });
    const doc = parseXpwe(buildXpwe([r], { projectName: 'P' }).xml);
    expect([...doc.superCategorie.values()]).toEqual(['Via Roma']);
    expect([...doc.categorie.values()]).toEqual(['Distribuzione']);
    expect(doc.sottoCategorie.size).toBe(0);
  });
  it('oltre 3 livelli: i livelli in eccesso si fondono nel terzo, con avviso', () => {
    const r = res('a', { wbs: ['L1', 'L2', 'L3', 'L4'], categoria: 'Cat' });
    const out = buildXpwe([r], { projectName: 'P' });
    expect([...parseXpwe(out.xml).sottoCategorie.values()]).toEqual(['L3 / L4 / Cat']);
    expect(out.warnings.join(' ')).toMatch(/più di 3 livelli/);
  });
});

// Struttura: ogni percorso di tag generato deve esistere in un file reale esportato da PriMus
const REAL = 'C:/Users/r.azevedo/Desktop/teste primus.xpwe';
const paths = (n: XNode, prefix = '', acc = new Set<string>()) => {
  const p = prefix + '/' + n.name; acc.add(p); n.children.forEach(c => paths(c, p, acc)); return acc;
};
describe.skipIf(!fs.existsSync(REAL))('struttura rispetto a un XPWE reale di PriMus', () => {
  it('usa solo tag presenti nel file reale (esclusa la sottocategoria, assente nel campione)', () => {
    const real = paths(parseXml(fs.readFileSync(REAL, 'utf8')));
    const mine = paths(parseXml(buildXpwe(items(), { projectName: 'P' }).xml));
    const extra = [...mine].filter(p => !real.has(p) && !/SubCategorie/.test(p));
    expect(extra).toEqual([]);
  });
});
