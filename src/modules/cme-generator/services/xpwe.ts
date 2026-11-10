// Formato XPWE di PriMus (ACCA): lettura e conversione in computo del CME Generator.
// Struttura ricavata da un file reale esportato da PriMus (nessuna specifica pubblica):
//   PweDocumento > PweDatiGenerali (categorie, WBS, spese generali/utili)
//                > PweMisurazioni > PweElencoPrezzi/EPItem  (voci di elenco prezzi, NP con PweEPAnalisi)
//                                 > PweVociComputo/VCItem > PweVCMisure/RGItem (righe di misura)
import type { ResultadoItem, SubItem } from '../types';
import { legacyWbsFields } from '../lib/wbs';
import { isNvpCode } from './cmeSheet';
import { recomputeResult, type NvpDetails, type NvpRow } from './pricing';

// ── Mini parser XML (il formato è semplice e ben formato; evita dipendenze e DOMParser) ──
export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e] ?? m;
  });

export function parseXml(xml: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) { top.text += m[1]; continue; }
    if (m[6] !== undefined) { top.text += decode(m[6]); continue; }
    if (m[3] === undefined) continue; // commento / istruzione
    if (m[2]) {
      if (stack.length < 2 || top.name !== m[3]) throw new Error(`XML non valido: tag </${m[3]}> inatteso.`);
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of m[4].matchAll(/([\w.:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3] ?? '');
    const node: XNode = { name: m[3], attrs, children: [], text: '' };
    top.children.push(node);
    if (!m[5]) stack.push(node);
  }
  if (stack.length !== 1) throw new Error('XML non valido: tag non chiusi.');
  return root.children[0] ?? (() => { throw new Error('File vuoto.'); })();
}

const child = (n: XNode | undefined, name: string) => n?.children.find(c => c.name === name);
const kids = (n: XNode | undefined, name: string) => n?.children.filter(c => c.name === name) ?? [];
const txt = (n: XNode | undefined, name: string) => (child(n, name)?.text ?? '').trim();

// Numeri XPWE: "3.06", "1.000", "10 000.00" (spazio come separatore di migliaia); vuoto → null
export function xNum(raw: string): number | null {
  const s = raw.replace(/\s/g, '');
  if (!s) return null;
  const n = Number(/,/.test(s) && !/\./.test(s) ? s.replace(',', '.') : s);
  return Number.isFinite(n) ? n : null;
}

// ── Modello del documento ──
export interface EparItem { tipo: number; idep: number; descrizione: string; um: string; qt: number; prezzo: number }
export interface EpItem {
  id: number; tariffa: string; articolo: string; descrizione: string; um: string; prezzo: number;
  isNp: boolean; analisi: EparItem[];
}
export interface RgItem { descrizione: string; quantita: number }
export interface VcItem { id: number; idep: number; quantita: number; idCat: number; idSpCat: number; idSbCat: number; righe: RgItem[] }
export interface XpweDoc {
  oggetto: string;
  speseGenerali: number;
  utili: number;
  /** Gerarchia delle categorie di PriMus (supercategorie > categorie > sottocategorie) = livelli WBS */
  superCategorie: Map<number, string>;
  categorie: Map<number, string>;
  sottoCategorie: Map<number, string>;
  ep: Map<number, EpItem>;
  voci: VcItem[];
}

const FLAG_NP = 131072;

export function parseXpwe(xml: string): XpweDoc {
  const root = parseXml(xml);
  if (root.name !== 'PweDocumento') throw new Error('Il file non è un documento XPWE di PriMus (manca PweDocumento).');

  const dg = child(root, 'PweDatiGenerali');
  const oggetto = txt(child(child(dg, 'PweDGProgetto'), 'PweDGDatiGenerali'), 'Oggetto');
  const analisi = child(child(dg, 'PweDGModuli'), 'PweDGAnalisi');
  const cc = child(dg, 'PweDGCapitoliCategorie');
  // I contenitori di categorie (PweDGSuperCategorie, PweDGCategorie, PweDGSub/SbCategorie) sono riconosciuti dal nome
  const levelMap = (pick: (name: string) => boolean) => {
    const out = new Map<number, string>();
    for (const cont of cc?.children ?? []) {
      if (!pick(cont.name)) continue;
      for (const it of cont.children) out.set(Number(it.attrs.ID), txt(it, 'DesSintetica'));
    }
    return out;
  };
  const isSuper = (n: string) => /super/i.test(n);
  const isSub = (n: string) => /(sub|sb)categor/i.test(n);

  const misure = child(root, 'PweMisurazioni');
  const ep = new Map<number, EpItem>();
  for (const n of kids(child(misure, 'PweElencoPrezzi'), 'EPItem')) {
    const id = Number(n.attrs.ID);
    const flags = xNum(txt(n, 'Flags')) ?? 0;
    const ar = kids(child(child(n, 'PweEPAnalisi'), 'PweEPAR'), 'EPARItem').map(a => ({
      tipo: xNum(txt(a, 'Tipo')) ?? 0,
      idep: xNum(txt(a, 'IDEP')) ?? -2,
      descrizione: txt(a, 'Descrizione'),
      um: txt(a, 'Misura'),
      qt: xNum(txt(a, 'Qt')) ?? 0,
      prezzo: xNum(txt(a, 'Prezzo')) ?? 0,
    }));
    ep.set(id, {
      id,
      tariffa: txt(n, 'Tariffa'),
      articolo: txt(n, 'Articolo'),
      descrizione: txt(n, 'DesEstesa') || txt(n, 'DesRidotta') || txt(n, 'DesBreve'),
      um: txt(n, 'UnMisura'),
      prezzo: xNum(txt(n, 'Prezzo1')) ?? 0,
      // NP: flag di PriMus, analisi presente o codice con NVP/NP (stessa regola della scheda Revit)
      isNp: (flags & FLAG_NP) !== 0 || ar.length > 0 || isNvpCode(txt(n, 'Tariffa')),
      analisi: ar,
    });
  }

  const voci: VcItem[] = kids(child(misure, 'PweVociComputo'), 'VCItem').map(n => ({
    id: Number(n.attrs.ID),
    idep: xNum(txt(n, 'IDEP')) ?? -1,
    quantita: xNum(txt(n, 'Quantita')) ?? 0,
    idCat: xNum(txt(n, 'IDCat')) ?? 0,
    idSpCat: xNum(txt(n, 'IDSpCat')) ?? 0,
    idSbCat: xNum(txt(n, 'IDSbCat')) ?? 0,
    righe: kids(child(n, 'PweVCMisure'), 'RGItem').map(r => ({
      descrizione: txt(r, 'Descrizione'),
      quantita: xNum(txt(r, 'Quantita')) ?? 0,
    })),
  }));

  return {
    oggetto,
    speseGenerali: xNum(txt(analisi, 'SpeseGenerali')) ?? 0,
    utili: xNum(txt(analisi, 'UtiliImpresa')) ?? 0,
    superCategorie: levelMap(isSuper),
    categorie: levelMap(n => /categor/i.test(n) && !isSuper(n) && !isSub(n)),
    sottoCategorie: levelMap(isSub),
    ep,
    voci,
  };
}

// ── Analisi di una NP → NVP del CME Generator ──
const XPWE_FONTE = 'XPWE (PriMus)';

export function analisiToNvp(item: EpItem, doc: Pick<XpweDoc, 'ep' | 'speseGenerali' | 'utili'>): NvpDetails {
  const materiali: NvpRow[] = [];
  const manoDOpera: NvpRow[] = [];
  const noleggi: NvpRow[] = [];
  let trasporti = 0;
  item.analisi.forEach((a, i) => {
    const id = `xpwe-${item.id}-${i}`;
    const ref = a.tipo === 1 ? doc.ep.get(a.idep) : undefined;
    if (a.tipo !== 1 || !ref) {
      materiali.push({ id, descrizione: a.descrizione, um: a.um, quantita: a.qt, prezzoUnitario: a.prezzo });
    } else if (ref.um === '%' || a.um === '%') {
      trasporti += a.prezzo * 100; // es. 0.04 su base 10 000 = 4 %
    } else {
      const row: NvpRow = {
        id, descrizione: ref.descrizione, um: a.um || ref.um, quantita: a.qt, prezzoUnitario: a.prezzo,
        codice: ref.tariffa, prezzario: XPWE_FONTE,
      };
      (/^m\d/i.test(ref.tariffa) || /ora|h$/i.test(a.um) ? manoDOpera : noleggi).push(row);
    }
  });
  return {
    materiali, scontoPercentuale: 0, manoDOpera, noleggi,
    trasportiPercentuale: Math.round(trasporti * 1e6) / 1e6,
    speseGeneraliPercentuale: doc.speseGenerali, utiliPercentuale: doc.utili, fonte: XPWE_FONTE,
  };
}

// ── Conversione del documento in risultati del computo (una riga di misura = un elemento) ──
export interface XpweImport { resultados: ResultadoItem[]; warnings: string[] }

export function xpweToResults(doc: XpweDoc): XpweImport {
  const resultados: ResultadoItem[] = [];
  const warnings: string[] = [];

  for (const vc of doc.voci) {
    const ep = doc.ep.get(vc.idep);
    if (!ep) { warnings.push(`Voce ${vc.id}: voce di elenco prezzi ${vc.idep} non trovata, ignorata.`); continue; }
    const righe = vc.righe.length > 0 ? vc.righe : [{ descrizione: '', quantita: vc.quantita }];

    righe.forEach((rg, i) => {
      if (!(rg.quantita > 0)) { warnings.push(`Voce ${ep.tariffa} (${vc.id}): riga di misura con quantità ${rg.quantita || 0}, ignorata.`); return; }
      // Le categorie di PriMus sono la gerarchia WBS del progetto (2 o 3 livelli); l'ultimo livello è anche la categoria dei riepiloghi
      const wbs = [doc.superCategorie.get(vc.idSpCat), doc.categorie.get(vc.idCat), doc.sottoCategorie.get(vc.idSbCat)]
        .map(s => (s ?? '').trim()).filter(Boolean);
      const categoria = wbs[wbs.length - 1] || 'Generale';
      const base = {
        idElemento: `xpwe_${vc.id}_${i}`,
        ...legacyWbsFields(wbs),
        wbs,
        categoria,
        descrizioneElemento: rg.descrizione || ep.descrizione,
        quantitaElemento: rg.quantita,
        unidade: ep.um,
        bimStatus: 'BIM ON' as const,
        tariffaOriginal: ep.tariffa,
      };

      if (ep.isNp) {
        const nvpDetails = ep.analisi.length > 0 ? analisiToNvp(ep, doc) : undefined; // NP senza analisi: resta "senza analisi"
        // Il prezzo della NP è quello memorizzato da PriMus (l'analisi può differire di qualche centesimo
        // per gli arrotondamenti): così il totale importato coincide con quello di PriMus.
        resultados.push({
          ...base, tipoPrezzo: 'NVP', valoreUnitario: ep.prezzo, total: Math.round(ep.prezzo * rg.quantita * 100) / 100,
          originePrezzo: XPWE_FONTE, status: 'NVP', subItems: [], nvpDetails,
        });
        return;
      }
      const sub: SubItem = {
        codiceDeiOriginal: ep.tariffa,
        descrizioneDei: ep.descrizione,
        codicePrezzarioTarget: ep.tariffa,
        descrizionePrezzarioTarget: ep.descrizione,
        confiancaMatch: 1,
        quantitaComposizione: 1,
        valoreUnitario: ep.prezzo,
        status: 'OK',
        unidade: ep.um,
        prezzarioNome: XPWE_FONTE,
      };
      resultados.push(recomputeResult({
        ...base, tipoPrezzo: 'misura', valoreUnitario: 0, total: 0,
        originePrezzo: XPWE_FONTE, status: 'OK', subItems: [sub],
      }));
    });
  }
  return { resultados, warnings };
}
