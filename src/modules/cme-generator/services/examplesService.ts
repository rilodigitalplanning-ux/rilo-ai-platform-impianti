// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/examplesService.ts
// Read/write confirmed matches from/to cme_examples (Supabase).
//
// saveExamplesBatch  — called after admin approves a review job (bulk)
// findSimilarExamples — called before each AI call to inject context
// ─────────────────────────────────────────────────────────────────────────────
import { supabase } from '../lib/supabase';
import type { CmeExample, ResultadoItemReview } from '../types';

const BATCH_SIZE = 200; // Supabase upsert batch limit

// ── Save a batch of approved results as examples ──────────────────────────────
export async function saveExamplesBatch(
  items: ResultadoItemReview[],
  userId: string,
): Promise<{ saved: number; skipped: number }> {
  let saved = 0;
  let skipped = 0;

  // Flatten: each SubItem becomes one example row
  const rows: object[] = [];
  for (const item of items) {
    if (item.reviewStatus === 'rejected') { skipped++; continue; }

    // Determine final price (corrected by user or original)
    const finalValore = item.correctedValore ?? item.valoreUnitario;
    const score       = item.reviewStatus === 'corrected' ? 0.7 : 1.0;

    for (const sub of item.subItems) {
      if (!sub.codicePrezzarioTarget) continue;
      rows.push({
        descrizione_elemento:  item.descrizioneElemento,
        codice_dei:            sub.codiceDeiOriginal,
        descrizione_dei:       sub.descrizioneDei,
        codice_target:         item.correctedCodice ?? sub.codicePrezzarioTarget,
        descrizione_target:    sub.descrizionePrezzarioTarget,
        valore_unitario:       finalValore,
        um:                    item.unidade,
        categoria:             item.categoria,
        score_confirmacao:     score,
        vezes_usado:           0,
        aprovado_por:          userId,
      });
    }

    // If no subItems (NVP or fallback), save the elemento itself
    if (item.subItems.length === 0 && item.correctedCodice) {
      rows.push({
        descrizione_elemento:  item.descrizioneElemento,
        codice_dei:            item.idElemento,
        descrizione_dei:       item.descrizioneElemento,
        codice_target:         item.correctedCodice,
        descrizione_target:    '',
        valore_unitario:       finalValore,
        um:                    item.unidade,
        categoria:             item.categoria,
        score_confirmacao:     0.7,
        vezes_usado:           0,
        aprovado_por:          userId,
      });
    }
  }

  // ── Deduplicate rows by (codice_dei, codice_target) ───────────────────────
  // PostgreSQL ON CONFLICT requires that the batch contains no duplicate keys.
  const uniqueRowsMap = new Map<string, object>();
  for (const row of rows as any[]) {
    const key = `${row.codice_dei}_${row.codice_target}`;
    if (!uniqueRowsMap.has(key)) {
      uniqueRowsMap.set(key, row);
    }
  }
  const uniqueRows = Array.from(uniqueRowsMap.values());

  // Batch upsert — conflict on (codice_dei, codice_target) updates score and valore
  for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
    const batch = uniqueRows.slice(i, i + BATCH_SIZE);
    const { error, data } = await supabase
      .from('cme_examples')
      .upsert(batch, {
        onConflict: 'codice_dei,codice_target',
        ignoreDuplicates: false,
      })
      .select('id');

    if (error) throw new Error(`Errore nel salvataggio degli esempi: ${error.message}`);
    saved += data?.length ?? batch.length;
  }

  return { saved, skipped };
}

// ── Find the most similar confirmed examples for a given element ──────────────
// Uses PostgreSQL full-text search on descrizione_elemento + descrizione_dei.
// Returns up to `limit` examples ordered by usage count (most confirmed first).
export async function findSimilarExamples(
  descrizione: string,
  limit = 8,
): Promise<CmeExample[]> {
  if (!descrizione.trim()) return [];

  // Build a simple search query from the description words
  const query = descrizione
    .toLowerCase()
    .replace(/[^a-z0-9àèéìòùçäöü\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 6)
    .join(' & ');

  if (!query) return [];

  const { data, error } = await supabase
    .from('cme_examples')
    .select('*')
    .textSearch('descrizione_elemento', query, { type: 'plain', config: 'simple' })
    .order('vezes_usado', { ascending: false })
    .order('score_confirmacao', { ascending: false })
    .limit(limit);

  if (error) {
    // Full-text search failed (index not ready yet) — fallback to ilike
    const { data: fallback } = await supabase
      .from('cme_examples')
      .select('*')
      .ilike('descrizione_elemento', `%${descrizione.substring(0, 30)}%`)
      .order('vezes_usado', { ascending: false })
      .limit(limit);
    return (fallback ?? []).map(mapRow);
  }

  return (data ?? []).map(mapRow);
}

// ── Increment usage counters for examples that were actually used ─────────────
export async function incrementExampleUsage(ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  // Uses the SQL function created in the migration
  await supabase.rpc('cme_increment_example_usage', { example_ids: ids });
}

// ── Get total count of examples in the bank ───────────────────────────────────
export async function getExamplesCount(): Promise<number> {
  const { count } = await supabase
    .from('cme_examples')
    .select('id', { count: 'exact', head: true });
  return count ?? 0;
}

// ── Map DB row → CmeExample ───────────────────────────────────────────────────
function mapRow(r: any): CmeExample {
  return {
    id:                  r.id,
    descrizioneElemento: r.descrizione_elemento,
    codiceDei:           r.codice_dei,
    descrizioneDei:      r.descrizione_dei,
    codiceTarget:        r.codice_target,
    descrizioneTarget:   r.descrizione_target,
    valoreUnitario:      Number(r.valore_unitario),
    um:                  r.um,
    categoria:           r.categoria,
    scoreConfirmacao:    Number(r.score_confirmacao),
    vezesUsado:          r.vezes_usado,
    aprovadoPor:         r.aprovado_por,
  };
}
