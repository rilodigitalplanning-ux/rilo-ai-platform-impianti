import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { FvProject, InverterSpec, PanelSpec, StringConfig } from '../context/ProjectContext';
import { checkAndSizeString, calculateFdi, type FdiResult } from './pvStringCalc';
import { CABLE_TYPES, ampacityForSection } from './dcCableCalc';
import { saveFileWithPicker } from '@/utils/fileSave';

type RGB = [number, number, number];

const GOLD: RGB      = [242, 183, 5];
const DARK: RGB      = [42, 34, 8];
const GRAY: RGB      = [100, 100, 100];
const LIGHTGRAY: RGB = [245, 245, 245];
const WHITE: RGB     = [255, 255, 255];
const OK: RGB        = [45, 106, 79];
const BAD: RGB       = [153, 27, 27];

function fmt(v: number, dec = 2): string {
  return v.toFixed(dec).replace('.', ',');
}

function drawHeader(doc: jsPDF, project: FvProject) {
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(...GOLD);
  doc.rect(0, 0, W, 22, 'F');

  doc.setTextColor(...DARK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('RILO', 14, 14);

  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('INGEGNERIA DEGLI IMPIANTI', 36, 10);
  doc.text('IMPIANTO FV — VERIFICA STRINGHE E DIMENSIONAMENTO CAVI DC', 36, 15);

  const dateStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.setFontSize(7);
  doc.text(dateStr, W - 14, 10, { align: 'right' });
  doc.text('Documento preliminare', W - 14, 15, { align: 'right' });

  doc.setFillColor(...DARK);
  doc.rect(0, 22, W, 14, 'F');
  doc.setTextColor(...WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(project.name.toUpperCase(), 14, 32);
}

interface StringRow {
  cfg: StringConfig;
  inv: InverterSpec | undefined;
  pnl: PanelSpec | undefined;
  check: ReturnType<typeof checkAndSizeString> | null;
}

function buildRows(project: FvProject, catalogInverters: InverterSpec[], catalogPanels: PanelSpec[]): StringRow[] {
  return project.stringConfigs.map(cfg => {
    const inv = catalogInverters.find(i => i.id === cfg.inverterId);
    const pnl = catalogPanels.find(p => p.id === cfg.panelId);
    const ct = CABLE_TYPES.find(c => c.id === cfg.cableTypeId) ?? CABLE_TYPES[0];
    const check = (inv && pnl) ? checkAndSizeString(inv, pnl, cfg, ct) : null;
    return { cfg, inv, pnl, check };
  });
}

function buildFdiByInverter(project: FvProject, catalogInverters: InverterSpec[], catalogPanels: PanelSpec[]): Record<string, FdiResult | null> {
  const panelsById: Record<string, PanelSpec> = Object.fromEntries(catalogPanels.map(p => [p.id, p]));
  const result: Record<string, FdiResult | null> = {};
  for (const inv of catalogInverters) {
    const stringsOnThisInverter = project.stringConfigs.filter(s => s.inverterId === inv.id);
    result[inv.id] = calculateFdi(inv, stringsOnThisInverter, panelsById);
  }
  return result;
}

function drawSummary(doc: jsPDF, rows: StringRow[], startY: number): number {
  const W = doc.internal.pageSize.getWidth();
  const totalPowerKw = rows.reduce((sum, r) => sum + (r.check?.totalPowerW ?? 0), 0) / 1000;
  const okCount = rows.filter(r => r.check?.allOk).length;
  const boxW = (W - 28 - 8) / 3;
  const boxH = 24;
  let x = 14;

  const boxes = [
    { label: 'STRINGHE CONFIGURATE', value: `${rows.length}`, color: DARK },
    { label: 'STRINGHE COMPATIBILI', value: `${okCount} / ${rows.length}`, color: okCount === rows.length ? OK : BAD },
    { label: 'POTENZA TOTALE STIMATA', value: `${fmt(totalPowerKw, 2)} kW`, color: DARK },
  ];

  for (const b of boxes) {
    doc.setFillColor(...b.color);
    doc.roundedRect(x, startY, boxW, boxH, 2, 2, 'F');
    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(b.label, x + 4, startY + 6);
    doc.setFontSize(15);
    doc.text(b.value, x + 4, startY + 17);
    x += boxW + 4;
  }

  return startY + boxH + 8;
}

function drawStringsTable(doc: jsPDF, rows: StringRow[], startY: number): number {
  const head = [[
    'Stringa', 'Inverter', 'MPPT', 'Pannello', 'Config.\n(serie×par.)', 'Potenza\n(kW)',
    'Voc frd.\n(V)', 'Vmp cld.\n(V)', 'Isc str.\n(A)', 'Esito', 'Cavo\n(mm²)',
  ]];

  const body = rows.map(({ cfg, inv, pnl, check }) => [
    cfg.name,
    inv?.name ?? '?',
    String(cfg.mpptIndex ?? 1),
    pnl?.name ?? '?',
    `${cfg.panelsInSeries} × ${cfg.stringsInParallel}`,
    check ? fmt(check.totalPowerW / 1000, 2) : '—',
    check ? fmt(check.vocColdV, 1) : '—',
    check ? fmt(check.vmpHotV, 1) : '—',
    check ? fmt(check.iscStringA, 1) : '—',
    check ? (check.allOk ? 'OK' : 'NON OK') : '—',
    cfg.selectedSectionMm2 ?? '—',
  ]);

  autoTable(doc, {
    startY,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [...DARK], textColor: [...WHITE], fontStyle: 'bold', fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 24 },
      9: { fontStyle: 'bold' },
    },
    didParseCell: (data) => {
      if (data.column.index === 9 && data.section === 'body') {
        const ok = rows[data.row.index]?.check?.allOk;
        if (ok === true) data.cell.styles.textColor = [...OK];
        if (ok === false) data.cell.styles.textColor = [...BAD];
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 8;
}

function drawStringDetail(doc: jsPDF, row: StringRow, startY: number, fdi: FdiResult | null): number {
  const W = doc.internal.pageSize.getWidth();
  const { cfg, inv, pnl, check } = row;
  const blockH = 58;

  if (startY + blockH > doc.internal.pageSize.getHeight() - 14) {
    doc.addPage();
    startY = 14;
  }

  doc.setFillColor(...LIGHTGRAY);
  doc.rect(14, startY, W - 28, blockH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...DARK);
  doc.text(cfg.name, 18, startY + 7);

  if (check && inv && pnl) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);

    const col1 = [
      `Inverter: ${inv.name} (${inv.ratedPowerKw} kW, MPPT ${inv.mpptVoltageMinV}-${inv.mpptVoltageMaxV} V, ${inv.mpptMaxCurrentA} A max)`,
      `Pannello: ${pnl.name} (${pnl.pMaxW} Wp, Vmp ${pnl.vmp} V, Voc ${pnl.voc} V, Isc ${pnl.isc} A, β ${pnl.tempCoeffVocPctPerC} %/°C)`,
      `Configurazione: ${cfg.panelsInSeries} pannelli in serie × ${cfg.stringsInParallel} stringhe in parallelo — MPPT ${cfg.mpptIndex ?? 1} — T min ${cfg.tMinC}°C / T max cella ${cfg.tMaxC}°C`,
    ];
    let y = startY + 14;
    for (const l of col1) { doc.text(l, 18, y); y += 4.5; }

    y += 1;
    const vocLabel = check.vocOk ? 'OK' : 'FUORI RANGE';
    const vmpLabel = check.vmpOk ? 'OK' : 'FUORI RANGE';
    const iLabel = check.currentOk ? 'OK' : 'FUORI RANGE';
    doc.setFont('helvetica', 'bold');
    doc.text(
      `Voc a freddo: ${fmt(check.vocColdV, 1)} V (limite ${inv.mpptVoltageMaxV} V) — ${vocLabel}    ` +
      `Vmp a caldo: ${fmt(check.vmpHotV, 1)} V (range ${inv.mpptVoltageMinV}-${inv.mpptVoltageMaxV} V) — ${vmpLabel}`,
      18, y
    );
    y += 4.5;
    const chosenIz = cfg.selectedSectionMm2 ? ampacityForSection(CABLE_TYPES.find(c => c.id === cfg.cableTypeId) ?? CABLE_TYPES[0], cfg.selectedSectionMm2) : null;
    doc.text(
      `Isc stringa: ${fmt(check.iscStringA, 2)} A (limite ${inv.mpptMaxCurrentA} A) — ${iLabel}    ` +
      `Cavo: ${cfg.selectedSectionMm2 ?? '—'} mm² (Iz ${chosenIz ?? '—'} A, Ib ${fmt(check.stringBox.ibA, 1)} A, ΔV ≈ ${fmt(check.deltaVoltsV, 2)} V, L=${cfg.cableLengthM} m)`,
      18, y
    );
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    const sb = check.stringBox;
    const fuseTxt = sb.fuse.required ? `${sb.fuse.ratingA ?? '—'} A` : 'non richiesto';
    doc.text(
      `Quadro di campo: Fusibile ${fuseTxt} · Interruttore CC ${sb.breaker.ratingA ?? '—'} A · Sezionatore ${sb.switchDisconnector.category} ${sb.switchDisconnector.ratedCurrentA ?? '—'}A · SPD Cl.${sb.spd.spdClass}/${sb.spd.inKA}kA` +
      (fdi ? `    FDI inverter: ${fmt(fdi.fdi, 2)} (${fdi.ok ? 'OK' : 'ATTENZIONE — fuori 0,75-1,20'})` : ''),
      18, y
    );
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(...(check.allOk ? OK : BAD));
    doc.roundedRect(18, y - 3.5, 60, 6, 1, 1, 'F');
    doc.setTextColor(...WHITE);
    doc.text(check.allOk ? 'STRINGA COMPATIBILE' : 'STRINGA NON COMPATIBILE', 20, y + 0.5);
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BAD);
    doc.text('Inverter o pannello associato non trovato nel catalogo.', 18, startY + 16);
  }

  return startY + blockH + 6;
}

function drawMethodology(doc: jsPDF, startY: number): number {
  const W = doc.internal.pageSize.getWidth();

  if (startY > doc.internal.pageSize.getHeight() - 78) {
    doc.addPage();
    startY = 14;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('NOTA METODOLOGICA', 14, startY);

  doc.setFillColor(...LIGHTGRAY);
  doc.rect(14, startY + 3, W - 28, 64, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...DARK);

  const lines = [
    '  COMPATIBILITÀ STRINGA-INVERTER',
    '  Voc a freddo (coeff. β, T min di progetto) ≤ V max MPPT inverter.',
    '  Vmp a caldo (coeff. γ, T max cella) compreso nel range di tensione operativa MPPT (V min - V max).',
    '  Isc di stringa ≤ corrente massima di ingresso MPPT dichiarata dall\'inverter (limite hardware, nessun margine aggiuntivo).',
    '  FDI (Fattore di Dimensionamento Inverter) = P_AC nominale / ΣP_DC,STC delle stringhe collegate allo stesso inverter — range salutare 0,75-1,20.',
    '',
    '  QUADRO DI CAMPO (STRING BOX) — IEC 60364-7-712 / CEI 82-25 (NBR 16690 equivalente)',
    '  Fusibile di stringa obbligatorio se (Sa-1) × Isc,mod > corrente inversa max ammessa dal pannello; range 1,5-2,4 × Isc,mod.',
    '  Interruttore CC: range 1,25-2,4 × Isc del sottoarray, tensione nominale ≥ Voc max di stringa.',
    '  Sezionatore CC: categoria DC-21B, Ue ≥ Voc max, Ie ≥ Ib. SPD: Classe II, Uc ≥ Voc max.',
    '',
    '  DIMENSIONAMENTO CAVO DC DI STRINGA (CEI 64-8 / IEC 60364)',
    '  Sezione da caduta di tensione (su Impp, corrente di esercizio):  S = (2 × L × Impp × ρ) / ΔV   [ρ = 0,023 Ω·mm²/m]',
    '  Sezione da portata:  Iz (portata cavo) ≥ Ib (corrente di progetto = rating della protezione, o 1,25 × Isc se assente).',
    '  Sezione finale = sezione commerciale che soddisfa entrambi i criteri (il più vincolante dei due).',
    '',
    '  AVVERTENZA: Verifica preliminare basata sui dati inseriti manualmente. Non sostituisce la verifica',
    '  definitiva su schede tecniche ufficiali del costruttore e il progetto esecutivo dell\'impianto.',
  ];

  let y = startY + 9;
  for (const line of lines) { doc.text(line, 14, y); y += 4; }

  return y + 6;
}

function drawFooter(doc: jsPDF) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pageCount = doc.getNumberOfPages();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFillColor(...GOLD);
    doc.rect(0, H - 8, W, 8, 'F');
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.text('RILO — INGEGNERIA DEGLI IMPIANTI', 14, H - 3);
    doc.text(`Pagina ${i} di ${pageCount}`, W - 14, H - 3, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.text('Documento generato automaticamente — uso esclusivamente interno / preliminary design', W / 2, H - 3, { align: 'center' });
  }
}

export async function exportStringReportPdf(
  project: FvProject,
  catalogInverters: InverterSpec[],
  catalogPanels: PanelSpec[]
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const rows = buildRows(project, catalogInverters, catalogPanels);

  drawHeader(doc, project);

  let y = 40;
  y = drawSummary(doc, rows, y);

  if (rows.length > 0) {
    const fdiByInverter = buildFdiByInverter(project, catalogInverters, catalogPanels);
    y = drawStringsTable(doc, rows, y);
    for (const row of rows) {
      y = drawStringDetail(doc, row, y, row.inv ? fdiByInverter[row.inv.id] ?? null : null);
    }
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text('Nessuna stringa configurata in questo progetto.', 14, y + 6);
    y += 14;
  }

  drawMethodology(doc, y);
  drawFooter(doc);

  const filename = `RILO_ImpiantoFV_Stringhe_${project.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  const blob = doc.output('blob');
  await saveFileWithPicker(blob, {
    suggestedName: filename,
    mimeType: 'application/pdf',
    extensions: ['.pdf'],
    description: 'Documento PDF',
  });
}
