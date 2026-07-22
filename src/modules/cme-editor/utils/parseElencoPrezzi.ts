/**
 * parseElencoPrezzi.ts
 *
 * Legge un "Elenco Prezzi" esportato da Primus (.xls/.xlsx) e lo ripulisce:
 * - ogni voce nel file Primus occupa due righe: una riga "codice" (Tariffa +
 *   Descrizione) seguita da una riga "prezzo" (testo del prezzo in lettere,
 *   es. "euro (quindici/35)", unità di misura, prezzo, quantità, importo).
 *   Le due righe vengono unite in un'unica voce, scartando il testo in lettere.
 * - le voci con quantità pari a zero (non utilizzate nel computo) vengono eliminate.
 */

import * as XLSX from 'xlsx';
import type { ElencoPrezziResult, ElencoPrezziRow } from '../types';

function parseItalianNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[\s ]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function findHeaderLayout(rows: string[][]): { headerRowIdx: number; tariffaCol: number; descCol: number; unitaCol: number; quantitaCol: number } | null {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    const tariffaCol = row.findIndex(c => /tariffa/i.test(c));
    const descCol = row.findIndex(c => /descrizione/i.test(c));
    const unitaCol = row.findIndex(c => /unit[àa]\s*di\s*misura|unit[àa]\s*di/i.test(c));
    if (tariffaCol >= 0 && descCol >= 0) {
      // La riga successiva contiene le sotto-intestazioni "Quantità" / "Importo"
      const subRow = rows[i + 1] || [];
      const quantitaCol = subRow.findIndex(c => /quantit[àa]/i.test(c));
      return {
        headerRowIdx: i,
        tariffaCol,
        descCol,
        unitaCol: unitaCol >= 0 ? unitaCol : descCol + 1,
        quantitaCol: quantitaCol >= 0 ? quantitaCol : descCol + 3,
      };
    }
  }
  return null;
}

export async function parseElencoPrezzi(file: File): Promise<ElencoPrezziResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });

  const layout = findHeaderLayout(rows);
  if (!layout) {
    throw new Error('Non riconosco il formato del file: non trovo le colonne "Tariffa" / "Descrizione". Verifica che sia un elenco prezzi esportato da Primus.');
  }
  const { headerRowIdx, tariffaCol, descCol, unitaCol, quantitaCol } = layout;

  const result: ElencoPrezziRow[] = [];
  let originalCount = 0;
  let removedZeroQty = 0;

  let pending: { tariffa: string; descrizione: string } | null = null;

  for (let i = headerRowIdx + 2; i < rows.length; i++) {
    const row = rows[i] || [];
    const tariffa = (row[tariffaCol] || '').trim();
    const desc = (row[descCol] || '').trim();

    if (tariffa) {
      // Nuova voce: riga "codice"
      pending = { tariffa, descrizione: desc };
      continue;
    }

    if (pending && /^euro\b/i.test(desc)) {
      // Riga "prezzo" (testo in lettere) — completa la voce pendente
      originalCount++;
      const unita = (row[unitaCol] || '').trim();
      const quantita = parseItalianNumber(row[quantitaCol]);
      if (quantita === 0) {
        removedZeroQty++;
      } else {
        result.push({ tariffa: pending.tariffa, descrizione: pending.descrizione, unita, quantita });
      }
      pending = null;
      continue;
    }

    // Qualsiasi altra riga (es. "Voce riservata!!!") viene ignorata: non fa
    // parte di una voce valida a due righe.
  }

  return {
    fileName: file.name,
    rows: result,
    originalCount,
    removedZeroQty,
  };
}
