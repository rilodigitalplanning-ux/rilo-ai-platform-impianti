// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/excelExporter.ts
// Excel di esportazione (SheetJS): foglio Computo + un riepilogo per ogni livello della gerarchia del
// progetto + matrice dei primi due livelli + Dashboard. L'ordine e i nomi dei livelli vengono dalla
// gerarchia impostata nel progetto. Gli importi sono formule (quantità × prezzo, SUBTOTAL, SUMIFS):
// modificando una quantità o un prezzo nel foglio Computo, totali e riepiloghi si aggiornano.
// ─────────────────────────────────────────────────────────────────────────────
import { activeItems, defaultHierarchy, dimensionValue, sheetName, type HierarchyItem } from '../lib/hierarchy';
import type { ResultadoItem } from '../types';
import type * as XLSXType from 'xlsx';

const SHEET = 'Computo';

interface Layout {
  cols: HierarchyItem[];
  cDesc: number; cQty: number; cVal: number; cTot: number; cStatus: number;
  firstRow: number; lastRow: number; // righe Excel (1-based) dei dati, esclusa la riga TOTALE
}

const col = (XLSX: typeof XLSXType, c: number) => XLSX.utils.encode_col(c);
const rng = (XLSX: typeof XLSXType, c: number, lay: Layout) => `${SHEET}!$${col(XLSX, c)}$${lay.firstRow}:$${col(XLSX, c)}$${lay.lastRow}`;
const dimCol = (lay: Layout, id: string) => lay.cols.findIndex(c => c.id === id);

function setFormula(XLSX: typeof XLSXType, ws: XLSXType.WorkSheet, r: number, c: number, f: string, v: number, z?: string) {
  const cell: XLSXType.CellObject = { t: 'n', f, v };
  if (z) cell.z = z;
  ws[XLSX.utils.encode_cell({ r, c })] = cell;
}

function buildComputoSheet(XLSX: typeof XLSXType, results: ResultadoItem[], cols: HierarchyItem[]): { ws: XLSXType.WorkSheet; lay: Layout } {
  const nC = cols.length;
  const headers = [...cols.map(c => c.label), 'DESCRIZIONE', 'QTD', 'UM', 'VALORE UNIT.', 'TOTALE (€)', 'PREZZARIO', 'STATUS'];
  const cDesc = nC, cQty = nC + 1, cVal = nC + 3, cTot = nC + 4, cStatus = nC + 6;

  // Ogni riga dati con le informazioni necessarie per scrivere le formule
  type Meta = { kind: 'parent'; first: number; last: number; total: number; value: number }
    | { kind: 'child'; parent: number; fattore: number; qty: number; total: number };
  const dataRows: any[][] = [];
  const metas: Meta[] = [];

  for (const item of results) {
    const parentRow = dataRows.length + 1; // +1: riga di intestazione
    dataRows.push([
      ...Array<string>(nC).fill(''), // livelli della gerarchia: solo sulle righe delle voci
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
        ...cols.map(c => dimensionValue(item, c.id)),
        `  [${sub.codicePrezzarioTarget || 'NVP'}] ${sub.descrizionePrezzarioTarget}`,
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
    ...cols.map(() => ({ wch: 18 })), { wch: 48 },
    { wch: 9 },  { wch: 8 },  { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
  ];

  const lay: Layout = { cols, cDesc, cQty, cVal, cTot, cStatus, firstRow: 2, lastRow: dataRows.length + 1 };
  return { ws, lay };
}

// Riepilogo di un livello della gerarchia: SUMIFS sulla colonna del livello nel foglio Computo
// (le righe degli elementi hanno i livelli vuoti, quindi si sommano solo le righe delle voci)
function buildDimensionSheet(XLSX: typeof XLSXType, results: ResultadoItem[], lay: Layout, item: HierarchyItem): XLSXType.WorkSheet {
  const headers = [item.label.toUpperCase(), 'ELEMENTI', 'TOTALE (€)', '%'];
  const map = new Map<string, { count: number; total: number }>();
  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  for (const r of results) {
    const key = dimensionValue(r, item.id);
    const entry = map.get(key) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += r.total;
    map.set(key, entry);
  }

  const sorted = [...map.entries()].sort((a, b) => b[1].total - a[1].total);
  const dataRows = sorted.map(([v, data]) => [v || '(non assegnato)', data.count, data.total, grandTotal > 0 ? data.total / grandTotal : 0]);
  const n = dataRows.length;
  const totalRow = ['TOTALE', results.length, grandTotal, 1];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalRow]);
  const c = dimCol(lay, item.id);
  sorted.forEach(([v, data], i) => {
    const r = i + 1;
    if (v) {
      setFormula(XLSX, ws, r, 2, `SUMIFS(${rng(XLSX, lay.cTot, lay)},${rng(XLSX, c, lay)},A${r + 1})`, data.total);
    }
    setFormula(XLSX, ws, r, 3, `IF(C$${n + 2}=0,0,C${r + 1}/C$${n + 2})`, grandTotal > 0 ? data.total / grandTotal : 0, '0.0%');
  });
  setFormula(XLSX, ws, n + 1, 1, `SUM(B2:B${n + 1})`, results.length);
  setFormula(XLSX, ws, n + 1, 2, `SUM(C2:C${n + 1})`, grandTotal);
  setFormula(XLSX, ws, n + 1, 3, `SUM(D2:D${n + 1})`, 1, '0.0%');
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 12 }];
  return ws;
}

// Matrice dei primi due livelli attivi (secondo × primo)
function buildMatrixSheet(XLSX: typeof XLSXType, results: ResultadoItem[], lay: Layout, a: HierarchyItem, b: HierarchyItem): XLSXType.WorkSheet {
  const va = [...new Set(results.map(r => dimensionValue(r, a.id)))].filter(Boolean).sort();
  const vb = [...new Set(results.map(r => dimensionValue(r, b.id)))].filter(Boolean).sort();
  const headers = [`${b.label} \\ ${a.label}`, ...va];
  const ca = dimCol(lay, a.id), cb = dimCol(lay, b.id);

  const rows = vb.map(rowVal => [rowVal, ...va.map(colVal => {
    const total = results
      .filter(r => dimensionValue(r, b.id) === rowVal && dimensionValue(r, a.id) === colVal)
      .reduce((s, r) => s + r.total, 0);
    return total > 0 ? total : '';
  })]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  vb.forEach((_row, i) => va.forEach((_col, j) => {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: j + 1 })];
    if (!cell) return;
    setFormula(XLSX, ws, i + 1, j + 1,
      `SUMIFS(${rng(XLSX, lay.cTot, lay)},${rng(XLSX, ca, lay)},${col(XLSX, j + 1)}$1,${rng(XLSX, cb, lay)},$A${i + 2})`, cell.v as number);
  }));
  ws['!cols'] = [{ wch: 24 }, ...va.map(() => ({ wch: 16 }))];
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
    ...lay.cols.map(c => [c.label, new Set(results.map(r => dimensionValue(r, c.id)).filter(Boolean)).size]),
    ['', ''],
    ['STATUS', 'Conteggio'],
    ['✓ OK', okCount],
    ['⚠ ALERT (verificare)', alertCount],
    ['✗ Non Trovato', nfCount],
    ['◈ NVP', nvpCount],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const status = rng(XLSX, lay.cStatus, lay);
  const s0 = 5 + lay.cols.length + 2; // prima riga di conteggio (0-based)
  setFormula(XLSX, ws, 3, 1, `${SHEET}!${col(XLSX, lay.cTot)}${lay.lastRow + 1}`, grandTotal);
  setFormula(XLSX, ws, s0, 1, `COUNTIF(${status},"OK")`, okCount);
  setFormula(XLSX, ws, s0 + 1, 1, `COUNTIF(${status},"ALERT")`, alertCount);
  setFormula(XLSX, ws, s0 + 2, 1, `COUNTIF(${status},"NAO_ENCONTRADO")`, nfCount);
  setFormula(XLSX, ws, s0 + 3, 1, `COUNTIF(${status},"NVP")`, nvpCount);
  ws['!cols'] = [{ wch: 30 }, { wch: 22 }];
  return ws;
}

/** Costruisce il workbook (separato dal download per poterlo verificare nei test) */
export function buildWorkbook(XLSX: typeof XLSXType, results: ResultadoItem[], hierarchy?: HierarchyItem[]): XLSXType.WorkBook {
  const cols = activeItems(hierarchy ?? defaultHierarchy(results));
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'Computo Metrico Estimativo',
    Author: 'CABLEPRO CME Generator',
    CreatedDate: new Date(),
  };

  const used = new Set([SHEET.toLowerCase(), 'dashboard']);
  const { ws: computo, lay } = buildComputoSheet(XLSX, results, cols);
  XLSX.utils.book_append_sheet(wb, computo, SHEET);
  for (const item of cols) {
    XLSX.utils.book_append_sheet(wb, buildDimensionSheet(XLSX, results, lay, item), sheetName(item.label, used));
  }
  if (cols.length >= 2) {
    XLSX.utils.book_append_sheet(wb, buildMatrixSheet(XLSX, results, lay, cols[0], cols[1]), sheetName(`${cols[1].label} x ${cols[0].label}`, used));
  }
  XLSX.utils.book_append_sheet(wb, buildDashboardSheet(XLSX, results, lay), 'Dashboard');
  // Excel ricalcola tutte le formule all'apertura
  wb.Workbook = { ...(wb.Workbook ?? {}), CalcPr: { fullCalcOnLoad: true } } as XLSXType.WorkBook['Workbook'];
  return wb;
}

// ── Public export — all heavy imports are lazy ────────────────────────────────
export async function exportExcel(
  results: ResultadoItem[],
  filename = 'Computo_Metrico.xlsx',
  hierarchy?: HierarchyItem[],
): Promise<void> {
  // Dynamic imports: only pulled in when the user clicks Export
  const [XLSX, { saveAs }] = await Promise.all([
    import('xlsx'),
    import('file-saver'),
  ]);

  const wb = buildWorkbook(XLSX, results, hierarchy);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
}
