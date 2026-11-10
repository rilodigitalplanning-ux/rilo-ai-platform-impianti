import type { Elemento, PrezzarioVoce, ResultadoItem, SubItem } from '../types';
import { computeNvpTotal, recomputeResult, type NvpDetails } from './pricing';

export interface NvpAnalysis {
  valoreUnitario: number;
  originePrezzo: string;
  nvpDetails: NvpDetails | null;
}

export const nvpCodeKey = (codice: string) => codice.trim().toUpperCase();
export const voceKey = (codice: string) => codice.trim().toLowerCase();

const clone = <T,>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));

// Codici NVP distinti (con descrizione di un elemento d'esempio e numero di elementi) da chiedere all'utente
export function collectNvpCodes(elementi: Elemento[]): { codice: string; descrizione: string; nElementi: number }[] {
  const map = new Map<string, { codice: string; descrizione: string; nElementi: number }>();
  for (const el of elementi) {
    for (const c of el.componenti ?? []) {
      if (!c.isNvp) continue;
      const k = nvpCodeKey(c.codice);
      const e = map.get(k);
      if (e) e.nElementi++;
      else map.set(k, { codice: c.codice, descrizione: el.descricao, nElementi: 1 });
    }
  }
  return [...map.values()];
}

// Costruisce il risultato di un elemento della scheda CME a partire dalla sua composizione
export function buildResultFromComponenti(
  el: Elemento,
  voci: Map<string, PrezzarioVoce>,
  nvps: Map<string, NvpAnalysis>,
  prezzarioNome: string,
): ResultadoItem {
  const comps = el.componenti ?? [];
  const base = {
    idElemento: el.idUnico,
    edificio: el.edificio,
    livello: el.livello,
    zona: el.zona,
    wbs4: el.wbs4,
    wbs: el.wbs,
    descrizioneElemento: el.descricao,
    quantitaElemento: el.quantita,
    unidade: el.unidade || '',
    bimStatus: el.bimStatus,
    tariffaOriginal: el.tariffa,
    tipoImpianto: el.tipoImpianto,
  };

  const missing = comps.filter(c => !c.isNvp && !voci.has(voceKey(c.codice))).map(c => c.codice);
  if (missing.length > 0) {
    return {
      ...base,
      categoria: el.categoriaCme || 'Non trovato',
      tipoPrezzo: 'misura',
      valoreUnitario: 0,
      total: 0,
      originePrezzo: 'NAO_ENCONTRADO',
      status: 'NAO_ENCONTRADO',
      subItems: [],
      notes: `Codici non trovati nel prezzario: ${missing.join(', ')}.`,
    };
  }

  // Elemento che è interamente una NVP (un solo codice, fattore 1)
  if (comps.length === 1 && comps[0].isNvp && comps[0].fattore === 1) {
    const a = nvps.get(nvpCodeKey(comps[0].codice));
    const details = clone(a?.nvpDetails ?? null);
    const r: ResultadoItem = {
      ...base,
      categoria: el.categoriaCme || 'NVP',
      tipoPrezzo: 'NVP',
      valoreUnitario: a?.valoreUnitario ?? 0,
      total: 0,
      originePrezzo: a?.originePrezzo || 'NVP',
      status: 'NVP',
      subItems: [],
      nvpDetails: details ?? undefined,
    };
    return recomputeResult(r);
  }

  const subItems: SubItem[] = comps.map(c => {
    if (c.isNvp) {
      const a = nvps.get(nvpCodeKey(c.codice));
      const details = clone(a?.nvpDetails ?? null);
      return {
        codiceDeiOriginal: c.codice,
        descrizioneDei: el.descricao,
        codicePrezzarioTarget: c.codice,
        descrizionePrezzarioTarget: el.descricao,
        confiancaMatch: 1,
        quantitaComposizione: c.fattore,
        valoreUnitario: details ? computeNvpTotal(details) : (a?.valoreUnitario ?? 0),
        status: 'NVP' as const,
        unidade: 'cad',
        prezzarioNome: a?.originePrezzo || 'NVP',
        nvpDetails: details ?? undefined,
      };
    }
    const v = voci.get(voceKey(c.codice))!;
    return {
      codiceDeiOriginal: c.codice,
      descrizioneDei: el.descricao,
      codicePrezzarioTarget: v.codice,
      descrizionePrezzarioTarget: v.descrizione,
      confiancaMatch: 1,
      quantitaComposizione: c.fattore,
      valoreUnitario: v.valore,
      status: 'OK' as const,
      unidade: v.um || 'cad',
      prezzarioId: v.prezzarioId,
      prezzarioNome: prezzarioNome,
    };
  });

  const firstVoce = comps.map(c => voci.get(voceKey(c.codice))).find(Boolean);
  return recomputeResult({
    ...base,
    categoria: el.categoriaCme || firstVoce?.categoria || 'Generale',
    tipoPrezzo: 'misura',
    valoreUnitario: 0,
    total: 0,
    originePrezzo: prezzarioNome,
    status: 'OK',
    subItems,
  });
}
