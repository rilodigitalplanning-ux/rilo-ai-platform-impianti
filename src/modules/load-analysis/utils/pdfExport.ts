import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { LoadProject } from '../types';
import type { LightingCalculationResult } from './lightingCalculator';
import { USAGE_LABELS, BUILDING_TYPE_LABELS } from '../constants/coefficients';

type RGB = [number, number, number];

const RED: RGB       = [173, 25, 28];
const DARK: RGB      = [26, 26, 26];
const GRAY: RGB      = [100, 100, 100];
const LIGHTGRAY: RGB = [245, 245, 245];
const WHITE: RGB     = [255, 255, 255];

const OPT_COLOR: RGB  = [45, 106, 79];
const PROB_COLOR: RGB = [26, 58, 92];
const PESS_COLOR: RGB = [129, 41, 44];

function fmt(v: number, dec = 2): string {
  return v.toFixed(dec).replace('.', ',');
}

function drawHeader(doc: jsPDF, project: LoadProject) {
  const W = doc.internal.pageSize.getWidth();

  // Banda rossa in alto
  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 22, 'F');

  // Logo testuale RILO
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RILO', 14, 14);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('INGEGNERIA DEGLI IMPIANTI', 36, 10);
  doc.text('LOAD ANALYSIS — STIMA ILLUMINAZIONE', 36, 15);

  // Data e pagina
  const dateStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.setFontSize(7);
  doc.text(dateStr, W - 14, 10, { align: 'right' });
  doc.text('Documento preliminare', W - 14, 15, { align: 'right' });

  // Nome progetto
  doc.setFillColor(...DARK);
  doc.rect(0, 22, W, 18, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(project.name.toUpperCase(), 14, 33);

  if (project.client) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(200, 200, 200);
    doc.text(`Committente: ${project.client}`, 14, 38);
  }

  // Badge tipologia + qualità
  const info = `${BUILDING_TYPE_LABELS[project.buildingType] ?? project.buildingType}  ·  Qualità: ${project.qualityLevel.toUpperCase()}  ·  Zona climatica: ${project.climateZone}`;
  doc.setTextColor(180, 180, 180);
  doc.setFontSize(7);
  doc.text(info, W - 14, 38, { align: 'right' });
}

function drawScenariSummary(doc: jsPDF, lr: LightingCalculationResult, startY: number): number {
  const W = doc.internal.pageSize.getWidth();
  const boxW = (W - 28 - 8) / 3;
  const boxH = 28;
  let x = 14;
  const scenari = [
    { key: 'ottimistico' as const, label: 'A — Ottimistico', color: OPT_COLOR },
    { key: 'probabile'   as const, label: 'B — Probabile',   color: PROB_COLOR },
    { key: 'pessimistico'as const, label: 'C — Pessimistico',color: PESS_COLOR },
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('STIMA TOTALE ILLUMINAZIONE (incl. sicurezza +6%)', 14, startY - 3);

  for (const s of scenari) {
    doc.setFillColor(...s.color);
    doc.roundedRect(x, startY, boxW, boxH, 2, 2, 'F');

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(s.label.toUpperCase(), x + 4, startY + 6);

    doc.setFontSize(18);
    const kw = lr.total[s.key];
    doc.text(`${fmt(kw, 2)} kW`, x + 4, startY + 18);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(`LPD medio: ${fmt(lr.avgLpd[s.key], 1)} W/m²`, x + 4, startY + 24);

    x += boxW + 4;
  }

  return startY + boxH + 8;
}

function drawZoneTable(doc: jsPDF, lr: LightingCalculationResult, startY: number): number {
  const head = [[
    'Zona', 'Area\n(m²)', 'h\n(m)', 'Em\n(lux)', 'UF\nnominale', 'RCR', 'UF\neff.',
    'P ott.\n(W)', 'P prob.\n(W)', 'P pess.\n(W)',
  ]];

  const body = lr.zones.map(z => [
    `${z.zoneName || USAGE_LABELS[z.usage]}${z.rcrCorrected ? ' ⚠' : ''}`,
    z.area.toFixed(0),
    z.height.toFixed(1),
    z.Em.toString(),
    fmt(z.UF_nominal, 2),
    fmt(z.RCR, 1),
    fmt(z.UF_effective, 2),
    Math.round(z.power.ottimistico).toString(),
    Math.round(z.power.probabile).toString(),
    Math.round(z.power.pessimistico).toString(),
  ]);

  // Riga totale
  const totW = (s: keyof typeof lr.subtotal) =>
    Math.round(lr.subtotal[s] * 1000).toString();

  body.push([
    'SUBTOTALE (ante sicurezza)', `${lr.totalArea.toFixed(0)}`, '', '', '', '', '',
    totW('ottimistico'), totW('probabile'), totW('pessimistico'),
  ]);

  autoTable(doc, {
    startY,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [...DARK], textColor: [...WHITE], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 44 },
      7: { textColor: [...OPT_COLOR],  fontStyle: 'bold' },
      8: { textColor: [...PROB_COLOR], fontStyle: 'bold' },
      9: { textColor: [...PESS_COLOR], fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [...LIGHTGRAY] as [number, number, number];
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 6;
}

function drawMethodology(doc: jsPDF, lr: LightingCalculationResult, startY: number): number {
  const W = doc.internal.pageSize.getWidth();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('NOTA METODOLOGICA', 14, startY);

  doc.setFillColor(...LIGHTGRAY);
  doc.rect(14, startY + 3, W - 28, 68, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...DARK);

  const quality = lr.quality;
  const lines = [
    '  METODO DI CALCOLO — METODO DEL FLUSSO LUMINOSO (EN 12464-1)',
    '',
    '  Formula:  Φ_zona = (Em × A) / (UF × MF)  [lm]     P_zona = Φ_zona / η  [W]     LPD = P_zona / A  [W/m²]',
    '',
    `  Qualità impianto: ${quality.toUpperCase()} — Contemporaneità illuminazione: 1,00 (fisso — CEI 64-8)`,
    '',
    `  Scenario A (Ottimistico):   η=${quality === 'standard' ? 125 : quality === 'premium' ? 160 : 95} lm/W  MF=${quality === 'standard' ? '0,80' : quality === 'premium' ? '0,85' : '0,75'}  UF+0,08  Daylight -${quality === 'standard' ? '18' : quality === 'premium' ? '35' : '0'}%`,
    `  Scenario B (Probabile):     η=${quality === 'standard' ? 110 : quality === 'premium' ? 140 : 80} lm/W  MF=${quality === 'standard' ? '0,75' : quality === 'premium' ? '0,80' : '0,70'}  UF nominale  Daylight -${quality === 'standard' ? '12' : quality === 'premium' ? '25' : '0'}%`,
    `  Scenario C (Pessimistico):  η=${quality === 'standard' ? 90  : quality === 'premium' ? 115 : 65} lm/W  MF=${quality === 'standard' ? '0,70' : quality === 'premium' ? '0,72' : '0,65'}  UF-0,08  Daylight 0%`,
    '',
    '  Correzione altezza (RCR):  Ambienti con RCR > 3 ricevono un fattore correttivo sul UF (segnalati con ⚠).',
    '  RCR = 10 × (h−0,5) / √A — per h ≤ 3m: nessuna correzione.',
    '',
    '  Illuminazione di sicurezza: +6% sul totale (CEI EN 1838 / D.Lgs 81/08).',
    '',
    '  AVVERTENZA: Stima parametrica preliminare. Non sostituisce il calcolo illuminotecnico definitivo.',
    '  Norme di riferimento: EN 12464-1:2021 · CEI EN 1838 · UNI EN 15193 · D.Lgs 81/08.',
  ];

  let y = startY + 9;
  for (const line of lines) {
    doc.text(line, 14, y);
    y += 4;
  }

  return y + 6;
}

function drawFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...RED);
    doc.rect(0, H - 8, W, 8, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('RILO — INGEGNERIA DEGLI IMPIANTI', 14, H - 3);
    doc.text(`Pagina ${i} di ${pageCount}`, W - 14, H - 3, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text('Documento generato automaticamente — uso esclusivamente interno / preliminary design', W / 2, H - 3, { align: 'center' });
  }
}

export function exportLightingPdf(project: LoadProject, lr: LightingCalculationResult): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  drawHeader(doc, project);

  let y = 48;

  y = drawScenariSummary(doc, lr, y);
  y = drawZoneTable(doc, lr, y);

  // Nuova pagina se poco spazio rimasto
  if (y > 200) {
    doc.addPage();
    y = 14;
  }

  drawMethodology(doc, lr, y);
  drawFooter(doc);

  const filename = `RILO_LoadAnalysis_Illuminazione_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  doc.save(filename);
}
