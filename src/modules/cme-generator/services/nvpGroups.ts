// Raggruppamento delle NVP per TARIFFA (Analisi Prezzi): stessa tariffa = stessa NVP, un'unica correzione
// di costo per tutti gli elementi che la usano. Una tariffa con testi descrittivi diversi è un conflitto.
import type { ResultadoItem } from '../types';
import { wbsLevels } from '../lib/wbs';
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

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

/** Applica la stessa analisi a tutti gli elementi del gruppo (un'unica modifica, annullabile) */
export function applyNvpToGroup(group: NvpGroup, details: NvpDetails, fonte: string): Changes {
  const current = new Map<string, ResultadoItem>();
  for (const e of group.entries) {
    const r = current.get(e.result.idElemento) ?? e.result;
    current.set(
      r.idElemento,
      e.subIndex === null ? updateNvpElement(r, clone(details), fonte) : updateNvpSub(r, e.subIndex, clone(details), fonte),
    );
  }
  return { upsert: [...current.values()], remove: [] };
}
