// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cme-generator/services/pdfPrezzarioParser.ts
// Estrazione euristica delle voci di un prezzario da un PDF con testo selezionabile.
//
// Layout atteso (il più comune nei prezzari italiani): una riga per voce che inizia
// con il CODICE (es. "A.01.001.001", "EL.01.010") e termina con "UM  PREZZO"
// (es. "m²  12,34"); la descrizione può proseguire su più righe sotto il codice.
// Le voci senza prezzo (titoli di capitolo, note) vengono scartate e contate.
// I PDF scansionati (solo immagine) non contengono testo estraibile.
// ─────────────────────────────────────────────────────────────────────────────
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PrezzarioVoce } from '../types';

export interface PdfParseResult {
  voci: PrezzarioVoce[];
  skipped: number;
  pages: number;
}

// Codice: almeno una cifra e almeno un separatore (. - /), es. A.01.001.001 · 01.A01.001 · U05-010-0010
const CODE_RE = /^(?=.*\d)[A-Za-z0-9]{1,8}(?:[.\-/][A-Za-z0-9]{1,10}){1,7}$/;
// Prezzo all'italiana: 1.234,56 · 12,34 · 0,2500
const PRICE_RE = /^(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2,4}$/;
// Unità di misura plausibile: m, m², m3, cad, kg, n°, ora, m/h, %...
const UM_RE = /^[A-Za-zµ°²³%./\d]{1,9}$/;
// Righe di intestazione/piè di pagina da ignorare
const NOISE_RE = /^(pag(ina|\.)?\s*\d+|\d+\s*\/\s*\d+|pagina\s+\d+\s+di\s+\d+)$/i;

const toNumber = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;

interface PendingRow {
  codice: string;
  parts: string[];
  um: string;
  valore: number | null;
}

// Se i token finiscono con "UM PREZZO" ritorna i dati e i token residui
function splitTrailingPrice(tokens: string[]): { rest: string[]; um: string; valore: number } | null {
  if (tokens.length < 2) return null;
  const last = tokens[tokens.length - 1];
  if (!PRICE_RE.test(last)) return null;
  const valore = toNumber(last);
  let rest = tokens.slice(0, -1);
  let um = 'cad';
  const n = rest.length;
  if (n >= 2 && rest[n - 1].toLowerCase() === 'corpo' && rest[n - 2].toLowerCase() === 'a') {
    um = 'a corpo';
    rest = rest.slice(0, -2);
  } else if (n >= 1 && UM_RE.test(rest[n - 1]) && !/^\d+$/.test(rest[n - 1])) {
    um = rest[n - 1];
    rest = rest.slice(0, -1);
  }
  return { rest, um, valore };
}

export async function parsePrezzarioPdf(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<PdfParseResult> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;

  const voci: PrezzarioVoce[] = [];
  let skipped = 0;
  let current: PendingRow | null = null;
  let totalChars = 0;

  const finalize = () => {
    if (!current) return;
    if (current.valore === null) {
      skipped++;
    } else {
      voci.push({
        prezzarioId: 0,
        codice: current.codice,
        descrizione: current.parts.join(' ').replace(/\s+/g, ' ').trim(),
        valore: current.valore,
        um: current.um,
        categoria: '',
      });
    }
    current = null;
  };

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Raggruppa i frammenti di testo in righe (stessa ordinata), poi ordina per ascissa
    const rows: { y: number; items: { x: number; str: string }[] }[] = [];
    for (const it of content.items as any[]) {
      const str: string = it.str ?? '';
      if (!str.trim()) continue;
      totalChars += str.length;
      const x = it.transform[4];
      const y = it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) <= 3);
      if (!row) { row = { y, items: [] }; rows.push(row); }
      row.items.push({ x, str: str.trim() });
    }
    rows.sort((a, b) => b.y - a.y); // dall'alto in basso

    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x);
      const tokens = row.items.map(i => i.str).join(' ').split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      const lineText = tokens.join(' ');
      if (NOISE_RE.test(lineText)) continue;

      if (CODE_RE.test(tokens[0])) {
        finalize();
        current = { codice: tokens[0], parts: [], um: 'cad', valore: null };
        const priced = splitTrailingPrice(tokens.slice(1));
        if (priced) {
          current.parts.push(priced.rest.join(' '));
          current.um = priced.um;
          current.valore = priced.valore;
        } else {
          current.parts.push(tokens.slice(1).join(' '));
        }
      } else if (current) {
        if (current.valore === null) {
          const priced = splitTrailingPrice(tokens);
          if (priced) {
            current.parts.push(priced.rest.join(' '));
            current.um = priced.um;
            current.valore = priced.valore;
            continue;
          }
        }
        current.parts.push(lineText);
      }
    }

    onProgress?.(p, pdf.numPages);
    if (p % 5 === 0) await new Promise(r => setTimeout(r));
  }
  finalize();

  if (totalChars === 0) {
    throw new Error('Il PDF non contiene testo selezionabile (probabile scansione). Usa un file Excel o un PDF con testo.');
  }
  return { voci, skipped, pages: pdf.numPages };
}
