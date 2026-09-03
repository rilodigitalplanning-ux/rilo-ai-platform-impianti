/**
 * dxfWriter.ts
 *
 * Scrittore DXF minimale in formato ASCII R12 (AC1009). Deliberatamente NON
 * si usa un $ACADVER più recente (es. AC1015/AutoCAD 2000): quei formati
 * dichiarano funzionalità (handle univoci su ogni entità/tabella, sezioni
 * CLASSES/BLOCKS/OBJECTS, $HANDSEED, ecc.) che un lettore DXF rigoroso si
 * aspetta di trovare quando vede quella versione in intestazione — se
 * mancano, il file viene letto come troncato/corrotto ("Unexpected end of
 * file"), anche se sintatticamente le sezioni presenti sono corrette. Il
 * formato R12 non richiede nulla di tutto ciò ed è il minimo comune
 * denominatore letto correttamente da qualsiasi software CAD (AutoCAD,
 * progeCAD, LibreCAD, QCAD, ecc.).
 *
 * Usa entità LINE semplici (invece di POLYLINE) per massimizzare la
 * compatibilità: ogni segmento diventa una entità indipendente sullo stesso
 * layer/colore.
 */

export interface DxfSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  layer: string;
  colorIndex: number; // AutoCAD Color Index (ACI), 1-255
}

function n(v: number): string {
  // DXF accetta numeri in virgola mobile con punto decimale
  return v.toFixed(4);
}

export function buildDxf(segments: DxfSegment[]): string {
  const layers = [...new Set(segments.map(s => s.layer))];
  const lines: string[] = [];

  const add = (code: number, value: string | number) => {
    lines.push(String(code), String(value));
  };

  // Calcolate con un ciclo (non Math.min/max(...array)): con migliaia di
  // segmenti lo spread operator supera il limite di argomenti dello stack
  // della funzione e genera "Maximum call stack size exceeded".
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of segments) {
    if (s.x1 < minX) minX = s.x1;
    if (s.x2 < minX) minX = s.x2;
    if (s.x1 > maxX) maxX = s.x1;
    if (s.x2 > maxX) maxX = s.x2;
    if (s.y1 < minY) minY = s.y1;
    if (s.y2 < minY) minY = s.y2;
    if (s.y1 > maxY) maxY = s.y1;
    if (s.y2 > maxY) maxY = s.y2;
  }

  // ── HEADER ──
  add(0, 'SECTION');
  add(2, 'HEADER');
  add(9, '$ACADVER');
  add(1, 'AC1009');
  add(9, '$INSBASE');
  add(10, '0.0'); add(20, '0.0'); add(30, '0.0');
  add(9, '$EXTMIN');
  add(10, n(minX)); add(20, n(minY)); add(30, '0.0');
  add(9, '$EXTMAX');
  add(10, n(maxX)); add(20, n(maxY)); add(30, '0.0');
  add(0, 'ENDSEC');

  // ── TABLES (definizione layer) ──
  add(0, 'SECTION');
  add(2, 'TABLES');
  add(0, 'TABLE');
  add(2, 'LAYER');
  add(70, layers.length);
  layers.forEach(layer => {
    add(0, 'LAYER');
    add(2, layer);
    add(70, 0);
    add(62, 7); // colore di default del layer (bianco/nero)
    add(6, 'CONTINUOUS');
  });
  add(0, 'ENDTAB');
  add(0, 'ENDSEC');

  // ── ENTITIES ──
  add(0, 'SECTION');
  add(2, 'ENTITIES');
  segments.forEach(s => {
    add(0, 'LINE');
    add(8, s.layer);
    add(62, s.colorIndex);
    add(10, n(s.x1));
    add(20, n(s.y1));
    add(30, '0.0');
    add(11, n(s.x2));
    add(21, n(s.y2));
    add(31, '0.0');
  });
  add(0, 'ENDSEC');

  add(0, 'EOF');

  return lines.join('\r\n') + '\r\n';
}

/** Approssima un colore RGB al più vicino tra gli indici colore AutoCAD (ACI) standard. */
const ACI_PALETTE: [number, number, number, number][] = [
  [1, 255, 0, 0],
  [2, 255, 255, 0],
  [3, 0, 255, 0],
  [4, 0, 255, 255],
  [5, 0, 0, 255],
  [6, 255, 0, 255],
  [7, 255, 255, 255],
  [8, 128, 128, 128],
  [9, 192, 192, 192],
  [30, 255, 128, 0],
];

export function rgbToAci(r: number, g: number, b: number): number {
  // Quasi nero/bianco puro -> 7 (bianco, visibile su sfondo scuro CAD di default)
  let best = 7;
  let bestDist = Infinity;
  for (const [aci, pr, pg, pb] of ACI_PALETTE) {
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestDist) { bestDist = d; best = aci; }
  }
  return best;
}
