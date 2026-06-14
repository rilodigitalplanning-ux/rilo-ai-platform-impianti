import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Keyboard, X } from 'lucide-react';
import { Translation } from '../types';

export function ShortcutsModal({ isOpen, onClose, t }: { isOpen: boolean, onClose: () => void, t: Translation }) {
  if (!isOpen) return null;

  const shortcuts = [
    { keys: ['Ctrl', 'S'], description: t.misc.saveProjectShortcut },
    { keys: ['Ctrl', 'N'], description: t.misc.newProjectShortcut },
    { keys: ['Esc'], description: t.misc.closeModalsShortcut },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="relative w-full max-w-md bg-white dark:bg-[#141414] rounded-3xl overflow-hidden shadow-2xl border border-black/10 dark:border-white/10"
        >
          <div className="p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#81292C]/10 rounded-xl flex items-center justify-center text-[#81292C]">
                  <Keyboard size={20} />
                </div>
                <h2 className="text-xl font-bold dark:text-white uppercase tracking-tight">Atalhos de Teclado</h2>
              </div>
              <button onClick={onClose} className="p-2 text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white transition-colors rounded-full hover:bg-black/5 dark:hover:bg-white/5">
                <X size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              {shortcuts.map((shortcut, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-xl bg-black/5 dark:bg-white/5">
                  <span className="text-xs font-bold dark:text-white uppercase">{shortcut.description}</span>
                  <div className="flex gap-2">
                    {shortcut.keys.map((key, kIndex) => (
                      <kbd key={kIndex} className="px-2 py-1 bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-lg text-xs font-mono dark:text-white shadow-sm">
                        {key}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
