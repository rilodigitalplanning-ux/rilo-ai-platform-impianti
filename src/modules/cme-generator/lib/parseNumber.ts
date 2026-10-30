// Parsing numeri in formato italiano/inglese: "1.250,00", "1250,5", "1,250.00", "12.5", "€ 9,80".
// Il separatore decimale è l'ultimo tra "." e ","; se compare un solo tipo di separatore
// viene trattato come decimale (con "," sempre decimale), salvo più occorrenze (migliaia).
// ambiguousDotIsThousands: un "1.250" isolato vale 1250 (prezzi di file italiani) invece di 1,25.
export function parseItNumber(raw: unknown, ambiguousDotIsThousands = false): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  let s = String(raw ?? '').replace(/[€\s\u00a0]/g, '');
  if (!s) return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    s = (s.match(/,/g)!.length > 1) ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot >= 0) {
    if ((s.match(/\./g)!.length) > 1) s = s.replace(/\./g, '');
    else if (ambiguousDotIsThousands && /^-?\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
