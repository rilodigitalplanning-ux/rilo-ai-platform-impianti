// Raggruppamento delle NVP per TARIFFA (Analisi Prezzi): stessa tariffa = stessa NVP, un'unica correzione
// di costo per tutti gli elementi che la usano. Una tariffa con testi descrittivi diversi è un conflitto.
import type { ResultadoItem } from '../types';
import { wbsLevels } from '../lib/wbs';
import { deepClone } from '../lib/util';
import {
  isNvpSub, normText, nvpCodeOfSub, nvpKey, updateNvpElement, updateNvpSub, type Changes, type NvpDetails,
} from './pricing';

export interface NvpEntry {
  /** idElemento oppure idElemento#indice della sottovoce */
  id: string;
  result: ResultadoItem;
  subIndex: number | null; // null = NVP dell'intero elemento
  descrizione: string;
  wbs: string[];
  qty: number;
  valoreUnitario: number;
  importo: number;
  fonte: string;
  nvpDetails?: NvpDetails;
}

export interface NvpGroup {
  key: string;
  codice: string;
  entries: NvpEntry[];
  /** Testi descrittivi distinti, con la forma originale della prima occorrenza */
  descrizioni: string[];
  /** Stessa tariffa con testi descrittivi diversi */
  conflitto: boolean;
  /** Alcuni elementi hanno un'analisi diversa dagli altri */
  analisiDiverse: boolean;
  senzaAnalisi: number;
  qty: number;
  importo: number;
  /** Prezzo unitario comune, o null se gli elementi hanno prezzi diversi */
  prezzo: number | null;
}

// Firma dell'analisi, senza gli id interni delle righe, per confrontare le copie
const signature = (d?: NvpDetails) => (d ? JSON.stringify(d, (k, v) => (k === 'id' ? undefined : v)) : '');

export function groupNvp(results: ResultadoItem[]): NvpGroup[] {
  const groups = new Map<string, NvpGroup>();
  const add = (code: string, e: NvpEntry) => {
    const key = nvpKey(code, e.result.descrizioneElemento);
    const g = groups.get(key) ?? {
      key, codice: code, entries: [], descrizioni: [], conflitto: false, analisiDiverse: false, senzaAnalisi: 0, qty: 0, importo: 0, prezzo: null,
    };
    g.entries.push(e);
    g.qty += e.qty;
    g.importo += e.importo;
    if (!g.codice && code) g.codice = code;
    if (!g.descrizioni.some(d => normText(d) === normText(e.descrizione))) g.descrizioni.push(e.descrizione);
    groups.set(key, g);
  };

  for (const r of results) {
    if (r.subItems.length === 0 && r.status === 'NVP') {
      add(r.tariffaOriginal || '', {
        id: r.idElemento, result: r, subIndex: null, descrizione: r.descrizioneElemento, wbs: wbsLevels(r),
        qty: r.quantitaElemento, valoreUnitario: r.valoreUnitario, importo: r.total, fonte: r.originePrezzo, nvpDetails: r.nvpDetails,
      });
    }
    r.subItems.forEach((s, i) => {
      if (!isNvpSub(s)) return;
      const qty = r.quantitaElemento * s.quantitaComposizione;
      add(nvpCodeOfSub(s), {
        id: `${r.idElemento}#${i}`, result: r, subIndex: i, descrizione: r.descrizioneElemento, wbs: wbsLevels(r),
        qty, valoreUnitario: s.valoreUnitario, importo: qty * s.valoreUnitario, fonte: s.prezzarioNome || '', nvpDetails: s.nvpDetails,
      });
    });
  }

  for (const g of groups.values()) {
    g.conflitto = g.descrizioni.length > 1;
    g.senzaAnalisi = g.entries.filter(e => !e.nvpDetails || e.valoreUnitario === 0).length;
    const sigs = new Set(g.entries.filter(e => e.nvpDetails).map(e => signature(e.nvpDetails)));
    g.analisiDiverse = sigs.size > 1;
    const prezzi = new Set(g.entries.map(e => Math.round(e.valoreUnitario * 100)));
    g.prezzo = prezzi.size === 1 ? g.entries[0].valoreUnitario : null;
  }
  return [...groups.values()].sort((a, b) => a.codice.localeCompare(b.codice, 'it', { numeric: true }));
}

/** Applica la stessa analisi a tutti gli elementi del gruppo (un'unica modifica, annullabile) */
export function applyNvpToGroup(group: NvpGroup, details: NvpDetails, fonte: string): Changes {
  const current = new Map<string, ResultadoItem>();
  for (const e of group.entries) {
    const r = current.get(e.result.idElemento) ?? e.result;
    current.set(
      r.idElemento,
      e.subIndex === null ? updateNvpElement(r, deepClone(details), fonte) : updateNvpSub(r, e.subIndex, deepClone(details), fonte),
    );
  }
  return { upsert: [...current.values()], remove: [] };
}

/** Analisi di partenza di un gruppo: quella più diffusa tra i suoi elementi */
export function referenceDetails(g: NvpGroup): NvpDetails | undefined {
  const counts = new Map<string, { n: number; d: NvpDetails }>();
  for (const e of g.entries) {
    if (!e.nvpDetails) continue;
    const k = signature(e.nvpDetails);
    const c = counts.get(k) ?? { n: 0, d: e.nvpDetails };
    c.n++; counts.set(k, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.d;
}

// ── Controlli di coerenza delle NVP (usati da Analisi Prezzi e prima dell'esportazione) ─────────────────
export interface NvpDuplicate { descrizione: string; gruppi: NvpGroup[] }
export interface NvpIssues {
  /** Stessa tariffa con testi descrittivi diversi */
  tariffe: NvpGroup[];
  /** Stessa descrizione con tariffe diverse (possibili duplicati da unire) */
  duplicati: NvpDuplicate[];
  /** Totale dei problemi da risolvere */
  totale: number;
}

export function nvpIssues(results: ResultadoItem[], groups: NvpGroup[] = groupNvp(results)): NvpIssues {
  const tariffe = groups.filter(g => g.conflitto);

  // stessa descrizione in gruppi con tariffe diverse; se due NVP convivono nello stesso elemento
  // (componenti diversi di una composizione) non sono duplicati
  const byText = new Map<string, { text: string; groups: NvpGroup[] }>();
  for (const g of groups) {
    for (const d of g.descrizioni) {
      const k = normText(d);
      if (!k) continue;
      const e = byText.get(k) ?? { text: d, groups: [] };
      if (!e.groups.includes(g)) e.groups.push(g);
      byText.set(k, e);
    }
  }
  const ids = (g: NvpGroup) => new Set(g.entries.map(e => e.result.idElemento));
  const duplicati: NvpDuplicate[] = [];
  for (const { text, groups: gs } of byText.values()) {
    if (gs.length < 2) continue;
    const sets = gs.map(ids);
    const apart = gs.filter((_, i) => gs.some((__, j) => j !== i && ![...sets[i]].some(id => sets[j].has(id))));
    if (apart.length >= 2) duplicati.push({ descrizione: text, gruppi: apart });
  }
  return { tariffe, duplicati, totale: tariffe.length + duplicati.length };
}

/** Righe di testo per un messaggio di conferma */
export function describeNvpIssues(issues: NvpIssues, max = 8): string[] {
  const lines = [
    ...issues.tariffe.map(g => `Tariffa ${g.codice}: ${g.descrizioni.length} testi diversi (${g.descrizioni.slice(0, 3).join(' / ')})`),
    ...issues.duplicati.map(d => `"${d.descrizione}": tariffe diverse (${d.gruppi.map(g => g.codice || '—').join(', ')})`),
  ];
  return lines.length > max ? [...lines.slice(0, max), `… e altri ${lines.length - max}`] : lines;
}
