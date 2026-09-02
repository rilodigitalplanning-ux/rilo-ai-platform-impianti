/**
 * pdfToDxf.ts
 *
 * Estrae la geometria vettoriale (linee, curve, rettangoli) dal contenuto di
 * un PDF — tipicamente un disegno CAD esportato in PDF — e la converte in
 * entità DXF (LINE), utilizzabili in AutoCAD o altro software CAD.
 *
 * Le curve di Bézier vengono approssimate con segmenti di retta (poligonali),
 * poiché DXF non richiede curve esatte per un disegno di riferimento tecnico.
 * Il testo del PDF non viene convertito (solo geometria vettoriale): un PDF
 * scansionato (immagine raster, senza testo/tracciati vettoriali) non
 * produce alcuna geometria utile — questo limite viene segnalato all'utente.
 */

import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore — sintassi Vite per importare un file come Web Worker vero e proprio.
// Necessario perché pdfjs-dist v4 con Vite: l'import "?url" fa fallire il
// worker (pdf.js ripiega su un "fake worker" che tenta un dynamic import
// diretto del pacchetto in node_modules, bloccato dal dev server di Vite).
// Passando un Worker reale già istanziato tramite "?worker", il problema
// non si presenta perché pdf.js non deve più risolvere/creare il worker da sé.
import PdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';
import { buildDxf, rgbToAci, type DxfSegment } from './dxfWriter';
import type { ConversionResult } from '../types';

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

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

/**
 * Converte un file PDF in testo DXF. Percorre l'operator list di pdf.js di
 * ogni pagina, ricostruendo lo stack delle trasformazioni (q/Q, cm) e i
 * percorsi (m/l/c/re), producendo una entità LINE per ogni segmento.
 */
export async function convertPdfToDxf(file: File, onProgress?: (msg: string) => void): Promise<ConversionResult> {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const segments: DxfSegment[] = [];
  const warnings: string[] = [];
  const layersUsed = new Set<string>();

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    onProgress?.(`Lettura pagina ${pageNum}/${pdf.numPages}...`);
    try {
      const page = await pdf.getPage(pageNum);
      const opList = await page.getOperatorList();
      const layer = pdf.numPages > 1 ? `PAGINA_${pageNum}` : 'PDF_IMPORT';
      layersUsed.add(layer);

      const OPS = pdfjsLib.OPS;
      let matrix: Matrix = [1, 0, 0, 1, 0, 0];
      const stack: Matrix[] = [];
      let colorIndex = 7;

      const { fnArray, argsArray } = opList;
      const pageEntitiesBefore = segments.length;

      for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i];

        if (fn === OPS.save) {
          stack.push([...matrix] as Matrix);
        } else if (fn === OPS.restore) {
          const prev = stack.pop();
          if (prev) matrix = prev;
        } else if (fn === OPS.transform) {
          const [a, b, c, d, e, ee] = args as number[];
          matrix = multiply(matrix, [a, b, c, d, e, ee]);
        } else if (fn === OPS.setStrokeRGBColor || fn === OPS.setFillRGBColor) {
          const [r, g, b] = args as number[];
          colorIndex = rgbToAci(r, g, b);
        } else if (fn === OPS.constructPath) {
          // args: [opsArray, coordsFlat, minMax]
          const pathOps: number[] = args[0];
          const coords: number[] = args[1];
          let ci = 0;
          let cur: [number, number] = [0, 0];
          let subStart: [number, number] = [0, 0];

          for (const pOp of pathOps) {
            if (pOp === OPS.moveTo) {
              cur = [coords[ci], coords[ci + 1]]; ci += 2;
              subStart = cur;
            } else if (pOp === OPS.lineTo) {
              const next: [number, number] = [coords[ci], coords[ci + 1]]; ci += 2;
              const [x1, y1] = apply(matrix, cur[0], cur[1]);
              const [x2, y2] = apply(matrix, next[0], next[1]);
              segments.push({ x1: x1 * PT_TO_MM, y1: y1 * PT_TO_MM, x2: x2 * PT_TO_MM, y2: y2 * PT_TO_MM, layer, colorIndex });
              cur = next;
            } else if (pOp === OPS.curveTo) {
              const p1: [number, number] = [coords[ci], coords[ci + 1]];
              const p2: [number, number] = [coords[ci + 2], coords[ci + 3]];
              const p3: [number, number] = [coords[ci + 4], coords[ci + 5]];
              ci += 6;
              const pts = cubicBezierPoints(cur, p1, p2, p3);
              let prevPt = cur;
              for (const pt of pts) {
                const [x1, y1] = apply(matrix, prevPt[0], prevPt[1]);
                const [x2, y2] = apply(matrix, pt[0], pt[1]);
                segments.push({ x1: x1 * PT_TO_MM, y1: y1 * PT_TO_MM, x2: x2 * PT_TO_MM, y2: y2 * PT_TO_MM, layer, colorIndex });
                prevPt = pt;
              }
              cur = p3;
            } else if (pOp === OPS.curveTo2) {
              // control points: [cur, p2, p3] — il primo punto di controllo coincide col punto corrente
              const p2: [number, number] = [coords[ci], coords[ci + 1]];
              const p3: [number, number] = [coords[ci + 2], coords[ci + 3]];
              ci += 4;
              const pts = cubicBezierPoints(cur, cur, p2, p3);
              let prevPt = cur;
              for (const pt of pts) {
                const [x1, y1] = apply(matrix, prevPt[0], prevPt[1]);
                const [x2, y2] = apply(matrix, pt[0], pt[1]);
                segments.push({ x1: x1 * PT_TO_MM, y1: y1 * PT_TO_MM, x2: x2 * PT_TO_MM, y2: y2 * PT_TO_MM, layer, colorIndex });
                prevPt = pt;
              }
              cur = p3;
            } else if (pOp === OPS.curveTo3) {
              // control points: [p1, p3, p3] — il secondo punto di controllo coincide col punto finale
              const p1: [number, number] = [coords[ci], coords[ci + 1]];
              const p3: [number, number] = [coords[ci + 2], coords[ci + 3]];
              ci += 4;
              const pts = cubicBezierPoints(cur, p1, p3, p3);
              let prevPt = cur;
              for (const pt of pts) {
                const [x1, y1] = apply(matrix, prevPt[0], prevPt[1]);
                const [x2, y2] = apply(matrix, pt[0], pt[1]);
                segments.push({ x1: x1 * PT_TO_MM, y1: y1 * PT_TO_MM, x2: x2 * PT_TO_MM, y2: y2 * PT_TO_MM, layer, colorIndex });
                prevPt = pt;
              }
              cur = p3;
            } else if (pOp === OPS.closePath) {
              const [x1, y1] = apply(matrix, cur[0], cur[1]);
              const [x2, y2] = apply(matrix, subStart[0], subStart[1]);
              segments.push({ x1: x1 * PT_TO_MM, y1: y1 * PT_TO_MM, x2: x2 * PT_TO_MM, y2: y2 * PT_TO_MM, layer, colorIndex });
              cur = subStart;
            } else if (pOp === OPS.rectangle) {
              const x = coords[ci], y = coords[ci + 1], w = coords[ci + 2], h = coords[ci + 3];
              ci += 4;
              const corners: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
              for (let k = 0; k < corners.length - 1; k++) {
                const [x1, y1] = apply(matrix, corners[k][0], corners[k][1]);
                const [x2, y2] = apply(matrix, corners[k + 1][0], corners[k + 1][1]);
                segments.push({ x1: x1 * PT_TO_MM, y1: y1 * PT_TO_MM, x2: x2 * PT_TO_MM, y2: y2 * PT_TO_MM, layer, colorIndex });
              }
              cur = [x, y];
              subStart = cur;
            }
          }
        }
      }

      if (segments.length === pageEntitiesBefore) {
        warnings.push(`Pagina ${pageNum}: nessuna geometria vettoriale trovata (probabilmente un'immagine scansionata).`);
      }
    } catch (e: any) {
      warnings.push(`Pagina ${pageNum}: errore durante l'estrazione (${e?.message || e}).`);
    }
  }

  if (segments.length === 0) {
    throw new Error('Nessuna geometria vettoriale trovata nel PDF. Funziona solo con PDF contenenti tracciati vettoriali (es. esportati da un CAD) — non con scansioni/immagini.');
  }

  const dxfText = buildDxf(segments);

  return {
    dxfText,
    stats: {
      fileName: file.name,
      pages: pdf.numPages,
      entities: segments.length,
      layers: layersUsed.size,
      warnings,
    },
  };
}
