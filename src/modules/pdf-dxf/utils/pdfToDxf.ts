/**
 * pdfToDxf.ts
 *
 * Converte un PDF in DXF con due strategie, provate in ordine per ogni
 * pagina:
 *
 *   1. Estrazione vettoriale diretta — percorre l'operator list di pdf.js e
 *      ricostruisce i tracciati (linee, curve, rettangoli) presenti nel
 *      contenuto del PDF. Funziona solo se il PDF è stato generato da un
 *      CAD (o comunque contiene vettori reali) ed è il metodo più fedele,
 *      quindi è sempre il primo tentativo.
 *   2. Fallback raster (Potrace) — se una pagina non contiene alcun
 *      tracciato vettoriale (tipico di un PDF scansionato/plottato come
 *      immagine), la pagina viene renderizzata ad alta risoluzione e
 *      vettorizzata con Potrace (vedi potraceRasterFallback.ts per i
 *      dettagli della pipeline, validata manualmente dall'utente).
 *
 * Le curve di Bézier (in entrambe le strategie) vengono approssimate con
 * segmenti di retta, poiché DXF non richiede curve esatte per un disegno di
 * riferimento tecnico.
 */

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — Vite risolve l'URL del worker come asset statico, mantenendo
// il percorso reale del file (serve a pdf.js per risolvere correttamente,
// relativamente ad esso, le risorse aggiuntive del worker — es. i codec
// immagine — necessarie per il rendering di pagine con immagini incorporate).
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { buildDxf, rgbToAci, type DxfSegment } from './dxfWriter';
import { rasterizePdfPageToImageData, tracePageToSegments } from './potraceRasterFallback';
import type { ConversionResult } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Concatena `source` dentro `target` con un ciclo, non `target.push(...source)`:
 * con array di decine di migliaia di elementi (comune per PDF CAD complessi)
 * lo spread supera il limite di argomenti della funzione e genera
 * "Maximum call stack size exceeded" — lo stesso problema già risolto per
 * Math.min/max(...array) in dxfWriter.ts, qui capitato di nuovo su push().
 */
function pushAll<T>(target: T[], source: T[]): void {
  for (const item of source) target.push(item);
}

/** Conta i pixel "scuri" (inchiostro) in un'immagine già binarizzata — usato solo per diagnostica in caso di fallimento. */
function countInkPixels(imageData: ImageData): number {
  const d = imageData.data;
  let count = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === 0) count++;
  }
  return count;
}

// 1 punto PDF (1/72 pollice) in millimetri
const PT_TO_MM = 25.4 / 72;

type Matrix = [number, number, number, number, number, number];

function multiply(m1: Matrix, m2: Matrix): Matrix {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function cubicBezierPoints(
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

export interface VectorExtractionResult {
  segments: DxfSegment[];
  /** Diagnostica: numero totale di operatori nella pagina e quanti erano costruzioni di percorso. */
  totalOps: number;
  pathOps: number;
}

/** Estrae i segmenti vettoriali di una pagina dal suo operator list di pdf.js. */
async function extractVectorSegments(page: any, layer: string): Promise<VectorExtractionResult> {
  const opList = await page.getOperatorList();
  const OPS = pdfjsLib.OPS;
  const segments: DxfSegment[] = [];
  let pathOps = 0;

  let matrix: Matrix = [1, 0, 0, 1, 0, 0];
  const stack: Matrix[] = [];
  let colorIndex = 7;

  const { fnArray, argsArray } = opList;

  const pushSeg = (ax: number, ay: number, bx: number, by: number) => {
    const [x1, y1] = apply(matrix, ax, ay);
    const [x2, y2] = apply(matrix, bx, by);
    segments.push({ x1: x1 * PT_TO_MM, y1: y1 * PT_TO_MM, x2: x2 * PT_TO_MM, y2: y2 * PT_TO_MM, layer, colorIndex });
  };

  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i];
    const args = argsArray[i];

    if (fn === OPS.save || fn === OPS.paintFormXObjectBegin) {
      // paintFormXObjectBegin racchiude il contenuto di un Form XObject
      // (un blocco di disegno annidato, molto comune nei PDF esportati da
      // CAD/Revit): pdf.js lo inserisce già "srotolato" nella stessa
      // operator list, ma la sua matrice di posizionamento (args[0]) va
      // applicata esplicitamente qui, esattamente come un q/cm — altrimenti
      // tutta la geometria annidata nel form risulta nella posizione
      // sbagliata (o si perde nei calcoli se la matrice non combacia).
      stack.push([...matrix] as Matrix);
      if (fn === OPS.paintFormXObjectBegin) {
        const formMatrix = args?.[0] as number[] | null;
        if (formMatrix && formMatrix.length === 6) {
          matrix = multiply(matrix, formMatrix as Matrix);
        }
      }
    } else if (fn === OPS.restore || fn === OPS.paintFormXObjectEnd) {
      const prev = stack.pop();
      if (prev) matrix = prev;
    } else if (fn === OPS.transform) {
      const [a, b, c, d, e, ee] = args as number[];
      matrix = multiply(matrix, [a, b, c, d, e, ee]);
    } else if (fn === OPS.setStrokeRGBColor || fn === OPS.setFillRGBColor) {
      const [r, g, b] = args as number[];
      colorIndex = rgbToAci(r, g, b);
    } else if (fn === OPS.constructPath) {
      pathOps++;
      // args: [opsArray, coordsFlat, minMax]
      const subOps: number[] = args[0];
      const coords: number[] = args[1];
      let ci = 0;
      let cur: [number, number] = [0, 0];
      let subStart: [number, number] = [0, 0];

      for (const pOp of subOps) {
        if (pOp === OPS.moveTo) {
          cur = [coords[ci], coords[ci + 1]]; ci += 2;
          subStart = cur;
        } else if (pOp === OPS.lineTo) {
          const next: [number, number] = [coords[ci], coords[ci + 1]]; ci += 2;
          pushSeg(cur[0], cur[1], next[0], next[1]);
          cur = next;
        } else if (pOp === OPS.curveTo) {
          const p1: [number, number] = [coords[ci], coords[ci + 1]];
          const p2: [number, number] = [coords[ci + 2], coords[ci + 3]];
          const p3: [number, number] = [coords[ci + 4], coords[ci + 5]];
          ci += 6;
          let prevPt = cur;
          for (const pt of cubicBezierPoints(cur, p1, p2, p3)) {
            pushSeg(prevPt[0], prevPt[1], pt[0], pt[1]);
            prevPt = pt;
          }
          cur = p3;
        } else if (pOp === OPS.curveTo2) {
          // control points: [cur, p2, p3] — il primo punto di controllo coincide col punto corrente
          const p2: [number, number] = [coords[ci], coords[ci + 1]];
          const p3: [number, number] = [coords[ci + 2], coords[ci + 3]];
          ci += 4;
          let prevPt = cur;
          for (const pt of cubicBezierPoints(cur, cur, p2, p3)) {
            pushSeg(prevPt[0], prevPt[1], pt[0], pt[1]);
            prevPt = pt;
          }
          cur = p3;
        } else if (pOp === OPS.curveTo3) {
          // control points: [p1, p3, p3] — il secondo punto di controllo coincide col punto finale
          const p1: [number, number] = [coords[ci], coords[ci + 1]];
          const p3: [number, number] = [coords[ci + 2], coords[ci + 3]];
          ci += 4;
          let prevPt = cur;
          for (const pt of cubicBezierPoints(cur, p1, p3, p3)) {
            pushSeg(prevPt[0], prevPt[1], pt[0], pt[1]);
            prevPt = pt;
          }
          cur = p3;
        } else if (pOp === OPS.closePath) {
          pushSeg(cur[0], cur[1], subStart[0], subStart[1]);
          cur = subStart;
        } else if (pOp === OPS.rectangle) {
          const x = coords[ci], y = coords[ci + 1], w = coords[ci + 2], h = coords[ci + 3];
          ci += 4;
          const corners: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
          for (let k = 0; k < corners.length - 1; k++) {
            pushSeg(corners[k][0], corners[k][1], corners[k + 1][0], corners[k + 1][1]);
          }
          cur = [x, y];
          subStart = cur;
        }
      }
    }
  }

  return { segments, totalOps: fnArray.length, pathOps };
}

export interface ConvertOptions {
  /** Scala della pianta per il fallback raster, es. 100 per "1:100". Ignorata per le pagine vettoriali. */
  planScale: number;
  /** Dimensione minima (mm, diagonale) sotto la quale un tracciato del fallback raster viene scartato. 0 = trace completo, nessun filtro. */
  minSizeMm: number;
}

const DEFAULT_OPTIONS: ConvertOptions = { planScale: 1, minSizeMm: 0 };

/** Converte un file PDF in testo DXF, pagina per pagina (vettoriale, con fallback raster/Potrace). */
export async function convertPdfToDxf(
  file: File,
  onProgress?: (msg: string) => void,
  options: Partial<ConvertOptions> = {}
): Promise<ConversionResult> {
  const opts: ConvertOptions = { ...DEFAULT_OPTIONS, ...options };
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const segments: DxfSegment[] = [];
  const warnings: string[] = [];
  const layersUsed = new Set<string>();
  let vectorPages = 0;
  let rasterPages = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const layer = pdf.numPages > 1 ? `PAGINA_${pageNum}` : 'PDF_IMPORT';
    layersUsed.add(layer);

    try {
      onProgress?.(`Lettura vettoriale pagina ${pageNum}/${pdf.numPages}...`);
      const page = await pdf.getPage(pageNum);
      const vectorResult = await extractVectorSegments(page, layer);

      if (vectorResult.segments.length > 0) {
        pushAll(segments, vectorResult.segments);
        vectorPages++;
        continue;
      }

      // Nessun vettore trovato: probabile PDF raster/scansionato -> fallback Potrace.
      onProgress?.(`Pagina ${pageNum}/${pdf.numPages}: nessun vettore, tracciamento raster in corso (può richiedere qualche secondo)...`);
      const imageData = await rasterizePdfPageToImageData(page);
      const inkPixels = countInkPixels(imageData);
      const raster = await tracePageToSegments(imageData, {
        planScale: opts.planScale,
        minSizeMm: opts.minSizeMm,
        layer,
      });

      if (raster.segments.length > 0) {
        pushAll(segments, raster.segments);
        rasterPages++;
        warnings.push(`Pagina ${pageNum}: nessun tracciato vettoriale nel PDF — usata la vettorizzazione raster (Potrace). Verifica la scala impostata (${opts.planScale}) e le dimensioni ottenute (${raster.widthMm.toFixed(0)}×${raster.heightMm.toFixed(0)} mm).`);
      } else {
        // Diagnostica: perché il tracciamento raster non ha trovato nulla?
        // - inkPixels ~0%: la pagina renderizzata è risultata bianca (rendering fallito o pagina vuota).
        // - inkPixels alto ma 0 tracciati: Potrace non è riuscito a isolare contorni (soglia di binarizzazione o turdsize troppo aggressivi).
        const inkPct = ((inkPixels / (imageData.width * imageData.height)) * 100).toFixed(2);
        warnings.push(
          `Pagina ${pageNum}: 0 vettori nel PDF (${vectorResult.totalOps} operatori letti, ${vectorResult.pathOps} costruzioni di percorso) e 0 tracciati dal fallback raster ` +
          `(immagine ${imageData.width}×${imageData.height}px, ${inkPct}% pixel scuri rilevati dopo la binarizzazione). ` +
          (Number(inkPct) < 0.1
            ? 'La pagina renderizzata risulta praticamente bianca: possibile problema di rendering o pagina realmente vuota.'
            : 'Pixel scuri presenti ma Potrace non ha isolato contorni: prova ad abbassare la soglia di binarizzazione o verifica che il disegno non sia troppo chiaro/a bassa risoluzione.')
        );
      }
    } catch (e: any) {
      warnings.push(`Pagina ${pageNum}: errore durante l'estrazione (${e?.message || e}).`);
    }
  }

  if (segments.length === 0) {
    const detail = warnings.length > 0 ? ' Dettaglio: ' + warnings.join(' | ') : '';
    throw new Error(`Nessuna geometria trovata nel PDF, né come vettori né tramite tracciamento raster.${detail}`);
  }

  const dxfText = buildDxf(segments);

  return {
    dxfText,
    stats: {
      fileName: file.name,
      pages: pdf.numPages,
      entities: segments.length,
      layers: layersUsed.size,
      vectorPages,
      rasterPages,
      warnings,
    },
  };
}
