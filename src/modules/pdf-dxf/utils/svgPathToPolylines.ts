/**
 * svgPathToPolylines.ts
 *
 * Converte l'attributo "d" di un <path> SVG (l'output di Potrace) in una
 * lista di poligonali (array di punti). Supporta i comandi M/L/H/V/C/S/Q/T/Z
 * (assoluti e relativi) — le curve vengono approssimate con segmenti di
 * retta, come già fatto per l'estrazione vettoriale diretta dal PDF.
 */

export interface Polyline {
  points: [number, number][];
  closed: boolean;
}

function cubicPoints(
  p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], segments = 8
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * mt * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t * t * t * p3[0];
    const y = mt * mt * mt * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t * t * t * p3[1];
    pts.push([x, y]);
  }
  return pts;
}

function quadraticPoints(
  p0: [number, number], p1: [number, number], p2: [number, number], segments = 6
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const mt = 1 - t;
    const x = mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0];
    const y = mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1];
    pts.push([x, y]);
  }
  return pts;
}

const CMD_RE = /([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)/g;
const NUM_RE = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

function parseNums(s: string): number[] {
  return (s.match(NUM_RE) || []).map(Number);
}

/** Converte una singola stringa "d" (che può contenere più sotto-percorsi M...Z M...Z) in poligonali. */
export function svgPathToPolylines(d: string): Polyline[] {
  const polylines: Polyline[] = [];
  let cur: [number, number] = [0, 0];
  let start: [number, number] = [0, 0];
  let prevCtrl: [number, number] | null = null; // per S/T (riflette il punto di controllo precedente)
  let currentPts: [number, number][] = [];

  const flush = (closed: boolean) => {
    if (currentPts.length > 1) polylines.push({ points: currentPts, closed });
    currentPts = [];
  };

  let match: RegExpExecArray | null;
  CMD_RE.lastIndex = 0;
  while ((match = CMD_RE.exec(d))) {
    const cmd = match[1];
    const nums = parseNums(match[2]);
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    let i = 0;

    const abs = (x: number, y: number): [number, number] =>
      rel ? [cur[0] + x, cur[1] + y] : [x, y];

    if (C === 'M') {
      flush(false);
      const p = abs(nums[i], nums[i + 1]); i += 2;
      cur = p; start = p; currentPts = [p];
      // ulteriori coppie dopo la prima in un comando M sono lineTo implicite
      while (i + 1 < nums.length) {
        const np = abs(nums[i], nums[i + 1]); i += 2;
        currentPts.push(np); cur = np;
      }
      prevCtrl = null;
    } else if (C === 'L') {
      while (i + 1 < nums.length) {
        const p = abs(nums[i], nums[i + 1]); i += 2;
        currentPts.push(p); cur = p;
      }
      prevCtrl = null;
    } else if (C === 'H') {
      while (i < nums.length) {
        const p: [number, number] = rel ? [cur[0] + nums[i], cur[1]] : [nums[i], cur[1]]; i += 1;
        currentPts.push(p); cur = p;
      }
      prevCtrl = null;
    } else if (C === 'V') {
      while (i < nums.length) {
        const p: [number, number] = rel ? [cur[0], cur[1] + nums[i]] : [cur[0], nums[i]]; i += 1;
        currentPts.push(p); cur = p;
      }
      prevCtrl = null;
    } else if (C === 'C') {
      while (i + 5 < nums.length) {
        const p1 = abs(nums[i], nums[i + 1]);
        const p2 = abs(nums[i + 2], nums[i + 3]);
        const p3 = abs(nums[i + 4], nums[i + 5]);
        i += 6;
        currentPts.push(...cubicPoints(cur, p1, p2, p3));
        cur = p3; prevCtrl = p2;
      }
    } else if (C === 'S') {
      while (i + 3 < nums.length) {
        const p1: [number, number] = prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur;
        const p2 = abs(nums[i], nums[i + 1]);
        const p3 = abs(nums[i + 2], nums[i + 3]);
        i += 4;
        currentPts.push(...cubicPoints(cur, p1, p2, p3));
        cur = p3; prevCtrl = p2;
      }
    } else if (C === 'Q') {
      while (i + 3 < nums.length) {
        const p1 = abs(nums[i], nums[i + 1]);
        const p2 = abs(nums[i + 2], nums[i + 3]);
        i += 4;
        currentPts.push(...quadraticPoints(cur, p1, p2));
        cur = p2; prevCtrl = p1;
      }
    } else if (C === 'T') {
      while (i + 1 < nums.length) {
        const p1: [number, number] = prevCtrl ? [2 * cur[0] - prevCtrl[0], 2 * cur[1] - prevCtrl[1]] : cur;
        const p2 = abs(nums[i], nums[i + 1]);
        i += 2;
        currentPts.push(...quadraticPoints(cur, p1, p2));
        cur = p2; prevCtrl = p1;
      }
    } else if (C === 'A') {
      // Archi: rari nell'output di Potrace (con alphamax=0/opticurve=0 non li produce mai);
      // se presenti li approssimiamo con una linea retta all'endpoint per non perdere il tracciato.
      while (i + 6 < nums.length) {
        const p = abs(nums[i + 5], nums[i + 6]); i += 7;
        currentPts.push(p); cur = p;
      }
      prevCtrl = null;
    } else if (C === 'Z') {
      currentPts.push(start);
      cur = start;
      flush(true);
      prevCtrl = null;
    }
  }
  flush(false);

  return polylines;
}

/** Converte tutte le stringhe "d" di un array di path in un'unica lista di poligonali. */
export function svgPathsToPolylines(paths: string[]): Polyline[] {
  return paths.flatMap(svgPathToPolylines);
}
