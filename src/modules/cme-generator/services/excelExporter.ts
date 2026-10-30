// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/excelExporter.ts
// Generate a 5-sheet .xlsx workbook from ResultadoItem[]
// Uses SheetJS (xlsx) — 100% browser-native, no Node.js dependencies.
// ─────────────────────────────────────────────────────────────────────────────
import type { ResultadoItem } from '../types';
import type * as XLSXType from 'xlsx';

// ── Color palette (used in cell styles via SheetJS-style) ─────────────────────
// Note: SheetJS community edition has limited style support.
// We use cell metadata and rely on data organisation for visual clarity.

function buildComputoSheet(XLSX: typeof XLSXType, results: ResultadoItem[]): XLSXType.WorkSheet {
  const headers = [
    'EDIFICIO', 'LIVELLO', 'ZONA', 'IMPIANTO', 'CATEGORIA', 'DESCRIZIONE',
    'QTD', 'UM', 'VALORE UNIT.', 'TOTALE (€)', 'PREZZARIO', 'STATUS',
  ];

  const dataRows: any[][] = [];

  for (const item of results) {
    // Main header row for the element (bold, WBS and Code empty)
    dataRows.push([
      '', // EDIFICIO
      '', // LIVELLO
      '', // ZONA
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

    // Sub items underneath
    const subItemsList = item.subItems && item.subItems.length > 0 ? item.subItems : [{
      codicePrezzarioTarget: item.tariffaOriginal || item.idElemento,
      descrizionePrezzarioTarget: item.descrizioneElemento,
      unidade: item.unidade || '',
      quantitaComposizione: 1,
      valoreUnitario: item.valoreUnitario,
      status: item.status
    }];

    for (const sub of subItemsList) {
      const childQty = item.quantitaElemento * (sub.quantitaComposizione || 1);
      const childTot = childQty * (sub.valoreUnitario || 0);
      dataRows.push([
        item.edificio,
        item.livello,
        item.zona,
        item.tipoImpianto || '', // IMPIANTO
        item.categoria,
        `  [${sub.codicePrezzarioTarget || 'NVP'}] ${sub.descrizionePrezzarioTarget}`,
        childQty,
        sub.unidade || (sub as any).um || '',
        sub.valoreUnitario,
        childTot,
        '',
        '',
      ]);
    }
  }

  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  const totalRow = ['', '', '', '', 'TOTALE GENERALE', '', '', '', '', grandTotal, '', ''];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalRow]);

  // Set column widths
  ws['!cols'] = [
    { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 48 },
    { wch: 9 },  { wch: 8 },  { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 12 },
  ];

  // Freeze first row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  return ws;
}

function buildCategoriaSheet(XLSX: typeof XLSXType, results: ResultadoItem[]): XLSXType.WorkSheet {
  const headers = ['CATEGORIA', 'QTD ITENS', 'TOTALE (€)', '%'];

  const map = new Map<string, { count: number; total: number }>();
  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  for (const r of results) {
    const entry = map.get(r.categoria) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += r.total;
    map.set(r.categoria, entry);
  }

  const dataRows = [...map.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(([cat, data]) => [
      cat,
      data.count,
      data.total,
      grandTotal > 0 ? (data.total / grandTotal * 100).toFixed(1) + '%' : '0.0%',
    ]);

  const totalRow = ['TOTALE', results.length, grandTotal, '100.0%'];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows, totalRow]);
  ws['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 12 }];
  return ws;
}

function buildLivelloSheet(XLSX: typeof XLSXType, results: ResultadoItem[]): XLSXType.WorkSheet {
  const edificios = [...new Set(results.map(r => r.edificio))].sort();
  const livelli   = [...new Set(results.map(r => r.livello))].sort();

  const headers = ['LIVELLO \\ EDIFICIO', ...edificios];
  const dataRows = livelli.map(lv => {
    const row: any[] = [lv];
    for (const ed of edificios) {
      const total = results
        .filter(r => r.livello === lv && r.edificio === ed)
        .reduce((s, r) => s + r.total, 0);
      row.push(total > 0 ? total : '');
    }
    return row;
  });

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws['!cols'] = [{ wch: 20 }, ...edificios.map(() => ({ wch: 16 }))];
  return ws;
}

function buildEdificioSheet(XLSX: typeof XLSXType, results: ResultadoItem[]): XLSXType.WorkSheet {
  const headers = ['EDIFICIO', 'CATEGORIA', 'TOTALE (€)'];
  const rows: any[][] = [headers];

  const edificios = [...new Set(results.map(r => r.edificio))].sort();
  for (const ed of edificios) {
    const edItems = results.filter(r => r.edificio === ed);
    const catMap = new Map<string, number>();
    for (const r of edItems) catMap.set(r.categoria, (catMap.get(r.categoria) ?? 0) + r.total);
    const edTotal = edItems.reduce((s, r) => s + r.total, 0);

    for (const [cat, total] of [...catMap.entries()].sort((a, b) => b[1] - a[1])) {
      rows.push([ed, cat, total]);
    }
    rows.push([`Subtotale ${ed}`, '', edTotal]);
  }

  const grandTotal = results.reduce((s, r) => s + r.total, 0);
  rows.push(['TOTALE GENERALE', '', grandTotal]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 26 }, { wch: 18 }];
  return ws;
}

function buildDashboardSheet(XLSX: typeof XLSXType, results: ResultadoItem[]): XLSXType.WorkSheet {
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
    ['Edifici', new Set(results.map(r => r.edificio)).size],
    ['Livelli', new Set(results.map(r => r.livello)).size],
    ['Categorie', new Set(results.map(r => r.categoria)).size],
    ['', ''],
    ['STATUS', 'Conteggio'],
    ['✓ OK', okCount],
    ['⚠ ALERT (verificare)', alertCount],
    ['✗ Non Trovato', nfCount],
    ['◈ NVP', nvpCount],
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 30 }, { wch: 22 }];
  return ws;
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

  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title: 'Computo Metrico Estimativo',
    Author: 'CABLEPRO CME Generator',
    CreatedDate: new Date(),
  };

  XLSX.utils.book_append_sheet(wb, buildComputoSheet(XLSX, results), 'Computo');
  XLSX.utils.book_append_sheet(wb, buildCategoriaSheet(XLSX, results), 'Categoria');
  XLSX.utils.book_append_sheet(wb, buildLivelloSheet(XLSX, results), 'Livello');
  XLSX.utils.book_append_sheet(wb, buildEdificioSheet(XLSX, results), 'Edificio');
  XLSX.utils.book_append_sheet(wb, buildDashboardSheet(XLSX, results), 'Dashboard');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  saveAs(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename);
}
