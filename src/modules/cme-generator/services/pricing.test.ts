import { describe, it, expect } from 'vitest';
import type { ResultadoItem, SubItem } from '../types';
import {
  computeNvp, noleggiRows, recomputeResult, groupVoci, replaceVoce, deleteVoce, buildManualItem,
  updateNvpElement, subKey, elementKey, type NvpDetails, type VoceChoice,
} from './pricing';

const sub = (codice: string, valore: number, qc = 1, extra: Partial<SubItem> = {}): SubItem => ({
  codiceDeiOriginal: 'X', descrizioneDei: 'dei', codicePrezzarioTarget: codice,
  descrizionePrezzarioTarget: `desc ${codice}`, confiancaMatch: 0.9, quantitaComposizione: qc,
  valoreUnitario: valore, status: 'OK', unidade: 'm', ...extra,
});

const res = (id: string, subs: SubItem[], qty: number, extra: Partial<ResultadoItem> = {}): ResultadoItem => ({
  idElemento: id, edificio: 'E1', livello: 'L1', zona: 'Z1', categoria: 'Cavi', descrizioneElemento: `el ${id}`,
  tipoPrezzo: 'PREZZARIO', quantitaElemento: qty, unidade: 'm', valoreUnitario: 0, total: 0,
  originePrezzo: 'DEI 2025', status: 'OK', subItems: subs, ...extra,
});

const nvp: NvpDetails = {
  materiali: [{ id: '1', descrizione: 'm', um: 'cad', quantita: 2, prezzoUnitario: 50 }],
  scontoPercentuale: 10,
  manoDOpera: [{ id: '1', descrizione: 'op', um: 'ora', quantita: 2, prezzoUnitario: 28 }],
  noleggi: 10, trasportiPercentuale: 3, speseGeneraliPercentuale: 15, utiliPercentuale: 10, fonte: 'Preventivo',
};

const voceB: VoceChoice = { codice: 'B.1', descrizione: 'Voce B', um: 'cad', valore: 20, prezzarioNome: 'Regione 2024', prezzarioId: 7 };

describe('computeNvp', () => {
  it('replica la formula del modale (A scontato + B + C + D, poi SG e utili)', () => {
    const r = computeNvp(nvp);
    const A = 100, scont = 90, B = 56, C = 10, D = 2.7;
    const E = scont + B + C + D; // 158.7
    const F = E * 0.15;
    const G = (E + F) * 0.10;
    expect(r.totaleA).toBeCloseTo(A);
    expect(r.totaleE).toBeCloseTo(E);
    expect(r.totaleFinale).toBeCloseTo(E + F + G);
  });
});

describe('noleggi dal prezzario', () => {
  it('somma le righe di noleggio (quantità × prezzo del prezzario)', () => {
    const r = computeNvp({
      ...nvp,
      noleggi: [
        { id: 'a', descrizione: 'Autocarro', um: 'ora', quantita: 2, prezzoUnitario: 45, codice: 'N.01', prezzario: 'DEI' },
        { id: 'b', descrizione: 'Piattaforma', um: 'giorno', quantita: 1, prezzoUnitario: 120 },
      ],
    });
    expect(r.totaleC).toBe(210);
  });
  it('NVP salvate con noleggi numerico restano valide e diventano una riga', () => {
    expect(computeNvp(nvp).totaleC).toBe(10);
    const rows = noleggiRows(nvp);
    expect(rows).toHaveLength(1);
    expect(rows[0].prezzoUnitario).toBe(10);
    expect(noleggiRows({ ...nvp, noleggi: 0 })).toEqual([]);
  });
});

describe('recomputeResult', () => {
  it('ricalcola da sottovoci e fattori di composizione', () => {
    const r = recomputeResult(res('a', [sub('A', 10, 2), sub('B', 5, 1)], 3));
    expect(r.valoreUnitario).toBe(25);
    expect(r.total).toBe(75);
  });
  it('NVP senza sottovoci: usa nvpDetails', () => {
    const r = recomputeResult(res('n', [], 4, { status: 'NVP', nvpDetails: nvp }));
    expect(r.valoreUnitario).toBeCloseTo(computeNvp(nvp).totaleFinale);
    expect(r.total).toBeCloseTo(r.valoreUnitario * 4, 1);
  });
});

describe('groupVoci', () => {
  it('un elemento composito contribuisce a due voci con importo per voce', () => {
    const rows = groupVoci([
      res('a', [sub('A', 10), sub('B', 5)], 2),
      res('b', [sub('A', 10)], 3),
    ]);
    const a = rows.find(r => r.codice === 'A')!;
    expect(a.nElementi).toBe(2);
    expect(a.quantita).toBe(5);
    expect(a.importo).toBe(50);
    expect(rows.find(r => r.codice === 'B')!.importo).toBe(10);
  });
  it('NVP con stessa tariffa e descrizione si raggruppano in una riga', () => {
    const rows = groupVoci([
      res('n1', [], 1, { status: 'NVP', valoreUnitario: 100, total: 100, tariffaOriginal: 'T' }),
      res('n2', [], 2, { status: 'NVP', valoreUnitario: 100, total: 200, tariffaOriginal: 'T', descrizioneElemento: 'el n1' }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('nvp');
    expect(rows[0].nElementi).toBe(2);
    expect(rows[0].importo).toBe(300);
  });
});

describe('replaceVoce', () => {
  it('sostituisce una voce in tutti gli elementi e ricalcola i totali', () => {
    const a = res('a', [sub('A', 10), sub('C', 4)], 2);
    const b = res('b', [sub('A', 10)], 3);
    const c = res('c', [sub('Z', 1)], 1);
    const key = subKey(a, a.subItems[0]);
    const { upsert, remove } = replaceVoce([a, b, c], key, { kind: 'voce', voce: voceB });
    expect(remove).toHaveLength(0);
    expect(upsert.map(r => r.idElemento).sort()).toEqual(['a', 'b']);
    const ua = upsert.find(r => r.idElemento === 'a')!;
    expect(ua.valoreUnitario).toBe(24); // 20 + 4
    expect(ua.total).toBe(48);
    expect(ua.subItems[0].prezzarioNome).toBe('Regione 2024');
    expect(upsert.find(r => r.idElemento === 'b')!.originePrezzo).toBe('Regione 2024');
  });

  it('NVP su elemento con una sola voce: l\'elemento diventa NVP e il totale è coerente', () => {
    const b = res('b', [sub('A', 10, 2)], 3); // qty effettiva 6
    const key = subKey(b, b.subItems[0]);
    const { upsert } = replaceVoce([b], key, { kind: 'nvp', valoreUnitario: 0, fonte: 'Prev.', nvpDetails: nvp });
    const n = upsert[0];
    expect(n.status).toBe('NVP');
    expect(n.subItems).toHaveLength(0);
    expect(n.quantitaElemento).toBe(6);
    expect(n.total).toBeCloseTo(computeNvp(nvp).totaleFinale * 6, 1);
  });

  it('NVP su una sottovoce di un elemento composito: resta sottovoce NVP', () => {
    const a = res('a', [sub('A', 10), sub('C', 4)], 1);
    const { upsert } = replaceVoce([a], subKey(a, a.subItems[0]), { kind: 'nvp', valoreUnitario: 0, fonte: 'P', nvpDetails: nvp });
    expect(upsert[0].subItems[0].nvpDetails).toBeTruthy();
    expect(upsert[0].subItems[1].codicePrezzarioTarget).toBe('C');
    expect(upsert[0].valoreUnitario).toBeCloseTo(computeNvp(nvp).totaleFinale + 4, 4);
  });

  it('una NVP sostituita con una voce di prezzario torna a elemento standard', () => {
    const n = recomputeResult(res('n', [], 2, { status: 'NVP', nvpDetails: nvp, tariffaOriginal: 'T', categoria: 'NVP' }));
    const { upsert } = replaceVoce([n], elementKey(n), { kind: 'voce', voce: voceB });
    expect(upsert[0].status).toBe('OK');
    expect(upsert[0].nvpDetails).toBeUndefined();
    expect(upsert[0].total).toBe(40);
    expect(upsert[0].categoria).toBe('Generale');
  });
});

describe('deleteVoce', () => {
  it('toglie la sottovoce e ricalcola; elimina l\'elemento se resta senza voci', () => {
    const a = res('a', [sub('A', 10), sub('C', 4)], 2);
    const b = res('b', [sub('A', 10)], 3);
    const { upsert, remove } = deleteVoce([a, b], subKey(a, a.subItems[0]));
    expect(remove).toEqual(['b']);
    expect(upsert).toHaveLength(1);
    expect(upsert[0].total).toBe(8);
  });
});

describe('buildManualItem / updateNvpElement', () => {
  it('crea un elemento manuale con voce di prezzario', () => {
    const m = buildManualItem({ descrizione: 'Nuovo', um: 'cad', quantita: 5, edificio: '', livello: '', zona: '', replacement: { kind: 'voce', voce: voceB } });
    expect(m.idElemento.startsWith('MAN_')).toBe(true);
    expect(m.total).toBe(100);
    expect(m.edificio).toBe('Generale');
  });
  it('aggiorna l\'analisi di una NVP e il totale', () => {
    const n = recomputeResult(res('n', [], 2, { status: 'NVP', nvpDetails: nvp }));
    const u = updateNvpElement(n, { ...nvp, noleggi: 110 }, 'Nuova fonte');
    expect(u.valoreUnitario).toBeGreaterThan(n.valoreUnitario);
    expect(u.originePrezzo).toBe('Nuova fonte');
  });
});

describe('risorse (manodopera/noleggi dal prezzario) in Elenco Prezzi', () => {
  const mo = { id: 'm', descrizione: 'Operaio specializzato', um: 'ora', quantita: 2, prezzoUnitario: 30, codice: 'MO.1', prezzario: 'DEI' };
  const withRes: NvpDetails = { ...nvp, manoDOpera: [mo, { id: 'x', descrizione: 'manuale', um: 'ora', quantita: 1, prezzoUnitario: 20 }], noleggi: [] };
  const mk = (id: string, qty: number) => recomputeResult(res(id, [], qty, { status: 'NVP', nvpDetails: withRes }));

  it('aggrega per codice+prezzario e ignora le righe manuali', () => {
    const rows = groupVoci([mk('a', 3), mk('b', 2)]).filter(r => r.kind === 'risorsa');
    expect(rows).toHaveLength(1);
    expect(rows[0].tipoRisorsa).toBe('Manodopera');
    expect(rows[0].quantita).toBe(10); // 2 × (3+2)
    expect(rows[0].importo).toBe(300);
    expect(rows[0].nElementi).toBe(2);
  });

  it('sostituzione aggiorna la riga e ricalcola il totale della NVP', () => {
    const a = mk('a', 1);
    const key = groupVoci([a]).find(r => r.kind === 'risorsa')!.key;
    const { upsert } = replaceVoce([a], key, { kind: 'voce', voce: { ...voceB, codice: 'MO.2', valore: 50 } });
    expect(upsert[0].nvpDetails!.manoDOpera[0].codice).toBe('MO.2');
    expect(upsert[0].valoreUnitario).toBeGreaterThan(a.valoreUnitario);
  });

  it('eliminazione rimuove la riga dall\'analisi', () => {
    const a = mk('a', 1);
    const key = groupVoci([a]).find(r => r.kind === 'risorsa')!.key;
    const { upsert } = deleteVoce([a], key);
    expect(upsert[0].nvpDetails!.manoDOpera).toHaveLength(1);
    expect(upsert[0].valoreUnitario).toBeLessThan(a.valoreUnitario);
  });
});
