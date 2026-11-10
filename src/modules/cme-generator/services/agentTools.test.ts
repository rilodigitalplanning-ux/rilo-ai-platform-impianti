import { describe, it, expect } from 'vitest';
import type { ResultadoItem, SubItem, CmeState } from '../types';
import { Workspace, runTool, matches, CONFIRM_THRESHOLD, type ToolContext } from './agentTools';
import { cmeReducer } from '../context/CmeContext';
import { computeNvpTotal, recomputeResult, type NvpDetails } from './pricing';

const nvp: NvpDetails = {
  materiali: [{ id: '1', descrizione: 'm', um: 'cad', quantita: 1, prezzoUnitario: 100 }], scontoPercentuale: 0,
  manoDOpera: [], noleggi: [], trasportiPercentuale: 0, speseGeneraliPercentuale: 15, utiliPercentuale: 10, fonte: 'T',
};
const sub = (codice: string, valore: number, extra: Partial<SubItem> = {}): SubItem => ({
  codiceDeiOriginal: codice, descrizioneDei: 'd', codicePrezzarioTarget: codice, descrizionePrezzarioTarget: `desc ${codice}`,
  confiancaMatch: 1, quantitaComposizione: 1, valoreUnitario: valore, status: 'OK', unidade: 'cad', ...extra,
});
const res = (id: string, extra: Partial<ResultadoItem> = {}): ResultadoItem => recomputeResult({
  idElemento: id, edificio: 'Piano', livello: 'Camera 01', zona: '', categoria: 'EVAC', descrizioneElemento: `el ${id}`,
  tipoPrezzo: 'misura', quantitaElemento: 2, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK',
  subItems: [sub('A1', 10)], tariffaOriginal: 'A1', ...extra,
});
const nvpEl = (id: string, code: string) => res(id, { status: 'NVP', subItems: [], tariffaOriginal: code, nvpDetails: nvp, categoria: 'QE' });
const nvpSubEl = (id: string, code: string) => res(id, { subItems: [sub('A1', 10), sub(code, computeNvpTotal(nvp), { status: 'NVP', nvpDetails: nvp })] });

const ctx: ToolContext = {
  search: async a => ({ results: a.codice === 'B2' ? [{ prezzarioId: 1, prezzario: 'DEI', codice: 'B2', descrizione: 'Voce B', um: 'cad', valore: 20, categoria: 'X' }] : [] }),
};

describe('strumenti dell\'assistente', () => {
  it('rename_nvp_codes: cambia il prefisso delle NVP (elementi e sottovoci), non tocca le voci normali', async () => {
    const ws = new Workspace([nvpEl('a', 'NVP.ELE.01'), nvpSubEl('b', 'NVP_QE'), res('c')]);
    const out: any = await runTool('rename_nvp_codes', { find: 'NVP', replace: 'NP', mode: 'prefix' }, ws, ctx);
    expect(out.elementi_modificati).toBe(2);
    expect(ws.map.get('a')!.tariffaOriginal).toBe('NP.ELE.01');
    expect(ws.map.get('b')!.subItems[1].codiceDeiOriginal).toBe('NP_QE');
    expect(ws.map.get('b')!.subItems[0].codiceDeiOriginal).toBe('A1');
    expect(ws.changes().upsert.map(r => r.idElemento).sort()).toEqual(['a', 'b']);
  });

  it('replace_text sul livello WBS aggiorna wbs e campi storici', async () => {
    const ws = new Workspace([res('a'), res('b', { livello: 'Camera 02' })]);
    const out: any = await runTool('replace_text', { field: 'wbs', wbs_level: 2, find: 'Camera', replace: 'Stanza', mode: 'contains' }, ws, ctx);
    expect(out.elementi_modificati).toBe(2);
    expect(ws.map.get('a')!.wbs).toEqual(['Piano', 'Stanza 01']);
    expect(ws.map.get('a')!.livello).toBe('Stanza 01');
  });

  it('set_fields quantità ricalcola il totale', async () => {
    const ws = new Workspace([res('a')]);
    await runTool('set_fields', { filter: { ids: ['a'] }, fields: { quantita: 5 } }, ws, ctx);
    expect(ws.map.get('a')!.total).toBe(50);
  });

  it('set_nvp_params ricalcola le NVP (elemento e sottovoce)', async () => {
    const ws = new Workspace([nvpEl('a', 'NVP.1'), nvpSubEl('b', 'NVP.2'), res('c')]);
    const t0 = ws.total();
    const out: any = await runTool('set_nvp_params', { utili: 0, spese_generali: 0 }, ws, ctx);
    expect(out.elementi_modificati).toBe(2);
    expect(ws.map.get('a')!.valoreUnitario).toBe(100);
    expect(ws.total()).toBeLessThan(t0);
  });

  it('replace_voce usa la ricerca nel prezzario e ricalcola', async () => {
    const ws = new Workspace([res('a'), res('b')]);
    const out: any = await runTool('replace_voce', { da_codice: 'A1', a_codice: 'B2' }, ws, ctx);
    expect(out.elementi_modificati).toBe(2);
    expect(ws.map.get('a')!.total).toBe(40);
    await expect(runTool('replace_voce', { da_codice: 'B2', a_codice: 'ZZ' }, ws, ctx)).rejects.toThrow(/non trovata/);
  });

  it('delete_elements: serve il filtro; sopra soglia chiede conferma', async () => {
    const many = Array.from({ length: CONFIRM_THRESHOLD + 1 }, (_, i) => res(`e${i}`));
    const ws = new Workspace(many);
    await expect(runTool('delete_elements', { filter: {} }, ws, ctx)).rejects.toThrow();
    const r: any = await runTool('delete_elements', { filter: { categoria: 'EVAC' } }, ws, ctx);
    expect(r.needs_confirmation).toBe(true);
    expect(ws.map.size).toBe(many.length);
    const ok: any = await runTool('delete_elements', { filter: { categoria: 'EVAC' }, confirmed: true }, ws, ctx);
    expect(ok.elementi_eliminati).toBe(many.length);
    expect(ws.changes().remove).toHaveLength(many.length);
  });

  it('find_elements / summarize / filtri', async () => {
    const ws = new Workspace([res('a'), nvpEl('b', 'NVP.1')]);
    const f: any = await runTool('find_elements', { filter: { nvp: true } }, ws, ctx);
    expect(f.totale_elementi).toBe(1);
    const s: any = await runTool('summarize', { group_by: 'categoria' }, ws, ctx);
    expect(s.gruppi.map((g: any) => g.gruppo).sort()).toEqual(['EVAC', 'QE']);
    expect(matches(res('a'), { wbs: ['piano', 'camera'] })).toBe(true);
    expect(matches(res('a'), { wbs: ['', 'sala'] })).toBe(false);
  });

  it('add_element aggiunge con voce di prezzario e WBS', async () => {
    const ws = new Workspace([]);
    await runTool('add_element', { descrizione: 'Nuovo', quantita: 3, codice_prezzario: 'B2', wbs: ['P', 'C'], categoria: 'EVAC' }, ws, ctx);
    const r = ws.all()[0];
    expect(r.total).toBe(60);
    expect(r.wbs).toEqual(['P', 'C']);
    expect(r.categoria).toBe('EVAC');
  });
});

describe('annulla / ripeti', () => {
  const base = (): CmeState => ({
    elementos: [], resultados: new Map([['a', res('a')]]), overrides: new Map(), chatHistory: new Map(),
    isProcessing: false, progress: { current: 0, total: 0, message: '' }, dirty: false,
  });
  it('un comando = un annullamento; ripeti lo riapplica', () => {
    let s = base();
    const changed = { ...res('a'), quantitaElemento: 9, total: 90 };
    s = cmeReducer(s, { type: 'APPLY_AGENT_CHANGES', payload: { upsert: [changed], remove: [], label: 'x' } });
    expect(s.resultados.get('a')!.total).toBe(90);
    s = cmeReducer(s, { type: 'UNDO' });
    expect(s.resultados.get('a')!.total).toBe(20);
    expect(s.redoStack).toHaveLength(1);
    s = cmeReducer(s, { type: 'REDO' });
    expect(s.resultados.get('a')!.total).toBe(90);
    s = cmeReducer(s, { type: 'UNDO' });
    s = cmeReducer(s, { type: 'UNDO' }); // pila vuota: nessun effetto
    expect(s.resultados.get('a')!.total).toBe(20);
  });
  it('un nuovo comando svuota ripeti; le eliminazioni si annullano', () => {
    let s = base();
    s = cmeReducer(s, { type: 'APPLY_AGENT_CHANGES', payload: { upsert: [], remove: ['a'], label: 'del' } });
    expect(s.resultados.size).toBe(0);
    s = cmeReducer(s, { type: 'UNDO' });
    expect(s.resultados.size).toBe(1);
    s = cmeReducer(s, { type: 'APPLY_AGENT_CHANGES', payload: { upsert: [], remove: [], label: 'nop' } });
    expect(s.redoStack).toHaveLength(0);
  });
});

describe('gerarchia nello stato del progetto', () => {
  const base = (): CmeState => ({
    elementos: [], resultados: new Map(), overrides: new Map(), chatHistory: new Map(),
    isProcessing: false, progress: { current: 0, total: 0, message: '' }, dirty: false,
  });
  const h = [{ id: 'cat', label: 'Impianto', enabled: true }, { id: 'wbs1', label: 'Edificio', enabled: true }];
  it('si imposta, segna il progetto da salvare, si ricarica col progetto e non passa ad altri progetti', () => {
    let s = cmeReducer(base(), { type: 'SET_HIERARCHY', payload: h });
    expect(s.hierarchy).toEqual(h);
    expect(s.dirty).toBe(true);
    // un altro progetto caricato non eredita la gerarchia
    s = cmeReducer(s, { type: 'LOAD_PROJECT', payload: { id: 'p2', name: 'Altro', elementos: [], resultados: [], overrides: [] } });
    expect(s.hierarchy).toBeUndefined();
    // il progetto salvato con la sua gerarchia la ritrova
    s = cmeReducer(s, { type: 'LOAD_PROJECT', payload: { id: 'p1', name: 'Uno', elementos: [], resultados: [], overrides: [], hierarchy: h } });
    expect(s.hierarchy).toEqual(h);
    // nuovo progetto / importazione: gerarchia predefinita
    expect(cmeReducer(s, { type: 'RESET' }).hierarchy).toBeUndefined();
    expect(cmeReducer(s, { type: 'IMPORT_PROJECT', payload: { name: 'X', resultados: [] } }).hierarchy).toBeUndefined();
  });
});
