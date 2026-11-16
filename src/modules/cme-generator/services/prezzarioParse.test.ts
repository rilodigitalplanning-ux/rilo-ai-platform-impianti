import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { parseSheetRows, summarizeVoci } from './prezzarioService';

describe('lettura del prezzario — una riga per voce', () => {
  const rows = [
    ['Tariffa', 'Descrizione', 'UM', 'Prezzo'],
    ['A1', 'Voce A', 'cad', '1.250,50'],
    ['B2', 'Voce B', 'm', 12.5],
    ['', '', '', ''],
    ['C3', 'Voce C', 'kg', ''],
  ];
  it('prezzo e UM dalla stessa riga, numeri italiani e numerici', () => {
    const v = parseSheetRows(rows);
    expect(v.map(x => [x.codice, x.valore, x.um])).toEqual([['A1', 1250.5, 'cad'], ['B2', 12.5, 'm'], ['C3', 0, 'kg']]);
  });
  it("trova l'intestazione anche sotto righe di titolo", () => {
    const v = parseSheetRows([['Prezzario regionale 2026'], [''], ...rows]);
    expect(v).toHaveLength(3);
  });
  it('senza colonne riconoscibili: errore chiaro', () => {
    expect(() => parseSheetRows([['x', 'y'], ['1', '2']])).toThrow(/colonne/);
  });
});

describe('lettura del prezzario — due righe per voce (PriMus)', () => {
  const rows = [
    ['', 'Tariffa', "DESCRIZIONE dell' ARTICOLO", 'unità di\r\nmisura', 'Prezzo [1]', ''],
    ['', '', 'VOCI A MISURA', '', '', ''],
    ['', '', '    <nessuna>', '', '', ''],
    ['', '', 'Voce riservata!!!', '', '0.00', ''],
    ['', '', "    MANO D'OPERA", '', '', ''],
    ['', '', '        Manodopera', '', '', ''],
    ['', '', "            MANO D'OPERA", '', '', ''],
    ['', 'M01001a', 'Edile IV livello: costo non comprensivo', '', '', ''],
    ['', '', 'euro (trentaquattro/32)', 'ora', '34.32', ''],
    ['', '', '    IMPIANTI ELETTRICI', '', '', ''],
    ['', '', '        Materiali', '', '', ''],
    ['', '', '            DISPOSITIVI DI COMANDO', '', '', ''],
    ['', '015003r', 'Impianto elettrico per punto presa', '', '', ''],
    ['', '', 'euro (cinquantadue/47)', 'cad', '52.47', ''],
    ['', '095999z', 'Quadro grande', '', '', ''],
    ['', '', 'euro (undicimila/306.35)', 'cad', '11 306.35', ''],
  ];
  const v = parseSheetRows(rows);

  it('prezzo e UM vengono dalla riga "euro (…)" successiva', () => {
    expect(v.map(x => [x.codice, x.valore, x.um])).toEqual([
      ['M01001a', 34.32, 'ora'], ['015003r', 52.47, 'cad'], ['095999z', 11306.35, 'cad'],
    ]);
  });
  it('prezzi con spazio per le migliaia e punto decimale', () => {
    expect(v[2].valore).toBe(11306.35);
  });
  it('la riga con solo prezzo e senza tariffa ("Voce riservata") non diventa una voce', () => {
    expect(v.some(x => /riservata/i.test(x.descrizione))).toBe(false);
  });
  it('categoria dai titoli con rientro, senza il livello radice, i segnaposto e i doppioni', () => {
    expect(v[0].categoria).toBe("MANO D'OPERA › Manodopera");
    expect(v[1].categoria).toBe('IMPIANTI ELETTRICI › Materiali › DISPOSITIVI DI COMANDO');
  });
  it('il riepilogo di controllo non segnala problemi', () => {
    expect(summarizeVoci(v)).toEqual({ total: 3, zeroPrice: 0, noUm: 0, withCategoria: 3 });
  });
});

const REAL = 'C:/Users/r.azevedo/Desktop/PREZZARI AUSILIARI/DEI 2026.xls';
describe.skipIf(!fs.existsSync(REAL))('DEI 2026.xls reale', () => {
  it('12.493 voci con prezzo e UM; i soli zeri sono le note "Avvertenze"', async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(fs.readFileSync(REAL), { type: 'buffer' });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    const voci = parseSheetRows(rows);
    const st = summarizeVoci(voci);
    expect(st.total).toBe(12493);
    expect(voci.filter(x => !(x.valore > 0)).every(x => /Avvertenze$/.test(x.codice))).toBe(true);
    expect(st.zeroPrice).toBe(3);
    expect(st.noUm).toBe(3);
    expect(st.withCategoria).toBeGreaterThan(12000);
    const m = voci.find(x => x.codice === 'M01001a')!;
    expect([m.valore, m.um]).toEqual([34.32, 'ora']);
    expect(Math.max(...voci.map(x => x.valore))).toBeGreaterThan(10000); // es. "11 306.35"
  });
});
