// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/excelExporter.ts
// Generate a 5-sheet .xlsx workbook from ResultadoItem[]
// Uses SheetJS (xlsx) — 100% browser-native, no Node.js dependencies.
// Gli importi sono formule Excel (quantità × prezzo, somme e SUMIFS): modificando una quantità o
// un prezzo nel foglio Computo, tutti i totali e i riepiloghi si aggiornano.
// ─────────────────────────────────────────────────────────────────────────────
import { wbsLevels, wbsDepth } from '../lib/wbs';
import type { ResultadoItem } from '../types';
import type * as XLSXType from 'xlsx';

// Note: SheetJS community edition has limited style support.
// We use cell metadata and rely on data organisation for visual clarity.

const SHEET = 'Computo';
const LEAF = '  [*'; // le righe delle voci iniziano con "  [codice]": criterio per sommare solo le righe foglia

interface Layout {
  depth: number;
  cCat: number; cDesc: number; cQty: number; cVal: number; cTot: number; cStatus: number;
  firstRow: number; lastRow: number; // righe Excel (1-based) dei dati, esclusa la riga TOTALE
}

const col = (XLSX: typeof XLSXType, c: number) => XLSX.utils.encode_col(c);
const rng = (XLSX: typeof XLSXType, c: number, lay: Layout) => `${SHEET}!$${col(XLSX, c)}$${lay.firstRow}:$${col(XLSX, c)}$${lay.lastRow}`;

function setFormula(XLSX: typeof XLSXType, ws: XLSXType.WorkSheet, r: number, c: number, f: string, v: number, z?: string) {
  const cell: XLSXType.CellObject = { t: 'n', f, v };
  if (z) cell.z = z;
  ws[XLSX.utils.encode_cell({ r, c })] = cell;
}

function buildComputoSheet(XLSX: typeof XLSXType, results: ResultadoItem[]): { ws: XLSXType.WorkSheet; lay: Layout } {
  const depth = wbsDepth(results);
  const headers = [
    ...Array.from({ length: depth }, (_, i) => `WBS${i + 1}`), 'IMPIANTO', 'CATEGORIA', 'DESCRIZIONE',
    'QTD', 'UM', 'VALORE UNIT.', 'TOTALE (€)', 'PREZZARIO', 'STATUS',
  ];
  const cCat = depth + 1, cDesc = depth + 2, cQty = depth + 3, cVal = depth + 5, cTot = depth + 6, cStatus = depth + 8;

  // Ogni riga dati con le informazioni necessarie per scrivere le formule (indice di riga Excel 0-based)
  type Meta = { kind: 'parent'; first: number; last: number; total: number; value: number }
    | { kind: 'child'; parent: number; fattore: number; qty: number; total: number };
  const dataRows: any[][] = [];
  const metas: Meta[] = [];

  for (const item of results) {
    const parentRow = dataRows.length + 1; // +1: riga di intestazione
    dataRows.push([
      ...Array<string>(depth).fill(''), // WBS (solo sulle righe delle voci)
      item.tipoImpianto || '', // IMPIANTO
      item.categoria,
      item.descrizioneElemento,
      item.quantitaElemento,
      item.unidade || '',
      item.valoreUnitario,
      item.total,
      item.originePrezzo,
      item.status,
    ]);
    const parentMeta: Meta = { kind: 'parent', first: parentRow + 1, last: parentRow, total: item.total, value: item.valoreUnitario };
    metas.push(parentMeta);

    const subItemsList = item.subItems && item.subItems.length > 0 ? item.subItems : [{
      codicePrezzarioTarget: item.tariffaOriginal || item.idElemento,
      descrizionePrezzarioTarget: item.descrizioneElemento,
      unidade: item.unidade || '',
      quantitaComposizione: 1,
      valoreUnitario: item.valoreUnitario,
      status: item.status
    }];

    for (const sub of subItemsList) {
      const fattore = sub.quantitaComposizione || 1;
      const childQty = item.quantitaElemento * fattore;
      const childTot = childQty * (sub.valoreUnitario || 0);
      dataRows.push([
        ...Array.from({ length: depth }, (_, i) => wbsLevels(item)[i] ?? ''),
        item.tipoImpianto || '', // IMPIANTO
        item.categoria,
        `${LEAF.slice(0, 3)}${sub.codicePrezzarioTarget || 'NVP'}] ${sub.descrizionePrezzarioTarget}`,
        childQty,
        sub.unidade || (sub as any).um || '',
        sub.valoreUnitario,
        childTot,
        '',
        '',
      ]);
      metas.push({ kind: 'child', parent: parentRow, fattore, qty: childQty, total: childTot });
      parentMeta.last = dataRows.length;
    }
  }

  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  const totalRow: any[] = Array(headers.length).fill('');
  totalRow[cDesc] = 'TOTALE GENERALE';
  totalRow[cTot] = grandTotal;

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalRow]);

  // Formule: quantità della voce = quantità elemento × fattore; importo = quantità × prezzo;
  // importo dell'elemento = somma delle sue voci; prezzo unitario dell'elemento = importo / quantità.
  const A = (c: number, r0: number) => `${col(XLSX, c)}${r0 + 1}`; // r0 = indice di riga 0-based
  metas.forEach((m, i) => {
    const r = i + 1; // riga 0-based nel foglio (0 = intestazione)
    if (m.kind === 'child') {
      setFormula(XLSX, ws, r, cQty, m.fattore === 1 ? A(cQty, m.parent) : `${A(cQty, m.parent)}*${m.fattore}`, m.qty);
      setFormula(XLSX, ws, r, cTot, `${A(cQty, r)}*${A(cVal, r)}`, m.total);
    } else {
      setFormula(XLSX, ws, r, cTot, `SUBTOTAL(9,${A(cTot, m.first)}:${A(cTot, m.last)})`, m.total);
      setFormula(XLSX, ws, r, cVal, `IF(${A(cQty, r)}=0,0,${A(cTot, r)}/${A(cQty, r)})`, m.value);
    }
  });
  const lastDataRow = dataRows.length; // 0-based dell'ultima riga dati
  if (dataRows.length > 0) {
    setFormula(XLSX, ws, lastDataRow + 1, cTot, `SUBTOTAL(9,${A(cTot, 1)}:${A(cTot, lastDataRow)})`, grandTotal);
  }

  ws['!cols'] = [
    ...Array.from({ length: depth }, () => ({ wch: 16 })), { wch: 18 }, { wch: 18 }, { wch: 48 },
    { wch: 9 },  { wch: 8 },  { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
  ];

  const lay: Layout = { depth, cCat, cDesc, cQty, cVal, cTot, cStatus, firstRow: 2, lastRow: dataRows.length + 1 };
  return { ws, lay };
}

// Riepilogo per categoria: SUMIFS sulle righe foglia del foglio Computo
function buildCategoriaSheet(XLSX: typeof XLSXType, results: ResultadoItem[], lay: Layout): XLSXType.WorkSheet {
  const headers = ['CATEGORIA', 'QTD ITENS', 'TOTALE (€)', '%'];

  const map = new Map<string, { count: number; total: number }>();
  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  for (const r of results) {
    const entry = map.get(r.categoria) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += r.total;
    map.set(r.categoria, entry);
  }

  const sorted = [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  const dataRows = sorted.map(([cat, data]) => [cat, data.count, data.total, grandTotal > 0 ? data.total / grandTotal : 0]);
  const n = dataRows.length;
  const totalRow = ['TOTALE', results.length, grandTotal, 1];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalRow]);
  sorted.forEach(([cat, data], i) => {
    const r = i + 1;
    setFormula(XLSX, ws, r, 2,
      `SUMIFS(${rng(XLSX, lay.cTot, lay)},${rng(XLSX, lay.cCat, lay)},A${r + 1},${rng(XLSX, lay.cDesc, lay)},"${LEAF}")`, data.total);
    setFormula(XLSX, ws, r, 3, `IF(C$${n + 2}=0,0,C${r + 1}/C$${n + 2})`, grandTotal > 0 ? data.total / grandTotal : 0, '0.0%');
  });
  setFormula(XLSX, ws, n + 1, 1, `SUM(B2:B${n + 1})`, results.length);
  setFormula(XLSX, ws, n + 1, 2, `SUM(C2:C${n + 1})`, grandTotal);
  setFormula(XLSX, ws, n + 1, 3, `SUM(D2:D${n + 1})`, 1, '0.0%');
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 12 }];
  return ws;
}

// Matrice WBS2 × WBS1: SUMIFS sulle colonne WBS del foglio Computo (compilate solo sulle righe foglia)
function buildLivelloSheet(XLSX: typeof XLSXType, results: ResultadoItem[], lay: Layout): XLSXType.WorkSheet {
  const edificios = [...new Set(results.map(r => wbsLevels(r)[0] ?? ''))].sort();
  const livelli   = [...new Set(results.map(r => wbsLevels(r)[1] ?? ''))].sort();

  const headers = ['WBS2 \\ WBS1', ...edificios];
  const dataRows = livelli.map(lv => {
    const row: any[] = [lv];
    for (const ed of edificios) {
      const total = results
        .filter(r => (wbsLevels(r)[1] ?? '') === lv && (wbsLevels(r)[0] ?? '') === ed)
        .reduce((s, r) => s + r.total, 0);
      row.push(total > 0 ? total : '');
    }
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  if (lay.depth >= 2) {
    livelli.forEach((lv, i) => edificios.forEach((ed, j) => {
      if (!lv || !ed) return; // livelli senza nome: restano valori
      const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: j + 1 })];
      if (!cell) return;
      setFormula(XLSX, ws, i + 1, j + 1,
        `SUMIFS(${rng(XLSX, lay.cTot, lay)},${rng(XLSX, 0, lay)},${col(XLSX, j + 1)}$1,${rng(XLSX, 1, lay)},$A${i + 2},${rng(XLSX, lay.cDesc, lay)},"${LEAF}")`, cell.v as number);
    }));
  }
  ws['!cols'] = [{ wch: 20 }, ...edificios.map(() => ({ wch: 16 }))];
  return ws;
}

// WBS1 × categoria, con subtotali e totale generale
function buildEdificioSheet(XLSX: typeof XLSXType, results: ResultadoItem[], lay: Layout): XLSXType.WorkSheet {
  const headers = ['WBS1', 'CATEGORIA', 'TOTALE (€)'];
  const rows: any[][] = [headers];
  const formulas: { r: number; f: string; v: number }[] = [];

  const edificios = [...new Set(results.map(r => wbsLevels(r)[0] ?? ''))].sort();
  const subtotRows: number[] = [];
  for (const ed of edificios) {
    const edItems = results.filter(r => (wbsLevels(r)[0] ?? '') === ed);
    const catMap = new Map<string, number>();
    for (const r of edItems) catMap.set(r.categoria, (catMap.get(r.categoria) ?? 0) + r.total);
    const edTotal = edItems.reduce((s, r) => s + r.total, 0);

    const first = rows.length + 1; // riga Excel 1-based della prima categoria
    for (const [cat, total] of [...catMap.entries()].sort((a, b) => b[1] - a[1])) {
      rows.push([ed, cat, total]);
      if (ed) formulas.push({ r: rows.length - 1, v: total, f: `SUMIFS(${rng(XLSX, lay.cTot, lay)},${rng(XLSX, 0, lay)},A${rows.length},${rng(XLSX, lay.cCat, lay)},B${rows.length},${rng(XLSX, lay.cDesc, lay)},"${LEAF}")` });
    }
    rows.push([`Subtotale ${ed}`, '', edTotal]);
    formulas.push({ r: rows.length - 1, v: edTotal, f: `SUM(C${first}:C${rows.length - 1})` });
    subtotRows.push(rows.length);
  }

  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  rows.push(['TOTALE GENERALE', '', grandTotal]);
  if (subtotRows.length) formulas.push({ r: rows.length - 1, v: grandTotal, f: subtotRows.map(r => `C${r}`).join('+') });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (lay.depth >= 1) formulas.forEach(x => setFormula(XLSX, ws, x.r, 2, x.f, x.v));
  ws['!cols'] = [{ wch: 20 }, { wch: 26 }, { wch: 18 }];
  return ws;
}

function buildDashboardSheet(XLSX: typeof XLSXType, results: ResultadoItem[], lay: Layout): XLSXType.WorkSheet {
  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  const okCount    = results.filter(r => r.status === 'OK').length;
  const alertCount = results.filter(r => r.status === 'ALERT').length;
  const nfCount    = results.filter(r => r.status === 'NAO_ENCONTRADO').length;
  const nvpCount   = results.filter(r => r.status === 'NVP').length;

  const rows: any[][] = [
    ['DASHBOARD — COMPUTO METRICO', ''],
    ['', ''],
    ['KPI', 'Valore'],
    ['Totale Generale (€)', grandTotal],
    ['Totale Elementi', results.length],
    ['Edifici', new Set(results.map(r => wbsLevels(r)[0] ?? '')).size],
    ['Livelli', new Set(results.map(r => wbsLevels(r)[1] ?? '')).size],
    ['Categorie', new Set(results.map(r => r.categoria)).size],
    ['', ''],
    ['STATUS', 'Conteggio'],
    ['✓ OK', okCount],
    ['⚠ ALERT (verificare)', alertCount],
    ['✗ Non Trovato', nfCount],
    ['◈ NVP', nvpCount],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const status = rng(XLSX, lay.cStatus, lay);
  setFormula(XLSX, ws, 3, 1, `${SHEET}!${col(XLSX, lay.cTot)}${lay.lastRow + 1}`, grandTotal);
  setFormula(XLSX, ws, 10, 1, `COUNTIF(${status},"OK")`, okCount);
  setFormula(XLSX, ws, 11, 1, `COUNTIF(${status},"ALERT")`, alertCount);
  setFormula(XLSX, ws, 12, 1, `COUNTIF(${status},"NAO_ENCONTRADO")`, nfCount);
  setFormula(XLSX, ws, 13, 1, `COUNTIF(${status},"NVP")`, nvpCount);
  ws['!cols'] = [{ wch: 30 }, { wch: 22 }];
  return ws;
}

/** Costruisce il workbook (separato dal download per poterlo verificare nei test) */
export function buildWorkbook(XLSX: typeof XLSXType, results: ResultadoItem[]): XLSXType.WorkBook {
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'Computo Metrico Estimativo',
    Author: 'CABLEPRO CME Generator',
    CreatedDate: new Date(),
  };

  const { ws: computo, lay } = buildComputoSheet(XLSX, results);
  XLSX.utils.book_append_sheet(wb, computo, SHEET);
  XLSX.utils.book_append_sheet(wb, buildCategoriaSheet(XLSX, results, lay), 'Categoria');
  XLSX.utils.book_append_sheet(wb, buildLivelloSheet(XLSX, results, lay), 'WBS2');
  XLSX.utils.book_append_sheet(wb, buildEdificioSheet(XLSX, results, lay), 'WBS1');
  XLSX.utils.book_append_sheet(wb, buildDashboardSheet(XLSX, results, lay), 'Dashboard');
  // Excel ricalcola tutte le formule all'apertura
  wb.Workbook = { ...(wb.Workbook ?? {}), CalcPr: { fullCalcOnLoad: true } } as XLSXType.WorkBook['Workbook'];
  return wb;
}

// ── Public export — all heavy imports are lazy ────────────────────────────────
export async function exportExcel(
  results: ResultadoItem[],
  filename = 'Computo_Metrico.xlsx',
): Promise<void> {
  // Dynamic imports: only pulled in when the user clicks Export
  const [XLSX, { saveAs }] = await Promise.all([
    import('xlsx'),
    import('file-saver'),
  ]);

  const wb = buildWorkbook(XLSX, results);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
}
