// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/excelFiller.ts
// Uses ExcelJS to load the user's template from Supabase Storage, fill it with
// computed results, and style the hierarchical WBS rows with custom colors.
// ─────────────────────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { ResultadoItem } from '../types';
import { downloadTemplateBuffer } from './templateService';

/**
 * Helper to detect columns in a sheet using fuzzy matching.
 */
function detectColumns(worksheet: ExcelJS.Worksheet): { headerRowIdx: number; map: Record<string, number> } {
  let bestRowIdx = -1;
  let maxMatchedCols = 0;
  let bestColMap: Record<string, number> = {};

  // Check up to the first 100 rows to find a header
  for (let i = 1; i <= Math.min(worksheet.rowCount, 100); i++) {
    const row = worksheet.getRow(i);
    if (!row.hasValues) continue;

    let matchedCols = 0;
    const tempColMap: Record<string, number> = {};

    row.eachCell((cell, colNumber) => {
      const val = String(cell.value || '').toUpperCase().trim();
      if (!val) return;

      if (val.includes('TARIFFA') || val.includes('CODICE') || val.includes('CÓDIGO') || val.includes('CODE') || val === 'ARTICOLO' || val === 'ART') {
        tempColMap['tariffa'] = colNumber; matchedCols++;
      }
      else if (val.includes('DESCRIZIONE') || val.includes('DESIGNAÇÃO') || val.includes('DESC') || val.includes('TEXTO') || val.includes('LAVORAZIONE')) {
        tempColMap['descrizione'] = colNumber; matchedCols++;
      }
      else if (val === 'UM' || val === 'U.M.' || val === 'UNIDADE' || val === 'UN' || val === 'UNIT') {
        tempColMap['um'] = colNumber; matchedCols++;
      }
      else if (val.includes('QUANTITA') || val.includes('QUANTITÀ') || val === 'Q.TÀ' || val === 'QTD' || val.includes('QNT') || val.includes('QUANTITY')) {
        tempColMap['quantita'] = colNumber; matchedCols++;
      }
      else if (val.includes('PREZZO') || val.includes('UNITARIO') || val === 'PU' || val.includes('PREÇO') || val.includes('PRICE')) {
        tempColMap['valore'] = colNumber; matchedCols++;
      }
      else if (val.includes('TOTALE') || val === 'TOT' || val.includes('TOTAL') || val === 'IMPORTO') {
        tempColMap['totale'] = colNumber; matchedCols++;
      }
      else if (val === 'BIM' || val.includes('MODELADO')) {
        tempColMap['bim'] = colNumber; matchedCols++;
      }
      // Impianto matching
      else if (val.includes('IMPIANTI') || val.includes('IMPIANTO') || val.includes('INSTALACAO') || val.includes('INSTALAÇÃO')) {
        tempColMap['tipoImpianto'] = colNumber; matchedCols++;
      }
      // WBS matching
      else if (val.includes('EDIFICIO') || val === 'WBS1' || val.includes('WBS 1') || val === 'WBSS_1') {
        tempColMap['edificio'] = colNumber; matchedCols++;
      }
      else if (val.includes('LIVELLO') || val === 'WBS2' || val.includes('WBS 2') || val.includes('PISO') || val === 'WBSS_2') {
        tempColMap['livello'] = colNumber; matchedCols++;
      }
      else if (val.includes('ZONA') || val === 'WBS3' || val.includes('WBS 3') || val === 'WBSS_3') {
        tempColMap['zona'] = colNumber; matchedCols++;
      }
    });

    if (matchedCols > maxMatchedCols) {
      maxMatchedCols = matchedCols;
      bestRowIdx = i;
      bestColMap = tempColMap;
    }
  }

  if (maxMatchedCols > 0) {
    return { headerRowIdx: bestRowIdx, map: bestColMap };
  }
  
  // Fallback map
  return { 
    headerRowIdx: worksheet.rowCount > 0 ? worksheet.rowCount : 1, 
    map: { tariffa: 1, descrizione: 2, um: 3, quantita: 4, valore: 5, totale: 6 } 
  };
}

/**
 * Groups items and inserts them into the template using ExcelJS (with styles).
 */
export async function fillTemplateAndExport(
  results: ResultadoItem[],
  filename = 'Computo_Metrico_Gerado.xlsx',
  rawBimOffData?: any[][]
): Promise<void> {
  // 1. Fetch template buffer
  let buffer: ArrayBuffer;
  try {
    buffer = await downloadTemplateBuffer();
  } catch (err: any) {
    throw new Error('Impossibile caricare il template base. Verifica di averlo caricato nelle Impostazioni.');
  }

  // 2. Load into ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  fillWorkbook(workbook, results, rawBimOffData);

  // 9. Write and download
  const outBuffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([outBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
}

/** Riempie il foglio COMPUTO del workbook (template) con i risultati; importi come formule. */
export function fillWorkbook(workbook: ExcelJS.Workbook, results: ResultadoItem[], rawBimOffData?: any[][]): void {
  if (workbook.worksheets.length === 0) {
    throw new Error('Il template Excel non contiene fogli di lavoro.');
  }

  // 3. Identify target COMPUTO sheet
  let wsComputo = workbook.worksheets.find(ws => ws.name.toUpperCase().includes('COMPUTO'));
  if (!wsComputo) {
    wsComputo = workbook.worksheets.length > 1 ? workbook.worksheets[1] : workbook.worksheets[0];
  }
  
  const targetMeta = detectColumns(wsComputo);
  const targetColMap = targetMeta.map;

  // Determine BIM column index (create one at the end if it doesn't exist)
  if (targetColMap['bim'] === undefined) {
    const maxCol = Math.max(...Object.values(targetColMap), 0);
    targetColMap['bim'] = maxCol + 1;
    // Inject header text
    const headerRow = wsComputo.getRow(targetMeta.headerRowIdx);
    headerRow.getCell(targetColMap['bim']).value = 'BIM';
    headerRow.commit();
  }

  // We no longer extract non-modeled items from the template.
  // The 'results' array already contains both BIM ON and BIM OFF items 
  // extracted from the uploaded Excel file.

  // 5. Group results hierarchically: Edificio -> Livello -> Zona
  const groups = new Map<string, Map<string, Map<string, ResultadoItem[]>>>();
  for (const item of results) {
    const ed = item.edificio || 'Generale';
    const lv = item.livello || 'N/A';
    const zn = item.zona || 'N/A';

    if (!groups.has(ed)) groups.set(ed, new Map());
    const edGroup = groups.get(ed)!;
    if (!edGroup.has(lv)) edGroup.set(lv, new Map());
    const lvGroup = edGroup.get(lv)!;
    if (!lvGroup.has(zn)) lvGroup.set(zn, []);
    lvGroup.get(zn)!.push(item);
  }

  // 6. Clear existing placeholder rows beneath the header
  const totalRows = wsComputo.rowCount;
  if (totalRows > targetMeta.headerRowIdx) {
    // Delete rows starting from the bottom to avoid shifting issues, 
    // or simply delete count rows from headerRowIdx + 1
    const rowsToDelete = totalRows - targetMeta.headerRowIdx;
    wsComputo.spliceRows(targetMeta.headerRowIdx + 1, rowsToDelete);
  }

  // 7. Insert Rows with Styles — importi come formule Excel (quantità × prezzo, subtotali con SUBTOTAL)
  //    così, modificando una quantità o un prezzo nel file, tutti i totali si aggiornano.
  const cQ = targetColMap['quantita'], cV = targetColMap['valore'], cT = targetColMap['totale'];
  const useFormulas = !!(cQ && cV && cT);
  const L = (c: number) => wsComputo!.getColumn(c).letter;
  const setF = (row: ExcelJS.Row, col: number | undefined, formula: string, result: number) => {
    if (col) row.getCell(col).value = useFormulas ? { formula, result } : result;
  };
  // Subtotale di un gruppo: somma delle sole righe "foglia" (SUBTOTAL ignora gli altri SUBTOTAL annidati)
  const closeGroup = (rowNumber: number, startRow: number, endRow: number, value: number) => {
    if (!cT) return;
    const f = endRow >= startRow ? `SUBTOTAL(9,${L(cT)}${startRow}:${L(cT)}${endRow})` : '0';
    wsComputo!.getRow(rowNumber).getCell(cT).value = useFormulas ? { formula: f, result: value } : value;
  };

  let insertIndex = targetMeta.headerRowIdx + 1;
  const firstDataRow = insertIndex;

  for (const [edificio, edGroup] of groups.entries()) {
    let edHeader = 0;
    const edStart = insertIndex;
    let edTotal = 0;
    edGroup.forEach(lv => lv.forEach(items => items.forEach(i => edTotal += i.total)));

    if (edificio && edificio !== 'Generale') {
      const row = wsComputo.insertRow(insertIndex++, []);
      edHeader = row.number;
      const colIdx = targetColMap['edificio'] ?? targetColMap['descrizione'] ?? 1;
      row.getCell(colIdx).value = edificio;

      // Dark Blue formatting
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }; // Dark blue
      row.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      row.commit();
    }

    for (const [livello, lvGroup] of edGroup.entries()) {
      let lvHeader = 0;
      const lvStart = insertIndex;
      let lvTotal = 0;
      lvGroup.forEach(items => items.forEach(i => lvTotal += i.total));

      if (livello && livello !== 'N/A') {
        const row = wsComputo.insertRow(insertIndex++, []);
        lvHeader = row.number;
        const colIdx = targetColMap['livello'] ?? targetColMap['descrizione'] ?? 1;
        row.getCell(colIdx).value = targetColMap['livello'] ? livello : `  ${livello}`;

        // Medium Blue formatting
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F75B5' } }; // Medium blue
        row.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        row.commit();
      }

      for (const [zona, items] of lvGroup.entries()) {
        let znHeader = 0;
        const znStart = insertIndex;
        let znTotal = 0;
        items.forEach(i => znTotal += i.total);

        if (zona && zona !== 'N/A') {
          const row = wsComputo.insertRow(insertIndex++, []);
          znHeader = row.number;
          const colIdx = targetColMap['zona'] ?? targetColMap['descrizione'] ?? 1;
          row.getCell(colIdx).value = targetColMap['zona'] ? zona : `    ${zona}`;

          // Light Blue formatting
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }; // Light blue
          row.font = { color: { argb: 'FF000000' }, bold: true };
          row.commit();
        }

        // Data Rows
        for (const item of items) {
          // Write main header row for the element (bold, WBS and Code empty)
          const row = wsComputo.insertRow(insertIndex++, []);
          const parentNo = row.number;

          if (targetColMap['edificio']) row.getCell(targetColMap['edificio']).value = '';
          if (targetColMap['livello']) row.getCell(targetColMap['livello']).value = '';
          if (targetColMap['zona']) row.getCell(targetColMap['zona']).value = '';
          if (targetColMap['tipoImpianto']) row.getCell(targetColMap['tipoImpianto']).value = item.tipoImpianto || '';
          if (targetColMap['categoria']) row.getCell(targetColMap['categoria']).value = item.categoria;

          if (targetColMap['tariffa']) row.getCell(targetColMap['tariffa']).value = '';
          if (targetColMap['descrizione']) row.getCell(targetColMap['descrizione']).value = item.descrizioneElemento;
          if (targetColMap['um']) row.getCell(targetColMap['um']).value = item.unidade || '';
          if (cQ) row.getCell(cQ).value = item.quantitaElemento; // dato di input: modificabile
          if (targetColMap['bim']) row.getCell(targetColMap['bim']).value = item.bimStatus || 'BIM ON';

          // Make the main header row bold
          row.font = { bold: true };

          // Write all sub-items underneath
          const subItemsList = item.subItems && item.subItems.length > 0 ? item.subItems : [{
            codicePrezzarioTarget: item.tariffaOriginal || item.idElemento,
            descrizionePrezzarioTarget: item.descrizioneElemento,
            unidade: item.unidade || '',
            quantitaComposizione: 1,
            valoreUnitario: item.valoreUnitario,
            status: item.status
          }];

          const firstChild = insertIndex;
          for (const sub of subItemsList) {
            const rowSub = wsComputo.insertRow(insertIndex++, []);

            // WBS columns filled with coordinates
            if (targetColMap['edificio']) rowSub.getCell(targetColMap['edificio']).value = item.edificio;
            if (targetColMap['livello']) rowSub.getCell(targetColMap['livello']).value = item.livello;
            if (targetColMap['zona']) rowSub.getCell(targetColMap['zona']).value = item.zona;
            if (targetColMap['tipoImpianto']) rowSub.getCell(targetColMap['tipoImpianto']).value = item.tipoImpianto || '';
            if (targetColMap['categoria']) rowSub.getCell(targetColMap['categoria']).value = item.categoria;

            if (targetColMap['tariffa']) rowSub.getCell(targetColMap['tariffa']).value = sub.codicePrezzarioTarget;
            if (targetColMap['descrizione']) rowSub.getCell(targetColMap['descrizione']).value = sub.descrizionePrezzarioTarget;
            if (targetColMap['um']) rowSub.getCell(targetColMap['um']).value = sub.unidade || (sub as any).um || '';
            const fattore = sub.quantitaComposizione || 1;
            const childQty = item.quantitaElemento * fattore;
            const childTot = childQty * (sub.valoreUnitario || 0);
            // quantità = quantità dell'elemento × fattore della voce; prezzo = dato di input; importo = quantità × prezzo
            setF(rowSub, cQ, fattore === 1 ? `${L(cQ || 1)}${parentNo}` : `${L(cQ || 1)}${parentNo}*${fattore}`, childQty);
            if (cV) rowSub.getCell(cV).value = sub.valoreUnitario;
            setF(rowSub, cT, `${L(cQ || 1)}${rowSub.number}*${L(cV || 1)}${rowSub.number}`, childTot);
            if (targetColMap['bim']) rowSub.getCell(targetColMap['bim']).value = item.bimStatus || 'BIM ON';

            rowSub.commit();
          }
          const lastChild = insertIndex - 1;

          // Riga dell'elemento: importo = somma delle sue voci; prezzo unitario = importo / quantità
          if (cT) setF(row, cT, `SUBTOTAL(9,${L(cT)}${firstChild}:${L(cT)}${lastChild})`, item.total);
          if (cV && cT && cQ) setF(row, cV, `IF(${L(cQ)}${parentNo}=0,0,${L(cT)}${parentNo}/${L(cQ)}${parentNo})`, item.valoreUnitario);
          row.commit();
        }

        if (znHeader) closeGroup(znHeader, znStart + 1, insertIndex - 1, znTotal);
      }

      if (lvHeader) closeGroup(lvHeader, lvStart + 1, insertIndex - 1, lvTotal);
    }

    if (edHeader) closeGroup(edHeader, edStart + 1, insertIndex - 1, edTotal);
  }

  // Totale generale (somma di tutte le righe foglia)
  if (cT && insertIndex > firstDataRow) {
    const grand = results.reduce((s, r) => s + r.total, 0);
    const row = wsComputo.insertRow(insertIndex++, []);
    row.getCell(targetColMap['descrizione'] ?? targetColMap['tariffa'] ?? 1).value = 'TOTALE GENERALE';
    row.getCell(cT).value = useFormulas
      ? { formula: `SUBTOTAL(9,${L(cT)}${firstDataRow}:${L(cT)}${insertIndex - 2})`, result: grand }
      : grand;
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
    row.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    row.commit();
  }

  // Excel ricalcola tutte le formule all'apertura
  workbook.calcProperties = { ...(workbook.calcProperties ?? {}), fullCalcOnLoad: true };

  // 8. Inject the raw BIM OFF sheet back into the workbook
  if (rawBimOffData && rawBimOffData.length > 0) {
    // Check if there is already a BIM OFF sheet in the template and remove it so we can append ours
    const existingOff = workbook.worksheets.find(ws => ws.name.toUpperCase() === 'BIM OFF');
    if (existingOff) workbook.removeWorksheet(existingOff.id);

    const wsBimOff = workbook.addWorksheet('BIM OFF');
    wsBimOff.addRows(rawBimOffData);
  }

}
