/**
 * stringBoxCalc.ts
 *
 * Dimensionamento delle protezioni del quadro di campo (String Box) di una
 * stringa fotovoltaica: fusibile di stringa, interruttore CC, sezionatore CC,
 * scaricatore di sovratensione (SPD). Regole numericamente equivalenti tra
 * IEC 60364-7-712/CEI 82-25 e NBR 16690 (le norme citate nello spec fornito
 * dall'utente) — stessi fattori 1,25–2,4×, stessa categoria DC-21B/22A, stessa
 * classe SPD II.
 */

// Serie commerciali tipiche gPV (fusibili) e MCB CC (interruttori) — valori
// standard di mercato, verificare sempre con la scheda tecnica del produttore
// scelto prima dell'uso in un progetto reale.
export const STANDARD_FUSE_RATINGS_A = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 25, 30, 32];
export const STANDARD_BREAKER_RATINGS_A = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];

export interface FuseSizingResult {
  required: boolean;
  ratingA: number | null;
  ok: boolean;
  note: string;
}

/**
 * Fusibile di stringa (protezione dalla corrente inversa).
 * Obbligatorio quando (Sa - 1) × Isc_mod supera la corrente inversa massima
 * ammessa dal pannello (Imod,max,ocpr) — tipicamente da 3 stringhe in
 * parallelo in su. Range di taratura: 1,5×Isc_mod < In < 2,4×Isc_mod, e
 * comunque In ≤ Imod,max,ocpr.
 */
export function sizeStringFuse(
  iscModA: number,
  stringsInParallel: number,
  maxReverseCurrentA: number
): FuseSizingResult {
  const worstCaseReverseA = (stringsInParallel - 1) * iscModA;
  const required = worstCaseReverseA > maxReverseCurrentA;

  if (!required) {
    return { required, ratingA: null, ok: true, note: 'Non obbligatorio con questa configurazione (< 3 stringhe in parallelo o corrente inversa entro i limiti del pannello).' };
  }

  const minA = 1.5 * iscModA;
  const maxA = 2.4 * iscModA;
  const ratingA = STANDARD_FUSE_RATINGS_A.find(r => r > minA && r < maxA && r <= maxReverseCurrentA) ?? null;

  return {
    required,
    ratingA,
    ok: ratingA !== null,
    note: ratingA !== null
      ? `In = ${ratingA} A (range ammesso ${minA.toFixed(1)}–${maxA.toFixed(1)} A, ≤ ${maxReverseCurrentA} A del pannello).`
      : `Nessun rating standard soddisfa il range ${minA.toFixed(1)}–${maxA.toFixed(1)} A entro il limite ${maxReverseCurrentA} A del pannello — verificare manualmente.`,
  };
}

export interface BreakerSizingResult {
  ratingA: number | null;
  voltageOk: boolean;
  ok: boolean;
  note: string;
}

/**
 * Interruttore CC di protezione del quadro di campo. Range di taratura:
 * 1,25×Isc,sub < In < 2,4×Isc,sub. Tensione nominale ≥ Voc di stringa max.
 */
export function sizeDcBreaker(iscSubA: number, vocStringMaxV: number, breakerRatedVoltageV = 1000): BreakerSizingResult {
  const minA = 1.25 * iscSubA;
  const maxA = 2.4 * iscSubA;
  const ratingA = STANDARD_BREAKER_RATINGS_A.find(r => r > minA && r < maxA) ?? null;
  const voltageOk = breakerRatedVoltageV >= vocStringMaxV;

  return {
    ratingA,
    voltageOk,
    ok: ratingA !== null && voltageOk,
    note: ratingA !== null
      ? `In = ${ratingA} A (range ${minA.toFixed(1)}–${maxA.toFixed(1)} A) · Un = ${breakerRatedVoltageV} V ${voltageOk ? '≥' : '<'} ${vocStringMaxV.toFixed(0)} V richiesti.`
      : `Nessun rating standard soddisfa il range ${minA.toFixed(1)}–${maxA.toFixed(1)} A — verificare manualmente.`,
  };
}

export interface SwitchSizingResult {
  category: string;
  ratedCurrentA: number | null;
  ok: boolean;
  note: string;
}

/**
 * Sezionatore CC sotto carico (interruttore-sezionatore). Categoria d'uso
 * DC-21B (uso generico) — tensione nominale ≥ Voc max; la corrente nominale
 * si sceglie, come per l'interruttore CC, nella stessa serie commerciale
 * standard, minima taglia con Ie ≥ Ib.
 */
export function sizeDcSwitch(vocStringMaxV: number, ibA: number, switchRatedVoltageV = 1000): SwitchSizingResult {
  const voltageOk = switchRatedVoltageV >= vocStringMaxV;
  const ratedCurrentA = STANDARD_BREAKER_RATINGS_A.find(r => r >= ibA) ?? null;
  const currentOk = ratedCurrentA !== null;
  return {
    category: 'DC-21B',
    ratedCurrentA,
    ok: voltageOk && currentOk,
    note: ratedCurrentA !== null
      ? `Ue = ${switchRatedVoltageV} V ${voltageOk ? '≥' : '<'} ${vocStringMaxV.toFixed(0)} V · Ie = ${ratedCurrentA} A ≥ Ib ${ibA.toFixed(1)} A.`
      : `Nessun rating standard ≥ Ib ${ibA.toFixed(1)} A — verificare manualmente.`,
  };
}

export interface SpdSizingResult {
  spdClass: 'II';
  inKA: number;
  ok: boolean;
  note: string;
}

/** DPS/SPD CC di stringa: Classe II, tensione di esercizio continua ≥ Voc max. */
export function sizeSpd(vocStringMaxV: number, spdRatedVoltageV = 1000, inKA = 20): SpdSizingResult {
  const ok = spdRatedVoltageV >= vocStringMaxV;
  return {
    spdClass: 'II',
    inKA,
    ok,
    note: `Uc = ${spdRatedVoltageV} V ${ok ? '≥' : '<'} ${vocStringMaxV.toFixed(0)} V · In = ${inKA} kA · Classe II.`,
  };
}

export interface StringBoxResult {
  fuse: FuseSizingResult;
  breaker: BreakerSizingResult;
  switchDisconnector: SwitchSizingResult;
  spd: SpdSizingResult;
  /** Corrente di progetto Ib usata a valle per il dimensionamento del cavo. */
  ibA: number;
  allOk: boolean;
}

/**
 * Dimensiona l'intero quadro di campo per una stringa e determina la
 * corrente di progetto Ib da usare per il cavo: il rating dell'interruttore
 * CC se disponibile, altrimenti 1,25×Isc di sottoarray (fallback normativo).
 */
export function sizeStringBox(
  iscModA: number,
  stringsInParallel: number,
  maxReverseCurrentA: number,
  vocStringMaxV: number
): StringBoxResult {
  const iscSubA = iscModA * stringsInParallel;
  const fuse = sizeStringFuse(iscModA, stringsInParallel, maxReverseCurrentA);
  const breaker = sizeDcBreaker(iscSubA, vocStringMaxV);
  const ibA = breaker.ratingA ?? 1.25 * iscSubA;
  const switchDisconnector = sizeDcSwitch(vocStringMaxV, ibA);
  const spd = sizeSpd(vocStringMaxV);

  return {
    fuse, breaker, switchDisconnector, spd, ibA,
    allOk: fuse.ok && breaker.ok && switchDisconnector.ok && spd.ok,
  };
}
