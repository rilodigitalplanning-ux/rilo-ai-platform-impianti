// Strumenti dell'assistente IA del progetto: funzioni pure (più la ricerca nel prezzario, iniettabile)
// che operano su una copia di lavoro dei risultati. Le modifiche si applicano al computo in blocco
// solo alla fine del comando (un'unica operazione annullabile).
import type { ResultadoItem } from '../types';
import { legacyWbsFields, wbsLevels } from '../lib/wbs';
import {
  buildManualItem, deleteVoce, groupVoci, recomputeResult, replaceVoce, updateNvpElement, updateNvpSub,
  type Changes, type NvpDetails, type VoceChoice,
} from './pricing';
import type { VoceHit } from './consultaService';

/** Oltre questa soglia le operazioni distruttive richiedono la conferma dell'utente */
export const CONFIRM_THRESHOLD = 20;

export interface Filter {
  ids?: string[];
  text?: string;
  categoria?: string;
  status?: string;
  /** Percorso WBS: un elemento per livello (stringa vuota = qualsiasi valore) */
  wbs?: string[];
  codice?: string;
  nvp?: boolean;
}

export interface ToolContext {
  search: (args: { terms?: string[]; codice?: string; prezzario?: string; limit?: number }) => Promise<{ results?: VoceHit[]; error?: string }>;
}

// ── Copia di lavoro ───────────────────────────────────────────────────────────
export class Workspace {
  readonly map: Map<string, ResultadoItem>;
  private readonly original: Set<string>;
  private touched = new Set<string>();
  private removed = new Set<string>();

  constructor(results: ResultadoItem[]) {
    this.map = new Map(results.map(r => [r.idElemento, r]));
    this.original = new Set(this.map.keys());
  }
  all(): ResultadoItem[] { return [...this.map.values()]; }
  set(r: ResultadoItem) { this.map.set(r.idElemento, r); this.touched.add(r.idElemento); this.removed.delete(r.idElemento); }
  remove(id: string) { this.map.delete(id); this.touched.delete(id); if (this.original.has(id)) this.removed.add(id); }
  apply(c: Changes) { c.upsert.forEach(r => this.set(r)); c.remove.forEach(id => this.remove(id)); }
  /** Modifiche nette rispetto all'inizio del comando */
  changes(): Changes {
    return { upsert: [...this.touched].filter(id => this.map.has(id)).map(id => this.map.get(id)!), remove: [...this.removed] };
  }
  total() { return this.all().reduce((s, r) => s + r.total, 0); }
}

// ── Filtri ────────────────────────────────────────────────────────────────────
const ci = (s: unknown) => String(s ?? '').toLowerCase();
export const isNvpResult = (r: ResultadoItem) => r.status === 'NVP' || r.subItems.some(s => s.status === 'NVP');
const codesOf = (r: ResultadoItem) =>
  [r.tariffaOriginal, ...r.subItems.flatMap(s => [s.codicePrezzarioTarget, s.codiceDeiOriginal])].filter(Boolean) as string[];

export function matches(r: ResultadoItem, f: Filter | undefined): boolean {
  if (!f) return true;
  if (f.ids && !f.ids.includes(r.idElemento)) return false;
  if (f.nvp !== undefined && isNvpResult(r) !== f.nvp) return false;
  if (f.status && r.status !== f.status.toUpperCase().replace('NON TROVATO', 'NAO_ENCONTRADO')) return false;
  if (f.categoria && !ci(r.categoria).includes(ci(f.categoria))) return false;
  if (f.wbs) {
    const lv = wbsLevels(r);
    for (let i = 0; i < f.wbs.length; i++) if (f.wbs[i] && !ci(lv[i]).includes(ci(f.wbs[i]))) return false;
  }
  if (f.codice && !codesOf(r).some(c => ci(c).startsWith(ci(f.codice)))) return false;
  if (f.text) {
    const q = ci(f.text);
    if (![r.descrizioneElemento, r.tariffaOriginal, r.categoria, ...codesOf(r), ...wbsLevels(r)].some(x => ci(x).includes(q))) return false;
  }
  return true;
}

const select = (ws: Workspace, f?: Filter) => ws.all().filter(r => matches(r, f));

function replaceIn(value: string, find: string, replace: string, mode: 'exact' | 'contains' | 'prefix'): string | null {
  const v = value ?? '';
  const a = ci(v), b = ci(find);
  if (!b) return null;
  if (mode === 'exact') return a === b ? replace : null;
  if (mode === 'prefix') return a.startsWith(b) ? replace + v.slice(find.length) : null;
  const i = a.indexOf(b);
  if (i < 0) return null;
  // sostituisce tutte le occorrenze, senza distinguere maiuscole/minuscole
  return v.replace(new RegExp(find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), () => replace);
}

const compact = (r: ResultadoItem) => ({
  id: r.idElemento, descrizione: r.descrizioneElemento, wbs: wbsLevels(r), categoria: r.categoria,
  quantita: r.quantitaElemento, um: r.unidade, prezzo_unitario: r.valoreUnitario, totale: r.total,
  status: r.status, codici: [...new Set(codesOf(r))],
});

// ── Strumenti ─────────────────────────────────────────────────────────────────
type Input = Record<string, any>;
type Handler = (ws: Workspace, input: Input, ctx: ToolContext) => Promise<unknown> | unknown;

const needsConfirm = (n: number, input: Input) =>
  n > CONFIRM_THRESHOLD && input.confirmed !== true
    ? { needs_confirmation: true, affected: n, message: `L'operazione coinvolge ${n} elementi (soglia ${CONFIRM_THRESHOLD}). Chiedi conferma all'utente e, se accetta, richiama lo strumento con confirmed=true.` }
    : null;

const choiceFrom = (h: VoceHit): VoceChoice => ({
  codice: h.codice, descrizione: h.descrizione, um: h.um, valore: h.valore, categoria: h.categoria,
  prezzarioId: h.prezzarioId, prezzarioNome: h.prezzario,
});

async function lookupVoce(ctx: ToolContext, codice: string, prezzario?: string): Promise<VoceChoice> {
  const res = await ctx.search({ codice, prezzario, limit: 10 });
  if (res.error) throw new Error(res.error);
  const hits = res.results ?? [];
  const exact = hits.find(h => ci(h.codice) === ci(codice)) ?? hits[0];
  if (!exact) throw new Error(`Voce "${codice}" non trovata nei prezzari${prezzario ? ` ("${prezzario}")` : ''}.`);
  return choiceFrom(exact);
}

const HANDLERS: Record<string, Handler> = {
  find_elements(ws, i) {
    const sel = select(ws, i.filter);
    const limit = Math.min(Number(i.limit) || 30, 100);
    return { totale_elementi: sel.length, importo: Math.round(sel.reduce((s, r) => s + r.total, 0) * 100) / 100, mostrati: Math.min(limit, sel.length), elementi: sel.slice(0, limit).map(compact) };
  },

  summarize(ws, i) {
    const by = String(i.group_by || 'categoria');
    const key = (r: ResultadoItem) => {
      if (by === 'categoria') return r.categoria || '—';
      if (by === 'status') return r.status;
      const m = /^wbs(\d+)$/.exec(by);
      return m ? (wbsLevels(r)[Number(m[1]) - 1] || '—') : '—';
    };
    const g = new Map<string, { n: number; totale: number }>();
    for (const r of select(ws, i.filter)) {
      const e = g.get(key(r)) ?? { n: 0, totale: 0 };
      e.n++; e.totale += r.total; g.set(key(r), e);
    }
    return {
      raggruppato_per: by,
      gruppi: [...g.entries()].map(([gruppo, e]) => ({ gruppo, elementi: e.n, totale: Math.round(e.totale * 100) / 100 })).sort((a, b) => b.totale - a.totale).slice(0, 60),
    };
  },

  // Rinomina i codici delle NVP (elementi NVP e sottovoci NVP)
  rename_nvp_codes(ws, i) {
    const mode = (i.mode || 'prefix') as 'exact' | 'contains' | 'prefix';
    const examples: { da: string; a: string }[] = [];
    const seen = new Set<string>();
    let changed = 0;
    for (const r of select(ws, i.filter)) {
      let next = r, touched = false;
      if (r.status === 'NVP' && r.tariffaOriginal) {
        const n = replaceIn(r.tariffaOriginal, i.find, i.replace, mode);
        if (n !== null && n !== r.tariffaOriginal) {
          if (!seen.has(r.tariffaOriginal)) { seen.add(r.tariffaOriginal); examples.push({ da: r.tariffaOriginal, a: n }); }
          next = { ...next, tariffaOriginal: n }; touched = true;
        }
      }
      if (r.subItems.some(s => s.status === 'NVP')) {
        const subs = r.subItems.map(s => {
          if (s.status !== 'NVP') return s;
          const a = replaceIn(s.codiceDeiOriginal, i.find, i.replace, mode);
          const b = replaceIn(s.codicePrezzarioTarget, i.find, i.replace, mode);
          if (a === null && b === null) return s;
          touched = true;
          if (a !== null && !seen.has(s.codiceDeiOriginal)) { seen.add(s.codiceDeiOriginal); examples.push({ da: s.codiceDeiOriginal, a }); }
          return { ...s, codiceDeiOriginal: a ?? s.codiceDeiOriginal, codicePrezzarioTarget: b ?? s.codicePrezzarioTarget };
        });
        next = { ...next, subItems: subs };
      }
      if (touched) { ws.set(next); changed++; }
    }
    return { elementi_modificati: changed, esempi: examples.slice(0, 10) };
  },

  // Sostituzione di testo in descrizioni, categorie o livelli WBS
  replace_text(ws, i) {
    const field = String(i.field);
    const mode = (i.mode || 'contains') as 'exact' | 'contains' | 'prefix';
    const level = Number(i.wbs_level) || 1;
    const examples: { da: string; a: string }[] = [];
    let changed = 0;
    for (const r of select(ws, i.filter)) {
      let next: ResultadoItem | null = null;
      if (field === 'descrizione') {
        const n = replaceIn(r.descrizioneElemento, i.find, i.replace, mode);
        if (n !== null && n !== r.descrizioneElemento) { next = { ...r, descrizioneElemento: n }; examples.push({ da: r.descrizioneElemento, a: n }); }
      } else if (field === 'categoria') {
        const n = replaceIn(r.categoria, i.find, i.replace, mode);
        if (n !== null && n !== r.categoria) { next = { ...r, categoria: n }; examples.push({ da: r.categoria, a: n }); }
      } else if (field === 'wbs') {
        const lv = wbsLevels(r);
        const n = replaceIn(lv[level - 1] ?? '', i.find, i.replace, mode);
        if (n !== null && n !== lv[level - 1]) {
          const path = [...lv]; path[level - 1] = n;
          next = { ...r, wbs: path, ...legacyWbsFields(path) };
          examples.push({ da: lv[level - 1], a: n });
        }
      } else throw new Error(`Campo non supportato: ${field} (usa descrizione, categoria o wbs).`);
      if (next) { ws.set(next); changed++; }
    }
    const uniq = [...new Map(examples.map(e => [e.da, e])).values()];
    return { elementi_modificati: changed, esempi: uniq.slice(0, 10) };
  },

  set_fields(ws, i) {
    const f = i.fields ?? {};
    let changed = 0;
    for (const r of select(ws, i.filter)) {
      let next: ResultadoItem = { ...r };
      if (f.quantita !== undefined) next.quantitaElemento = Number(f.quantita);
      if (f.unita_misura !== undefined) next.unidade = String(f.unita_misura);
      if (f.categoria !== undefined) next.categoria = String(f.categoria);
      if (Array.isArray(f.wbs)) { const p = f.wbs.map(String).filter(Boolean); next = { ...next, wbs: p, ...legacyWbsFields(p) }; }
      ws.set(f.quantita !== undefined ? recomputeResult(next) : next);
      changed++;
    }
    return { elementi_modificati: changed };
  },

  set_nvp_params(ws, i) {
    const patch: Partial<NvpDetails> = {};
    if (i.spese_generali !== undefined) patch.speseGeneraliPercentuale = Number(i.spese_generali);
    if (i.utili !== undefined) patch.utiliPercentuale = Number(i.utili);
    if (i.trasporti !== undefined) patch.trasportiPercentuale = Number(i.trasporti);
    if (i.sconto_materiali !== undefined) patch.scontoPercentuale = Number(i.sconto_materiali);
    if (!Object.keys(patch).length) throw new Error('Nessun parametro NVP indicato.');
    let changed = 0, skipped = 0;
    for (const r of select(ws, { ...i.filter, nvp: true })) {
      let next = r;
      if (r.subItems.length === 0 && r.nvpDetails) next = updateNvpElement(next, { ...r.nvpDetails, ...patch }, r.nvpDetails.fonte || r.originePrezzo);
      r.subItems.forEach((s, idx) => {
        if (s.nvpDetails) next = updateNvpSub(next, idx, { ...s.nvpDetails, ...patch }, s.prezzarioNome || '');
      });
      if (next !== r) { ws.set(next); changed++; } else skipped++;
    }
    return { elementi_modificati: changed, nvp_senza_analisi_ignorate: skipped };
  },

  async replace_voce(ws, i, ctx) {
    const row = groupVoci(ws.all()).find(v => v.kind === 'voce' && ci(v.codice) === ci(i.da_codice));
    if (!row) throw new Error(`Voce "${i.da_codice}" non presente nel progetto.`);
    const voce = await lookupVoce(ctx, i.a_codice, i.prezzario);
    const ch = replaceVoce(ws.all(), row.key, { kind: 'voce', voce });
    const conf = needsConfirm(ch.upsert.length, i);
    if (conf) return conf;
    ws.apply(ch);
    return { elementi_modificati: ch.upsert.length, nuova_voce: { codice: voce.codice, descrizione: voce.descrizione, prezzo: voce.valore, prezzario: voce.prezzarioNome } };
  },

  delete_voce(ws, i) {
    const row = groupVoci(ws.all()).find(v => ci(v.codice) === ci(i.codice) && (v.kind === 'voce' || v.kind === 'nvp' || v.kind === 'nf'));
    if (!row) throw new Error(`Voce "${i.codice}" non presente nel progetto.`);
    const ch = deleteVoce(ws.all(), row.key);
    const conf = needsConfirm(ch.upsert.length + ch.remove.length, i);
    if (conf) return conf;
    ws.apply(ch);
    return { elementi_modificati: ch.upsert.length, elementi_eliminati: ch.remove.length };
  },

  delete_elements(ws, i) {
    if (!i.filter || !Object.keys(i.filter).length) throw new Error('Serve un filtro per eliminare elementi (non si elimina tutto il computo).');
    const sel = select(ws, i.filter);
    const conf = needsConfirm(sel.length, i);
    if (conf) return conf;
    sel.forEach(r => ws.remove(r.idElemento));
    return { elementi_eliminati: sel.length };
  },

  async add_element(ws, i, ctx) {
    const voce = i.codice_prezzario ? await lookupVoce(ctx, i.codice_prezzario, i.prezzario) : null;
    if (!voce) throw new Error('Indica il codice di prezzario della voce da usare.');
    const path = (Array.isArray(i.wbs) ? i.wbs : []).map(String).filter(Boolean);
    const item = buildManualItem({
      descrizione: String(i.descrizione), um: String(i.unita_misura || voce.um), quantita: Number(i.quantita) || 1,
      edificio: path[0] ?? '', livello: path[1] ?? '', zona: path[2] ?? '', replacement: { kind: 'voce', voce },
    });
    ws.set({ ...item, wbs: path.length ? path : undefined, categoria: i.categoria ? String(i.categoria) : item.categoria });
    return { aggiunto: compact(ws.map.get(item.idElemento)!) };
  },

  async search_prezzario(_ws, i, ctx) {
    const res = await ctx.search({ terms: i.terms, codice: i.codice, prezzario: i.prezzario, limit: 15 });
    return res.error ? { error: res.error } : { risultati: res.results };
  },
};

export async function runTool(name: string, input: Input, ws: Workspace, ctx: ToolContext): Promise<unknown> {
  const h = HANDLERS[name];
  if (!h) throw new Error(`Strumento sconosciuto: ${name}`);
  return h(ws, input ?? {}, ctx);
}

// ── Definizione degli strumenti per Claude ────────────────────────────────────
const FILTER_SCHEMA = {
  type: 'object',
  description: 'Filtro sugli elementi (tutti i campi opzionali, combinati in AND)',
  properties: {
    ids: { type: 'array', items: { type: 'string' } },
    text: { type: 'string', description: 'testo contenuto in descrizione, codici, categoria o WBS' },
    categoria: { type: 'string' },
    status: { type: 'string', enum: ['OK', 'NVP', 'NAO_ENCONTRADO', 'ALERT'] },
    wbs: { type: 'array', items: { type: 'string' }, description: 'valori per livello WBS1, WBS2…; "" = qualsiasi' },
    codice: { type: 'string', description: 'codice (o inizio del codice) di prezzario/NVP' },
    nvp: { type: 'boolean', description: 'true = solo elementi con NVP' },
  },
} as const;
const CONFIRMED = { type: 'boolean', description: 'true solo dopo che l\'utente ha confermato un\'operazione sopra soglia' } as const;
const MODE = { type: 'string', enum: ['prefix', 'contains', 'exact'] } as const;

export const AGENT_TOOLS = [
  { name: 'find_elements', description: 'Cerca elementi del computo con un filtro. Restituisce totale, importo e i primi elementi.', input_schema: { type: 'object', properties: { filter: FILTER_SCHEMA, limit: { type: 'number' } } } },
  { name: 'summarize', description: 'Totali raggruppati per categoria, status o livello WBS (wbs1, wbs2, …).', input_schema: { type: 'object', properties: { group_by: { type: 'string', description: 'categoria | status | wbs1 | wbs2 | wbs3 …' }, filter: FILTER_SCHEMA }, required: ['group_by'] } },
  { name: 'rename_nvp_codes', description: 'Rinomina i codici delle NVP (es. cambia il prefisso "NVP" in "NP"). Agisce solo sulle NVP.', input_schema: { type: 'object', properties: { find: { type: 'string' }, replace: { type: 'string' }, mode: MODE, filter: FILTER_SCHEMA }, required: ['find', 'replace'] } },
  { name: 'replace_text', description: 'Sostituisce testo nelle descrizioni degli elementi, nelle categorie o in un livello WBS.', input_schema: { type: 'object', properties: { field: { type: 'string', enum: ['descrizione', 'categoria', 'wbs'] }, wbs_level: { type: 'number', description: 'livello WBS (1 = WBS1) se field=wbs' }, find: { type: 'string' }, replace: { type: 'string' }, mode: MODE, filter: FILTER_SCHEMA }, required: ['field', 'find', 'replace'] } },
  { name: 'set_fields', description: 'Imposta quantità, unità di misura, categoria o percorso WBS completo sugli elementi filtrati.', input_schema: { type: 'object', properties: { filter: FILTER_SCHEMA, fields: { type: 'object', properties: { quantita: { type: 'number' }, unita_misura: { type: 'string' }, categoria: { type: 'string' }, wbs: { type: 'array', items: { type: 'string' } } } } }, required: ['fields'] } },
  { name: 'set_nvp_params', description: 'Modifica le percentuali delle analisi NVP (spese generali, utili, trasporti, sconto materiali) e ricalcola i prezzi.', input_schema: { type: 'object', properties: { filter: FILTER_SCHEMA, spese_generali: { type: 'number' }, utili: { type: 'number' }, trasporti: { type: 'number' }, sconto_materiali: { type: 'number' } } } },
  { name: 'replace_voce', description: 'Sostituisce in tutto il progetto una voce di prezzario con un\'altra (prezzo ricalcolato).', input_schema: { type: 'object', properties: { da_codice: { type: 'string' }, a_codice: { type: 'string' }, prezzario: { type: 'string', description: 'nome del prezzario di destinazione (opzionale)' }, confirmed: CONFIRMED }, required: ['da_codice', 'a_codice'] } },
  { name: 'delete_voce', description: 'Elimina una voce da tutti gli elementi che la usano (gli elementi senza più voci vengono rimossi).', input_schema: { type: 'object', properties: { codice: { type: 'string' }, confirmed: CONFIRMED }, required: ['codice'] } },
  { name: 'delete_elements', description: 'Elimina gli elementi che corrispondono al filtro (il filtro è obbligatorio).', input_schema: { type: 'object', properties: { filter: FILTER_SCHEMA, confirmed: CONFIRMED }, required: ['filter'] } },
  { name: 'add_element', description: 'Aggiunge un elemento al computo con una voce di prezzario.', input_schema: { type: 'object', properties: { descrizione: { type: 'string' }, quantita: { type: 'number' }, unita_misura: { type: 'string' }, codice_prezzario: { type: 'string' }, prezzario: { type: 'string' }, wbs: { type: 'array', items: { type: 'string' } }, categoria: { type: 'string' } }, required: ['descrizione', 'quantita', 'codice_prezzario'] } },
  { name: 'search_prezzario', description: 'Cerca voci nei prezzari caricati (per testo o codice).', input_schema: { type: 'object', properties: { terms: { type: 'array', items: { type: 'string' } }, codice: { type: 'string' }, prezzario: { type: 'string' } } } },
] as const;
