import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Undo2, Redo2, Trash2, Loader2, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { eur } from '../lib/format';
import { useCme } from '../context/CmeContext';
import { listPrezzarios } from '../services/prezzarioService';
import { runAgent } from '../services/agentService';
import type { AgentMessage } from '../types';


const SUGGESTIONS = [
  'Mostrami il totale per categoria',
  'Cambia il prefisso dei codici NVP da "NVP" a "NP"',
  'Quali elementi sono NON TROVATO?',
  'Imposta spese generali al 13% e utili al 10% su tutte le NVP',
];

// Assistente IA del progetto: esegue in autonomia modifiche sul computo in corso.
// Ogni comando è un'unica operazione annullabile (Annulla / Ripeti).
export const AgentPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { moduleTheme, showToast } = useApp();
  const { state, dispatch, getAllEffectiveResults, hierarchy } = useCme();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const chat = state.agentChat ?? [];
  const canUndo = (state.undoStack?.length ?? 0) > 0;
  const canRedo = (state.redoStack?.length ?? 0) > 0;

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat.length, busy]);

  async function send(textArg?: string) {
    const text = (textArg ?? input).trim();
    if (!text || busy) return;
    if (state.resultados.size === 0) { showToast('Apri o importa un computo prima di usare l\'assistente.', 'error'); return; }
    setInput('');
    setBusy(true);
    setStatus('Penso…');
    const userMsg: AgentMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    const history = chat;
    dispatch({ type: 'AGENT_ADD_MSG', payload: userMsg });
    try {
      const prezzari = await listPrezzarios().catch(() => []);
      const run = await runAgent({
        history, text, results: getAllEffectiveResults(), projectName: state.projectName, hierarchy, prezzari, onStatus: setStatus,
      });
      const n = run.changes.upsert.length, d = run.changes.remove.length;
      if (n + d > 0) dispatch({ type: 'APPLY_AGENT_CHANGES', payload: { ...run.changes, label: text.slice(0, 60) } });
      dispatch({
        type: 'AGENT_ADD_MSG',
        payload: {
          role: 'assistant', content: run.text, timestamp: new Date().toISOString(),
          meta: n + d > 0 ? { modificati: n, eliminati: d, prima: run.before, dopo: run.after } : undefined,
        },
      });
    } catch (e: any) {
      dispatch({ type: 'AGENT_ADD_MSG', payload: { role: 'assistant', content: `Errore: ${e?.message ?? e}`, timestamp: new Date().toISOString() } });
    } finally {
      setBusy(false);
      setStatus('');
    }
  }

  return (
    <aside className="w-[380px] shrink-0 flex flex-col border-l border-black/5 dark:border-white/5 bg-white dark:bg-[#101010] text-gray-900 dark:text-white">
      <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-black/5 dark:border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles size={16} style={{ color: moduleTheme.accent }} />
          <h3 className="text-[11px] font-bold uppercase tracking-widest">Assistente IA</h3>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => dispatch({ type: 'UNDO' })} disabled={!canUndo || busy}
            title={canUndo ? `Annulla: ${state.undoStack![state.undoStack!.length - 1].label}` : 'Niente da annullare'}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-25"
          ><Undo2 size={15} /></button>
          <button
            onClick={() => dispatch({ type: 'REDO' })} disabled={!canRedo || busy}
            title="Ripeti" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-25"
          ><Redo2 size={15} /></button>
          <button
            onClick={() => dispatch({ type: 'AGENT_CLEAR_CHAT' })} disabled={busy || chat.length === 0}
            title="Svuota la conversazione" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-25"
          ><Trash2 size={15} /></button>
          <button onClick={onClose} title="Chiudi" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"><X size={15} /></button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
        {chat.length === 0 && (
          <div className="space-y-3">
            <p className="text-[12px] opacity-60">
              Chiedimi qualsiasi modifica al computo: rinominare codici o WBS, cambiare quantità, sostituire voci, aggiornare le NVP, eliminare o aggiungere elementi. Ogni comando si può annullare.
            </p>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => void send(s)} className="block w-full text-left text-[11px] px-3 py-2 rounded-xl border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5">
                {s}
              </button>
            ))}
          </div>
        )}
        {chat.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[12px] whitespace-pre-wrap ${m.role === 'user' ? 'text-white' : 'bg-black/5 dark:bg-white/5'}`}
              style={m.role === 'user' ? { backgroundColor: moduleTheme.primary } : undefined}
            >
              {m.content}
              {m.meta && (
                <p className="mt-2 pt-2 border-t border-black/10 dark:border-white/10 text-[10px] font-bold opacity-70">
                  {m.meta.modificati} modificati{m.meta.eliminati ? ` · ${m.meta.eliminati} eliminati` : ''} · {eur(m.meta.prima)} → {eur(m.meta.dopo)}
                </p>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-[11px] opacity-60"><Loader2 size={13} className="animate-spin" />{status}</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-black/5 dark:border-white/5 flex gap-2 items-end">
        <textarea
          value={input} onChange={e => setInput(e.target.value)} rows={2} disabled={busy}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Scrivi un comando…"
          className="flex-1 resize-none bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2 text-[12px] outline-none"
        />
        <button
          onClick={() => void send()} disabled={busy || !input.trim()}
          className="p-3 rounded-xl text-white disabled:opacity-40" style={{ backgroundColor: moduleTheme.accent }} title="Invia"
        ><Send size={15} /></button>
      </div>
    </aside>
  );
};
