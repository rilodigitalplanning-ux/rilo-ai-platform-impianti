import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import type { ResultadoItem, SubItem } from '../types';
import { buildWorkbook } from './excelExporter';
import { fillWorkbook } from './excelFiller';
import { recomputeResult } from './pricing';
import { createEvaluator, type CellInfo } from './xlsxEval.testutil';

const sub = (codice: string, valore: number, qc = 1): SubItem => ({
  codiceDeiOriginal: codice, descrizioneDei: 'd', codicePrezzarioTarget: codice, descrizionePrezzarioTarget: `Voce ${codice}`,
  confiancaMatch: 1, quantitaComposizione: qc, valoreUnitario: valore, status: 'OK', unidade: 'cad',
});
const res = (id: string, wbs: string[], categoria: string, qty: number, subs: SubItem[]): ResultadoItem => recomputeResult({
  idElemento: id, edificio: wbs[0] ?? '', livello: wbs[1] ?? '', zona: wbs[2] ?? '', wbs, categoria, descrizioneElemento: `Elemento ${id}`,
  tipoPrezzo: 'misura', quantitaElemento: qty, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK', subItems: subs,
});
const data = () => [
  res('a', ['Piano', 'Camera 01'], 'EVAC', 2, [sub('A1', 10), sub('B2', 5, 10)]),
  res('b', ['Piano', 'Camera 02'], 'EVAC', 3, [sub('A1', 10)]),
  res('c', ['Piano', 'Camera 01'], 'IRAI', 1, [sub('C3', 100)]),
];
const grand = (items: ResultadoItem[]) => items.reduce((s, r) => s + r.total, 0);

describe('Excel di esportazione con formule (modello SheetJS)', () => {
  const items = data();
  const wb = buildWorkbook(XLSX, items);
  const get = (sheet: string, addr: string): CellInfo | undefined => {
    const c = wb.Sheets[sheet]?.[addr];
    return c ? { f: c.f, v: c.v as any } : undefined;
  };
  const ev = createEvaluator(get, 'Computo');

  it('ogni formula, ricalcolata, coincide con il valore memorizzato', () => {
    let n = 0;
    for (const name of wb.SheetNames) {
      for (const [addr, cell] of Object.entries(wb.Sheets[name])) {
        if (addr.startsWith('!') || !(cell as any).f) continue;
        n++;
        const got = Number(ev.evalFormula((cell as any).f, name));
        expect(got, `${name}!${addr}: ${(cell as any).f}`).toBeCloseTo(Number((cell as any).v), 2);
      }
    }
    expect(n).toBeGreaterThan(20);
  });

  it('il foglio Computo contiene formule (non solo valori) per importi e totale', () => {
    const s = wb.Sheets.Computo;
    const formulas = Object.values(s).filter((c: any) => c && c.f).length;
    expect(formulas).toBeGreaterThanOrEqual(2 * 3 + 4); // 4 voci × 2 + 3 elementi × 2 + totale
    expect(s[XLSX.utils.encode_cell({ r: 1, c: 5 })]).toBeTruthy();
  });

  it('modificando una quantità o un prezzo, totali e riepiloghi si aggiornano', () => {
    // Computo: WBS1,WBS2,IMPIANTO,CATEGORIA,DESCRIZIONE,QTD,UM,VALORE,TOTALE → QTD = F, VALORE = H, TOTALE = I
    const edited = XLSX.utils.book_new();
    for (const name of wb.SheetNames) edited.Sheets[name] = JSON.parse(JSON.stringify(wb.Sheets[name]));
    edited.SheetNames = [...wb.SheetNames];
    edited.Sheets.Computo.F2.v = 20; // quantità del primo elemento: da 2 a 20
    const get2 = (sheet: string, addr: string): CellInfo | undefined => {
      const c = edited.Sheets[sheet]?.[addr];
      return c ? { f: c.f, v: c.v as any } : undefined;
    };
    const ev2 = createEvaluator(get2, 'Computo');
    const expected = grand(items) - items[0].total + items[0].valoreUnitario * 20;
    const lastRow = XLSX.utils.decode_range(edited.Sheets.Computo['!ref'] as string).e.r + 1;
    expect(ev2.cellValue('Computo', `I${lastRow}`)).toBeCloseTo(expected, 2);
    // Categoria EVAC (riga 2 del foglio Categoria) e totale del Dashboard seguono la modifica
    const evac = [...Array(3)].map((_, i) => ev2.cellValue('Categoria', `A${i + 2}`) === 'EVAC' ? ev2.cellValue('Categoria', `C${i + 2}`) : 0).reduce((s: number, x) => s + Number(x), 0);
    expect(evac).toBeCloseTo(items[0].valoreUnitario * 20 + items[1].total, 2);
    expect(ev2.cellValue('Dashboard', 'B4')).toBeCloseTo(expected, 2);
  });
});

describe('Excel da template (ExcelJS) con formule', () => {
  const items = data();
  const mkTemplate = () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('COMPUTO');
    ws.addRow(['WBS1', 'WBS2', 'WBS3', 'Tariffa', 'Descrizione', 'UM', 'Quantità', 'Prezzo unitario', 'Totale']);
    return wb;
  };
  const wb = mkTemplate();
  fillWorkbook(wb, items);
  const ws = wb.getWorksheet('COMPUTO')!;

  const get = (_sheet: string, addr: string): CellInfo | undefined => {
    const v: any = ws.getCell(addr).value;
    if (v === null || v === undefined) return undefined;
    if (typeof v === 'object' && 'formula' in v) return { f: v.formula, v: v.result };
    return { v };
  };
  const ev = createEvaluator(get, 'COMPUTO');

  const formulaCells: string[] = [];
  ws.eachRow(row => row.eachCell(c => { const v: any = c.value; if (v && typeof v === 'object' && 'formula' in v) formulaCells.push(c.address); }));

  it('importi e subtotali sono formule che, ricalcolate, coincidono con i valori memorizzati', () => {
    expect(formulaCells.length).toBeGreaterThan(15);
    for (const addr of formulaCells) {
      const v: any = ws.getCell(addr).value;
      expect(Number(ev.evalFormula(v.formula, 'COMPUTO')), `${addr}: ${v.formula}`).toBeCloseTo(Number(v.result), 2);
    }
  });

  it("c'è il totale generale e vale la somma di tutte le voci", () => {
    let totalAddr = '';
    ws.eachRow(row => { if (String(row.getCell(5).value) === 'TOTALE GENERALE') totalAddr = row.getCell(9).address; });
    expect(totalAddr).not.toBe('');
    expect(ev.cellValue('COMPUTO', totalAddr)).toBeCloseTo(grand(items), 2);
  });

  it('cambiando la quantità di un elemento, il totale generale si aggiorna', () => {
    let parentAddr = '', totalAddr = '';
    ws.eachRow(row => {
      if (String(row.getCell(5).value) === 'Elemento a') parentAddr = row.getCell(7).address;
      if (String(row.getCell(5).value) === 'TOTALE GENERALE') totalAddr = row.getCell(9).address;
    });
    ws.getCell(parentAddr).value = 20;
    const fresh = createEvaluator(get, 'COMPUTO');
    expect(fresh.cellValue('COMPUTO', totalAddr)).toBeCloseTo(grand(items) - items[0].total + items[0].valoreUnitario * 20, 2);
  });

  it('senza colonne quantità/prezzo/totale nel template scrive valori (nessuna formula)', () => {
    const w = new ExcelJS.Workbook();
    const s = w.addWorksheet('COMPUTO');
    s.addRow(['Tariffa', 'Descrizione', 'UM']);
    fillWorkbook(w, items);
    let any = false;
    s.eachRow(row => row.eachCell(c => { const v: any = c.value; if (v && typeof v === 'object' && 'formula' in v) any = true; }));
    expect(any).toBe(false);
  });
});
