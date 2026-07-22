/**
 * exportElencoPrezzi.ts
 *
 * Genera l'Excel ripulito, nella stessa estetica dell'elenco prezzi Primus
 * originale: intestazione "Tariffa / Descrizione / Unità / Prezzo / Sommario
 * (Quantità, Importo)", ma con Prezzo e Importo vuoti (pronti per essere
 * compilati) e Importo calcolato automaticamente come Prezzo × Quantità.
 */

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ElencoPrezziRow } from '../types';

const EURO_FORMAT = '€ #,##0.00';

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
};

export async function exportElencoPrezzi(rows: ElencoPrezziRow[], fileName = 'elenco-prezzi-pulito.xlsx') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rilo AI Platform';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Elenco Prezzi', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  // Colonna A vuota di margine, come nel file Primus originale
  sheet.columns = [
    { width: 4 },
    { width: 18 },   // Tariffa
    { width: 100 },  // Descrizione
    { width: 14 },   // Unità di misura
    { width: 14 },   // Prezzo
    { width: 14 },   // Quantità
    { width: 16 },   // Importo
  ];

  // ── Intestazione (righe 1-2, come l'originale) ──
  const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 10, color: { argb: 'FF333333' } };

  sheet.mergeCells('B1:B2');
  sheet.mergeCells('C1:C2');
  sheet.mergeCells('D1:D2');
  sheet.mergeCells('E1:E2');
  sheet.mergeCells('F1:G1');

  const headerCells: { addr: string; text: string }[] = [
    { addr: 'B1', text: 'Tariffa' },
    { addr: 'C1', text: "Descrizione dell'articolo" },
    { addr: 'D1', text: 'Unità di misura' },
    { addr: 'E1', text: 'Prezzo' },
    { addr: 'F1', text: 'Sommario' },
  ];
  headerCells.forEach(({ addr, text }) => {
    const cell = sheet.getCell(addr);
    cell.value = text;
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
  ['F2', 'G2'].forEach((addr, i) => {
    const cell = sheet.getCell(addr);
    cell.value = i === 0 ? 'Quantità' : 'Importo';
    cell.font = headerFont;
    cell.fill = headerFill;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder;
  });
  sheet.getRow(1).height = 18;
  sheet.getRow(2).height = 18;

  // ── Righe dati ──
  let rowIndex = 3;
  for (const item of rows) {
    const row = sheet.getRow(rowIndex);

    row.getCell(2).value = item.tariffa;
    row.getCell(3).value = item.descrizione;
    row.getCell(4).value = item.unita;
    row.getCell(5).value = null; // Prezzo — vuoto, da compilare
    row.getCell(6).value = item.quantita;
    // "result" fornisce un valore in cache (0, finché il Prezzo non viene compilato)
    // così la cella non appare vuota/non riconosciuta prima che Excel ricalcoli.
    row.getCell(7).value = { formula: `E${rowIndex}*F${rowIndex}`, result: 0 };

    row.getCell(5).numFmt = EURO_FORMAT;
    row.getCell(7).numFmt = EURO_FORMAT;

    for (let c = 2; c <= 7; c++) {
      const cell = row.getCell(c);
      cell.font = { size: 9 };
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'left' : 'center', wrapText: c === 3 };
    }

    rowIndex++;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  saveAs(blob, fileName);
}
