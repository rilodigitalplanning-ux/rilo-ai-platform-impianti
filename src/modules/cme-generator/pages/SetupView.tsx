// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/pages/SetupView.tsx
// Step 1: Load Revit CSV + select which prezzarios to use.
// Prezzario upload/delete is exclusively done in Settings (admin only).
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState, useRef } from 'react';
import { FileSpreadsheet, ChevronRight, AlertCircle, Database, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { parseRevitCsv } from '../services/csvParser';
import { parseRevitExcel } from '../services/excelParser';
import { useCme } from '../context/CmeContext';
import type { PrezzarioRecord, Elemento } from '../types';
import type { UserProfile } from '../lib/currentUser';

interface SetupViewProps {
  user: UserProfile;
  prezzarios: PrezzarioRecord[];
  refPrezzarioId: number | null;
  setRefPrezzarioId: (id: number) => void;
  targetPrezzarioId: number | null;
  setTargetPrezzarioId: (id: number) => void;
  onStartProcessing: () => void;
  onGoToSettings: () => void;
}

export function SetupView({
  user,
  prezzarios,
  refPrezzarioId,
  setRefPrezzarioId,
  targetPrezzarioId,
  setTargetPrezzarioId,
  onStartProcessing,
  onGoToSettings,
}: SetupViewProps) {
  const { state, dispatch } = useCme();
  const [error, setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);

  const canProcess = state.elementos.length > 0 && prezzarios.length > 0 &&
    refPrezzarioId !== null && targetPrezzarioId !== null;

  // ── CSV da Revit ────────────────────────────────────────────────────────────

  async function handleCsvUpload(file: File) {
    setError(null); setSuccess(null);
    try {
      let elementos: Elemento[] = [];
      let warnings: string[] = [];
      let rawBimOffData: any[][] | undefined = undefined;

      if (file.name.toLowerCase().endsWith('.xlsx')) {
        const buffer = await file.arrayBuffer();
        const res = await parseRevitExcel(buffer);
        elementos = res.elementos;
        warnings = res.warnings;
        rawBimOffData = res.rawBimOffData;
      } else {
        const text = await file.text();
        const res = parseRevitCsv(text);
        elementos = res.elementos;
        warnings = res.warnings;
      }

      dispatch({ type: 'SET_ELEMENTOS', payload: elementos });
      if (rawBimOffData) {
        dispatch({ type: 'SET_RAW_BIM_OFF_DATA', payload: rawBimOffData });
      }
      setSuccess(`✓ ${elementos.length} elementi caricati dal file`);
      if (warnings.length > 0) setError(`Avvisi: ${warnings.slice(0, 3).join(', ')}`);
    } catch (e: any) {
      setError(`Errore durante la lettura del file: ${e.message}`);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleCsvUpload(file);
  }

  return (
    <div className="flex-1 overflow-auto p-8 space-y-8">

      {/* ── Alerts ── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 flex gap-3 items-start">
            <AlertCircle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <span className="text-red-300 text-sm">{error}</span>
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-green-900/30 border border-green-500/30 rounded-xl p-4 text-green-300 text-sm">
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Step 1: CSV da Revit ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold tracking-widest text-gray-500 dark:text-white/40 uppercase mb-4">
          1 — CSV da Revit
        </h2>
        <div
          onClick={() => csvRef.current?.click()}
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 dark:border-white/10 hover:border-[#E94560]/50 rounded-2xl p-10 flex flex-col items-center gap-4 cursor-pointer transition-colors group"
        >
          <FileSpreadsheet size={36} className="text-gray-300 dark:text-white/20 group-hover:text-[#E94560]/60 transition-colors" />
          <div className="text-center">
            <p className="text-gray-600 dark:text-white/60 text-sm">Trascina o clicca per selezionare il file da Revit (.csv o .xlsx)</p>
            {state.elementos.length > 0 && (
              <p className="text-[#E94560] font-bold mt-2">✓ {state.elementos.length} elementi caricati</p>
            )}
          </div>
          <input ref={csvRef} type="file" accept=".csv,.xlsx" className="hidden"
            onChange={e => e.target.files?.[0] && handleCsvUpload(e.target.files[0])} />
        </div>
      </section>

      {/* ── Step 2: Seleziona Prezzari ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-bold tracking-widest text-gray-500 dark:text-white/40 uppercase mb-4">
          2 — Seleziona Prezzari
        </h2>

        {prezzarios.length === 0 ? (
          /* No prezzarios loaded yet — guide user to settings */
          <div className="border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl p-8 flex flex-col items-center gap-4 text-center">
            <Database size={32} className="text-gray-300 dark:text-white/20" />
            <div>
              <p className="text-gray-500 dark:text-white/40 text-sm font-medium">Nessun prezzario disponibile</p>
              <p className="text-gray-400 dark:text-white/20 text-xs mt-1">
                {user.role === 'admin'
                  ? 'Carica un prezzario DEI o Sicilia nelle Impostazioni.'
                  : 'Attendi che l\'amministratore carichi il prezzario di sistema.'
                }
              </p>
            </div>
            {(user.role === 'admin') && (
              <button
                onClick={onGoToSettings}
                className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 rounded-xl text-sm font-bold transition-colors"
              >
                <Settings size={15} />
                Vai alle Impostazioni
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-5">
            {[
              {
                label: 'Prezzario di Riferimento',
                sublabel: 'DEI — fonte dei prezzi base',
                value: refPrezzarioId,
                set: setRefPrezzarioId,
                color: '#0F3460',
              },
              {
                label: 'Prezzario Target',
                sublabel: 'Prezzario da confrontare / applicare',
                value: targetPrezzarioId,
                set: setTargetPrezzarioId,
                color: '#E94560',
              },
            ].map(({ label, sublabel, value, set, color }) => (
              <div key={label} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl p-5 space-y-3">
                <div>
                  <label className="block text-xs font-bold tracking-widest uppercase text-gray-500 dark:text-white/50 mb-0.5">
                    {label}
                  </label>
                  <p className="text-gray-400 dark:text-white/25 text-[11px]">{sublabel}</p>
                </div>
                <select
                  value={value ?? ''}
                  onChange={e => set(Number(e.target.value))}
                  className="w-full bg-white dark:bg-[#0a0f1a] border border-gray-300 dark:border-white/10 focus:border-gray-400 dark:focus:border-white/30 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-sm outline-none transition-colors"
                  style={{ borderLeftColor: color, borderLeftWidth: 3 }}
                >
                  <option value="">— seleziona —</option>
                  {prezzarios.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Process button ── */}
      <div className="flex justify-end pt-4">
        <motion.button
          onClick={onStartProcessing}
          disabled={!canProcess}
          whileHover={canProcess ? { scale: 1.02 } : undefined}
          whileTap={canProcess ? { scale: 0.98 } : undefined}
          className={`flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm tracking-widest uppercase transition-all
            ${canProcess
              ? 'bg-gradient-to-r from-[#0F3460] to-[#E94560] text-white shadow-2xl shadow-[#E94560]/20 hover:shadow-[#E94560]/40'
              : 'bg-gray-200 dark:bg-white/5 text-gray-400 dark:text-white/20 cursor-not-allowed'
            }`}
        >
          ELABORA
          <ChevronRight size={20} />
        </motion.button>
      </div>
    </div>
  );
}
