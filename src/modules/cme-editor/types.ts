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
  /**
   * true se il file è stato modificato "sul posto" (.xlsx) preservando al 100%
   * colori/stile originali; false se è stato ricostruito da zero con uno stile
   * pulito standard (.xls legacy, i cui stili non sono leggibili con librerie gratuite).
   */
  stylePreserved: boolean;
  /** Presente solo quando stylePreserved è true: il workbook già pronto per l'export */
  editedWorkbook?: import('exceljs').Workbook;
}
