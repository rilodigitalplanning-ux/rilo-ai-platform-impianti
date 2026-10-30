import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, ArrowRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VocePicker } from './VocePicker';
import { NvpBuilderModal } from './NvpBuilderModal';
import { replaceVoce, type VoceRow, type VoceChoice, type Changes } from '../services/pricing';
import type { ResultadoItem } from '../types';

interface Props {
  row: VoceRow;
  results: ResultadoItem[];
  onApply: (changes: Changes) => void;
  onClose: () => void;
}

const eur = (v: number) => `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const ReplaceVoceDialog: React.FC<Props> = ({ row, results, onApply, onClose }) => {
  const { moduleTheme } = useApp();
  const [tab, setTab] = useState<'prezzario' | 'nvp'>('prezzario');
  const [selected, setSelected] = useState<VoceChoice | null>(null);
  const [showNvp, setShowNvp] = useState(false);

  const preview = useMemo(() => {
    if (!selected) return null;
    const { upsert } = replaceVoce(results, row.key, { kind: 'voce', voce: selected });
    const ids = new Set(upsert.map(r => r.idElemento));
    const before = results.filter(r => ids.has(r.idElemento)).reduce((s, r) => s + r.total, 0);
    const after = upsert.reduce((s, r) => s + r.total, 0);
    return { n: upsert.length, before, after };
  }, [selected, results, row.key]);

  if (showNvp) {
    return (
      <NvpBuilderModal
        elemento={{ descricao: row.descrizione, descrizioneElemento: row.descrizione, edificio: `${row.nElementi} elementi`, edifcio: '', livello: 'sostituzione in blocco' } as any}
        onConfirm={(valoreUnitario, originePrezzo, nvpDetails) => {
          onApply(replaceVoce(results, row.key, { kind: 'nvp', valoreUnitario, fonte: originePrezzo, nvpDetails }));
        }}
        onSkip={() => setShowNvp(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#141414] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 dark:text-white"
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-black/10 dark:border-white/10">
          <h2 className="text-sm font-black uppercase tracking-tight">Sostituisci voce</h2>
          <button onClick={onClose} className="p-2 opacity-40 hover:opacity-100 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><X size={18} /></button>
        </div>

        <div className="p-8 space-y-6">
          <div className="rounded-xl bg-black/5 dark:bg-white/5 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40">Voce attuale</p>
            <p className="text-[12px] font-bold font-mono mt-0.5">{row.codice || '—'} <span className="font-sans font-normal opacity-50">· {row.prezzario}</span></p>
            <p className="text-[11px] opacity-70">{row.descrizione}</p>
            <p className="text-[10px] opacity-40 mt-1">
              Usata in {row.nElementi} element{row.nElementi === 1 ? 'o' : 'i'} · {row.quantita.toLocaleString('it-IT', { maximumFractionDigits: 2 })} {row.um} · {eur(row.importo)}
            </p>
          </div>

          <div className="flex gap-1">
            {([['prezzario', 'Da prezzario'], ['nvp', 'Come NVP']] as const).filter(([id]) => id === 'prezzario' || row.kind !== 'risorsa').map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${tab === id ? 'text-white' : 'opacity-50 hover:opacity-100'}`}
                style={tab === id ? { backgroundColor: moduleTheme.accent } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'prezzario' ? (
            <>
              <VocePicker selected={selected} onSelect={setSelected} />
              {selected && preview && (
                <div className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-3 flex items-center gap-3 text-[12px]">
                  <span className="opacity-60">Importo degli {preview.n} elementi</span>
                  <span className="font-bold">{eur(preview.before)}</span>
                  <ArrowRight size={14} className="opacity-40" />
                  <span className="font-black" style={{ color: moduleTheme.accent }}>{eur(preview.after)}</span>
                  <span className={`ml-auto font-bold ${preview.after - preview.before > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                    {preview.after - preview.before >= 0 ? '+' : ''}{eur(preview.after - preview.before)}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 p-6 text-center space-y-3">
              <p className="text-[12px] opacity-60">
                La voce diventa una Nuova Voce di Prezzo (NVP): configuri l'analisi (materiali, manodopera, noleggi, spese generali, utili)
                e viene applicata a tutti gli elementi che la usano ({row.nElementi}).
              </p>
              <button
                onClick={() => setShowNvp(true)}
                className="px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white"
                style={{ backgroundColor: moduleTheme.accent }}
              >
                Configura NVP
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-8 py-5 border-t border-black/10 dark:border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5">
            Annulla
          </button>
          {tab === 'prezzario' && (
            <button
              disabled={!selected}
              onClick={() => selected && onApply(replaceVoce(results, row.key, { kind: 'voce', voce: selected }))}
              className="px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-30"
              style={{ backgroundColor: moduleTheme.accent }}
            >
              Applica a {row.nElementi} element{row.nElementi === 1 ? 'o' : 'i'}
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};
