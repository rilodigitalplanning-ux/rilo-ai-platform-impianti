/**
 * potraceRasterFallback.ts
 *
 * Pipeline per PDF "raster" (planimetrie scansionate/plottate come
 * immagine, senza tracciati vettoriali estraibili dal contenuto del PDF).
 * Riproduce la pipeline validata manualmente dall'utente:
 *
 *   1. Rendering della pagina PDF ad alta risoluzione (300 DPI) su <canvas>.
 *   2. Binarizzazione (soglia bianco/nero) — l'inchiostro (scuro) diventa
 *      il tracciato da vettorizzare, lo sfondo (chiaro) resta vuoto.
 *   3. Vettorizzazione con Potrace (qui via WASM, eseguito nel browser —
 *      stesso algoritmo del Potrace desktop, non un tracciamento "fatto in
 *      casa" con Hough Lines/contorni OpenCV, che dà risultati frammentati).
 *   4. Calibrazione della scala: mm_per_pixel = (25.4 / dpi) * scalaPianta.
 *      La scala della pianta (es. 100 per "1:100") viene fornita
 *      dall'utente, perché su un PDF raster non è leggibile automaticamente
 *      in modo affidabile (richiederebbe OCR sul cartiglio).
 *   5. Inversione asse Y (le coordinate immagine crescono verso il basso,
 *      il DXF si aspetta Y crescente verso l'alto).
 *
 * NOTA: Potrace traccia OGNI area scura dell'immagine — pareti, porte,
 * simboli, testo (come contorno, non come testo editabile), campiture.
 * Non c'è modo di distinguere automaticamente "questo è muro" da "questo è
 * un simbolo elettrico" a partire da soli pixel: è un limite intrinseco di
 * un PDF raster, non un bug della conversione. Il filtro per dimensione
 * minima (parametro opzionale) aiuta a scartare simboli/testo piccoli,
 * mantenendo le linee lunghe (muri), ma è un'euristica, non una soluzione
 * perfetta — l'alternativa è il "trace completo" (nessun filtro) seguito
 * da una pulizia manuale nel software CAD.
 */

import { potrace, init as initPotrace } from 'esm-potrace-wasm';
import { svgPathsToPolylines } from './svgPathToPolylines';
import { rgbToAci, type DxfSegment } from './dxfWriter';

const RENDER_DPI = 300;
const PDF_DEFAULT_DPI = 72;

let potraceReady: Promise<void> | null = null;
function ensurePotraceReady(): Promise<void> {
  if (!potraceReady) potraceReady = initPotrace();
  return potraceReady;
}

export interface RasterFallbackOptions {
  /** Scala della pianta, es. 100 per un disegno in scala 1:100. Default 1 (nessun riscalamento oltre ai DPI). */
  planScale: number;
  /** Dimensione minima (in mm, diagonale del bounding box) sotto la quale un tracciato viene scartato. 0 = trace completo, nessun filtro. */
  minSizeMm: number;
  layer: string;
}

export interface RasterFallbackResult {
  segments: DxfSegment[];
  widthMm: number;
  heightMm: number;
  entitiesBeforeFilter: number;
}

function grayscaleThreshold(imageData: ImageData, threshold = 200): void {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    // Luminanza percettiva (stessa formula usata comunemente per la conversione in scala di grigi)
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const v = lum < threshold ? 0 : 255;
    d[i] = v; d[i + 1] = v; d[i + 2] = v; d[i + 3] = 255;
  }
}

export async function rasterizePdfPageToImageData(
  page: any, // pdfjsLib.PDFPageProxy
  dpi = RENDER_DPI
): Promise<ImageData> {
  const scale = dpi / PDF_DEFAULT_DPI;
  const viewport = page.getViewport({ scale }); // include già la rotazione /Rotate della pagina

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Impossibile creare il contesto canvas per il rendering.');

  // Sfondo bianco esplicito: le pagine PDF con aree trasparenti altrimenti
  // risulterebbero nere sul canvas, invertendo il risultato della soglia.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  await page.render({ canvasContext: ctx, viewport }).promise;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  grayscaleThreshold(imageData);
  return imageData;
}

// Potrace esporta le coordinate dei tracciati SVG a una risoluzione 10x
// superiore ai pixel dell'immagine di origine (comportamento di default
// ereditato dal backend SVG del Potrace originale, confermato empiricamente:
// il bounding box dei tracciati risultava esattamente 10x le dimensioni note
// dell'immagine data in input). Vanno quindi riportate in spazio-pixel reale
// dividendo per questo fattore prima di applicare la calibrazione mm/pixel.
const POTRACE_COORD_SCALE = 10;

/** Vettorizza una singola pagina (già rasterizzata + binarizzata) con Potrace e la converte in segmenti DXF calibrati. */
export async function tracePageToSegments(
  imageData: ImageData,
  opts: RasterFallbackOptions,
  dpi = RENDER_DPI
): Promise<RasterFallbackResult> {
  await ensurePotraceReady();

  const paths = await potrace(imageData, {
    turdsize: 2,
    turnpolicy: 4,
    alphamax: 0,      // 0 = nessuno smussamento degli angoli -> segmenti retti (equivalente a "potrace --flat")
    opticurve: 0,      // disabilita l'ottimizzazione a curve di Bézier, coerente con alphamax 0
    opttolerance: 0.2,
    pathonly: true,    // ritorna un array di stringhe "d" invece di un SVG completo
    extractcolors: false,
    posterizelevel: 1,
    posterizationalgorithm: 0,
  } as any) as string[];

  const polylines = svgPathsToPolylines(paths);

  const mmPerPixel = (25.4 / dpi) * opts.planScale;
  const heightPx = imageData.height;

  const toRealPx = (px: number, py: number): [number, number] =>
    [px / POTRACE_COORD_SCALE, py / POTRACE_COORD_SCALE];

  const toMm = (px: number, py: number): [number, number] => {
    const [rx, ry] = toRealPx(px, py);
    return [rx * mmPerPixel, (heightPx - ry) * mmPerPixel];
  };

  const segments: DxfSegment[] = [];
  const colorIndex = rgbToAci(0, 0, 0); // tracciato monocromatico (bianco/nero) -> ACI 7

  let entitiesBeforeFilter = 0;
  for (const poly of polylines) {
    entitiesBeforeFilter++;
    if (poly.points.length < 2) continue;

    if (opts.minSizeMm > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const [x, y] of poly.points) {
        const [rx, ry] = toRealPx(x, y);
        if (rx < minX) minX = rx; if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry; if (ry > maxY) maxY = ry;
      }
      const wMm = (maxX - minX) * mmPerPixel;
      const hMm = (maxY - minY) * mmPerPixel;
      const diag = Math.sqrt(wMm * wMm + hMm * hMm);
      if (diag < opts.minSizeMm) continue;
    }

    const mmPts = poly.points.map(([x, y]) => toMm(x, y));
    for (let i = 0; i < mmPts.length - 1; i++) {
      const [x1, y1] = mmPts[i];
      const [x2, y2] = mmPts[i + 1];
      segments.push({ x1, y1, x2, y2, layer: opts.layer, colorIndex });
    }
  }

  return {
    segments,
    widthMm: imageData.width * mmPerPixel,
    heightMm: imageData.height * mmPerPixel,
    entitiesBeforeFilter,
  };
}
