/**
 * pvStringCalc.ts
 *
 * Verifica di compatibilità stringa-inverter, dimensionamento del quadro di
 * campo (String Box, vedi stringBoxCalc.ts) e dimensionamento automatico del
 * cavo DC di stringa (dcCableCalc.ts), a partire dai dati di inverter e
 * pannello.
 *
 * Compatibilità elettrica (indipendente dalla caduta di tensione/portata,
 * che restano gestite da dcCableCalc.ts):
 *   - Tensione a vuoto (Voc) della stringa, alla temperatura minima di
 *     progetto, non deve superare la tensione massima di ingresso
 *     dell'MPPT (il caso più critico: il freddo AUMENTA la Voc dei moduli
 *     cristallini, per il coefficiente di temperatura negativo).
 *   - Tensione di lavoro (Vmp) della stringa, alla temperatura massima di
 *     progetto, deve rientrare nel range di tensione operativa dell'MPPT
 *     (il caldo ABBASSA la Vmp).
 *   - Corrente di corto circuito (Isc) della stringa non deve superare la
 *     corrente massima di ingresso dichiarata dal datasheet dell'inverter:
 *     è un limite hardware assoluto, e Isc è già il caso peggiore (nessun
 *     margine aggiuntivo va applicato qui — l'eventuale margine 1,25× serve
 *     solo a dimensionare il CAVO secondo la CEI 64-8/IEC 60364, non a
 *     confrontarsi con la portata dichiarata dall'inverter).
 *
 * La Voc a freddo è corretta con il coefficiente di temperatura della Voc
 * (β); la Vmp a caldo è corretta con il coefficiente di temperatura della
 * potenza (γ) — un'approssimazione standard quando non si dispone del
 * coefficiente separato per la Vmp, in pratica molto vicino a γ.
 */

import {
  calculateDcCableSection,
  type DcCableResult,
  type CableType,
} from './dcCableCalc';
import { sizeStringBox, type StringBoxResult } from './stringBoxCalc';

export interface InverterSpec {
  id: string;
  name: string;
  ratedPowerKw: number;
  mpptVoltageMinV: number;
  mpptVoltageMaxV: number;
  mpptMaxCurrentA: number;
  /** Numero di MPPT indipendenti dell'inverter. Se assente, si assume 1. */
  numMppt?: number;
}

export interface PanelSpec {
  id: string;
  name: string;
  pMaxW: number;
  vmp: number;
  voc: number;
  impp: number;
  isc: number;
  /** Coefficiente di temperatura della Voc, in %/°C (tipicamente negativo, es. -0.28). */
  tempCoeffVocPctPerC: number;
  /** Coefficiente di temperatura della Pmax (γ), in %/°C — usato per la Vmp a caldo. Se assente, si usa β come stima. */
  tempCoeffPmaxPctPerC?: number;
  /** Corrente inversa massima ammessa dal pannello (Imod,max,ocpr), in A — usata per l'obbligatorietà del fusibile di stringa. Se assente, si stima prudenzialmente 2×Isc. */
  maxReverseCurrentA?: number;
}

export interface StringConfig {
  id: string;
  name: string;
  inverterId: string;
  /** Indice dell'MPPT dell'inverter a cui è collegata questa stringa (1-based). Se assente, MPPT 1. */
  mpptIndex?: number;
  panelId: string;
  panelsInSeries: number;
  stringsInParallel: number;
  tMinC: number; // temperatura minima di progetto (default -10°C)
  tMaxC: number; // temperatura massima di progetto, di cella (default 70°C)
  cableLengthM: number;
  deltaVPercent: number; // default 3% — obbligo normativo (CEI 82-25 / Guida CEI 0-21)
  cableTypeId: string;
  selectedSectionMm2: number | null;
}

export interface StringCheckResult {
  vocColdV: number;
  vmpHotV: number;
  iscStringA: number;
  imppStringA: number;
  totalPowerW: number;
  /** Corrente minima richiesta per il CAVO (= Ib, corrente di progetto — vedi stringBox.ibA). */
  requiredIzA: number;
  vocOk: boolean;
  vmpOk: boolean;
  currentOk: boolean;
  allOk: boolean;
  deltaVoltsV: number;
  cable: DcCableResult;
  /** Dimensionamento del quadro di campo (fusibile, interruttore CC, sezionatore, SPD). */
  stringBox: StringBoxResult;
}

const STC_TEMP_C = 25;

/** Fattore di Dimensionamento Inverter: P_AC nominale / ΣP_DC,STC di tutte le stringhe collegate allo stesso inverter. Range salutare: 0,75–1,20. */
export interface FdiResult {
  fdi: number;
  totalDcPowerW: number;
  ok: boolean;
}

export function calculateFdi(inverter: InverterSpec, stringsOnThisInverter: Pick<StringConfig, 'panelsInSeries' | 'stringsInParallel' | 'panelId'>[], panelsById: Record<string, PanelSpec>): FdiResult | null {
  if (stringsOnThisInverter.length === 0) return null;
  const totalDcPowerW = stringsOnThisInverter.reduce((sum, s) => {
    const panel = panelsById[s.panelId];
    if (!panel) return sum;
    return sum + panel.pMaxW * s.panelsInSeries * s.stringsInParallel;
  }, 0);
  if (totalDcPowerW === 0) return null;
  const fdi = (inverter.ratedPowerKw * 1000) / totalDcPowerW;
  return { fdi, totalDcPowerW, ok: fdi >= 0.75 && fdi <= 1.20 };
}

export function checkAndSizeString(
  inverter: InverterSpec,
  panel: PanelSpec,
  config: Pick<StringConfig, 'panelsInSeries' | 'stringsInParallel' | 'tMinC' | 'tMaxC' | 'cableLengthM' | 'deltaVPercent'>,
  cableType: CableType
): StringCheckResult {
  const { panelsInSeries, stringsInParallel, tMinC, tMaxC, cableLengthM, deltaVPercent } = config;

  const gammaPctPerC = panel.tempCoeffPmaxPctPerC ?? panel.tempCoeffVocPctPerC;
  const maxReverseCurrentA = panel.maxReverseCurrentA ?? panel.isc * 2;

  const vocFactorCold = 1 + (panel.tempCoeffVocPctPerC / 100) * (tMinC - STC_TEMP_C);
  const vmpFactorHot = 1 + (gammaPctPerC / 100) * (tMaxC - STC_TEMP_C);

  const vocColdV = panel.voc * panelsInSeries * vocFactorCold;
  const vmpHotV = panel.vmp * panelsInSeries * vmpFactorHot;
  const iscStringA = panel.isc * stringsInParallel;
  const imppStringA = panel.impp * stringsInParallel;
  const totalPowerW = panel.pMaxW * panelsInSeries * stringsInParallel;

  const vocOk = vocColdV <= inverter.mpptVoltageMaxV;
  const vmpOk = vmpHotV >= inverter.mpptVoltageMinV && vmpHotV <= inverter.mpptVoltageMaxV;
  // Confronto diretto con Isc (nessun margine 1,25×): il limite del datasheet
  // è un tetto hardware, e Isc è già la corrente più alta che la stringa può
  // produrre — il margine 1,25× è solo per il dimensionamento del cavo.
  const currentOk = iscStringA <= inverter.mpptMaxCurrentA;
  const allOk = vocOk && vmpOk && currentOk;

  // Riferimento per la ΔV%: la Vmpp nominale di stringa a STC (25°C), la
  // convenzione più comune nella pratica progettuale.
  const vmppNominalV = panel.vmp * panelsInSeries;
  const deltaVoltsV = (deltaVPercent / 100) * vmppNominalV;

  const stringBox = sizeStringBox(panel.isc, stringsInParallel, maxReverseCurrentA, vocColdV);
  const requiredIzA = stringBox.ibA;

  const cable = calculateDcCableSection({
    lengthM: cableLengthM,
    currentForDropA: imppStringA,
    currentForAmpacityA: requiredIzA,
    deltaVoltsV,
    cableType,
  });

  return {
    vocColdV, vmpHotV, iscStringA, imppStringA, totalPowerW, requiredIzA,
    vocOk, vmpOk, currentOk, allOk, deltaVoltsV, cable, stringBox,
  };
}
