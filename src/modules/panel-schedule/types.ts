export interface CircuitRow {
  tag: string;              // es. "-QF0.1.6"
  descrizione: string;      // es. "POLIVALENTE 02 | TA.C03"
  sistema: string;          // es. "TN-S"
  fasi: string;             // es. "3F+N", "F+N"
  potenzaKw: number | null; // potenza installata [kW]
  cavo: string;             // es. "3G2.5" oppure "1x120+1x70+1x70"
  lunghezzaM: number | null;
  tensioneV: number | null;
  caduteTensionePct: number | null;
  ib: number | null;
  in: number | null;   // In del telaio dell'interruttore (taglia massima)
  ir: number | null;   // Ir di regolazione dello sganciatore (soglia reale d'intervento)
  iz: number | null;
  /** Presente quando Ib non risulta fisicamente coerente con P/Un — da verificare a mano sul disegno originale. */
  warning: string | null;
}

export interface QuadroGroup {
  nome: string;             // es. "CORPO B ZE P1.B.ZE.Neu" oppure "[QCAB.TA]"
  righe: CircuitRow[];
  /** Nome del quadro a monte che alimenta questo (es. "QUADRO GENERALE", "QGBT") — null se non determinabile o se è il quadro radice (MT/QGBT). */
  alimentatoDa: string | null;
  /** Livello nella cascata (0 = radice/MT/QGBT, 1 = secondario, 2 = terziario, ...). Calcolato automaticamente. */
  livello: number;
}

export interface ParsedSchema {
  quadri: QuadroGroup[];
}

export interface UploadedFile {
  id: string;
  file: File;
  status: 'pending' | 'processing' | 'done' | 'error';
  error?: string;
}
