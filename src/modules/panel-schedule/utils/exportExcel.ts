/**
 * exportExcel.ts
 *
 * Genera un file Excel (.xlsx) formattato con la tabella di calcolo,
 * una sezione per ogni quadro, replicando lo stile del report di riferimento
 * (intestazione di gruppo, colonne tecniche, bordi su ogni cella).
 */

import ExcelJS from 'exceljs';
import type { ParsedSchema } from '../types';
import { saveFileWithPicker } from '@/utils/fileSave';

const COLUMNS = [
  { header: 'Descrizione', width: 40 },
  { header: 'Sistema', width: 10 },
  { header: 'Fasi', width: 10 },
  { header: 'P Installata [kW]', width: 16 },
  { header: 'Cavo', width: 20 },
  { header: 'Lunghezza [m]', width: 14 },
  { header: 'Tensione [V]', width: 12 },
  { header: 'ΔV [%]', width: 10 },
  { header: 'Verifica (Ib≤In≤Iz)', width: 26 },
  { header: 'Verifica ΔV (≤4%)', width: 22 },
] as const;

const DV_LIMIT_PCT = 4;

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
  right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
};

function formatNum(n: number | null, decimals = 2): string {
  if (n === null || n === undefined) return '';
  return n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function buildVerifica(ib: number | null, ir: number | null, inA: number | null, iz: number | null): string {
  const protezione = ir ?? inA; // usa Ir (regolazione) se disponibile, altrimenti In (telaio)
  if (ib === null && protezione === null && iz === null) return '';
  const parts = [ib !== null ? formatNum(ib) : '?', protezione !== null ? formatNum(protezione, 0) : '?', iz !== null ? formatNum(iz, 0) : '?'];
  return `${parts[0]}<=${parts[1]}<=${parts[2]} A`;
}

function buildVerificaDV(pct: number | null): { text: string; ok: boolean | null } {
  if (pct === null) return { text: '', ok: null };
  const ok = Math.abs(pct) <= DV_LIMIT_PCT;
  return { text: `${formatNum(pct)}<=${DV_LIMIT_PCT} % (${ok ? 'Verificato' : 'NON verificato'})`, ok };
}

export async function exportSchemaToExcel(schema: ParsedSchema, fileName = 'quadro-elettrico.xlsx') {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Rilo AI Platform';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Quadri Elettrici', {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,   // tutte le colonne su un'unica larghezza di pagina
      fitToHeight: 0,  // altezza libera (più pagine in verticale se serve)
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
      horizontalCentered: true,
    },
  });

  sheet.columns = COLUMNS.map(c => ({ width: c.width }));

  let rowIndex = 1;

  for (const quadro of schema.quadri) {
    // ── Riga di intestazione del quadro (merged, sfondo scuro) ──
    const indent = '    '.repeat(quadro.livello); // indentazione visiva per livello di cascata
    const headerLabel = quadro.alimentatoDa
      ? `${indent}${quadro.nome}  (alimentato da ${quadro.alimentatoDa})`
      : `${indent}${quadro.nome}${quadro.livello === 0 ? '  — RADICE / QGBT' : ''}`;
    const headerRow = sheet.getRow(rowIndex);
    headerRow.getCell(1).value = headerLabel;
    sheet.mergeCells(rowIndex, 1, rowIndex, COLUMNS.length);
    headerRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
    headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D2B3A' } };
    headerRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.height = 22;
    rowIndex++;

    // ── Riga colonne ──
    const colRow = sheet.getRow(rowIndex);
    COLUMNS.forEach((c, i) => {
      const cell = colRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, size: 9, color: { argb: 'FF444444' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinBorder;
    });
    colRow.height = 28;
    rowIndex++;

    // ── Righe dati ──
    for (const r of quadro.righe) {
      const row = sheet.getRow(rowIndex);
      const verificaDV = buildVerificaDV(r.caduteTensionePct);
      const values = [
        `${r.tag ? r.tag + ' | ' : ''}${r.descrizione}`,
        r.sistema,
        r.fasi,
        formatNum(r.potenzaKw),
        r.cavo,
        formatNum(r.lunghezzaM, 1),
        formatNum(r.tensioneV, 0),
        formatNum(r.caduteTensionePct, 2),
        buildVerifica(r.ib, r.ir, r.in, r.iz),
        verificaDV.text,
      ];
      values.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        cell.font = { size: 9 };
        cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
        cell.border = thinBorder;
        if (r.warning) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
        }
      });
      // Evidenzia in rosso la cella di verifica ΔV se supera il limite normativo
      if (verificaDV.ok === false) {
        const dvCell = row.getCell(values.length);
        dvCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8D7DA' } };
        dvCell.font = { size: 9, bold: true, color: { argb: 'FF842029' } };
      }
      if (r.warning) {
        row.getCell(1).note = r.warning;
      }
      rowIndex++;
    }

    // Riga vuota di separazione tra quadri
    rowIndex++;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  await saveFileWithPicker(blob, {
    suggestedName: fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx'],
    description: 'Foglio Excel',
  });
}
