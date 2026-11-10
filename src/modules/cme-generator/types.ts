import type { HierarchyItem } from './lib/hierarchy';
// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/types.ts
// Domain types for the CME Generator module
// ─────────────────────────────────────────────────────────────────────────────

export type StatusItem = 'OK' | 'ALERT' | 'NAO_ENCONTRADO' | 'NVP';

// ── Raw Revit CSV row (WBS schema) ───────────────────────────────────────────
export interface Elemento {
  idUnico:    string;
  edificio:   string;   // WBSs_1 — building
  livello:    string;   // WBSs_2 — floor / level
  zona:       string;   // WBSs_3 — space within floor
  descricao:  string;   // Descricao — element description for the computo
  tariffa:    string;   // WBSt_1 or WBSt_3 — prezzario match key
  quantita:   number;   // Count × fatorWBS — final quantity for the computo line
  fatorWBS:   number;   // WBSt_2 or WBSt_4 — multiplier applied to Count
  countRevit: number;   // Count — raw Revit quantity before factor
  /** Optional: 'PREZZARIO' | 'NVP' — read from TipoPrezzo column if present in CSV */
  tipoPrezzo?: 'PREZZARIO' | 'NVP' | string;
  bimStatus?: 'BIM ON' | 'BIM OFF';
  tariffa2?:   string;   // WBSt_3 — secondary composition prezzario key
  fatorWBS2?:  number;   // WBSt_4 — secondary composition multiplier
  unidade?:    string;   // Product unit exported in the Revit CSV
  tipoImpianto?: string; // TIPO DI IMPIANTI column value
  /** WBS4 (formato scheda CME: WBS fino a 4 livelli; edificio/livello/zona = WBS1/WBS2/WBS3) */
  wbs4?:       string;
  /** Percorso WBS completo (N livelli); edificio/livello/zona/wbs4 ne sono i primi 4 */
  wbs?:        string[];
  /** Modello Revit di provenienza (es. FM, LUCE) quando il computo unisce più file */
  modello?:    string;
  /** CME_CATEGORIE della scheda, usata nei riepiloghi dei costi */
  categoriaCme?: string;
  /** Composizione (fino a 5 voci) letta da CME_ELE01..10: codice + fattore per unità di elemento */
  componenti?: Componente[];
}

export interface Componente {
  codice: string;
  fattore: number;
  isNvp: boolean;
}

// ── Processed result ──────────────────────────────────────────────────────────
export interface SubItem {
  codiceDeiOriginal: string;
  descrizioneDei: string;
  codicePrezzarioTarget: string;
  descrizionePrezzarioTarget: string;
  confiancaMatch: number;
  quantitaComposizione: number;
  valoreUnitario: number;
  status: StatusItem;
  unidade?: string;
  /** Prezzario di provenienza della voce (assenti nei progetti salvati prima di questa versione) */
  prezzarioId?: number;
  prezzarioNome?: string;
  /** Analisi NVP, solo per sottovoci NVP di elementi compositi */
  nvpDetails?: any;
}

export interface ResultadoItem {
  idElemento: string;
  edificio: string;
  livello: string;
  zona: string;
  categoria: string;
  descrizioneElemento: string;
  tipoPrezzo: string;
  quantitaElemento: number;
  unidade: string;
  valoreUnitario: number;
  total: number;
  originePrezzo: string;
  status: StatusItem;
  subItems: SubItem[];
  notes?: string;
  bimStatus?: 'BIM ON' | 'BIM OFF';
  tariffaOriginal?: string;
  nvpDetails?: any;
  tipoImpianto?: string;
  wbs4?: string;
  /** Percorso WBS completo (N livelli); edificio/livello/zona/wbs4 ne sono i primi 4 */
  wbs?: string[];
  /** Modello Revit di provenienza (es. FM, LUCE) quando il computo unisce più file */
  modello?: string;
}

// ── Prezzario (price list) ────────────────────────────────────────────────────
export interface PrezzarioVoce {
  id?: number;
  prezzarioId: number;
  codice: string;
  descrizione: string;
  valore: number;
  um: string;
  categoria: string;
}

export interface PrezzarioRecord {
  id?: number;
  nome: string;
  dataImport: string;
  totalVoci: number;
}

export interface AgentMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  /** Riepilogo delle modifiche applicate da questa risposta */
  meta?: { modificati: number; eliminati: number; prima: number; dopo: number };
}

/** Istantanea del computo per Annulla/Ripeti dei comandi dell'assistente */
export interface Snapshot {
  label: string;
  resultados: Map<string, ResultadoItem>;
  overrides: Map<string, Partial<ResultadoItem>>;
}

export interface CmeState {
  /** Gerarchia di voce del progetto (ordine, nomi e attivazione dei livelli); assente = predefinita */
  hierarchy?: HierarchyItem[];
  /** Conversazione con l'assistente IA del progetto (salvata con il progetto) */
  agentChat?: AgentMessage[];
  undoStack?: Snapshot[];
  redoStack?: Snapshot[];
  elementos: Elemento[];
  resultados: Map<string, ResultadoItem>;
  overrides: Map<string, Partial<ResultadoItem>>;
  chatHistory: Map<string, ChatMessage[]>;
  isProcessing: boolean;
  progress: { current: number; total: number; message: string };
  rawBimOffData?: any[][];
  projectId?: string | null;
  projectName?: string | null;
  /** true se ci sono modifiche non ancora salvate nel progetto */
  dirty?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

