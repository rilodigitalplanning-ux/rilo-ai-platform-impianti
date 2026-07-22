export interface ElencoPrezziRow {
  tariffa: string;
  descrizione: string;
  unita: string;
  quantita: number;
}

export interface ElencoPrezziResult {
  fileName: string;
  rows: ElencoPrezziRow[];
  /** Numero di voci originali individuate nel file (prima della pulizia) */
  originalCount: number;
  /** Voci scartate perché a quantità zero (non utilizzate nel computo) */
  removedZeroQty: number;
}
