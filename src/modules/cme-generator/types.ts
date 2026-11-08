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

// ── In-memory module state ────────────────────────────────────────────────────
export type CmeAction =
  | { type: 'ADD_CHAT_MSG'; payload: { id: string; msg: ChatMessage } }
  | { type: 'SET_RAW_BIM_OFF_DATA'; payload: any[][] | undefined }
  | { type: 'SET_PROJECT_ID'; payload: { id: string; name: string } | null }
  | { type: 'LOAD_PROJECT'; payload: any }
  | { type: 'RESET' };

export interface CmeState {
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

// ── Config (Supabase key-value) ───────────────────────────────────────────────
export interface CmeConfig {
  chave: string;
  valor: string;
}

// ── Learning system ───────────────────────────────────────────────────────────

/** A confirmed match stored in cme_examples for future AI context injection */
export interface CmeExample {
  id?: number;
  descrizioneElemento: string;
  codiceDei:           string;
  descrizioneDei:      string;
  codiceTarget:        string;
  descrizioneTarget:   string;
  valoreUnitario:      number;
  um:                  string;
  categoria:           string;
  scoreConfirmacao:    number; // 1.0 = admin-approved, 0.7 = user-corrected
  vezesUsado:          number;
  aprovadoPor?:        string;
}

/** Summary counts for the review screen */
export interface ReviewStats {
  total:          number;
  ok:             number;
  alert:          number;
  naoEncontrado:  number;
  nvp:            number;
  aprovados:      number;
}

/** Per-item decision made during review */
export type ReviewItemStatus = 'pending' | 'approved' | 'corrected' | 'rejected';

/** ResultadoItem enriched with review decision */
export interface ResultadoItemReview extends ResultadoItem {
  reviewStatus:    ReviewItemStatus;
  correctedValore?: number;     // if user manually changed the price
  correctedCodice?: string;     // if user manually changed the target code
}
