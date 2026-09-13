/**
 * dcCableCalc.ts
 *
 * Dimensionamento del cavo lato DC di un impianto fotovoltaico secondo i due
 * criteri richiesti dalla normativa:
 *
 *   1. Caduta di tensione ammessa (circuito a due conduttori, andata + ritorno):
 *        ΔV = (2 × L × I × ρ) / S   →   S = (2 × L × I × ρ) / ΔV
 *      ρ = resistività del rame. A 20°C è 0,0178 Ω·mm²/m, ma i cavi solari
 *      lavorano tipicamente a 70-90°C: si usa ρ ≈ 0,023 Ω·mm²/m per restare
 *      in sicurezza (valore standard nella pratica progettuale italiana).
 *
 *   2. Portata (ampacità): la corrente ammissibile Iz del cavo, per la
 *      sezione e il tipo scelti, deve essere ≥ 1,25 × Isc della stringa.
 *      La sezione da installare è la maggiore tra quella richiesta dai due
 *      criteri — se il cavo scelto manualmente non ha portata sufficiente,
 *      va vietato e sostituito con la sezione minima che la soddisfi.
 */

export const COPPER_RESISTIVITY_HOT = 0.023; // Ω·mm²/m, cavo solare a temperatura di esercizio
export const AMPACITY_SAFETY_FACTOR = 1.25; // Iz richiesta = 1,25 × Isc (margine di sicurezza normativo)

// Sezioni commerciali standard (mm²)
export const STANDARD_SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240];

export interface CableType {
  id: string;
  name: string;
  /** Fonte dei valori di portata — da verificare sempre con la scheda tecnica del produttore specifico prima dell'uso in progetto. */
  source: string;
  /** Portata Iz (A) per sezione (mm²), nelle condizioni di posa indicate in `name`/`source`. */
  ampacityBySection: Record<number, number>;
}

/**
 * Valori tipici di portata per cavo solare unipolare EN 50618 (H1Z2Z2-K,
 * 1,8 kV DC), la tipologia di cavo di stringa fotovoltaico più diffusa e
 * normata in Italia/UE — sostanzialmente uniformi tra i produttori
 * conformi allo standard (es. Prysmian, Cavicel, Top Cable, TFKable).
 * Verificare comunque sempre la scheda tecnica specifica del produttore
 * scelto prima dell'uso definitivo in un progetto reale.
 */
export const CABLE_TYPES: CableType[] = [
  {
    id: 'en50618-free-air',
    name: 'Cavo solare EN 50618 (H1Z2Z2-K) — posa in aria libera',
    source: 'Valori tipici da normativa EN 50618, ambiente 30°C — verificare con la scheda tecnica del produttore',
    ampacityBySection: {
      1.5: 30, 2.5: 41, 4: 55, 6: 70, 10: 98, 16: 132, 25: 176, 35: 218,
      50: 276, 70: 347, 95: 416, 120: 490, 150: 557, 185: 636, 240: 743,
    },
  },
  {
    id: 'en50618-conduit',
    name: 'Cavo solare EN 50618 (H1Z2Z2-K) — posa in canalina/passerella',
    source: 'Valori tipici da normativa EN 50618 con fattore di correzione per posa raggruppata — verificare con la scheda tecnica del produttore',
    ampacityBySection: {
      1.5: 24, 2.5: 33, 4: 44, 6: 56, 10: 78, 16: 106, 25: 141, 35: 174,
      50: 221, 70: 278, 95: 333, 120: 392, 150: 446, 185: 509, 240: 594,
    },
  },
];

export interface DcCableInput {
  lengthM: number;   // L — lunghezza tratta singola (andata), non andata+ritorno
  /** Corrente di esercizio (Impp di stringa) — usata per il criterio di caduta di tensione. */
  currentForDropA: number;
  /**
   * Corrente di progetto Ib per il criterio di portata: il rating della
   * protezione del quadro di campo (interruttore/fusibile) se presente,
   * altrimenti 1,25 × Isc come da normativa in assenza di protezione.
   */
  currentForAmpacityA: number;
  deltaVoltsV: number; // ΔV — caduta di tensione ammessa, in volt
  cableType: CableType;
}

export interface DcCableResult {
  sMinVoltageDropMm2: number;   // sezione minima per sola caduta di tensione
  sMinAmpacityMm2: number | null; // sezione minima per sola portata (null se nessuna sezione disponibile è sufficiente)
  sCommercialMm2: number | null;  // sezione consigliata finale (la maggiore tra i due criteri)
  bindingCriterion: 'voltage-drop' | 'ampacity' | null; // quale criterio ha determinato la sezione finale
  requiredIzA: number; // portata minima richiesta (= corrente di progetto Ib)
}

/** Caduta di tensione reale (V) usando una sezione qualsiasi (es. scelta manualmente dall'utente). */
export function actualDeltaVoltsForSection(lengthM: number, currentA: number, sectionMm2: number): number {
  return (2 * lengthM * currentA * COPPER_RESISTIVITY_HOT) / sectionMm2;
}

/** La portata Iz (A) di una sezione per il tipo di cavo scelto, o null se la sezione non è nella tabella. */
export function ampacityForSection(cableType: CableType, sectionMm2: number): number | null {
  return cableType.ampacityBySection[sectionMm2] ?? null;
}

export function calculateDcCableSection(input: DcCableInput): DcCableResult {
  const { lengthM, currentForDropA, currentForAmpacityA, deltaVoltsV, cableType } = input;

  const sMinVoltageDropMm2 = (2 * lengthM * currentForDropA * COPPER_RESISTIVITY_HOT) / deltaVoltsV;
  const requiredIzA = currentForAmpacityA;

  const sMinAmpacityMm2 = STANDARD_SECTIONS.find(s => (cableType.ampacityBySection[s] ?? 0) >= requiredIzA) ?? null;

  const sCommercialForVoltageDrop =
    STANDARD_SECTIONS.find(s => s >= sMinVoltageDropMm2) ?? STANDARD_SECTIONS[STANDARD_SECTIONS.length - 1];

  let sCommercialMm2: number | null = null;
  let bindingCriterion: DcCableResult['bindingCriterion'] = null;

  if (sMinAmpacityMm2 !== null) {
    if (sMinAmpacityMm2 >= sCommercialForVoltageDrop) {
      sCommercialMm2 = sMinAmpacityMm2;
      bindingCriterion = 'ampacity';
    } else {
      sCommercialMm2 = sCommercialForVoltageDrop;
      bindingCriterion = 'voltage-drop';
    }
  }
  // Se nessuna sezione della tabella ha portata sufficiente, sCommercialMm2 resta null:
  // nessuna sezione standard è idonea con questo tipo di cavo per la corrente data.

  return { sMinVoltageDropMm2, sMinAmpacityMm2, sCommercialMm2, bindingCriterion, requiredIzA };
}
