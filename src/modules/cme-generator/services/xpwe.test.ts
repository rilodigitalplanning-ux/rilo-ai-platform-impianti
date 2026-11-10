import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { parseXml, parseXpwe, xNum, xpweToResults, analisiToNvp } from './xpwe';
import { computeNvpTotal } from './pricing';
import { wbsLevels } from '../lib/wbs';

const XML = `<?mso-application progid="PriMus.Document.XPWE"?><PweDocumento><PweDatiGenerali>
<PweDGProgetto><PweDGDatiGenerali><Oggetto>Progetto &apos;Test&apos;</Oggetto></PweDGDatiGenerali></PweDGProgetto>
<PweDGCapitoliCategorie><PweDGSuperCategorie><DGSuperCategorieItem ID="1" ><DesSintetica>VIA ROMA</DesSintetica></DGSuperCategorieItem></PweDGSuperCategorie>
<PweDGCategorie><DGCategorieItem ID="1" ><DesSintetica>QUADRI</DesSintetica></DGCategorieItem><DGCategorieItem ID="2" ><DesSintetica>CAVI</DesSintetica></DGCategorieItem></PweDGCategorie></PweDGCapitoliCategorie>
<PweDGModuli><PweDGAnalisi><SpeseGenerali>15</SpeseGenerali><UtiliImpresa>10</UtiliImpresa></PweDGAnalisi></PweDGModuli></PweDatiGenerali>
<PweMisurazioni><PweElencoPrezzi>
<EPItem ID="3" ><TipoEP>0</TipoEP><Tariffa>M01025a</Tariffa><DesEstesa>Installatore</DesEstesa><UnMisura>ora</UnMisura><Prezzo1>29.67</Prezzo1><Flags>0</Flags><PweEPAnalisi></PweEPAnalisi></EPItem>
<EPItem ID="4" ><TipoEP>0</TipoEP><Tariffa>Trasporto</Tariffa><DesEstesa>Trasporto</DesEstesa><UnMisura>%</UnMisura><Prezzo1>0.04</Prezzo1><Flags>0</Flags><PweEPAnalisi></PweEPAnalisi></EPItem>
<EPItem ID="5" ><TipoEP>0</TipoEP><Tariffa>235016</Tariffa><DesEstesa>Pozzetto</DesEstesa><UnMisura>cad</UnMisura><Prezzo1>217.79</Prezzo1><Flags>0</Flags><PweEPAnalisi></PweEPAnalisi></EPItem>
<EPItem ID="6" ><TipoEP>0</TipoEP><Tariffa>NP.01</Tariffa><DesEstesa>Quadro</DesEstesa><UnMisura>a corpo</UnMisura><Prezzo1>13756.52</Prezzo1><Flags>131072</Flags><PweEPAnalisi><PweEPAR>
<EPARItem ID="2" ><Tipo>0</Tipo><IDEP>-2</IDEP><Descrizione>QE</Descrizione><Misura>cadauno</Misura><Qt>1.000</Qt><Prezzo>10 000.00</Prezzo></EPARItem>
<EPARItem ID="3" ><Tipo>1</Tipo><IDEP>3</IDEP><Descrizione/><Misura>ora</Misura><Qt>8.000</Qt><Prezzo>29.67</Prezzo></EPARItem>
<EPARItem ID="4" ><Tipo>1</Tipo><IDEP>3</IDEP><Descrizione/><Misura>ora</Misura><Qt>8.000</Qt><Prezzo>29.67</Prezzo></EPARItem>
<EPARItem ID="5" ><Tipo>1</Tipo><IDEP>4</IDEP><Descrizione/><Misura>%</Misura><Qt>10 000.000</Qt><Prezzo>0.04</Prezzo></EPARItem>
</PweEPAR></PweEPAnalisi></EPItem></PweElencoPrezzi>
<PweVociComputo>
<VCItem ID="1" ><IDEP>5</IDEP><Quantita>7</Quantita><IDSpCat>1</IDSpCat><IDCat>2</IDCat><PweVCMisure>
<RGItem ID="2" ><Descrizione>Camera 1</Descrizione><Quantita>3.00</Quantita></RGItem><RGItem ID="3" ><Descrizione/><Quantita>4.00</Quantita></RGItem></PweVCMisure></VCItem>
<VCItem ID="2" ><IDEP>6</IDEP><Quantita>2</Quantita><IDSpCat>1</IDSpCat><IDCat>1</IDCat><PweVCMisure><RGItem ID="2" ><Descrizione>QE</Descrizione><Quantita>2.00</Quantita></RGItem></PweVCMisure></VCItem>
<VCItem ID="3" ><IDEP>5</IDEP><Quantita>0</Quantita><IDCat>2</IDCat><PweVCMisure><RGItem ID="2" ><Descrizione/><Quantita/></RGItem></PweVCMisure></VCItem>
</PweVociComputo></PweMisurazioni></PweDocumento>`;

describe('xml/numeri', () => {
  it('decodifica entità e tag auto-chiusi', () => {
    const n = parseXml('<a><b x="1&amp;2"/><c>l&apos;uno &lt;due&gt;</c></a>');
    expect(n.children[0].attrs.x).toBe('1&2');
    expect(n.children[1].text).toBe("l'uno <due>");
  });
  it('xNum con separatore di migliaia a spazio', () => {
    expect(xNum('10 000.00')).toBe(10000);
    expect(xNum('1.000')).toBe(1);
    expect(xNum('')).toBeNull();
  });
  it('rifiuta file non XPWE', () => expect(() => parseXpwe('<Altro/>')).toThrow());
});

describe('parseXpwe / xpweToResults', () => {
  const doc = parseXpwe(XML);
  it('legge categorie, elenco prezzi e voci', () => {
    expect(doc.oggetto).toBe("Progetto 'Test'");
    expect(doc.categorie.get(2)).toBe('CAVI');
    expect(doc.superCategorie.get(1)).toBe('VIA ROMA');
    expect(doc.ep.size).toBe(4);
    expect(doc.ep.get(6)!.isNp).toBe(true);
    expect(doc.voci).toHaveLength(3);
  });
  it("l'analisi NP si ricostruisce e dà il prezzo di PriMus", () => {
    const d = analisiToNvp(doc.ep.get(6)!, doc);
    expect(d.materiali).toHaveLength(1);
    expect(d.manoDOpera).toHaveLength(2);
    expect(d.manoDOpera[0].codice).toBe('M01025a');
    expect(d.trasportiPercentuale).toBe(4);
    expect(computeNvpTotal(d)).toBeCloseTo(13756.52, 2);
  });
  it('una riga di misura = un elemento, con categoria e WBS1 da supercategoria', () => {
    const { resultados, warnings } = xpweToResults(doc);
    expect(resultados).toHaveLength(3); // 2 righe pozzetto + 1 NP; riga a quantità 0 ignorata
    expect(warnings).toHaveLength(1);
    const [a, b, np] = resultados;
    expect(a.descrizioneElemento).toBe('Camera 1');
    expect(b.descrizioneElemento).toBe('Pozzetto'); // riga senza descrizione → descrizione del prezzo
    expect(a.total).toBeCloseTo(3 * 217.79, 2);
    expect(a.categoria).toBe('CAVI');
    expect(a.edificio).toBe('VIA ROMA');
    expect(a.livello).toBe('CAVI');
    expect(a.wbs).toEqual(['VIA ROMA', 'CAVI']); // categorie di PriMus = livelli WBS
    expect(a.categoria).toBe('CAVI'); // ultimo livello = categoria dei riepiloghi
    expect(np.status).toBe('NVP');
    expect(np.total).toBeCloseTo(2 * 13756.52, 2);
    expect(np.nvpDetails).toBeTruthy();
  });
});

describe('gerarchia WBS da categorie PriMus (N livelli)', () => {
  const x = XML
    .replace('</PweDGCategorie>', '</PweDGCategorie><PweDGSubCategorie><DGSubCategorieItem ID="7" ><DesSintetica>POZZETTI</DesSintetica></DGSubCategorieItem></PweDGSubCategorie>')
    .replace('<IDCat>2</IDCat><PweVCMisure>', '<IDCat>2</IDCat><IDSbCat>7</IDSbCat><PweVCMisure>');
  it('supercategoria > categoria > sottocategoria = WBS1..3, ultimo livello = categoria', () => {
    const { resultados } = xpweToResults(parseXpwe(x));
    expect(resultados[0].wbs).toEqual(['VIA ROMA', 'CAVI', 'POZZETTI']);
    expect([resultados[0].edificio, resultados[0].livello, resultados[0].zona]).toEqual(['VIA ROMA', 'CAVI', 'POZZETTI']);
    expect(resultados[0].categoria).toBe('POZZETTI');
  });
  it('wbsLevels: usa wbs se presente, altrimenti i 4 campi storici senza vuoti', () => {
    expect(wbsLevels({ wbs: ['a', 'b', 'c', 'd', 'e'], edificio: '', livello: '', zona: '' })).toHaveLength(5);
    expect(wbsLevels({ edificio: 'P', livello: 'C', zona: '', wbs4: '' })).toEqual(['P', 'C']);
  });
});

const REAL = 'C:/Users/r.azevedo/Desktop/teste primus.xpwe';
describe.skipIf(!fs.existsSync(REAL))('file PriMus reale', () => {
  it('le NP tornano al prezzo di PriMus (±1 cent) e il totale coincide', () => {
    const doc = parseXpwe(fs.readFileSync(REAL, 'utf8'));
    for (const e of doc.ep.values()) if (e.isNp && e.analisi.length > 0) expect(Math.abs(computeNvpTotal(analisiToNvp(e, doc)) - e.prezzo)).toBeLessThan(0.0150001);
    const { resultados } = xpweToResults(doc);
    const mine = resultados.reduce((s, r) => s + r.total, 0);
    const primus = doc.voci.reduce((s, v) => s + v.quantita * (doc.ep.get(v.idep)?.prezzo ?? 0), 0);
    expect(mine).toBeCloseTo(primus, 1);
  });
});
