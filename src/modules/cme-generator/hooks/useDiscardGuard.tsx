import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useCme } from '../context/CmeContext';
import { useApp } from '../context/AppContext';
import { useSaveProject } from './useSaveProject';

// Avvisa prima di un'azione che farebbe perdere il computo in corso (uscita dal modulo,
// apertura/creazione di un altro progetto). Se non ci sono modifiche da perdere esegue subito.
export function useDiscardGuard() {
  const { state } = useCme();
  const { moduleTheme } = useApp();
  const { save, isSaving } = useSaveProject();
  const [open, setOpen] = useState(false);
  const pending = useRef<(() => void) | null>(null);

  const dirty = state.dirty || (state.elementos.length > 0 && !state.projectId);
  // Qualsiasi computo aperto (anche già salvato) chiede conferma: uscendo lo stato in corso viene chiuso
  const unsaved = dirty || state.elementos.length > 0 || state.resultados.size > 0;

  // Chiusura o ricarica della scheda del browser
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  const guard = useCallback((action: () => void) => {
    if (!unsaved) { action(); return; }
    pending.current = action;
    setOpen(true);
  }, [unsaved]);

  const close = () => { pending.current = null; setOpen(false); };
  const proceed = () => { const a = pending.current; close(); a?.(); };

  const dialog = open ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#141414] dark:text-white rounded-3xl shadow-2xl border border-black/10 dark:border-white/10 p-8 space-y-5">
        <div className="flex items-center gap-3">
          <AlertTriangle size={22} className="text-amber-500 shrink-0" />
          <h2 className="text-sm font-black uppercase tracking-tight">{dirty ? 'Modifiche non salvate' : 'Uscire dal computo?'}</h2>
        </div>
        <p className="text-[12px] opacity-70">
          {dirty
            ? <>Il computo in corso{state.projectName ? ` "${state.projectName}"` : ''} ha modifiche non salvate. Se esci ora andranno perse.</>
            : <>Stai per lasciare il computo{state.projectName ? ` "${state.projectName}"` : ''}. Dovrai riaprirlo dal Banco di Progetti.</>}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={close} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5">
            Resta qui
          </button>
          <button onClick={proceed} className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-red-500 border border-red-500/30 hover:bg-red-500/10">
            {dirty ? 'Esci senza salvare' : 'Esci'}
          </button>
          {dirty && <button
            disabled={isSaving}
            onClick={async () => { if (await save()) proceed(); }}
            className="px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white disabled:opacity-50"
            style={{ backgroundColor: moduleTheme.accent }}
          >
            {isSaving ? 'Salvataggio…' : 'Salva ed esci'}
          </button>}
        </div>
      </div>
    </div>
  ) : null;

  return { guard, dialog };
}
