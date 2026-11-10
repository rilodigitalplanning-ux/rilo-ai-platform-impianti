// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/pages/ReviewView.tsx
// Post-processing review: bulk approve OK, quick review ALERT, fix NAO_ENCONTRADO
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useMemo, useCallback } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ChevronRight, ChevronLeft,
         ThumbsUp, Edit3, Trash2, Save, BarChart2, Database, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCme } from '../context/CmeContext';
import { saveExamplesBatch, getExamplesCount } from '../services/examplesService';
import type { ResultadoItem, ResultadoItemReview, ReviewStats, ReviewItemStatus } from '../types';
import type { UserProfile } from '../lib/currentUser';

interface ReviewViewProps {
  user: UserProfile;
  onFinish: () => void;         // go to ResultsView after saving
  onSkip:   () => void;         // skip review, go straight to results
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initReviews(resultados: Map<string, ResultadoItem>): ResultadoItemReview[] {
  return Array.from(resultados.values()).map(r => ({
    ...r,
    reviewStatus: (r.status === 'OK' ? 'approved' : 'pending') as ReviewItemStatus,
  }));
}

function calcStats(items: ResultadoItemReview[]): ReviewStats {
  return {
    total:         items.length,
    ok:            items.filter(i => i.status === 'OK').length,
    alert:         items.filter(i => i.status === 'ALERT').length,
    naoEncontrado: items.filter(i => i.status === 'NAO_ENCONTRADO').length,
    nvp:           items.filter(i => i.status === 'NVP').length,
    aprovados:     items.filter(i => i.reviewStatus !== 'pending' && i.reviewStatus !== 'rejected').length,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatBadge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex flex-col items-center px-5 py-3 rounded-xl border ${color}`}>
      <span className="text-2xl font-black">{value.toLocaleString('it-IT')}</span>
      <span className="text-xs uppercase tracking-widest opacity-60 mt-0.5">{label}</span>
    </div>
  );
}

function AlertCard({
  item, onApprove, onCorrect, onReject,
}: {
  item: ResultadoItemReview;
  onApprove: () => void;
  onCorrect: (valore: number) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [valoreInput, setValoreInput] = useState(String(item.correctedValore ?? item.valoreUnitario));

  const statusColors: Record<ReviewItemStatus, string> = {
    approved:  'border-green-500/30 bg-green-900/10',
    corrected: 'border-blue-500/30 bg-blue-900/10',
    rejected:  'border-red-500/30 bg-red-900/10 opacity-50',
    pending:   'border-yellow-500/20 bg-yellow-900/5',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`border rounded-xl px-5 py-4 transition-colors ${statusColors[item.reviewStatus]}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-gray-900 dark:text-white font-medium text-sm truncate">{item.descrizioneElemento}</p>
          <p className="text-gray-500 dark:text-white/40 text-xs mt-0.5">
            {item.edificio} · {item.livello} · {item.categoria}
          </p>
          {item.subItems.length > 0 && (
            <p className="text-gray-400 dark:text-white/30 text-xs mt-1">
              Match: <span className="text-gray-500 dark:text-white/50">{item.subItems[0]?.codicePrezzarioTarget}</span>
              {' '}— affidabilità: <span className={item.subItems[0]?.confiancaMatch >= 0.7 ? 'text-yellow-400' : 'text-red-400'}>
                {((item.subItems[0]?.confiancaMatch ?? 0) * 100).toFixed(0)}%
              </span>
            </p>
          )}
        </div>

        {/* Price */}
        <div className="text-right flex-shrink-0">
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={valoreInput}
                onChange={e => setValoreInput(e.target.value)}
                className="w-24 bg-gray-200 dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg px-2 py-1 text-gray-900 dark:text-white text-sm text-right"
                autoFocus
              />
              <button
                onClick={() => {
                  const v = parseFloat(valoreInput.replace(',', '.'));
                  if (!isNaN(v) && v >= 0) onCorrect(v);
                  setEditing(false);
                }}
                className="p-1 text-green-400 hover:text-green-300"
              >
                <Save size={14} />
              </button>
            </div>
          ) : (
            <div>
              <p className="text-gray-900 dark:text-white font-bold">€{(item.correctedValore ?? item.valoreUnitario).toFixed(2)}</p>
              <p className="text-gray-400 dark:text-white/30 text-xs">{item.quantitaElemento} {item.unidade}</p>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      {item.reviewStatus === 'pending' && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={onApprove}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 text-green-500 dark:text-green-400 text-xs font-bold transition-colors"
          >
            <ThumbsUp size={12} /> Approva
          </button>
          <button
            onClick={() => setEditing(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20 text-blue-400 text-xs font-bold transition-colors"
          >
            <Edit3 size={12} /> Correggi
          </button>
          <button
            onClick={onReject}
            className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-400 text-xs transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}

      {item.reviewStatus !== 'pending' && (
        <div className="flex items-center gap-2 mt-2">
          <span className={`text-xs font-bold ${
            item.reviewStatus === 'approved' ? 'text-green-400' :
            item.reviewStatus === 'corrected' ? 'text-blue-400' : 'text-red-400'
          }`}>
            {item.reviewStatus === 'approved' ? '✓ Approvato' :
             item.reviewStatus === 'corrected' ? '✎ Corretto' : '✗ Rifiutato'}
          </span>
          <button onClick={() => {
            /* reset to pending */
          }} className="text-gray-500 hover:text-gray-700 dark:hover:text-white/20 dark:hover:text-white/40 text-xs ml-auto">annulla</button>
        </div>
      )}
    </motion.div>
  );
}

// ── Main ReviewView ───────────────────────────────────────────────────────────

type Tab = 'ok' | 'alert' | 'nao';

export function ReviewView({ user, onFinish, onSkip }: ReviewViewProps) {
  const { state } = useCme();
  const [items, setItems] = useState<ResultadoItemReview[]>(() => initReviews(state.resultados));
  const [tab, setTab] = useState<Tab>('ok');
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const stats = useMemo(() => calcStats(items), [items]);

  const tabItems = useMemo(() => {
    const filtered = items.filter(i => {
      if (tab === 'ok')    return i.status === 'OK';
      if (tab === 'alert') return i.status === 'ALERT';
      return i.status === 'NAO_ENCONTRADO';
    });
    if (!filter.trim()) return filtered;
    const q = filter.toLowerCase();
    return filtered.filter(i =>
      i.descrizioneElemento.toLowerCase().includes(q) ||
      i.edificio.toLowerCase().includes(q) ||
      i.categoria.toLowerCase().includes(q)
    );
  }, [items, tab, filter]);

  // Update a single item's review status
  const setItemStatus = useCallback((id: string, status: ReviewItemStatus, extra?: Partial<ResultadoItemReview>) => {
    setItems(prev => prev.map(i => i.idElemento === id ? { ...i, reviewStatus: status, ...extra } : i));
  }, []);

  // Bulk approve all OK items
  function approveAllOk() {
    setItems(prev => prev.map(i => i.status === 'OK' ? { ...i, reviewStatus: 'approved' } : i));
  }

  // Save approved examples to Supabase and move on
  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const toSave = items.filter(i => i.reviewStatus === 'approved' || i.reviewStatus === 'corrected');
      const { saved } = await saveExamplesBatch(toSave, user.id);
      setSavedCount(saved);
      setTimeout(onFinish, 1800); // brief success flash then go to results
    } catch (e: any) {
      setError(`Errore durante il salvataggio: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  const pendingCount = items.filter(i => i.reviewStatus === 'pending' && i.status !== 'NVP').length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="px-8 py-5 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14]">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-gray-900 dark:text-white font-black text-lg tracking-tight">Revisione del lavoro</h2>
            <p className="text-gray-500 dark:text-white/40 text-xs mt-0.5">
              {pendingCount > 0
                ? `${pendingCount} elementi in attesa di revisione`
                : '✓ Tutti gli elementi revisionati'}
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onSkip}
              className="px-4 py-2 rounded-xl border border-gray-300 dark:border-white/10 text-gray-500 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60 text-sm transition-colors"
            >
              Salta revisione
            </button>
            <button
              onClick={handleSave}
              disabled={saving || savedCount !== null}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-[#0F3460] to-[#E94560] text-white font-bold text-sm transition-all disabled:opacity-50"
            >
              {saving
                ? <><Loader2 size={14} className="animate-spin" /> Salvataggio...</>
                : savedCount !== null
                ? <><CheckCircle2 size={14} className="text-green-400" /> {savedCount} esempi salvati!</>
                : <><Database size={14} /> Finalizza e Salva Esempi</>
              }
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-4">
          <StatBadge label="Totale"    value={stats.total}         color="border-gray-300 dark:border-white/10 text-gray-600 dark:text-white/60" />
          <StatBadge label="OK"        value={stats.ok}            color="border-green-500/20 text-green-400" />
          <StatBadge label="Alert"     value={stats.alert}         color="border-yellow-500/20 text-yellow-400" />
          <StatBadge label="Non trov." value={stats.naoEncontrado} color="border-red-500/20 text-red-400" />
          <div className="flex-1" />
          <StatBadge label="Approvati" value={stats.aprovados}     color="border-[#E94560]/20 text-[#E94560]" />
        </div>

        {error && (
          <div className="mt-3 bg-red-900/20 border border-red-500/30 rounded-xl px-4 py-2 text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 px-8 py-3 border-b border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-[#060A12]">
        {([
          { id: 'ok',    label: `✓ OK (${stats.ok})`,               color: 'text-green-400' },
          { id: 'alert', label: `⚠ Alert (${stats.alert})`,         color: 'text-yellow-400' },
          { id: 'nao',   label: `✗ Non trovati (${stats.naoEncontrado})`, color: 'text-red-400' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all
              ${tab === t.id
                ? `bg-gray-200 dark:bg-white/10 ${t.color}`
                : 'text-gray-400 dark:text-white/30 hover:text-gray-500 dark:hover:text-white/50'}`}
          >
            {t.label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Filter */}
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filtra..."
          className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-1.5 text-gray-600 dark:text-white/60 text-xs w-48 placeholder-gray-400 dark:placeholder-white/20 focus:outline-none focus:border-gray-300 dark:border-white/20"
        />

        {/* Bulk approve OK */}
        {tab === 'ok' && (
          <button
            onClick={approveAllOk}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 text-green-600 dark:text-green-400 text-xs font-bold transition-colors ml-2"
          >
            <CheckCircle2 size={13} />
            Approva Tutti OK ({stats.ok.toLocaleString('it-IT')})
          </button>
        )}
      </div>

      {/* ── Item list ── */}
      <div className="flex-1 overflow-auto px-8 py-5">
        {tab === 'ok' && (
          <div className="space-y-0 divide-y divide-white/5">
            {tabItems.slice(0, 200).map(item => (
              <div key={item.idElemento} className="py-3 flex items-center justify-between border-b border-gray-200 dark:border-white/5 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 dark:text-white/80 text-sm truncate font-medium">{item.descrizioneElemento}</p>
                  <p className="text-gray-500 dark:text-white/40 text-xs">{item.edificio} · {item.livello} · {item.categoria}</p>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <span className="text-gray-500 dark:text-white/50 text-sm">€{item.valoreUnitario.toFixed(2)}</span>
                  {item.reviewStatus === 'approved'
                    ? <CheckCircle2 size={16} className="text-green-400" />
                    : <div className="w-4 h-4 rounded-full border border-gray-300 dark:border-white/20" />
                  }
                </div>
              </div>
            ))}
            {tabItems.length > 200 && (
              <p className="text-gray-500 dark:text-white/30 text-xs py-4 text-center">
                + {(tabItems.length - 200).toLocaleString('it-IT')} elementi aggiuntivi —
                usa "Approva Tutti OK" per approvare in blocco
              </p>
            )}
          </div>
        )}

        {(tab === 'alert' || tab === 'nao') && (
          <div className="space-y-3">
            <AnimatePresence>
              {tabItems.map(item => (
                <AlertCard
                  key={item.idElemento}
                  item={item}
                  onApprove={() => setItemStatus(item.idElemento, 'approved')}
                  onCorrect={(valore) => setItemStatus(item.idElemento, 'corrected', { correctedValore: valore })}
                  onReject={() => setItemStatus(item.idElemento, 'rejected')}
                />
              ))}
            </AnimatePresence>

            {tabItems.length === 0 && (
              <div className="flex flex-col items-center py-16 text-gray-400 dark:text-white/20">
                <BarChart2 size={40} className="mb-3" />
                <p>Nessun elemento in questa categoria</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
