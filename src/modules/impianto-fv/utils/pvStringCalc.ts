/**
 * pvStringCalc.ts
 *
 * Verifica di compatibilità stringa-inverter e dimensionamento automatico
 * del cavo DC di stringa, a partire dai dati di inverter e pannello.
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
 * Le tensioni vengono corrette linearmente con il coefficiente di
 * temperatura della Voc del pannello (approssimazione standard quando non
 * si dispone del coefficiente separato per la Vmp, che in pratica è molto
 * simile).
 */

import {
  calculateDcCableSection,
  type DcCableResult,
  type CableType,
  AMPACITY_SAFETY_FACTOR,
} from './dcCableCalc';

export interface InverterSpec {
  id: string;
  name: string;
  ratedPowerKw: number;
  mpptVoltageMinV: number;
  mpptVoltageMaxV: number;
  mpptMaxCurrentA: number;
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
}

export interface StringConfig {
  id: string;
  name: string;
  inverterId: string;
  panelId: string;
  panelsInSeries: number;
  stringsInParallel: number;
  tMinC: number; // temperatura minima di progetto (default -10°C)
  tMaxC: number; // temperatura massima di progetto, di cella (default 70°C)
  cableLengthM: number;
  deltaVPercent: number; // default 1%
  cableTypeId: string;
  selectedSectionMm2: number | null;
}

export interface StringCheckResult {
  vocColdV: number;
  vmpHotV: number;
  iscStringA: number;
  imppStringA: number;
  totalPowerW: number;
  /** Corrente minima richiesta per il CAVO (Isc × 1,25, margine CEI 64-8) — non va confrontata con la corrente massima dell'inverter. */
  requiredIzA: number;
  vocOk: boolean;
  vmpOk: boolean;
  currentOk: boolean;
  allOk: boolean;
  deltaVoltsV: number;
  cable: DcCableResult;
}

const STC_TEMP_C = 25;

export function checkAndSizeString(
  inverter: InverterSpec,
  panel: PanelSpec,
  config: Pick<StringConfig, 'panelsInSeries' | 'stringsInParallel' | 'tMinC' | 'tMaxC' | 'cableLengthM' | 'deltaVPercent'>,
  cableType: CableType
): StringCheckResult {
  const { panelsInSeries, stringsInParallel, tMinC, tMaxC, cableLengthM, deltaVPercent } = config;

  const vocFactorCold = 1 + (panel.tempCoeffVocPctPerC / 100) * (tMinC - STC_TEMP_C);
  const vmpFactorHot = 1 + (panel.tempCoeffVocPctPerC / 100) * (tMaxC - STC_TEMP_C);

  const vocColdV = panel.voc * panelsInSeries * vocFactorCold;
  const vmpHotV = panel.vmp * panelsInSeries * vmpFactorHot;
  const iscStringA = panel.isc * stringsInParallel;
  const imppStringA = panel.impp * stringsInParallel;
  const totalPowerW = panel.pMaxW * panelsInSeries * stringsInParallel;
  const requiredIzA = iscStringA * AMPACITY_SAFETY_FACTOR;

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

  const cable = calculateDcCableSection({
    lengthM: cableLengthM,
    currentA: iscStringA,
    deltaVoltsV,
    cableType,
  });

  return {
    vocColdV, vmpHotV, iscStringA, imppStringA, totalPowerW, requiredIzA,
    vocOk, vmpOk, currentOk, allOk, deltaVoltsV, cable,
  };
}
