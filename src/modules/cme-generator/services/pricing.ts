// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cme-generator/services/pricing.ts
// Funzioni pure per i prezzi del progetto in corso: analisi NVP, ricalcolo dei
// totali, raggruppamento per voce (Elenco Prezzi) e sostituzione/eliminazione
// di una voce in tutto il progetto.
//
// Invariante da mantenere (gli export Excel e le viste leggono `total` memorizzato):
//   valoreUnitario = Σ sottovoce.valoreUnitario × sottovoce.quantitaComposizione
//   total          = round2(valoreUnitario × quantitaElemento)
// Le NVP "di elemento" non hanno sottovoci: valoreUnitario = totale dell'analisi.
// ─────────────────────────────────────────────────────────────────────────────
import type { ResultadoItem, SubItem } from '../types';

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ── Analisi NVP ───────────────────────────────────────────────────────────────
export interface NvpRow {
  id: string;
  descrizione: string;
  um: string;
  quantita: number;
  prezzoUnitario: number;
  /** Se la riga proviene da una voce di prezzario: codice e nome del prezzario */
  codice?: string;
  prezzario?: string;
}

export interface NvpDetails {
  materiali: NvpRow[];
  scontoPercentuale: number;
  manoDOpera: NvpRow[];
  /** Righe di noleggio (dal prezzario); le NVP salvate in passato hanno un solo importo numerico */
  noleggi: NvpRow[] | number;
  trasportiPercentuale: number;
  speseGeneraliPercentuale: number;
  utiliPercentuale: number;
  fonte: string;
}

export interface NvpBreakdown {
  totaleA: number;         // materiali
  totaleScontato: number;  // materiali scontati
  totaleB: number;         // manodopera
  totaleC: number;         // noleggi
  totaleD: number;         // trasporti
  totaleE: number;         // totale costo
  totaleF: number;         // spese generali
  totaleG: number;         // utili d'impresa
  totaleFinale: number;
}

export function computeNvp(d: Partial<NvpDetails>): NvpBreakdown {
  const totaleA = (d.materiali ?? []).reduce((s, m) => s + m.quantita * m.prezzoUnitario, 0);
  const totaleScontato = totaleA * (1 - (d.scontoPercentuale ?? 0) / 100);
  const totaleB = (d.manoDOpera ?? []).reduce((s, m) => s + m.quantita * m.prezzoUnitario, 0);
  const totaleC = Array.isArray(d.noleggi)
    ? d.noleggi.reduce((s, m) => s + m.quantita * m.prezzoUnitario, 0)
    : (d.noleggi ?? 0);
  const totaleD = totaleScontato * ((d.trasportiPercentuale ?? 0) / 100);
  const totaleE = totaleScontato + totaleB + totaleC + totaleD;
  const totaleF = totaleE * ((d.speseGeneraliPercentuale ?? 0) / 100);
  const totaleG = (totaleE + totaleF) * ((d.utiliPercentuale ?? 0) / 100);
  return { totaleA, totaleScontato, totaleB, totaleC, totaleD, totaleE, totaleF, totaleG, totaleFinale: totaleE + totaleF + totaleG };
}

// Normalizza i noleggi di NVP salvate in passato (importo unico) in una riga
export function noleggiRows(d: Partial<NvpDetails> | undefined | null): NvpRow[] {
  const n = d?.noleggi;
  if (Array.isArray(n)) return n;
  if (typeof n === 'number' && n > 0) {
    return [{ id: 'legacy', descrizione: 'Noleggi', um: 'cad', quantita: 1, prezzoUnitario: n }];
  }
  return [];
}

export const computeNvpTotal = (d: Partial<NvpDetails>) => computeNvp(d).totaleFinale;

// ── Ricalcolo del risultato ───────────────────────────────────────────────────
export function recomputeResult(r: ResultadoItem): ResultadoItem {
  let valoreUnitario = r.valoreUnitario;
  if (r.subItems.length > 0) {
    valoreUnitario = r.subItems.reduce((s, sub) => s + sub.valoreUnitario * sub.quantitaComposizione, 0);
  } else if (r.nvpDetails) {
    valoreUnitario = computeNvpTotal(r.nvpDetails);
  }
  return { ...r, valoreUnitario, total: round2(valoreUnitario * r.quantitaElemento) };
}

// ── Raggruppamento per voce (Elenco Prezzi) ───────────────────────────────────
export type VoceRowKind = 'voce' | 'nvp' | 'nf' | 'risorsa';

export interface VoceRow {
  key: string;
  kind: VoceRowKind;
  codice: string;
  descrizione: string;
  um: string;
  prezzario: string;
  nElementi: number;
  quantita: number;
  valoreUnitario: number;
  importo: number;
  elementIds: string[];
  /** Solo per kind 'risorsa': manodopera o noleggio preso dal prezzario dentro un'analisi NVP */
  tipoRisorsa?: RisorsaTipo;
  /** Testi descrittivi distinti (normalizzati per il confronto) con cui compare la stessa tariffa */
  descrizioni: string[];
  /** Stessa tariffa con testi descrittivi diversi: la tariffa deve essere univoca */
  conflitto?: boolean;
}

export type RisorsaTipo = 'Manodopera' | 'Noleggio';

const prezzarioOf = (r: ResultadoItem, sub: SubItem) => sub.prezzarioNome || r.originePrezzo || '';

// La TARIFFA (codice di prezzario o NVP) identifica la voce: stessa tariffa = stessa voce, anche con
// testi descrittivi diversi (in quel caso si segnala un conflitto). Confronto senza maiuscole né spazi.
export const normTariffa = (code: string | undefined | null) => String(code ?? '').toUpperCase().replace(/\s+/g, '');
export const normText = (t: string | undefined | null) => String(t ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export const isNvpSub = (sub: SubItem) => sub.status === 'NVP' || !!sub.nvpDetails;
/** Tariffa NVP di una sottovoce (dopo una conversione in NVP il codice originale resta in codiceDeiOriginal) */
export const nvpCodeOfSub = (sub: SubItem) =>
  sub.codicePrezzarioTarget && sub.codicePrezzarioTarget !== 'NVP' ? sub.codicePrezzarioTarget : (sub.codiceDeiOriginal || '');
/** Chiave di una NVP; senza tariffa si ripiega sulla descrizione */
export const nvpKey = (code: string | undefined | null, fallbackText: string) =>
  `N|${normTariffa(code) || '~' + normText(fallbackText)}`;

export const subKey = (r: ResultadoItem, sub: SubItem) =>
  isNvpSub(sub) ? nvpKey(nvpCodeOfSub(sub), r.descrizioneElemento)
    : `V|${normTariffa(sub.codicePrezzarioTarget)}|${normText(sub.descrizionePrezzarioTarget)}|${prezzarioOf(r, sub)}`;

export const elementKey = (r: ResultadoItem) =>
  r.status === 'NVP' ? nvpKey(r.tariffaOriginal, r.descrizioneElemento) : `F|${r.tariffaOriginal || ''}|${r.descrizioneElemento}`;

// ── Risorse (manodopera / noleggi dal prezzario) dentro le analisi NVP ─────────
export const risorsaKey = (tipo: RisorsaTipo, codice: string, prezzario?: string) => `R|${tipo}|${codice}|${prezzario ?? ''}`;
export const isRisorsaKey = (key: string) => key.startsWith('R|');

// Analisi NVP di un risultato (di elemento o di sottovoce) con la quantità a cui si applica
function nvpSources(r: ResultadoItem): { details: NvpDetails; qty: number }[] {
  const out: { details: NvpDetails; qty: number }[] = [];
  if (r.subItems.length === 0 && r.nvpDetails) out.push({ details: r.nvpDetails, qty: r.quantitaElemento });
  for (const s of r.subItems) {
    if (s.nvpDetails) out.push({ details: s.nvpDetails, qty: r.quantitaElemento * s.quantitaComposizione });
  }
  return out;
}

function risorseOf(d: NvpDetails): [RisorsaTipo, NvpRow[]][] {
  return [
    ['Manodopera', d.manoDOpera ?? []],
    ['Noleggio', Array.isArray(d.noleggi) ? d.noleggi : []],
  ];
}

export function groupVoci(results: ResultadoItem[]): VoceRow[] {
  const map = new Map<string, VoceRow>();
  const touch = (key: string, init: () => VoceRow, id: string, qty: number, amount: number, text = '') => {
    const row = map.get(key) ?? init();
    row.quantita += qty;
    row.importo += amount;
    const t = normText(text);
    if (t && !row.descrizioni.includes(t)) row.descrizioni.push(t);
    if (!row.elementIds.includes(id)) { row.elementIds.push(id); row.nElementi++; }
    map.set(key, row);
  };

  for (const r of results) {
    if (r.subItems.length > 0) {
      for (const sub of r.subItems) {
        const qty = r.quantitaElemento * sub.quantitaComposizione;
        touch(
          subKey(r, sub),
          () => ({
            key: subKey(r, sub),
            kind: isNvpSub(sub) ? 'nvp' : 'voce',
            codice: isNvpSub(sub) ? nvpCodeOfSub(sub) : sub.codicePrezzarioTarget,
            descrizione: sub.descrizionePrezzarioTarget || sub.descrizioneDei,
            um: sub.unidade || r.unidade,
            prezzario: prezzarioOf(r, sub),
            nElementi: 0, quantita: 0, valoreUnitario: sub.valoreUnitario, importo: 0, elementIds: [], descrizioni: [],
          }),
          r.idElemento, qty, qty * sub.valoreUnitario,
          isNvpSub(sub) ? r.descrizioneElemento : (sub.descrizionePrezzarioTarget || sub.descrizioneDei),
        );
      }
    } else {
      const isNvp = r.status === 'NVP';
      touch(
        elementKey(r),
        () => ({
          key: elementKey(r),
          kind: isNvp ? 'nvp' : 'nf',
          codice: r.tariffaOriginal || '',
          descrizione: r.descrizioneElemento,
          um: r.unidade,
          prezzario: isNvp ? 'NVP' : r.originePrezzo,
          nElementi: 0, quantita: 0, valoreUnitario: r.valoreUnitario, importo: 0, elementIds: [], descrizioni: [],
        }),
        r.idElemento, r.quantitaElemento, r.total, r.descrizioneElemento,
      );
    }
  }
  // Voci di manodopera/noleggio scelte dal prezzario nelle analisi NVP. Il loro importo è già
  // compreso nel prezzo delle NVP: sono informative e non vanno sommate al totale del computo.
  for (const r of results) {
    for (const src of nvpSources(r)) {
      for (const [tipo, rows] of risorseOf(src.details)) {
        for (const row of rows) {
          if (!row.codice) continue; // righe inserite a mano: nessuna voce di prezzario
          const key = risorsaKey(tipo, row.codice, row.prezzario);
          const qty = row.quantita * src.qty;
          touch(
            key,
            () => ({
              key, kind: 'risorsa', tipoRisorsa: tipo, codice: row.codice!, descrizione: row.descrizione, um: row.um,
              prezzario: row.prezzario ?? '', nElementi: 0, quantita: 0, valoreUnitario: row.prezzoUnitario, importo: 0, elementIds: [], descrizioni: [],
            }),
            r.idElemento, qty, qty * row.prezzoUnitario,
          );
        }
      }
    }
  }
  const rows = [...map.values()];
  // Tariffa univoca: la stessa tariffa con testi descrittivi diversi è un conflitto da segnalare
  const byCode = new Map<string, VoceRow[]>();
  for (const row of rows) {
    if (row.kind !== 'voce' && row.kind !== 'nvp') continue;
    const k = normTariffa(row.codice);
    if (!k) continue;
    byCode.set(k, [...(byCode.get(k) ?? []), row]);
  }
  for (const group of byCode.values()) {
    const texts = new Set(group.flatMap(r => r.descrizioni));
    if (texts.size > 1) group.forEach(r => { r.conflitto = true; });
  }
  return rows;
}

// ── Sostituzione / eliminazione di una voce in tutto il progetto ──────────────
export interface VoceChoice {
  codice: string;
  descrizione: string;
  um: string;
  valore: number;
  categoria?: string;
  prezzarioId?: number;
  prezzarioNome: string;
}

export type Replacement =
  | { kind: 'voce'; voce: VoceChoice }
  | { kind: 'nvp'; valoreUnitario: number; fonte: string; nvpDetails: NvpDetails };

export interface Changes {
  upsert: ResultadoItem[];
  remove: string[];
}

const subFromVoce = (base: Partial<SubItem>, v: VoceChoice): SubItem => ({
  codiceDeiOriginal: base.codiceDeiOriginal ?? '',
  descrizioneDei: base.descrizioneDei ?? '',
  codicePrezzarioTarget: v.codice,
  descrizionePrezzarioTarget: v.descrizione,
  confiancaMatch: 1,
  quantitaComposizione: base.quantitaComposizione ?? 1,
  valoreUnitario: v.valore,
  status: 'OK',
  unidade: v.um,
  prezzarioId: v.prezzarioId,
  prezzarioNome: v.prezzarioNome,
});

// Converte un elemento senza sottovoci (NVP / non trovato / manuale) secondo la sostituzione
function convertElement(r: ResultadoItem, rep: Replacement): ResultadoItem {
  if (rep.kind === 'voce') {
    const v = rep.voce;
    return recomputeResult({
      ...r,
      categoria: v.categoria || (r.categoria === 'NVP' ? 'Generale' : r.categoria) || 'Generale',
      tipoPrezzo: 'PREZZARIO',
      unidade: v.um || r.unidade,
      originePrezzo: v.prezzarioNome,
      status: 'OK',
      nvpDetails: undefined,
      subItems: [subFromVoce({ codiceDeiOriginal: r.tariffaOriginal || '', descrizioneDei: r.descrizioneElemento }, v)],
    });
  }
  return recomputeResult({
    ...r,
    categoria: 'NVP',
    tipoPrezzo: 'NVP',
    originePrezzo: rep.fonte || 'Analisi Prezzo NVP',
    status: 'NVP',
    subItems: [],
    nvpDetails: rep.nvpDetails,
    valoreUnitario: rep.valoreUnitario,
  });
}

function deriveStatus(subs: SubItem[]): ResultadoItem['status'] {
  if (subs.some(s => s.status === 'NAO_ENCONTRADO')) return 'NAO_ENCONTRADO';
  if (subs.some(s => s.status === 'ALERT')) return 'ALERT';
  return 'OK';
}

function replaceInResult(r: ResultadoItem, key: string, rep: Replacement): ResultadoItem | null {
  if (r.subItems.length === 0) {
    return elementKey(r) === key ? convertElement(r, rep) : null;
  }

  const matching = r.subItems.filter(s => subKey(r, s) === key);
  if (matching.length === 0) return null;

  // NVP su un elemento con una sola voce: l'intero elemento diventa NVP
  // (la quantità incorpora il fattore di composizione, così il totale non cambia di scala).
  if (rep.kind === 'nvp' && r.subItems.length === 1) {
    return convertElement({ ...r, quantitaElemento: r.quantitaElemento * r.subItems[0].quantitaComposizione, subItems: [] }, rep);
  }

  const subs = r.subItems.map(s => {
    if (subKey(r, s) !== key) return s;
    if (rep.kind === 'voce') return subFromVoce(s, rep.voce);
    return {
      ...s,
      codicePrezzarioTarget: 'NVP',
      descrizionePrezzarioTarget: s.descrizionePrezzarioTarget || s.descrizioneDei,
      confiancaMatch: 1,
      valoreUnitario: computeNvpTotal(rep.nvpDetails),
      status: 'NVP' as const,
      prezzarioNome: rep.fonte || 'Analisi Prezzo NVP',
      nvpDetails: rep.nvpDetails,
    };
  });
  const onlyOne = r.subItems.length === 1 && rep.kind === 'voce';
  return recomputeResult({
    ...r,
    subItems: subs,
    status: deriveStatus(subs),
    originePrezzo: onlyOne ? rep.voce.prezzarioNome : r.originePrezzo,
    categoria: onlyOne && rep.voce.categoria ? rep.voce.categoria : r.categoria,
  });
}

// Applica una modifica (o rimozione, se fn ritorna null) alle righe di manodopera/noleggio con la chiave data
function risorsaChanges(results: ResultadoItem[], key: string, fn: (row: NvpRow) => NvpRow | null): Changes {
  const mapDetails = (d: NvpDetails): NvpDetails | null => {
    let changed = false;
    const apply = (tipo: RisorsaTipo, rows: NvpRow[]) => rows.flatMap(row => {
      if (row.codice && risorsaKey(tipo, row.codice, row.prezzario) === key) {
        changed = true;
        const n = fn(row);
        return n ? [n] : [];
      }
      return [row];
    });
    const manoDOpera = apply('Manodopera', d.manoDOpera ?? []);
    const noleggi = Array.isArray(d.noleggi) ? apply('Noleggio', d.noleggi) : d.noleggi;
    return changed ? { ...d, manoDOpera, noleggi } : null;
  };

  const upsert: ResultadoItem[] = [];
  for (const r of results) {
    let next = r;
    let changed = false;
    if (r.subItems.length === 0 && r.nvpDetails) {
      const d = mapDetails(r.nvpDetails);
      if (d) { next = { ...next, nvpDetails: d }; changed = true; }
    }
    if (r.subItems.some(s => s.nvpDetails)) {
      const subs = r.subItems.map(s => {
        if (!s.nvpDetails) return s;
        const d = mapDetails(s.nvpDetails);
        if (!d) return s;
        changed = true;
        return { ...s, nvpDetails: d, valoreUnitario: computeNvpTotal(d) };
      });
      next = { ...next, subItems: subs };
    }
    if (changed) upsert.push(recomputeResult(next));
  }
  return { upsert, remove: [] };
}

export function replaceVoce(results: ResultadoItem[], key: string, rep: Replacement): Changes {
  if (isRisorsaKey(key)) {
    if (rep.kind !== 'voce') return { upsert: [], remove: [] };
    const v = rep.voce;
    return risorsaChanges(results, key, row => ({
      ...row, descrizione: v.descrizione, um: v.um, prezzoUnitario: v.valore, codice: v.codice, prezzario: v.prezzarioNome,
    }));
  }
  const upsert: ResultadoItem[] = [];
  for (const r of results) {
    const next = replaceInResult(r, key, rep);
    if (next) upsert.push(next);
  }
  return { upsert, remove: [] };
}

export function deleteVoce(results: ResultadoItem[], key: string): Changes {
  if (isRisorsaKey(key)) return risorsaChanges(results, key, () => null);
  const upsert: ResultadoItem[] = [];
  const remove: string[] = [];
  for (const r of results) {
    if (r.subItems.length === 0) {
      if (elementKey(r) === key) remove.push(r.idElemento);
      continue;
    }
    const remaining = r.subItems.filter(s => subKey(r, s) !== key);
    if (remaining.length === r.subItems.length) continue;
    if (remaining.length === 0) remove.push(r.idElemento);
    else upsert.push(recomputeResult({ ...r, subItems: remaining, status: deriveStatus(remaining) }));
  }
  return { upsert, remove };
}

// ── Aggiornamento dell'analisi di una NVP (Analisi Prezzi) ────────────────────
export function updateNvpElement(r: ResultadoItem, nvpDetails: NvpDetails, fonte: string): ResultadoItem {
  return recomputeResult({
    ...r,
    nvpDetails,
    originePrezzo: fonte || 'Analisi Prezzo NVP',
    valoreUnitario: computeNvpTotal(nvpDetails),
  });
}

export function updateNvpSub(r: ResultadoItem, subIndex: number, nvpDetails: NvpDetails, fonte: string): ResultadoItem {
  const subs = r.subItems.map((s, i) => i === subIndex
    ? { ...s, nvpDetails, prezzarioNome: fonte || 'Analisi Prezzo NVP', valoreUnitario: computeNvpTotal(nvpDetails) }
    : s);
  return recomputeResult({ ...r, subItems: subs });
}

// ── Nuovo elemento manuale (Elenco Prezzi → Aggiungi) ─────────────────────────
export interface ManualItemInput {
  descrizione: string;
  um: string;
  quantita: number;
  edificio: string;
  livello: string;
  zona: string;
  replacement: Replacement;
}

let manualCounter = 0;

export function buildManualItem(input: ManualItemInput): ResultadoItem {
  manualCounter++;
  const base: ResultadoItem = {
    idElemento: `MAN_${Date.now()}_${manualCounter}`,
    edificio: input.edificio || 'Generale',
    livello: input.livello || 'Generale',
    zona: input.zona || 'Generale',
    categoria: 'Generale',
    descrizioneElemento: input.descrizione,
    tipoPrezzo: '',
    quantitaElemento: input.quantita,
    unidade: input.um,
    valoreUnitario: 0,
    total: 0,
    originePrezzo: 'Inserimento manuale',
    status: 'NAO_ENCONTRADO',
    subItems: [],
    tariffaOriginal: '',
  };
  return convertElement(base, input.replacement);
}
