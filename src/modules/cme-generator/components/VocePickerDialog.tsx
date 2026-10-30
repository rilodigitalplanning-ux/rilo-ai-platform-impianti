import React from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import { VocePicker } from './VocePicker';
import type { VoceChoice } from '../services/pricing';

interface Props {
  title: string;
  initialQuery?: string;
  onPick: (v: VoceChoice) => void;
  onClose: () => void;
}

// Finestra di scelta di una voce di prezzario: cliccando una voce viene applicata e la finestra si chiude.
export const VocePickerDialog: React.FC<Props> = ({ title, initialQuery, onPick, onClose }) => (
  <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      className="relative w-full max-w-2xl bg-white dark:bg-[#141414] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 dark:text-white"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
        <h3 className="text-sm font-black uppercase tracking-tight">{title}</h3>
        <button onClick={onClose} className="p-2 opacity-40 hover:opacity-100 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><X size={18} /></button>
      </div>
      <div className="p-6">
        <VocePicker selected={null} initialQuery={initialQuery} onSelect={v => onPick(v)} />
        <p className="text-[10px] opacity-40 mt-3">Cliccando una voce vengono usati la sua descrizione, l'unità di misura e il costo del prezzario.</p>
      </div>
    </motion.div>
  </div>
);
