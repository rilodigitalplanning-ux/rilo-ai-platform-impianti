import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ProjectCable, Structure, Cable, Translation } from '../types';

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
  packedStructures?: { cables: (Cable & { px: number, py: number, color?: string, originalIndex?: number })[], currentArea: number, fillPercentage?: number, limit?: number }[];
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
    
    const maxW = 140;
    const maxH = 60;
    
    const isConduit = data.structure.type === 'conduit';
    const structW = data.structure.width;
    const structH = isConduit ? data.structure.width : data.structure.height;
    
    let currentY = schematicY + 10;
    
    // Use a fixed scale instead of fitting all into one line.
    // E.g. structure fits into maxW / maxH for a SINGLE structure.
    const structRatio = structW / structH;
    let singleBoxW = maxW;
    let singleBoxH = maxW / structRatio;
    
    if (singleBoxH > maxH) {
      singleBoxH = maxH;
      singleBoxW = maxH * structRatio;
    }
    
    const scale = singleBoxW / structW;
    const schematicX = (pageWidth - singleBoxW) / 2;

    const structuresToDraw = data.packedStructures && data.packedStructures.length > 0 
      ? data.packedStructures 
      : [{ cables: [], currentArea: 0 }];

    structuresToDraw.forEach((structData, sIdx) => {
      // Check for page wrap
      if (currentY + singleBoxH > pageHeight - margin - 20) {
        pdf.addPage();
        currentY = margin + 10;
      }

      const currentBoxX = schematicX;
      const schematicBoxY = currentY;

      // Structure Name
      pdf.setFontSize(8);
      pdf.setTextColor(100, 100, 100);
      pdf.setFont('helvetica', 'bold');
      const structName = data.structure.name || data.t.preview.structure;
      pdf.text(`${structName} ${sIdx + 1}`, currentBoxX + (singleBoxW / 2), schematicBoxY - 5, { align: 'center' });

      // Draw Structure
      pdf.setDrawColor(150, 150, 150);
      pdf.setLineWidth(0.5);
      if (isConduit) {
        pdf.circle(currentBoxX + singleBoxW/2, schematicBoxY + singleBoxH/2, singleBoxW/2, 'S');
      } else {
        pdf.rect(currentBoxX, schematicBoxY, singleBoxW, singleBoxH);
      }

      // Draw Separator if needed
      if (data.structure.type === 'tray' && data.structure.hasSeparator) {
        pdf.setDrawColor(150, 150, 150);
        pdf.line(currentBoxX + singleBoxW/2, schematicBoxY, currentBoxX + singleBoxW/2, schematicBoxY + singleBoxH);
      }
      
      // Draw Fill Limit Line for Trays
      if (!isConduit && data.structure.fillLimit) {
        const limitY = schematicBoxY + singleBoxH - (data.structure.fillLimit / 100 * singleBoxH);
        pdf.setDrawColor(255, 100, 100);
        pdf.setLineWidth(0.3);
        pdf.setLineDashPattern([2, 2], 0);
        pdf.line(currentBoxX, limitY, currentBoxX + singleBoxW, limitY);
        
        pdf.setFontSize(5);
        pdf.setTextColor(255, 100, 100);
        pdf.text(`${data.t.preview.limit}: ${data.structure.fillLimit}%`, currentBoxX + singleBoxW - 1, limitY - 1, { align: 'right' });
        
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

          // Parse hex color
          let rColor = 227, gColor = 52, bColor = 47;
          const cableColor = cable.color || (cable.type === 'power' ? '#81292C' : '#00B4D8');
          if (cableColor.startsWith('#')) {
            const hex = cableColor.replace('#', '');
            if (hex.length === 6) {
              rColor = parseInt(hex.substring(0, 2), 16);
              gColor = parseInt(hex.substring(2, 4), 16);
              bColor = parseInt(hex.substring(4, 6), 16);
            }
          }

          pdf.setDrawColor(rColor, gColor, bColor);
          pdf.setFillColor(rColor, gColor, bColor);
          pdf.circle(cx, cy, r, 'FD');

          pdf.setTextColor(255, 255, 255);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(Math.max(4, r * 1.5));
          // We don't have the original index easily, so we just use index+1 for this structure
          // To get the global index, we could search in data.cables, but it's complex.
          // Let's just use the cable's diameter as a label if it's too hard, or find its index.
          const label = cable.originalIndex !== undefined ? (cable.originalIndex + 1).toString() : (index + 1).toString();
          pdf.text(label, cx, cy + (r * 0.35), { align: 'center' });
        });
      } else {
        // Fallback to old logic if packedStructures is missing
        const positions: { x: number, y: number, r: number, color: string }[] = [];
        let currentX = 0;
        let currentY = 0;
        let rowMaxHeight = 0;

        const cablesToDraw = data.cables.flatMap(pc => {
          const cable = pc.cable;
          if (!cable) return [];
          return Array(pc.quantity).fill({ ...cable, color: pc.color || '#e3342f' });
        });

        cablesToDraw.forEach(cable => {
          if (currentX + cable.diameter > structW) {
            currentX = 0;
            currentY += rowMaxHeight;
            rowMaxHeight = 0;
          }

          positions.push({
            x: currentX + cable.diameter / 2,
            y: currentY + cable.diameter / 2,
            r: cable.diameter / 2,
            color: cable.color
          });

          currentX += cable.diameter;
          rowMaxHeight = Math.max(rowMaxHeight, cable.diameter);
        });

        if (currentY === 0 && positions.length > 0) {
          const totalWidth = positions[positions.length - 1].x + positions[positions.length - 1].r;
          const offsetX = (structW - totalWidth) / 2;
          positions.forEach(p => p.x += offsetX);
        }

        positions.forEach((pos, index) => {
          const cx = currentBoxX + (pos.x * scale);
          const cy = schematicBoxY + singleBoxH - (pos.y * scale);
          const r = pos.r * scale;

          let rColor = 227, gColor = 52, bColor = 47;
          if (pos.color.startsWith('#')) {
            const hex = pos.color.replace('#', '');
            if (hex.length === 6) {
              rColor = parseInt(hex.substring(0, 2), 16);
              gColor = parseInt(hex.substring(2, 4), 16);
              bColor = parseInt(hex.substring(4, 6), 16);
            }
          }

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
      
      // Update Y for next structure in the column
      currentY += singleBoxH + 20;
    });

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
        pc.tag || '-',
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

    pdf.save(`${filename}.pdf`);
  } catch (error) {
    console.error('Error generating PDF:', error);
    throw new Error('Erro ao gerar PDF vetorial. Por favor, tente novamente.');
  }
};

export const exportToCSV = (cables: ProjectCable[], filename: string) => {
  try {
    const headers = ['#', 'SPECIFICATION', 'DIMENSION', 'TAG', 'QTY'];
    const rows = cables.map((pc, index) => [
      (index + 1).toString(),
      pc.cable?.name || 'Unknown',
      pc.cable?.size || `${pc.cable?.diameter}mm`,
      pc.tag || '-',
      pc.quantity.toString()
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    console.error('Error exporting CSV:', error);
  }
};


