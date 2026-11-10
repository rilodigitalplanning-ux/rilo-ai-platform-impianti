// Unione di più modelli Revit (es. FM e LUCE) nello stesso computo: gli elementi del nuovo modello vengono
// elaborati con lo stesso prezzario e uniti ai risultati esistenti. Le NVP con una tariffa già presente nel
// progetto riusano la sua analisi; solo le tariffe nuove vengono richieste.
import type { Elemento, PrezzarioVoce, ResultadoItem } from '../types';
import { normText } from './pricing';
import { buildResultFromComponenti, collectNvpCodes, nvpCodeKey, voceKey, type NvpAnalysis } from './cmeBuilder';
import { groupNvp, referenceDetails } from './nvpGroups';
import { computeNvpTotal } from './pricing';

export interface ModelInput { nome: string; elementos: Elemento[] }

export interface ModelPlan {
  /** Elementi del progetto con lo stesso nome di modello (vengono sostituiti) */
  daSostituire: number;
  /** Codici NVP che richiederanno un'analisi nuova */
  nvpNuove: string[];
  /** Codici NVP già presenti nel progetto (si riusa l'analisi) */
  nvpRiusate: string[];
}

export interface ModelResult {
  results: ResultadoItem[];
  remove: string[];
  /** Elementi già presenti a cui è stato assegnato il nome del primo modello */
  retag: ResultadoItem[];
  plan: ModelPlan;
  nonTrovati: number;
}

export const modelSlug = (s: string) => normText(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'modello';
/** Nome di modello proposto da un nome di file (senza estensione) */
export const modelNameFromFile = (fileName: string) => fileName.replace(/\.[^.]+$/, '').trim() || 'Modello';
const sameModel = (a: string | undefined, b: string) => normText(a) === normText(b);

// Analisi già presenti nel progetto, per tariffa
function existingAnalyses(results: ResultadoItem[]): Map<string, NvpAnalysis> {
  const out = new Map<string, NvpAnalysis>();
  for (const g of groupNvp(results)) {
    if (!g.codice) continue;
    const d = referenceDetails(g);
    out.set(nvpCodeKey(g.codice), {
      valoreUnitario: d ? computeNvpTotal(d) : (g.entries[0]?.valoreUnitario ?? 0),
      originePrezzo: g.entries[0]?.fonte || 'NVP',
      nvpDetails: d ?? null,
    });
  }
  return out;
}

export function planModel(existing: ResultadoItem[], model: ModelInput): ModelPlan {
  const remaining = existing.filter(r => !sameModel(r.modello, model.nome));
  const known = existingAnalyses(remaining);
  const codes = collectNvpCodes(model.elementos);
  return {
    daSostituire: existing.length - remaining.length,
    nvpNuove: codes.filter(c => !known.has(nvpCodeKey(c.codice))).map(c => c.codice),
    nvpRiusate: codes.filter(c => known.has(nvpCodeKey(c.codice))).map(c => c.codice),
  };
}

export async function buildModelResults(params: {
  existing: ResultadoItem[];
  model: ModelInput;
  voci: PrezzarioVoce[];
  prezzarioName: string;
  /** Nome da assegnare agli elementi già presenti che non hanno un modello (il primo modello del progetto) */
  existingModelName?: string;
  askNvp: (pseudo: Elemento) => Promise<NvpAnalysis>;
}): Promise<ModelResult> {
  const { existing, model, voci, prezzarioName, existingModelName, askNvp } = params;

  const removed = existing.filter(r => sameModel(r.modello, model.nome));
  const remaining = existing.filter(r => !sameModel(r.modello, model.nome));
  const retag = existingModelName
    ? remaining.filter(r => !(r.modello || '').trim()).map(r => ({ ...r, modello: existingModelName }))
    : [];

  const nvps = existingAnalyses(remaining);
  const plan = planModel(existing, model);

  // id univoci tra modelli (ogni file riparte da 1) e modello su ogni elemento
  const prefix = modelSlug(model.nome);
  const elementos = model.elementos.map(e => ({ ...e, idUnico: `${prefix}~${e.idUnico}`, modello: model.nome }));

  for (const n of collectNvpCodes(elementos)) {
    if (nvps.has(nvpCodeKey(n.codice))) continue;
    const pseudo = {
      idUnico: n.codice, edificio: `${n.nElementi} elementi`, livello: `${model.nome} · ${n.codice}`, zona: '',
      descricao: n.descrizione, tariffa: n.codice, quantita: 1, fatorWBS: 1, countRevit: 1,
    } as Elemento;
    nvps.set(nvpCodeKey(n.codice), await askNvp(pseudo));
  }

  const map = new Map<string, PrezzarioVoce>();
  for (const v of voci) if (!map.has(voceKey(v.codice))) map.set(voceKey(v.codice), v);

  const results = elementos.map(el => buildResultFromComponenti(el, map, nvps, prezzarioName));
  return {
    results,
    remove: removed.map(r => r.idElemento),
    retag,
    plan,
    nonTrovati: results.filter(r => r.status === 'NAO_ENCONTRADO').length,
  };
}
