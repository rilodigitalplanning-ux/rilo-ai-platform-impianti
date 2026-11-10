import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { X, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCme } from '../context/CmeContext';
import { defaultHierarchy, defaultLabel, hierarchyPath, type HierarchyItem } from '../lib/hierarchy';

// Impostazione della gerarchia di voce del progetto: ordine, nome e attivazione dei livelli.
// Vale per tutto il progetto (tabella, Excel, XPWE, dashboard) e si salva insieme al progetto.
export const HierarchyDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { moduleTheme, showToast } = useApp();
  const { hierarchy, getAllEffectiveResults, dispatch } = useCme();
  const results = useMemo(() => getAllEffectiveResults(), [getAllEffectiveResults]);
  const [items, setItems] = useState<HierarchyItem[]>(() => hierarchy.map(h => ({ ...h })));

  const move = (i: number, d: -1 | 1) => setItems(prev => {
    const j = i + d;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  const patch = (i: number, p: Partial<HierarchyItem>) => setItems(prev => prev.map((x, k) => (k === i ? { ...x, ...p } : x)));

  const activeCount = items.filter(i => i.enabled).length;
  // anteprima: percorso del primo elemento che ha più livelli compilati
  const sample = useMemo(
    () => [...results].sort((a, b) => hierarchyPath(b, items).length - hierarchyPath(a, items).length)[0],
    [results, items],
  );
  const preview = sample ? hierarchyPath(sample, items) : [];

  function save() {
    const cleaned = items.map(i => ({ ...i, label: i.label.trim() || defaultLabel(i.id) }));
    const def = defaultHierarchy(results);
    const isDefault = cleaned.length === def.length && cleaned.every((c, k) => c.id === def[k].id && c.label === def[k].label && c.enabled);
    dispatch({ type: 'SET_HIERARCHY', payload: isDefault ? undefined : cleaned });
    showToast('Livelli aggiornati. Salva il progetto per conservarli.', 'success');
    onClose();
  }

  const inputCls = 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-[12px] outline-none dark:text-white w-full';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#141414] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 dark:text-white"
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-black/10 dark:border-white/10">
          <h2 className="text-sm font-black uppercase tracking-tight">Livelli del progetto</h2>
          <button onClick={onClose} className="p-2 opacity-40 hover:opacity-100 rounded-full hover:bg-black/5 dark:hover:bg-white/5"><X size={18} /></button>
        </div>

        <div className="p-8 space-y-5">
          <p className="text-[12px] opacity-60">
            Scegli l'ordine dei livelli e il nome con cui compaiono. Il primo livello è il più alto
            (in PriMus la supercategoria). Vale per tutto il progetto: tabella, Excel, XPWE e dashboard.
          </p>

          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={it.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${it.enabled ? 'border-black/10 dark:border-white/10' : 'border-dashed border-black/10 dark:border-white/10 opacity-50'}`}>
                <span className="w-5 text-center text-[10px] font-black opacity-40">{it.enabled ? items.slice(0, i + 1).filter(x => x.enabled).length : '–'}</span>
                <div className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20" title="Sposta su"><ArrowUp size={13} /></button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 disabled:opacity-20" title="Sposta giù"><ArrowDown size={13} /></button>
                </div>
                <span className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-widest opacity-50">{defaultLabel(it.id)}</span>
                <input
                  value={it.label} onChange={e => patch(i, { label: e.target.value })} className={inputCls}
                  placeholder={defaultLabel(it.id)} title="Nome mostrato nei documenti"
                />
                <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest cursor-pointer shrink-0">
                  <input
                    type="checkbox" checked={it.enabled} onChange={e => patch(i, { enabled: e.target.checked })}
                    disabled={it.enabled && activeCount === 1}
                  /> attivo
                </label>
              </li>
            ))}
          </ul>

          <div className="rounded-xl bg-black/5 dark:bg-white/5 px-4 py-3">
            <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 mb-1">Anteprima su un elemento</p>
            {preview.length ? (
              <p className="text-[12px] font-bold">{preview.join('  ›  ')}</p>
            ) : (
              <p className="text-[12px] opacity-50">—</p>
            )}
            <p className="text-[10px] opacity-50 mt-1">
              {activeItems(items).map(i => i.label || defaultLabel(i.id)).join('  ›  ')}
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-8 py-5 border-t border-black/10 dark:border-white/10">
          <button
            onClick={() => setItems(defaultHierarchy(results))}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"
          ><RotateCcw size={12} /> Predefinita</button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5">Annulla</button>
            <button onClick={save} className="px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white" style={{ backgroundColor: moduleTheme.accent }}>Applica</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

const activeItems = (h: HierarchyItem[]) => h.filter(i => i.enabled);
