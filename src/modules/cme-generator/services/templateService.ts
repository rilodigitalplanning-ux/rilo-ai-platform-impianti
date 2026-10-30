// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/templateService.ts
// Manages the company's CME Excel template stored in Supabase Storage.
//
// The template is uploaded ONCE by an admin and reused on every computo export.
// Metadata is stored in cme_config (Supabase) with localStorage as fallback.
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../lib/supabase';

const BUCKET        = 'cme-generator-templates';
const TEMPLATE_PATH = 'computo_template.xlsx';   // fixed path — always overwritten
const CONFIG_KEY    = 'cme_template_meta';        // stored in cme_config
const LS_KEY        = 'cme_template_meta_local';  // localStorage fallback

export interface TemplateMetadata {
  fileName:    string;
  uploadedAt:  string;
  uploadedBy:  string;
  sizeBytes:   number;
  // Claude's analysis result — column mapping + first data row
  analysis?: {
    columns:       string[];   // detected column names in order
    dataStartRow:  number;     // 1-based row where data begins
    headerRow:     number;     // row with column labels
    hasLogo:       boolean;
    notes:         string;
  };
}

// ── localStorage helpers (fallback when Supabase RLS blocks cme_config) ───────
function savMetaLocal(meta: TemplateMetadata): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

function loadMetaLocal(): TemplateMetadata | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as TemplateMetadata : null;
  } catch { return null; }
}

function clearMetaLocal(): void {
  try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
}

// ── Upload template file to Storage ──────────────────────────────────────────
export async function uploadTemplate(
  file: File,
  userId: string,
): Promise<TemplateMetadata> {
  if (!file.name.toLowerCase().endsWith('.xlsx')) {
    throw new Error('Il template deve essere un file .xlsx');
  }

  const buffer = await file.arrayBuffer();

  // 1. Upload to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(TEMPLATE_PATH, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,   // overwrite if exists
    });

  if (uploadErr) {
    if (uploadErr.message.includes('row-level security') || uploadErr.message.includes('RLS') || uploadErr.message.includes('policy')) {
      throw new Error(
        'Errore di permessi sullo Storage di Supabase.\n' +
        'Soluzione: eseguire il file "supabase-cme-generator.sql" nel SQL Editor di Supabase ' +
        'e verificare che il bucket "cme-generator-templates" esista in Storage.'
      );
    }
    if (uploadErr.message.includes('Bucket not found') || uploadErr.message.includes('bucket')) {
      throw new Error(
        'Bucket "cme-generator-templates" non trovato in Supabase.\n' +
        'Soluzione: aprire Supabase → Storage → New bucket → nome: cme-generator-templates → quindi eseguire lo script SQL delle policy.'
      );
    }
    throw new Error(`Errore nel caricamento del template: ${uploadErr.message}`);
  }

  const meta: TemplateMetadata = {
    fileName:   file.name,
    uploadedAt: new Date().toISOString(),
    uploadedBy: userId,
    sizeBytes:  file.size,
  };

  // 2. Save metadata — try Supabase cme_config first, fallback to localStorage
  try {
    const { error: cfgErr } = await supabase.from('cme_config').upsert(
      { user_id: userId, chave: CONFIG_KEY, valor: JSON.stringify(meta) },
      { onConflict: 'user_id,chave' },
    );
    if (cfgErr) {
      console.warn('[templateService] cme_config upsert failed, using localStorage:', cfgErr.message);
    }
  } catch (e) {
    console.warn('[templateService] cme_config error, using localStorage:', e);
  }
  // Always save locally too (works offline + as fallback)
  savMetaLocal(meta);

  return meta;
}

// ── Get stored metadata ───────────────────────────────────────────────────────
export async function getTemplateMeta(userId: string): Promise<TemplateMetadata | null> {
  // 1. Try Supabase first
  try {
    const { data } = await supabase
      .from('cme_config')
      .select('valor')
      .eq('user_id', userId)
      .eq('chave', CONFIG_KEY)
      .single();

    if (data?.valor) {
      try {
        const meta = JSON.parse(data.valor) as TemplateMetadata;
        savMetaLocal(meta); // keep local in sync
        return meta;
      } catch { /* fall through */ }
    }
  } catch { /* fall through */ }

  // 2. Fallback: localStorage
  const localMeta = loadMetaLocal();
  if (localMeta) return localMeta;

  // 3. Template might exist in Storage without metadata — check Storage
  try {
    const { data } = await supabase.storage.from(BUCKET).list('', { search: 'computo_template' });
    if ((data ?? []).length > 0) {
      return {
        fileName:   'computo_template.xlsx',
        uploadedAt: new Date().toISOString(),
        uploadedBy: userId,
        sizeBytes:  0,
      };
    }
  } catch { /* ignore */ }

  return null;
}

// ── Save updated metadata (e.g. after analysis) ───────────────────────────────
export async function saveTemplateMeta(userId: string, meta: TemplateMetadata): Promise<void> {
  savMetaLocal(meta);
  try {
    await supabase.from('cme_config').upsert(
      { user_id: userId, chave: CONFIG_KEY, valor: JSON.stringify(meta) },
      { onConflict: 'user_id,chave' },
    );
  } catch (e) {
    console.warn('[templateService] saveTemplateMeta Supabase failed, localStorage only:', e);
  }
}

// ── Download template as ArrayBuffer (for ExcelJS) ────────────────────────────
export async function downloadTemplateBuffer(): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(TEMPLATE_PATH);

  if (error || !data) throw new Error(`Errore nel download del template: ${error?.message}`);
  return data.arrayBuffer();
}

// ── Delete template ───────────────────────────────────────────────────────────
export async function deleteTemplate(userId: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([TEMPLATE_PATH]);
  clearMetaLocal();
  try {
    await supabase.from('cme_config')
      .delete()
      .eq('user_id', userId)
      .eq('chave', CONFIG_KEY);
  } catch { /* ignore */ }
}

// ── Check if a template is loaded ────────────────────────────────────────────
export async function hasTemplate(): Promise<boolean> {
  const { data } = await supabase.storage.from(BUCKET).list('', { search: 'computo_template' });
  return (data ?? []).length > 0;
}
