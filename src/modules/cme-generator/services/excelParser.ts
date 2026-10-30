// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/excelParser.ts
// Parse the uploaded .xlsx file containing 'BIM ON' and 'BIM OFF' sheets.
// ─────────────────────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs';
import { parseItNumber } from '../lib/parseNumber';
import type { Elemento } from '../types';

const COL_DESC    = 'Descricao';
const COL_WBSt1   = 'WBSt_1';
const COL_WBSt2   = 'WBSt_2';
const COL_WBSt3   = 'WBSt_3';
const COL_WBSt4   = 'WBSt_4';
const COL_WBSs1   = 'WBSs_1';
const COL_WBSs2   = 'WBSs_2';
const COL_WBSs3   = 'WBSs_3';
const COL_COUNT   = 'Count';
const COL_TIPO    = 'TipoPrezzo';

function resolveCol(headers: string[], target: string): number {
  const cleanStr = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const t = cleanStr(target);
  if (!t) return -1;

  // 1. Exact match
  let matchIdx = headers.findIndex(h => cleanStr(h) === t);
  if (matchIdx !== -1) return matchIdx + 1; // 1-indexed for ExcelJS

  // 2. Partial match (only for targets longer than 2 characters to avoid false matches like 'un' in 'count')
  if (t.length > 2) {
    matchIdx = headers.findIndex(h => cleanStr(h).includes(t) || t.includes(cleanStr(h)));
    if (matchIdx !== -1) return matchIdx + 1;
  }

  return -1;
}

let _counter = 0;
function makeId(edificio: string, livello: string, zona: string): string {
  _counter++;
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'X';
  return `${safe(edificio)}_${safe(livello)}_${safe(zona)}_${String(_counter).padStart(5, '0')}`;
}

function num(raw: any): number {
  if (typeof raw === 'number') return raw;
  if (!raw) return 0;
  return parseItNumber(raw);
}

function clean(raw: any): string {
  return raw ? String(raw).trim() : '';
}

function isBlank(v: any): boolean {
  const s = clean(v);
  return s === '' || s.toLowerCase() === 'nan' || s === '-';
}

export interface ExcelParseResult {
  elementos: Elemento[];
  warnings: string[];
  rawBimOffData?: any[][];
}

export async function parseRevitExcel(buffer: ArrayBuffer): Promise<ExcelParseResult> {
  _counter = 0;
  const warnings: string[] = [];
  const elementos: Elemento[] = [];
  
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  let rawBimOffData: any[][] | undefined = undefined;

  for (const sheet of workbook.worksheets) {
    const sheetName = sheet.name.toUpperCase();
    const isBimOn = sheetName.includes('BIM ON');
    const isBimOff = sheetName.includes('BIM OFF');
    
    // Process sheets that are either explicitly BIM ON/OFF or just process all if not named
    if (!isBimOn && !isBimOff && workbook.worksheets.length > 1) {
      warnings.push(`Foglio ignorato: ${sheet.name} (usare "BIM ON" o "BIM OFF" nel nome)`);
      continue;
    }

    const bimStatus = isBimOff ? 'BIM OFF' : 'BIM ON';

    // Extract raw data for BIM OFF to re-inject later
    if (isBimOff) {
      rawBimOffData = [];
      sheet.eachRow((row) => {
        // row.values is usually an array where index 0 is empty (1-based)
        const rowVals = Array.isArray(row.values) ? [...row.values] : [];
        if (rowVals.length > 0 && rowVals[0] === undefined) {
           rowVals.shift(); // remove the empty 0 index
        }
        rawBimOffData!.push(rowVals);
      });
    }

    if (sheet.rowCount < 1) continue;

    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      headers.push(clean(cell.value));
    });

    // Use fuzzy matching for typical column names since BIM OFF sheets might not use exact Revit names
    const resolveFuzzy = (targets: string[]) => {
      for (const t of targets) {
        const idx = resolveCol(headers, t);
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const cDesc  = resolveFuzzy([COL_DESC, 'DESCRIZIONE', 'DESIGNAÇÃO', 'LAVORAZIONE']);
    const cT1    = resolveFuzzy([COL_WBSt1, 'TARIFFA', 'CODICE', 'CÓDIGO', 'ARTICOLO']);
    const cF1    = resolveCol(headers, COL_WBSt2);
    const cT2    = resolveCol(headers, COL_WBSt3);
    const cF2    = resolveCol(headers, COL_WBSt4);
    const cEdif  = resolveFuzzy([COL_WBSs1, 'EDIFICIO', 'WBS1', 'WBS_1']);
    const cLiv   = resolveFuzzy([COL_WBSs2, 'LIVELLO', 'PISO', 'WBS2', 'WBS_2']);
    const cZona  = resolveFuzzy([COL_WBSs3, 'ZONA', 'WBS3', 'WBS_3']);
    const cCount = resolveFuzzy([COL_COUNT, 'QUANTITA', 'QUANTITÀ', 'QTD', 'QNT']);
    const cTipo  = resolveCol(headers, COL_TIPO);
    const cUm    = resolveFuzzy(['UM', 'U.M.', 'UNIDADE', 'UN', 'UNIT', 'UNITA']);
    const cTipoImp = resolveFuzzy(['TIPO DI IMPIANTI', 'TIPO DI IMPIANTO', 'TIPOIMPIANTO', 'TIPOIMPIANTI', 'IMPIANTO', 'IMPIANTI', 'TIPO DE INSTALACAO', 'TIPO DE INSTALAÇÃO']);

    const missing: string[] = [];
    if (cDesc === -1) missing.push(COL_DESC);
    if (cT1 === -1) missing.push(COL_WBSt1 + ' / TARIFFA');
    if (cCount === -1 && bimStatus === 'BIM ON') missing.push(COL_COUNT + ' / QUANTITA');

    if (missing.length > 0) {
      warnings.push(`Foglio ${sheet.name}: colonne mancanti: ${missing.join(', ')}`);
      continue;
    }

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (!row.hasValues) continue;

      const descrizione = clean(row.getCell(cDesc).value);
      if (isBlank(descrizione)) continue;

      const count    = cCount !== -1 ? num(row.getCell(cCount).value) : 1; // Default to 1 for BIM OFF if no count
      const edificio = cEdif !== -1 ? clean(row.getCell(cEdif).value) : 'SENZA_EDIFICIO';
      const livello  = cLiv !== -1 ? clean(row.getCell(cLiv).value) : 'SENZA_PIANO';
      const zona     = cZona !== -1 ? clean(row.getCell(cZona).value) : 'SENZA_SPAZIO';
      const unidade  = cUm !== -1 ? clean(row.getCell(cUm).value) : undefined;
      const tipoImpianto = cTipoImp !== -1 ? clean(row.getCell(cTipoImp).value) : undefined;

      const tariffa1   = cT1 !== -1 ? clean(row.getCell(cT1).value) : '';
      const tipoPrezzo = cTipo !== -1 ? (clean(row.getCell(cTipo).value).toUpperCase() || undefined) : undefined;
      
      if (!isBlank(tariffa1) || tipoPrezzo === 'NVP') {
        const finalTariffa = isBlank(tariffa1) && tipoPrezzo === 'NVP' ? 'NVP' : tariffa1;
        const fator1  = cF1 !== -1 ? num(row.getCell(cF1).value) : 1;
        const qty1    = count * (fator1 || 1);

        const tariffa2 = cT2 !== -1 ? clean(row.getCell(cT2).value) : '';
        const fator2  = cF2 !== -1 ? num(row.getCell(cF2).value) : 1;

        elementos.push({
          idUnico:     makeId(edificio, livello, zona),
          edificio,
          livello,
          zona,
          descricao: descrizione,
          tariffa:     finalTariffa,
          quantita:    qty1,
          fatorWBS:    fator1,
          countRevit:  count,
          tipoPrezzo,
          bimStatus,
          tariffa2:    !isBlank(tariffa2) ? tariffa2 : undefined,
          fatorWBS2:   !isBlank(tariffa2) ? (fator2 || 1) : undefined,
          unidade,
          tipoImpianto,
        });
      }
    }
  }

  if (elementos.length === 0) {
    throw new Error('Nessun elemento valido trovato nel file Excel.');
  }

  return { elementos, warnings, rawBimOffData };
}
