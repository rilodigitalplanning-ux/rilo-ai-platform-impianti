// Esportazione del computo in formato XPWE (PriMus). Struttura ricalcata da un file reale esportato da PriMus.
//   Gerarchia PriMus (supercategorie > categorie > sottocategorie) = livelli WBS del progetto, con la
//   categoria della scheda (CME_CATEGORIE) come ultimo livello (senza duplicarla se coincide con l'ultimo livello WBS).
//   Ogni componente di una composizione diventa una voce di computo: riga di misura = quantità dell'elemento × fattore.
import type { ResultadoItem } from '../types';
import { defaultHierarchy, hierarchyPath, type HierarchyItem } from '../lib/hierarchy';
import { round2, type NvpDetails, type NvpRow } from './pricing';

export interface XpweExport {
  xml: string;
  warnings: string[];
  stats: { voci: number; righe: number; prezzi: number; np: number; elementiSaltati: number };
}

const FLAG_NP = 131072;
const MAX_LEVELS = 3; // PriMus: supercategoria, categoria, sottocategoria

// ── Formattazione ─────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
const tag = (name: string, v: string | number = '') => (String(v) === '' ? `<${name}/>` : `<${name}>${esc(String(v))}</${name}>`);
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
/** Decimali: almeno `min`, al massimo `max`, senza zeri superflui oltre il minimo */
const dec = (n: number, min = 2, max = 4) => {
  let s = n.toFixed(max);
  while (s.endsWith('0') && s.length - s.indexOf('.') - 1 > min) s = s.slice(0, -1);
  return s;
};
/** Formato numerico delle analisi PriMus: "10 000.00" */
const spaced = (n: number, d: number) => {
  const [i, f] = n.toFixed(d).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (f ? '.' + f : '');
};
const short = (s: string) => (s.length <= 120 ? s : `${s.slice(0, 70).trimEnd()} ... ${s.slice(-45).trimStart()}`);

// ── Raccolta di prezzi (EPItem) ───────────────────────────────────────────────
interface Epar { tipo: 0 | 1; idep: number; descrizione: string; misura: string; qt: number; prezzo: number }
interface Ep { id: number; tariffa: string; descrizione: string; um: string; prezzo: number; np: boolean; analisi: Epar[] }

interface Line { code: string; desc: string; um: string; price: number; fattore: number; nvp: boolean; details?: NvpDetails | null }

function linesOf(r: ResultadoItem): Line[] {
  if (r.subItems.length === 0) {
    return [{ code: r.tariffaOriginal || 'NVP', desc: r.descrizioneElemento, um: r.unidade || 'cad', price: r.valoreUnitario, fattore: 1, nvp: true, details: r.nvpDetails }];
  }
  return r.subItems.map(s => {
    const nvp = s.status === 'NVP' || !!s.nvpDetails;
    return {
      code: nvp ? (s.codiceDeiOriginal || s.codicePrezzarioTarget) : s.codicePrezzarioTarget,
      desc: nvp ? (s.descrizionePrezzarioTarget || s.descrizioneDei) : s.descrizionePrezzarioTarget,
      um: s.unidade || 'cad', price: s.valoreUnitario, fattore: s.quantitaComposizione || 1, nvp, details: s.nvpDetails,
    };
  });
}

export function buildXpwe(
  results: ResultadoItem[],
  opts: { projectName: string; fileName?: string; today?: Date; hierarchy?: HierarchyItem[] },
): XpweExport {
  const config = opts.hierarchy ?? defaultHierarchy(results);
  const today = dmy(opts.today ?? new Date());
  const warnings: string[] = [];
  const eps = new Map<string, Ep>();
  const usedTariffe = new Map<string, string>(); // tariffa → chiave
  let nextEp = 3;

  const addEp = (key: string, tariffa: string, descrizione: string, um: string, prezzo: number, np: boolean, analisi: Epar[] = []): Ep => {
    const found = eps.get(key);
    if (found) return found;
    let t = tariffa, n = 2;
    while (usedTariffe.has(t) && usedTariffe.get(t) !== key) t = `${tariffa} (${n++})`; // stessa tariffa con prezzo diverso
    usedTariffe.set(t, key);
    const ep: Ep = { id: nextEp++, tariffa: t, descrizione, um, prezzo, np, analisi };
    eps.set(key, ep);
    return ep;
  };

  // Analisi NVP → righe EPAR (materiali liberi; manodopera/noleggi come riferimenti a voci dell'elenco; % come "Trasporto")
  const percPercent = { sg: [] as number[], ut: [] as number[] };
  const buildAnalisi = (d: NvpDetails): Epar[] => {
    percPercent.sg.push(d.speseGeneraliPercentuale); percPercent.ut.push(d.utiliPercentuale);
    const out: Epar[] = [];
    const sconto = 1 - (d.scontoPercentuale || 0) / 100;
    let base = 0;
    for (const m of d.materiali ?? []) {
      const prezzo = round2(m.prezzoUnitario * sconto);
      base += m.quantita * prezzo;
      out.push({ tipo: 0, idep: -2, descrizione: m.descrizione, misura: m.um, qt: m.quantita, prezzo });
    }
    const risorsa = (r: NvpRow) => {
      if (!r.codice) return out.push({ tipo: 0, idep: -2, descrizione: r.descrizione, misura: r.um, qt: r.quantita, prezzo: r.prezzoUnitario });
      const ep = addEp(`R|${r.codice}|${r.prezzoUnitario}`, r.codice, r.descrizione, r.um, r.prezzoUnitario, false);
      out.push({ tipo: 1, idep: ep.id, descrizione: '', misura: r.um || ep.um, qt: r.quantita, prezzo: r.prezzoUnitario });
    };
    (d.manoDOpera ?? []).forEach(risorsa);
    if (Array.isArray(d.noleggi)) d.noleggi.forEach(risorsa);
    else if (d.noleggi > 0) out.push({ tipo: 0, idep: -2, descrizione: 'Noleggi', misura: 'cadauno', qt: 1, prezzo: d.noleggi });
    if (d.trasportiPercentuale > 0) {
      const tr = addEp('T', 'Trasporto', 'Trasporto del materiale con arrivo al piano di utilizzo', '%', 0.01, false);
      out.push({ tipo: 1, idep: tr.id, descrizione: '', misura: '%', qt: round2(base), prezzo: d.trasportiPercentuale / 100 });
    }
    return out;
  };

  // Gerarchia: livelli WBS + categoria come ultimo livello; oltre 3 livelli quelli in eccesso si fondono nel terzo
  const levelIds: Map<string, number>[] = [new Map(), new Map(), new Map()];
  const idOf = (lv: number, name: string) => {
    const m = levelIds[lv];
    if (!m.has(name)) m.set(name, m.size + 1);
    return m.get(name)!;
  };
  let merged = 0;
  const hierarchy = (r: ResultadoItem): [number, number, number] => {
    // livelli nell'ordine configurato per il progetto; due livelli consecutivi uguali (es. categoria già presente
    // come ultimo livello WBS nei progetti da PriMus) si contano una volta sola
    const lv = hierarchyPath(r, config).filter((v, i, a) => i === 0 || v !== a[i - 1]);
    if (lv.length === 0) lv.push('Generale');
    let p = lv;
    if (lv.length > MAX_LEVELS) { p = [...lv.slice(0, MAX_LEVELS - 1), lv.slice(MAX_LEVELS - 1).join(' / ')]; merged++; }
    return [idOf(0, p[0]), p[1] ? idOf(1, p[1]) : 0, p[2] ? idOf(2, p[2]) : 0];
  };

  // Voci di computo: una per (voce, gerarchia) con una riga di misura per elemento
  interface Rg { desc: string; qty: number; fattore: number }
  const vcs = new Map<string, { id: number; ep: Ep; cat: [number, number, number]; rg: Rg[] }>();
  let nextVc = 2, skipped = 0, righe = 0;

  for (const r of results) {
    if (r.status === 'NAO_ENCONTRADO' || (r.subItems.length === 0 && r.status !== 'NVP')) { skipped++; continue; }
    const cat = hierarchy(r);
    for (const l of linesOf(r)) {
      const price = round2(l.price);
      const ep = l.nvp
        ? addEp(`N|${l.code}|${price}`, l.code, l.desc, l.um, price, true, l.details ? buildAnalisi(l.details) : [])
        : addEp(`V|${l.code}|${price}`, l.code, l.desc, l.um, price, false);
      const key = `${ep.id}|${cat.join('|')}`;
      let vc = vcs.get(key);
      if (!vc) { vc = { id: nextVc++, ep, cat, rg: [] }; vcs.set(key, vc); }
      vc.rg.push({ desc: r.descrizioneElemento, qty: r.quantitaElemento, fattore: l.fattore });
      righe++;
    }
  }
  if (skipped) warnings.push(`${skipped} element${skipped === 1 ? 'o' : 'i'} senza prezzo (NON TROVATO) non esportat${skipped === 1 ? 'o' : 'i'}.`);
  if (merged) warnings.push(`${merged} element${merged === 1 ? 'o ha' : 'i hanno'} più di ${MAX_LEVELS} livelli di gerarchia: i livelli in eccesso sono uniti nel terzo.`);
  const mode = (a: number[]) => (a.length ? [...a].sort((x, y) => a.filter(v => v === y).length - a.filter(v => v === x).length)[0] : undefined);
  const sg = mode(percPercent.sg) ?? 15, ut = mode(percPercent.ut) ?? 10;
  if (new Set(percPercent.sg).size > 1 || new Set(percPercent.ut).size > 1) {
    warnings.push('Le NVP hanno percentuali di spese generali/utili diverse: PriMus ne usa una sola per tutto il documento (i prezzi esportati restano quelli calcolati).');
  }

  // ── Serializzazione ─────────────────────────────────────────────────────────
  const catItems = (m: Map<string, number>, item: string) =>
    [...m].map(([name, id]) => `<${item} ID="${id}" >${tag('DesSintetica', name)}<DesEstesa/><DataInit>30/12/1899</DataInit><Durata>0</Durata><CodFase/><Percentuale>0</Percentuale><Codice/></${item}>`).join('');
  const wbsRoot = (container: string, item: string, attiva: string, titolo: string) =>
    `<${container}><${attiva}>0</${attiva}>` +
    `<${item} ID="2" ><CU>{00000000-0000-0000-0000-000000000001}</CU><CUParent/>${tag('TITOLO', titolo)}<CODICE/><CodiceExt/></${item}>` +
    `<${item} ID="3" ><CU>{00000000-0000-0000-0000-000000000002}</CU><CUParent>{00000000-0000-0000-0000-000000000001}</CUParent>${tag('TITOLO', '<NON assegnata>')}<CODICE/><CodiceExt/></${item}></${container}>`;

  const epXml = [...eps.values()].map(ep => {
    const analisi = ep.analisi.map((a, i) =>
      `<EPARItem ID="${i + 2}" ><Tipo>${a.tipo}</Tipo><IDEP>${a.idep}</IDEP>${tag('Descrizione', a.descrizione)}${tag('Misura', a.misura)}` +
      `<Qt>${spaced(a.qt, 3)}</Qt><Prezzo>${spaced(a.prezzo, a.prezzo * 100 === Math.round(a.prezzo * 100) ? 2 : 4)}</Prezzo><FieldCTL>0</FieldCTL></EPARItem>`).join('');
    return `<EPItem ID="${ep.id}" ><TipoEP>0</TipoEP>${tag('Tariffa', ep.tariffa)}<Articolo/>${tag('DesRidotta', short(ep.descrizione))}${tag('DesEstesa', ep.descrizione)}<DesBreve/>` +
      `${tag('UnMisura', ep.um)}<Prezzo1>${dec(ep.prezzo)}</Prezzo1><Prezzo2>0</Prezzo2><Prezzo3>0</Prezzo3><Prezzo4>0</Prezzo4><Prezzo5>0</Prezzo5>` +
      `<IDSpCap>0</IDSpCap><IDCap>0</IDCap><IDSbCap>0</IDSbCap><CodiceWBSCAP/><Flags>${ep.np ? FLAG_NP : 0}</Flags><Data>${today}</Data><AdrInternet/>` +
      `<IncSIC>0</IncSIC><IncMDO>0</IncMDO><IncMAT>0</IncMAT><IncATTR>0</IncATTR><TagBIM/>` +
      `<PweEPAnalisi>${analisi ? `<PweEPAR>${analisi}</PweEPAR>` : ''}</PweEPAnalisi></EPItem>`;
  }).join('');

  const vcXml = [...vcs.values()].map(vc => {
    const rg = vc.rg.map((g, i) => {
      const q = g.qty * g.fattore;
      return `<RGItem ID="${i + 2}" ><IDVV>-2</IDVV>${tag('Descrizione', g.desc)}<PartiUguali>${dec(g.qty)}</PartiUguali>` +
        `${g.fattore === 1 ? '<Lunghezza/>' : `<Lunghezza>${dec(g.fattore)}</Lunghezza>`}<Larghezza/><HPeso/><Quantita>${dec(q)}</Quantita><Flags>0</Flags></RGItem>`;
    }).join('');
    const tot = vc.rg.reduce((s, g) => s + g.qty * g.fattore, 0);
    return `<VCItem ID="${vc.id}" ><IDEP>${vc.ep.id}</IDEP><Quantita>${dec(tot, 0, 3)}</Quantita><DataMis>${today}</DataMis><Flags>0</Flags>` +
      `<IDSpCat>${vc.cat[0]}</IDSpCat><IDCat>${vc.cat[1]}</IDCat><IDSbCat>${vc.cat[2]}</IDSbCat><CodiceWBS/><PweVCMisure>${rg}</PweVCMisure></VCItem>`;
  }).join('');

  const xml =
    '<?mso-application progid="PriMus.Document.XPWE"?><PweDocumento>' +
    '<CopyRight>Rilo CME Generator</CopyRight><TipoDocumento>1</TipoDocumento><TipoFormato>XMLPwe</TipoFormato><Versione>5.04</Versione>' +
    `<SourceVersione>Rilo CME Generator</SourceVersione><SourceNome>Rilo CME Generator</SourceNome>${tag('FileNameDocumento', opts.fileName ?? opts.projectName)}<Fgs>131072</Fgs>` +
    '<PweDatiGenerali><PweDGProgetto><PweDGDatiGenerali><PercPrezzi>0</PercPrezzi><Comune/><Provincia/>' +
    `${tag('Oggetto', opts.projectName)}<Committente/><Impresa/><ParteOpera/></PweDGDatiGenerali></PweDGProgetto>` +
    `<PweDGCapitoliCategorie><PweDGSuperCategorie>${catItems(levelIds[0], 'DGSuperCategorieItem')}</PweDGSuperCategorie>` +
    `<PweDGCategorie>${catItems(levelIds[1], 'DGCategorieItem')}</PweDGCategorie>` +
    `<PweDGSubCategorie>${catItems(levelIds[2], 'DGSubCategorieItem')}</PweDGSubCategorie></PweDGCapitoliCategorie>` +
    `${wbsRoot('PweDGWBS', 'DGWBSItem', 'DGWBSAttiva', 'WBS')}${wbsRoot('PweDGWBSCAP', 'DGWBSCAPItem', 'DGWBSCAPAttiva', 'WBS CAPITOLI')}` +
    `<PweDGModuli><PweDGAnalisi><SpeseUtili>-1</SpeseUtili><SpeseGenerali>${sg}</SpeseGenerali><UtiliImpresa>${ut}</UtiliImpresa><OneriAccessoriSc>0</OneriAccessoriSc><ConfQuantita>11.3|1</ConfQuantita><OneriSociali>0</OneriSociali></PweDGAnalisi></PweDGModuli>` +
    '<PweDGConfigurazione><PweDGConfigNumeri><Divisa>euro</Divisa><ConversioniIN>lire</ConversioniIN><FattoreConversione>1936.27</FattoreConversione><Cambio>1</Cambio>' +
    '<PartiUguali>8.2|0</PartiUguali><Lunghezza>8.2|0</Lunghezza><Larghezza>9.3|0</Larghezza><HPeso>9.3|0</HPeso><Quantita>10.2|1</Quantita><Prezzi>10.2|1</Prezzi>' +
    '<PrezziTotale>14.2|1</PrezziTotale><ConvPrezzi>11.0|1</ConvPrezzi><ConvPrezziTotale>15.0|1</ConvPrezziTotale><IncidenzaPercentuale>7.3|0</IncidenzaPercentuale><Aliquote>7.3|0</Aliquote>' +
    '</PweDGConfigNumeri></PweDGConfigurazione></PweDatiGenerali>' +
    `<PweMisurazioni><PweElencoPrezzi>${epXml}</PweElencoPrezzi><PweVociComputo>${vcXml}</PweVociComputo></PweMisurazioni></PweDocumento>`;

  return { xml, warnings, stats: { voci: vcs.size, righe, prezzi: eps.size, np: [...eps.values()].filter(e => e.np).length, elementiSaltati: skipped } };
}
