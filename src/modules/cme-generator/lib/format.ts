// Formati numerici condivisi (italiano, con separatore delle migliaia anche per i numeri a 4 cifre)
const opts = (min: number, max: number): Intl.NumberFormatOptions =>
  ({ minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: 'always' } as unknown as Intl.NumberFormatOptions);

/** 1.234,50 */
export const fmt = (v: number) => v.toLocaleString('it-IT', opts(2, 2));
/** 1.234,5 — fino a 4 decimali (prezzi unitari di prezzario) */
export const fmt4 = (v: number) => v.toLocaleString('it-IT', opts(2, 4));
/** 1.234,5 — quantità */
export const fmtQty = (v: number) => v.toLocaleString('it-IT', opts(0, 2));
/** € 1.234,50 */
export const eur = (v: number) => `€ ${fmt(v)}`;
