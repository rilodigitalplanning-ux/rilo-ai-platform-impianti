import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProjectCable, Structure, Cable, Translation } from '../types';
import { saveFileWithPicker } from '@/utils/fileSave';

// Palette fissa per tipo di cavo — usata SEMPRE nell'export PDF, indipendentemente
// dal colore personalizzato assegnato all'istanza (pc.color). Garantisce che lo
// stesso tipo di cavo abbia sempre lo stesso colore su ogni sezione/pagina, così
// più fogli dello stesso progetto non arrivano con layer/colori diversi in CAD.
const CABLE_TYPE_COLOR_RGB: Record<Cable['type'], [number, number, number]> = {
  power: [230, 57, 70],   // #E63946
  data:  [0, 180, 216],   // #00B4D8
  evac:  [255, 190, 11],  // #FFBE0B
  irai:  [131, 56, 236],  // #8338EC
};

function getCableTypeColor(type: Cable['type'] | undefined): [number, number, number] {
  return CABLE_TYPE_COLOR_RGB[type as Cable['type']] || CABLE_TYPE_COLOR_RGB.power;
}

export interface ReportData {
  reportId: string;
  today: string;
  structure: Structure;
  cables: ProjectCable[];
  allCables: Cable[];
  results: {
    totalArea: number;
    usedArea: number;
    utilization: number;
    isPass: boolean;
  };
  packedStructures?: { cables: (Cable & { px: number, py: number, color?: string, originalIndex?: number })[], currentArea: number, fillPercentage?: number, limit?: number, isSpare?: boolean, customStructure?: Structure }[];
  t: Translation;
  engineerName?: string;
}

export const exportToPDF = async (data: ReportData, filename: string) => {
  try {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const accentColor = [129, 41, 44]; // #81292C

    // 1. Header
    pdf.setTextColor(accentColor[0], accentColor[1], accentColor[2]);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(22);
    pdf.text(data.t.report.title, pageWidth / 2, 25, { align: 'center' });
    
    pdf.setDrawColor(accentColor[0], accentColor[1], accentColor[2]);
    pdf.setLineWidth(0.8);
    pdf.line(margin, 30, pageWidth - margin, 30);

    // 3. Cross Section Preview (Vector Drawing)
    const schematicY = 40; // Adjusted from 60 since Info Grid is hidden

    // Scala FISSA (mm -> pt), calcolata una sola volta sulla struttura principale
    // del progetto e riusata per TUTTE le strutture disegnate (incluse eventuali
    // riserve manuali con misura propria) — dimezzata rispetto a prima, così più
    // cavidotti entrano nello stesso foglio (meno pagine PDF => meno file generati
    // in fase di export CAD). Essendo la stessa scala per tutte, le dimensioni
    // relative tra strutture di misure diverse restano proporzionali.
    const maxW = 70;
    const maxH = 30;

    const refIsConduit = data.structure.type === 'conduit';
    const refStructW = data.structure.width;
    const refStructH = refIsConduit ? data.structure.width : data.structure.height;

    const refRatio = refStructW / refStructH;
    let refBoxW = maxW;
    let refBoxH = maxW / refRatio;
    if (refBoxH > maxH) {
      refBoxH = maxH;
      refBoxW = maxH * refRatio;
    }
    const scale = refBoxW / refStructW;

    // Layout a griglia: max 4 cavidotti per riga, poi va a capo.
    const COLS = 4;
    const colWidth = (pageWidth - margin * 2) / COLS;

    const structuresToDraw = data.packedStructures && data.packedStructures.length > 0
      ? data.packedStructures
      : [{ cables: [], currentArea: 0 } as NonNullable<ReportData['packedStructures']>[number]];

    // Dimensioni della "scatola" di ciascuna struttura, usando la stessa scala fissa.
    const boxes = structuresToDraw.map(sd => {
      const def = sd.customStructure || data.structure;
      const isC = def.type === 'conduit';
      const w = def.width;
      const h = isC ? def.width : def.height;
      return { def, isConduit: isC, structW: w, structH: h, boxW: w * scale, boxH: h * scale };
    });

    // Altezza di ogni riga della griglia = altezza massima delle strutture in quella riga.
    const rowHeights: number[] = [];
    for (let i = 0; i < boxes.length; i += COLS) {
      const rowBoxes = boxes.slice(i, i + COLS);
      rowHeights.push(Math.max(...rowBoxes.map(b => b.boxH)) + 30);
    }

    let yOnPage = schematicY;
    let currentY = yOnPage;

    for (let rowIdx = 0; rowIdx * COLS < structuresToDraw.length; rowIdx++) {
      const rowHeight = rowHeights[rowIdx];

      if (rowIdx !== 0 && yOnPage + rowHeight > pageHeight - margin - 20) {
        pdf.addPage();
        yOnPage = margin + 10;
      }

      for (let col = 0; col < COLS; col++) {
        const sIdx = rowIdx * COLS + col;
        if (sIdx >= structuresToDraw.length) break;

        const structData = structuresToDraw[sIdx];
        const box = boxes[sIdx];
        const { isConduit, structW, structH } = box;
        const singleBoxW = box.boxW;
        const singleBoxH = box.boxH;

        const currentBoxX = margin + col * colWidth + (colWidth - singleBoxW) / 2;
        const schematicBoxY = yOnPage + 10;

        // Structure Name
        pdf.setFontSize(8);
        pdf.setTextColor(100, 100, 100);
        pdf.setFont('helvetica', 'bold');
        const structName = box.def.name || data.t.preview.structure;
        pdf.text(`${structName} ${sIdx + 1}`, currentBoxX + (singleBoxW / 2), schematicBoxY - 5, { align: 'center' });

        // Draw Structure
        pdf.setDrawColor(150, 150, 150);
        pdf.setLineWidth(0.5);
        if (isConduit) {
          pdf.circle(currentBoxX + singleBoxW / 2, schematicBoxY + singleBoxH / 2, singleBoxW / 2, 'S');
        } else {
          pdf.rect(currentBoxX, schematicBoxY, singleBoxW, singleBoxH);
        }

        // Draw Separator if needed
        if (box.def.type === 'tray' && box.def.hasSeparator) {
          pdf.setDrawColor(150, 150, 150);
          pdf.line(currentBoxX + singleBoxW / 2, schematicBoxY, currentBoxX + singleBoxW / 2, schematicBoxY + singleBoxH);
        }

        // Draw Fill Limit Line for Trays
        if (!isConduit && box.def.fillLimit) {
          const limitY = schematicBoxY + singleBoxH - (box.def.fillLimit / 100 * singleBoxH);
          pdf.setDrawColor(255, 100, 100);
          pdf.setLineWidth(0.3);
          pdf.setLineDashPattern([2, 2], 0);
          pdf.line(currentBoxX, limitY, currentBoxX + singleBoxW, limitY);

          pdf.setFontSize(5);
          pdf.setTextColor(255, 100, 100);
          pdf.text(`${data.t.preview.limit}: ${box.def.fillLimit}%`, currentBoxX + singleBoxW - 1, limitY - 1, { align: 'right' });

          pdf.setLineDashPattern([], 0);
        }

        pdf.setLineDashPattern([], 0);

        // Draw Cables
        if (data.packedStructures) {
          // Use pre-calculated positions
          structData.cables.forEach((cable, index) => {
            let cx = 0;
            let cy = 0;
            const r = (cable.diameter / 2) * scale;

            if (isConduit) {
              cx = currentBoxX + (cable.px + structW / 2) * scale;
              cy = schematicBoxY + (cable.py + structH / 2) * scale;
            } else {
              cx = currentBoxX + (cable.px + cable.diameter / 2) * scale;
              cy = schematicBoxY + (structH - cable.py - cable.diameter / 2) * scale;
            }

            const [rColor, gColor, bColor] = getCableTypeColor(cable.type);

            pdf.setDrawColor(rColor, gColor, bColor);
            pdf.setFillColor(rColor, gColor, bColor);
            pdf.circle(cx, cy, r, 'FD');

            pdf.setTextColor(255, 255, 255);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(Math.max(4, r * 1.5));
            const label = cable.originalIndex !== undefined ? (cable.originalIndex + 1).toString() : (index + 1).toString();
            pdf.text(label, cx, cy + (r * 0.35), { align: 'center' });
          });
        } else {
          // Fallback to old logic if packedStructures is missing
          const positions: { x: number, y: number, r: number, type: Cable['type'] }[] = [];
          let posX = 0;
          let posY = 0;
          let rowMaxHeight = 0;

          const cablesToDraw = data.cables.flatMap(pc => {
            const cable = pc.cable;
            if (!cable) return [];
            return Array(pc.quantity).fill(cable);
          });

          cablesToDraw.forEach(cable => {
            if (posX + cable.diameter > structW) {
              posX = 0;
              posY += rowMaxHeight;
              rowMaxHeight = 0;
            }

            positions.push({
              x: posX + cable.diameter / 2,
              y: posY + cable.diameter / 2,
              r: cable.diameter / 2,
              type: cable.type
            });

            posX += cable.diameter;
            rowMaxHeight = Math.max(rowMaxHeight, cable.diameter);
          });

          if (posY === 0 && positions.length > 0) {
            const totalWidth = positions[positions.length - 1].x + positions[positions.length - 1].r;
            const offsetX = (structW - totalWidth) / 2;
            positions.forEach(p => p.x += offsetX);
          }

          positions.forEach((pos, index) => {
            const cx = currentBoxX + (pos.x * scale);
            const cy = schematicBoxY + singleBoxH - (pos.y * scale);
            const r = pos.r * scale;

            const [rColor, gColor, bColor] = getCableTypeColor(pos.type);

            pdf.setDrawColor(rColor, gColor, bColor);
            pdf.setFillColor(rColor, gColor, bColor);
            pdf.circle(cx, cy, r, 'FD');

            pdf.setTextColor(255, 255, 255);
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(Math.max(4, r * 1.5));
            pdf.text((index + 1).toString(), cx, cy + (r * 0.35), { align: 'center' });
          });
        }

        // Dimensions
        pdf.setFontSize(10);
        pdf.setTextColor(150, 150, 150);
        pdf.setFont('helvetica', 'normal');
        if (!isConduit) {
          pdf.text(`${structH}mm`, currentBoxX - 5, schematicBoxY + (singleBoxH / 2), { angle: 90, align: 'center' });
        }
        pdf.text(`${structW}mm`, currentBoxX + (singleBoxW / 2), schematicBoxY + singleBoxH + 5, { align: 'center' });
      }

      yOnPage += rowHeight;
      currentY = yOnPage;
    }

    // 4. Cable Manifesto (Using AutoTable for vector table)
    // Avoid drawing table over the page margin
    if (currentY > pageHeight - margin - 40) {
      pdf.addPage();
      currentY = margin + 10;
    }
    const tableY = currentY + 10;
    pdf.setTextColor(0, 0, 0);
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'bold');
    pdf.text(data.t.report.cableManifest, margin, tableY);

    const tableRows = data.cables.map((pc, index) => {
      const cable = pc.cable;
      return [
        (index + 1).toString(),
        cable?.name || 'Unknown',
        cable?.size || `${cable?.diameter}mm`,
        (pc.tag || '-').toUpperCase(),
        pc.quantity.toString()
      ];
    });

    autoTable(pdf, {
      startY: tableY + 5,
      head: [['#', data.t.report.specification, data.t.report.dimension, data.t.report.tag, data.t.report.qty]],
      body: tableRows,
      theme: 'striped',
      headStyles: { 
        fillColor: accentColor as [number, number, number], 
        textColor: 255,
        fontSize: 8,
        fontStyle: 'bold'
      },
      bodyStyles: {
        fontSize: 8
      },
      margin: { left: margin, right: margin }
    });

    const blob = pdf.output('blob');
    await saveFileWithPicker(blob, {
      suggestedName: `${filename}.pdf`,
      mimeType: 'application/pdf',
      extensions: ['.pdf'],
      description: 'Documento PDF',
    });
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Erro ao gerar PDF vetorial. Por favor, tente novamente.');
  }
};

export const exportToCSV = async (cables: ProjectCable[], filename: string) => {
  try {
    const headers = ['#', 'SPECIFICATION', 'DIMENSION', 'TAG', 'QTY'];
    const rows = cables.map((pc, index) => [
      (index + 1).toString(),
      pc.cable?.name || 'Unknown',
      pc.cable?.size || `${pc.cable?.diameter}mm`,
      (pc.tag || '-').toUpperCase(),
      pc.quantity.toString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    await saveFileWithPicker(blob, {
      suggestedName: `${filename}.csv`,
      mimeType: 'text/csv',
      extensions: ['.csv'],
      description: 'File CSV',
    });
  } catch (error) {
    console.error('Error exporting CSV:', error);
  }
};


