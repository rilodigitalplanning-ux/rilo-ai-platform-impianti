import { describe, it, expect } from 'vitest';
import { detectCmeColumns, parseCmeRows, isNvpCode, toNumber } from './cmeSheet';
import { buildResultFromComponenti, collectNvpCodes, nvpCodeKey, type NvpAnalysis } from './cmeBuilder';
import type { PrezzarioVoce } from '../types';

const H = ['RDP_WBS1', 'RDP_WBS2', 'RDP_WBS3', 'RDP_WBS4', 'CME_CATEGORIE', 'Nome Tipo',
  'CME_ELE01', 'CME_ELE02', 'CME_ELE03', 'CME_ELE04', 'CME_ELE05', 'CME_ELE06', 'CME_ELE07', 'CME_ELE08', 'CME_ELE09', 'CME_ELE10', 'Quantita', 'Unita misura'];
const row = (wbs: string[], cat: string, nome: string, ele: string[], q: unknown, um = 'UN') =>
  [...wbs, cat, nome, ...ele, ...Array(10 - ele.length).fill(''), q, um];
const ids = () => { let n = 0; return () => `id${++n}`; };

const voce = (codice: string, valore: number): PrezzarioVoce => ({ prezzarioId: 3, codice, descrizione: `d ${codice}`, valore, um: 'cad', categoria: 'Cat' });
const voci = new Map([['a1', voce('A1', 10)], ['b2', voce('B2', 5)]]);

describe('isNvpCode', () => {
  it.each(['NVP.ELE.01', 'NVP_QE_MUR', 'nvp1', 'NP_01', 'QE.NP.02', 'NP'])('%s è NVP', c => expect(isNvpCode(c)).toBe(true));
  it.each(['015002a', 'M01025b', '2225001d', 'ANPA1', ''])('%s non è NVP', c => expect(isNvpCode(c)).toBe(false));
});

describe('toNumber', () => {
  it('punto decimale del file e formato italiano', () => {
    expect(toNumber('39.39')).toBe(39.39);
    expect(toNumber(36.79)).toBe(36.79);
    expect(toNumber('1.250,00')).toBe(1250);
    expect(toNumber('', 1)).toBe(1);
  });
});

describe('parseCmeRows', () => {
  const cols = detectCmeColumns(H)!;
  it('riconosce le intestazioni', () => {
    expect(cols).toBeTruthy();
    expect(cols.ele).toHaveLength(10);
    expect(detectCmeColumns(['Descricao', 'WBSt_1', 'Count'])).toBeNull();
  });
  it('legge WBS fino a 4 livelli, categoria, quantità e composizione fino a 5 voci', () => {
    const rows = [H,
      row(['P1', 'Camera 01', '', ''], 'EVAC', 'Diffusore', ['A1', '1', 'B2', '10', 'NVP.X', '2', 'C3', '1', 'D4', '3'], 4),
      row(['P1', 'Camera 01', 'Z', 'Y'], 'IRAI', 'Altro', ['A1', ''], 39.39, 'M'),
    ];
    const { elementos, warnings } = parseCmeRows(rows, cols, 'BIM OFF', ids());
    expect(warnings).toEqual([]);
    expect(elementos).toHaveLength(2);
    const [e1, e2] = elementos;
    expect([e1.edificio, e1.livello, e1.zona, e1.wbs4]).toEqual(['P1', 'Camera 01', '', '']);
    expect([e2.zona, e2.wbs4]).toEqual(['Z', 'Y']);
    expect(e1.componenti).toHaveLength(5);
    expect(e1.componenti![2]).toEqual({ codice: 'NVP.X', fattore: 2, isNvp: true });
    expect(e1.quantita).toBe(4);
    expect(e1.categoriaCme).toBe('EVAC');
    expect(e1.bimStatus).toBe('BIM OFF');
    expect(e2.componenti![0].fattore).toBe(1); // fattore vuoto → 1
    expect(e2.quantita).toBe(39.39);
    expect(e2.unidade).toBe('M');
  });
  it('ignora righe senza codici con un avviso', () => {
    const { elementos, warnings } = parseCmeRows([H, row(['P', 'C', '', ''], 'X', 'Vuoto', [], 1)], cols, 'BIM ON', ids());
    expect(elementos).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });
});

describe('buildResultFromComponenti', () => {
  const cols = detectCmeColumns(H)!;
  const mk = (ele: string[], q: number) => parseCmeRows([H, row(['P', 'C', '', ''], 'EVAC', 'El', ele, q)], cols, 'BIM ON', ids()).elementos[0];
  const nvps = new Map<string, NvpAnalysis>([[nvpCodeKey('NVP.X'), { valoreUnitario: 100, originePrezzo: 'Prev', nvpDetails: null }]]);

  it('composizione: Σ prezzo × fattore, totale = × quantità, categoria della scheda', () => {
    const r = buildResultFromComponenti(mk(['A1', '1', 'B2', '10'], 3), voci, nvps, 'DEI');
    expect(r.status).toBe('OK');
    expect(r.valoreUnitario).toBe(60);
    expect(r.total).toBe(180);
    expect(r.categoria).toBe('EVAC');
    expect(r.subItems).toHaveLength(2);
  });
  it('codice mancante → NON TROVATO con i codici nel messaggio e categoria della scheda', () => {
    const r = buildResultFromComponenti(mk(['A1', '1', 'Z9', '1'], 2), voci, nvps, 'DEI');
    expect(r.status).toBe('NAO_ENCONTRADO');
    expect(r.notes).toContain('Z9');
    expect(r.total).toBe(0);
    expect(r.categoria).toBe('EVAC');
  });
  it('NVP da sola (fattore 1) → NVP di elemento', () => {
    const r = buildResultFromComponenti(mk(['NVP.X', '1'], 2), voci, nvps, 'DEI');
    expect(r.status).toBe('NVP');
    expect(r.subItems).toHaveLength(0);
    expect(r.valoreUnitario).toBe(100);
    expect(r.total).toBe(200);
  });
  it('NVP dentro una composizione → sottovoce NVP', () => {
    const r = buildResultFromComponenti(mk(['A1', '1', 'NVP.X', '2'], 1), voci, nvps, 'DEI');
    expect(r.subItems[1].status).toBe('NVP');
    expect(r.valoreUnitario).toBe(10 + 200);
  });
  it('raccoglie i codici NVP una volta sola', () => {
    const els = [mk(['NVP.X', '1'], 1), mk(['A1', '1', 'nvp.x', '1'], 1)];
    const c = collectNvpCodes(els);
    expect(c).toHaveLength(1);
    expect(c[0].nElementi).toBe(2);
  });
});
