import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { X, FileSpreadsheet, Loader2, AlertTriangle, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useCme } from '../context/CmeContext';
import { NvpBuilderModal } from './NvpBuilderModal';
import { parseRevitExcel } from '../services/excelParser';
import { listPrezzarios, loadVoci } from '../services/prezzarioService';
import { buildModelResults, modelNameFromFile, planModel } from '../services/addModel';
import type { NvpAnalysis } from '../services/cmeBuilder';
import type { Elemento, PrezzarioRecord, ResultadoItem } from '../types';

interface ParsedModel { id: number; file: string; nome: string; elementos: Elemento[]; warnings: string[] }

// Unisce al computo in corso uno o più modelli Revit (es. FM e LUCE): stesso prezzario, totali sommati,
// categorie integrate e NVP unificate per tariffa. L'operazione è un'unica modifica annullabile.
export const AddModelDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { moduleTheme, showToast } = useApp();
  const { state, dispatch, getAllEffectiveResults } = useCme();
  const existing = useMemo(() => getAllEffectiveResults(), [getAllEffectiveResults]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [models, setModels] = useState<ParsedModel[]>([]);
  const [prezzari, setPrezzari] = useState<PrezzarioRecord[]>([]);
  const [prezzarioId, setPrezzarioId] = useState<number | null>(null);
  const [existingName, setExistingName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nvpAsk, setNvpAsk] = useState<{ elemento: Elemento; resolve: (a: NvpAnalysis) => void } | null>(null);

  const untagged = existing.some(r => !(r.modello || '').trim());
  const existingModels = useMemo(() => [...new Set(existing.map(r => (r.modello || '').trim()).filter(Boolean))], [existing]);

  // prezzario di partenza: quello con cui sono già calcolati i risultati del progetto
  useEffect(() => {
    listPrezzarios().then(list => {
      setPrezzari(list);
      const used = existing.map(r => r.originePrezzo);
      const match = list.find(p => used.includes(p.nome));
      setPrezzarioId((match ?? list[0])?.id ?? null);
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (untagged && !existingName) setExistingName(state.projectName?.trim() || 'Modello 1');
  }, [untagged]); // eslint-disable-line react-hooks/exhaustive-deps

  async function addFiles(files: File[]) {
    setError(null);
    const out: ParsedModel[] = [];
    let id = models.length;
    for (const f of files) {
      try {
        if (!f.name.toLowerCase().endsWith('.xlsx')) throw new Error('serve un file Excel (.xlsx)');
        const res = await parseRevitExcel(await f.arrayBuffer());
        if (!res.elementos.some(e => e.componenti)) throw new Error('non è una scheda CME (colonne RDP_WBS e CME_ELE)');
        out.push({ id: id++, file: f.name, nome: modelNameFromFile(f.name), elementos: res.elementos, warnings: res.warnings });
      } catch (e: any) {
        setError(`${f.name}: ${e.message}`);
      }
    }
    if (out.length) setModels(prev => [...prev, ...out]);
  }

  const names = models.map(m => m.nome.trim().toLowerCase());
  const duplicatedName = names.some((n, i) => !n || names.indexOf(n) !== i);
  const plans = useMemo(() => models.map(m => planModel(existing, { nome: m.nome.trim(), elementos: m.elementos })), [models, existing]);
  const canRun = models.length > 0 && !duplicatedName && prezzarioId !== null && (!untagged || existingName.trim() !== '') && !busy;

  async function run() {
    if (!canRun || prezzarioId === null) return;
    setError(null);
    try {
      setBusy('Caricamento del prezzario…');
      const voci = await loadVoci(prezzarioId);
      const prezzarioName = prezzari.find(p => p.id === prezzarioId)?.nome ?? '';

      let working: ResultadoItem[] = existing;
      const upsert = new Map<string, ResultadoItem>();
      const remove = new Set<string>();
      let tagName: string | undefined = untagged ? existingName.trim() : undefined;
      let nuovi = 0, nonTrovati = 0, sostituiti = 0;

      for (const m of models) {
        setBusy(`Elaborazione del modello ${m.nome}…`);
        const out = await buildModelResults({
          existing: working,
          model: { nome: m.nome.trim(), elementos: m.elementos },
          voci, prezzarioName, existingModelName: tagName,
          askNvp: pseudo => new Promise(resolve => setNvpAsk({ elemento: pseudo, resolve })),
        });
        tagName = undefined; // gli elementi senza modello si rinominano una volta sola
        out.retag.forEach(r => upsert.set(r.idElemento, r));
        out.remove.forEach(id => { remove.add(id); upsert.delete(id); });
        out.results.forEach(r => upsert.set(r.idElemento, r));
        working = [
          ...working.filter(r => !out.remove.includes(r.idElemento)).map(r => upsert.get(r.idElemento) ?? r),
          ...out.results,
        ];
        nuovi += out.results.length; nonTrovati += out.nonTrovati; sostituiti += out.plan.daSostituire;
      }

      const remList = [...remove].filter(id => existing.some(r => r.idElemento === id));
      dispatch({
        type: 'APPLY_AGENT_CHANGES',
        payload: { upsert: [...upsert.values()], remove: remList, label: `Aggiungi modello ${models.map(m => m.nome).join(', ')}` },
      });
      showToast(
        `${nuovi} elementi aggiunti${sostituiti ? ` (${sostituiti} sostituiti)` : ''}${nonTrovati ? ` · ${nonTrovati} NON TROVATO` : ''}. Annulla dall'assistente se serve.`,
        'success',
      );
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setBusy(null);
    }
  }

  const inputCls = 'bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-1.5 text-[12px] outline-none dark:text-white';

  if (nvpAsk) {
    return (
      <NvpBuilderModal
        elemento={nvpAsk.elemento}
        onConfirm={(valoreUnitario, originePrezzo, nvpDetails) => { nvpAsk.resolve({ valoreUnitario, originePrezzo, nvpDetails }); setNvpAsk(null); }}
        onSkip={() => { nvpAsk.resolve({ valoreUnitario: 0, originePrezzo: 'NVP — Non indicato', nvpDetails: null }); setNvpAsk(null); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={busy ? undefined : onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#141414] rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 dark:text-white"
      >
        <div className="flex items-center justify-between px-8 py-5 border-b border-black/10 dark:border-white/10">
          <h2 className="text-sm font-black uppercase tracking-tight">Aggiungi modello al computo</h2>
          <button onClick={onClose} disabled={!!busy} className="p-2 opacity-40 hover:opacity-100 rounded-full hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-20"><X size={18} /></button>
        </div>

        <div className="p-8 space-y-5">
          <p className="text-[12px] opacity-60">
            Importa un altro file Excel di Revit (es. FM, LUCE) nello stesso computo: gli importi si sommano, le categorie si
            integrano e le NVP si uniscono per tariffa. Se aggiungi un modello con lo stesso nome di uno già presente, lo sostituisce.
          </p>

          <input ref={fileRef} type="file" accept=".xlsx" multiple className="hidden"
            onChange={e => { const f = Array.from(e.target.files ?? []); e.target.value = ''; if (f.length) void addFiles(f); }} />
          <button
            onClick={() => fileRef.current?.click()} disabled={!!busy}
            className="w-full border-2 border-dashed border-black/15 dark:border-white/15 hover:border-[#E94560]/50 rounded-2xl p-6 flex items-center justify-center gap-3 text-[12px] opacity-80 disabled:opacity-40"
          ><FileSpreadsheet size={20} /> Seleziona uno o più file Excel (.xlsx)</button>

          {error && <p className="text-[12px] text-red-500">{error}</p>}

          {untagged && (
            <div className="rounded-xl bg-black/5 dark:bg-white/5 px-4 py-3 space-y-2">
              <p className="text-[11px] opacity-70">Gli elementi già presenti nel computo non hanno un modello. Come lo chiamiamo?</p>
              <input value={existingName} onChange={e => setExistingName(e.target.value)} className={`${inputCls} w-full`} placeholder="Nome del modello esistente" />
            </div>
          )}

          {models.map((m, i) => {
            const plan = plans[i];
            return (
              <div key={m.id} className="rounded-xl border border-black/10 dark:border-white/10 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={m.nome} onChange={e => setModels(prev => prev.map(x => (x.id === m.id ? { ...x, nome: e.target.value } : x)))}
                    disabled={!!busy} className={`${inputCls} flex-1 font-bold`} placeholder="Nome del modello"
                  />
                  <button onClick={() => setModels(prev => prev.filter(x => x.id !== m.id))} disabled={!!busy} className="p-2 opacity-40 hover:opacity-100"><X size={14} /></button>
                </div>
                <p className="text-[11px] opacity-60">{m.file} · {m.elementos.length} elementi</p>
                <ul className="text-[11px] space-y-0.5">
                  {plan.daSostituire > 0 && (
                    <li className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><AlertTriangle size={12} /> Sostituisce i {plan.daSostituire} elementi del modello "{m.nome}" già presente</li>
                  )}
                  <li>NVP nuove da analizzare: <b>{plan.nvpNuove.length}</b>{plan.nvpNuove.length ? ` (${plan.nvpNuove.slice(0, 4).join(', ')}${plan.nvpNuove.length > 4 ? '…' : ''})` : ''}</li>
                  <li>NVP già nel progetto (analisi riusata): <b>{plan.nvpRiusate.length}</b></li>
                </ul>
              </div>
            );
          })}
          {duplicatedName && <p className="text-[11px] text-red-500">I modelli devono avere nomi diversi e non vuoti.</p>}
          {existingModels.length > 0 && <p className="text-[10px] opacity-40">Modelli nel progetto: {existingModels.join(', ')}</p>}

          {models.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-bold uppercase tracking-widest opacity-50">Prezzario</label>
              <select
                value={prezzarioId ?? ''} onChange={e => setPrezzarioId(Number(e.target.value))} disabled={!!busy}
                className={`${inputCls} flex-1`}
              >
                {prezzari.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-8 py-5 border-t border-black/10 dark:border-white/10">
          {busy && <span className="mr-auto flex items-center gap-2 text-[11px] opacity-60"><Loader2 size={13} className="animate-spin" />{busy}</span>}
          <button onClick={onClose} disabled={!!busy} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 disabled:opacity-40">Annulla</button>
          <button
            onClick={() => void run()} disabled={!canRun}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-30"
            style={{ backgroundColor: moduleTheme.accent }}
          ><Plus size={13} /> Aggiungi al computo</button>
        </div>
      </motion.div>
    </div>
  );
};
