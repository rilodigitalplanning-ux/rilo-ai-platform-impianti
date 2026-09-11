/**
 * numberInput.ts
 *
 * Gli <input type="number"> nativi rifiutano il carattere "," a livello di
 * DOM: sulla tastiera numerica estesa (quella a destra, non i tasti sopra
 * le lettere) il separatore decimale digitato è spesso "," e l'input lo
 * scarta silenziosamente, impedendo di scrivere numeri decimali. Usiamo
 * quindi <input type="text" inputMode="decimal"> ovunque serva un decimale,
 * e normalizziamo qui la virgola in punto prima del parsing.
 */

import type { FocusEvent } from 'react';

export function parseLocaleFloat(raw: string, fallback = 0): number {
  const normalized = raw.replace(',', '.').trim();
  if (normalized === '' || normalized === '-') return fallback;
  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : fallback;
}

export function parseLocaleInt(raw: string, fallback = 0): number {
  const normalized = raw.replace(',', '.').trim();
  if (normalized === '' || normalized === '-') return fallback;
  const n = parseInt(normalized, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** Seleziona tutto il contenuto al focus, così scrivere sostituisce il valore invece di accodarsi (es. "0" + "13" -> "013"). */
export function selectAllOnFocus(e: FocusEvent<HTMLInputElement>): void {
  e.currentTarget.select();
}
