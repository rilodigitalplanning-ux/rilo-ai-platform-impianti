import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import type { ResultadoItem, SubItem } from '../types';
import {
  defaultHierarchy, resolveHierarchy, hierarchyPath, dimensionValue, sheetName, type HierarchyItem,
} from '../lib/hierarchy';
import { buildXpwe } from './xpweExport';
import { parseXpwe } from './xpwe';
import { buildWorkbook } from './excelExporter';
import { fillWorkbook } from './excelFiller';
import { recomputeResult } from './pricing';
import { createEvaluator, type CellInfo } from './xlsxEval.testutil';

const sub = (codice: string, valore: number): SubItem => ({
  codiceDeiOriginal: codice, descrizioneDei: 'd', codicePrezzarioTarget: codice, descrizionePrezzarioTarget: `Voce ${codice}`,
  confiancaMatch: 1, quantitaComposizione: 1, valoreUnitario: valore, status: 'OK', unidade: 'cad',
});
const res = (id: string, wbs: string[], categoria: string, qty: number): ResultadoItem => recomputeResult({
  idElemento: id, edificio: wbs[0] ?? '', livello: wbs[1] ?? '', zona: '', wbs, categoria, descrizioneElemento: `Elemento ${id}`,
  tipoPrezzo: 'misura', quantitaElemento: qty, unidade: 'cad', valoreUnitario: 0, total: 0, originePrezzo: 'DEI', status: 'OK', subItems: [sub('A1', 10)],
});
const data = () => [
  res('a', ['Piano Primo', 'Camera 01'], 'EVAC', 2),
  res('b', ['Piano Primo', 'Camera 02'], 'EVAC', 3),
  res('c', ['Piano Primo', 'Camera 01'], 'IRAI', 1),
];
// "la categoria dell'impianto è il livello più alto; WBS1 si chiama Edificio"
const custom = (): HierarchyItem[] => [
  { id: 'cat', label: 'Impianto', enabled: true },
  { id: 'wbs1', label: 'Edificio', enabled: true },
  { id: 'wbs2', label: 'Stanza', enabled: true },
];

describe('gerarchia del progetto', () => {
  it('predefinita: livelli WBS in ordine e categoria per ultima', () => {
    expect(defaultHierarchy(data()).map(i => [i.id, i.label])).toEqual([['wbs1', 'WBS1'], ['wbs2', 'WBS2'], ['cat', 'Categoria']]);
  });

  it('percorso nell\'ordine configurato, con livelli disattivati e vuoti saltati', () => {
    expect(hierarchyPath(data()[0], custom())).toEqual(['EVAC', 'Piano Primo', 'Camera 01']);
    const off = custom().map(i => (i.id === 'wbs1' ? { ...i, enabled: false } : i));
    expect(hierarchyPath(data()[0], off)).toEqual(['EVAC', 'Camera 01']);
    expect(dimensionValue(res('x', ['P'], '', 1), 'cat')).toBe('');
    expect(hierarchyPath(res('x', ['P'], '', 1), custom())).toEqual(['P']);
  });

  it('resolveHierarchy: conserva ordine e nomi, toglie i livelli inesistenti, aggiunge i nuovi', () => {
    const saved: HierarchyItem[] = [...custom(), { id: 'wbs4', label: 'Fantasma', enabled: true }];
    const r = resolveHierarchy(saved, data());
    expect(r.map(i => i.id)).toEqual(['cat', 'wbs1', 'wbs2']);
    expect(r[0].label).toBe('Impianto');
    // un livello WBS3 compare nei dati: va dopo il WBS2 già presente
    const deeper = [...data(), res('d', ['P', 'C', 'Z'], 'EVAC', 1)];
    expect(resolveHierarchy(custom(), deeper).map(i => i.id)).toEqual(['cat', 'wbs1', 'wbs2', 'wbs3']);
    // nome vuoto → nome predefinito; configurazione assente → predefinita
    expect(resolveHierarchy([{ id: 'cat', label: '  ', enabled: true }], data()).find(i => i.id === 'cat')!.label).toBe('Categoria');
    expect(resolveHierarchy(undefined, data())).toEqual(defaultHierarchy(data()));
  });

  it('sheetName: caratteri non validi, lunghezza e unicità', () => {
    const used = new Set<string>(['computo']);
    expect(sheetName('Edificio / Piano?', used)).toBe('Edificio Piano');
    expect(sheetName('Edificio Piano', used)).toBe('Edificio Piano 2');
    expect(sheetName('x'.repeat(40), used).length).toBeLessThanOrEqual(28);
    expect(sheetName('Computo', used)).not.toBe('Computo');
  });
});

describe('la gerarchia vale in tutti i documenti', () => {
  it('XPWE: il primo livello configurato è la supercategoria, il secondo la categoria, il terzo la sottocategoria', () => {
    const doc = parseXpwe(buildXpwe(data(), { projectName: 'P', hierarchy: custom() }).xml);
    expect([...doc.superCategorie.values()].sort()).toEqual(['EVAC', 'IRAI']);
    expect([...doc.categorie.values()]).toEqual(['Piano Primo']);
    expect([...doc.sottoCategorie.values()].sort()).toEqual(['Camera 01', 'Camera 02']);
  });

  it('XPWE: senza configurazione resta WBS prima e categoria per ultima', () => {
    const doc = parseXpwe(buildXpwe(data(), { projectName: 'P' }).xml);
    expect([...doc.superCategorie.values()]).toEqual(['Piano Primo']);
    expect([...doc.sottoCategorie.values()].sort()).toEqual(['EVAC', 'IRAI']);
  });

  it('Excel: colonne e fogli nell\'ordine e con i nomi scelti; i riepiloghi sono formule corrette', () => {
    const wb = buildWorkbook(XLSX, data(), custom());
    const header = XLSX.utils.sheet_to_json<string[]>(wb.Sheets.Computo, { header: 1 })[0];
    expect(header.slice(0, 3)).toEqual(['Impianto', 'Edificio', 'Stanza']);
    expect(wb.SheetNames).toEqual(['Computo', 'Impianto', 'Edificio', 'Stanza', 'Edificio x Impianto', 'Dashboard']);
    const get = (sheet: string, addr: string): CellInfo | undefined => {
      const c = wb.Sheets[sheet]?.[addr];
      return c ? { f: c.f, v: c.v as any } : undefined;
    };
    const ev = createEvaluator(get, 'Computo');
    for (const name of wb.SheetNames) {
      for (const [addr, cell] of Object.entries(wb.Sheets[name])) {
        if (addr.startsWith('!') || !(cell as any).f) continue;
        expect(Number(ev.evalFormula((cell as any).f, name)), `${name}!${addr}`).toBeCloseTo(Number((cell as any).v), 2);
      }
    }
    // nel foglio "Impianto" EVAC = 2×10 + 3×10
    expect(ev.cellValue('Impianto', 'A2')).toBe('EVAC');
    expect(ev.cellValue('Impianto', 'C2')).toBeCloseTo(50, 2);
  });

  it('Excel da template: i gruppi seguono l\'ordine e il nome del livello compare dove il template ha la colonna', () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('COMPUTO');
    ws.addRow(['Impianto', 'Edificio', 'Tariffa', 'Descrizione', 'UM', 'Quantità', 'Prezzo unitario', 'Totale']);
    fillWorkbook(wb, data(), undefined, custom());
    const col1: string[] = [];
    const col2: string[] = [];
    ws.eachRow(row => { col1.push(String(row.getCell(1).value ?? '')); col2.push(String(row.getCell(2).value ?? '')); });
    // i gruppi di primo livello sono gli impianti (EVAC, IRAI), non gli edifici
    expect(col1.filter(v => v === 'EVAC' || v === 'IRAI').length).toBeGreaterThanOrEqual(2);
    expect(col2.includes('Piano Primo')).toBe(true); // i valori dell'edificio compaiono nella colonna "Edificio"
    let evacHeader = 0;
    ws.eachRow((row, n) => { if (row.getCell(1).value === 'EVAC' && !evacHeader) evacHeader = n; });
    const t: any = ws.getRow(evacHeader).getCell(8).value;
    expect(t.formula).toMatch(/^SUBTOTAL\(9,H\d+:H\d+\)$/);
    expect(t.result).toBeCloseTo(50, 2);
  });
});
