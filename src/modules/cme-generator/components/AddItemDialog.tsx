import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { VocePicker } from './VocePicker';
import { NvpBuilderModal } from './NvpBuilderModal';
import { buildManualItem, type VoceChoice, type NvpDetails, type Changes } from '../services/pricing';
import { parseItNumber } from '../lib/parseNumber';

interface Props {
  onApply: (changes: Changes) => void;
  onClose: () => void;
}

const inputCls = 'w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-[12px] outline-none dark:text-white';
const labelCls = 'text-[9px] font-bold uppercase tracking-widest opacity-40';
const eur = (v: number) => `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Aggiunge al progetto un elemento manuale, con una voce di prezzario oppure con una NVP.
export const AddItemDialog: React.FC<Props> = ({ onApply, onClose }) => {
  const { moduleTheme } = useApp();
  const [descrizione, setDescrizione] = useState('');
  const [um, setUm] = useState('cad');
  const [quantita, setQuantita] = useState('1');
  const [edificio, setEdificio] = useState('');
  const [livello, setLivello] = useState('');
  const [zona, setZona] = useState('');
  const [tab, setTab] = useState<'prezzario' | 'nvp'>('prezzario');
  const [selected, setSelected] = useState<VoceChoice | null>(null);
  const [nvp, setNvp] = useState<{ valoreUnitario: number; fonte: string; details: NvpDetails } | null>(null);
  const [showNvp, setShowNvp] = useState(false);

  const qty = parseItNumber(quantita);
  const ready = descrizione.trim() !== '' && qty > 0 && (tab === 'prezzario' ? !!selected : !!nvp);

  function handleAdd() {
    if (!ready) return;
    const replacement = tab === 'prezzario'
      ? { kind: 'voce' as const, voce: selected! }
      : { kind: 'nvp' as const, valoreUnitario: nvp!.valoreUnitario, fonte: nvp!.fonte, nvpDetails: nvp!.details };
    onApply({
      upsert: [buildManualItem({ descrizione: descrizione.trim(), um, quantita: qty, edificio: edificio.trim(), livello: livello.trim(), zona: zona.trim(), replacement })],
      remove: [],
    });
  }

  if (showNvp) {
    return (
      <NvpBuilderModal
        elemento={{ descricao: descrizione || 'Nuovo elemento', descrizioneElemento: descrizione || 'Nuovo elemento', edificio: edificio || 'Generale', edifcio: '', livello: livello || 'Generale' } as any}
        initialNvpDetails={nvp?.details}
        onConfirm={(valoreUnitario, fonte, details) => { setNvp({ valoreUnitario, fonte, details }); setShowNvp(false); }}
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
          <h2 className="text-sm font-black uppercase tracking-tight">Aggiungi elemento al computo</h2>
          <button onClick={onClose} className="p-2 opacity-40 hover:opacity-100 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><X size={18} /></button>
        </div>

        <div className="p-8 space-y-6">
          <div className="grid grid-cols-6 gap-3">
            <div className="col-span-4">
              <label className={labelCls}>Descrizione dell'elemento</label>
              <input value={descrizione} onChange={e => setDescrizione(e.target.value)} className={`${inputCls} mt-1`} placeholder="Es. Quadro di zona aggiuntivo" />
            </div>
            <div>
              <label className={labelCls}>U.M.</label>
              <input value={um} onChange={e => setUm(e.target.value)} className={`${inputCls} mt-1`} />
            </div>
            <div>
              <label className={labelCls}>Quantità</label>
              <input value={quantita} onChange={e => setQuantita(e.target.value)} className={`${inputCls} mt-1`} />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Edificio</label>
              <input value={edificio} onChange={e => setEdificio(e.target.value)} className={`${inputCls} mt-1`} placeholder="Generale" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Livello</label>
              <input value={livello} onChange={e => setLivello(e.target.value)} className={`${inputCls} mt-1`} placeholder="Generale" />
            </div>
            <div className="col-span-2">
              <label className={labelCls}>Zona</label>
              <input value={zona} onChange={e => setZona(e.target.value)} className={`${inputCls} mt-1`} placeholder="Generale" />
            </div>
          </div>

          <div className="flex gap-1">
            {([['prezzario', 'Voce di prezzario'], ['nvp', 'NVP']] as const).map(([id, label]) => (
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
            <VocePicker selected={selected} onSelect={setSelected} />
          ) : (
            <div className="rounded-xl border border-dashed border-black/15 dark:border-white/15 p-6 text-center space-y-3">
              {nvp ? (
                <p className="text-[12px]">NVP configurata: <span className="font-black" style={{ color: moduleTheme.accent }}>{eur(nvp.valoreUnitario)}</span> per {um || 'unità'} · {nvp.fonte}</p>
              ) : (
                <p className="text-[12px] opacity-60">Configura l'analisi del nuovo prezzo (materiali, manodopera, noleggi, spese generali, utili).</p>
              )}
              <button
                onClick={() => setShowNvp(true)}
                className="px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-white"
                style={{ backgroundColor: moduleTheme.accent }}
              >
                {nvp ? 'Modifica analisi' : 'Configura NVP'}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-8 py-5 border-t border-black/10 dark:border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5">
            Annulla
          </button>
          <button
            disabled={!ready}
            onClick={handleAdd}
            className="px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-30"
            style={{ backgroundColor: moduleTheme.accent }}
          >
            Aggiungi al computo
          </button>
        </div>
      </motion.div>
    </div>
  );
};
