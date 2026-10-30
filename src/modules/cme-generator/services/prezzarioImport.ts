// Importazione di un prezzario da file Excel (.xlsx/.xls), CSV o PDF.
import { parsePrezzarioFile } from './prezzarioService';
import { parsePrezzarioPdf } from './pdfPrezzarioParser';
import type { PrezzarioVoce } from '../types';

export interface PrezzarioParseOutput {
  voci: PrezzarioVoce[];
  source: 'excel' | 'pdf';
  skipped: number;
  pages?: number;
}

export const ACCEPTED_PREZZARIO_FILES = '.xlsx,.xls,.csv,.pdf';

export async function parsePrezzarioUpload(
  file: File,
  onProgress?: (done: number, total: number) => void,
): Promise<PrezzarioParseOutput> {
  const name = file.name.toLowerCase();

  if (name.endsWith('.pdf')) {
    const r = await parsePrezzarioPdf(file, onProgress);
    return { voci: r.voci, source: 'pdf', skipped: r.skipped, pages: r.pages };
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    const voci = await parsePrezzarioFile(file);
    return { voci, source: 'excel', skipped: 0 };
  }
  throw new Error('Formato non supportato. Carica un file Excel (.xlsx, .xls), CSV o PDF.');
}
