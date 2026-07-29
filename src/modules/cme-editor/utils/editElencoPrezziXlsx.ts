/**
 * editElencoPrezziXlsx.ts
 *
 * Per i file .xlsx (Excel moderno) modifichiamo il workbook ORIGINALE al suo
 * posto — invece di ricostruire un file da zero — così tutta la formattazione
 * originale (colori delle celle, colori/stile del testo, bordi) viene
 * preservata al 100%. Questo è possibile solo per .xlsx: il formato legacy
 * .xls (Excel 97-2003, quello esportato di default da Primus) non espone gli
 * stili delle celle nelle librerie JavaScript gratuite — per quei file si usa
 * invece parseElencoPrezzi.ts + exportElencoPrezzi.ts (stile pulito standard).
 */

import ExcelJS from 'exceljs';
import type { ElencoPrezziRow } from '../types';

const EURO_FORMAT = '€ #,##0.00';

function parseItalianNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[\s ]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && 'richText' in (v as any)) {
    return (v as any).richText.map((rt: any) => rt.text).join('');
  }
  if (typeof v === 'object' && 'result' in (v as any)) {
    return String((v as any).result ?? '');
  }
  return String(v).trim();
}

function colLetter(colNumber: number): string {
  let n = colNumber;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export interface EditInPlaceResult {
  workbook: ExcelJS.Workbook;
  rows: ElencoPrezziRow[];
  originalCount: number;
  removedZeroQty: number;
}

export async function editElencoPrezziXlsxInPlace(file: File): Promise<EditInPlaceResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Il file non contiene nessun foglio.');

  // ── Individua l'intestazione (righe con "Tariffa" / "Descrizione" / "Quantità") ──
  let headerRowNumber = -1;
  let tariffaCol = -1, descCol = -1, unitaCol = -1;
  const maxScan = Math.min(sheet.rowCount, 10);
  for (let r = 1; r <= maxScan && headerRowNumber === -1; r++) {
    const row = sheet.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell);
      if (/tariffa/i.test(text)) tariffaCol = colNumber;
      if (/descrizione/i.test(text)) descCol = colNumber;
      if (/unit[àa]\s*di/i.test(text)) unitaCol = colNumber;
    });
    if (tariffaCol >= 0 && descCol >= 0) headerRowNumber = r;
  }
  if (headerRowNumber === -1) {
    throw new Error('Non riconosco il formato del file: non trovo le colonne "Tariffa" / "Descrizione". Verifica che sia un elenco prezzi esportato da Primus.');
  }
  let quantitaCol = -1;
  sheet.getRow(headerRowNumber + 1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (/quantit[àa]/i.test(cellText(cell))) quantitaCol = colNumber;
  });
  if (quantitaCol === -1) quantitaCol = descCol + 3;
  if (unitaCol === -1) unitaCol = descCol + 1;
  const prezzoCol = unitaCol + 1;
  const importoCol = quantitaCol + 1;

  const rows: ElencoPrezziRow[] = [];
  const rowsToDelete: number[] = [];
  let originalCount = 0;
  let removedZeroQty = 0;

  let r = headerRowNumber + 2;
  const lastRow = sheet.rowCount;
  while (r <= lastRow) {
    const codeRow = sheet.getRow(r);
    const tariffa = cellText(codeRow.getCell(tariffaCol));

    if (tariffa) {
      const priceRow = sheet.getRow(r + 1);
      const priceDesc = cellText(priceRow.getCell(descCol));
      if (/^euro\b/i.test(priceDesc)) {
        originalCount++;
        const descrizione = cellText(codeRow.getCell(descCol));
        const unita = cellText(priceRow.getCell(unitaCol));
        const quantita = parseItalianNumber(cellText(priceRow.getCell(quantitaCol)));

        if (quantita === 0) {
          removedZeroQty++;
          rowsToDelete.push(r, r + 1);
        } else {
          // Trasferisci unità e quantità sulla riga "codice", che mantiene lo
          // stile/colore originale del file; svuota Prezzo e imposta la
          // formula dell'Importo, mantenendo lo stile della cella intatto.
          codeRow.getCell(unitaCol).value = unita;
          codeRow.getCell(quantitaCol).value = quantita;
          codeRow.getCell(prezzoCol).value = null;
          codeRow.getCell(importoCol).value = {
            formula: `${colLetter(prezzoCol)}${r}*${colLetter(quantitaCol)}${r}`,
            result: 0,
          };
          codeRow.getCell(prezzoCol).numFmt = EURO_FORMAT;
          codeRow.getCell(importoCol).numFmt = EURO_FORMAT;
          rowsToDelete.push(r + 1);
          rows.push({ tariffa, descrizione, unita, quantita });
        }
        r += 2;
        continue;
      }
    }

    // Righe estranee alla struttura a coppie (es. "Voce riservata!!!"): se hanno
    // quantità zero (o nessun valore) vengono comunque scartate.
    if (!tariffa && r > headerRowNumber + 1) {
      const desc = cellText(codeRow.getCell(descCol));
      const quantita = parseItalianNumber(cellText(codeRow.getCell(quantitaCol)));
      if (desc && quantita === 0) {
        rowsToDelete.push(r);
      }
    }
    r++;
  }

  // Elimina le righe dal basso verso l'alto per non alterare gli indici già letti.
  [...new Set(rowsToDelete)].sort((a, b) => b - a).forEach(rn => sheet.spliceRows(rn, 1));

  return { workbook, rows, originalCount, removedZeroQty };
}
