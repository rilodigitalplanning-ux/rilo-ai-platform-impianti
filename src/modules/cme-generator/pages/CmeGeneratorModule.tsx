// src/modules/cme-generator/pages/CmeGeneratorModule.tsx
// Vista "Computo Metrico": il computo in lavorazione (caricamento → elaborazione →
// revisione → risultati). Il layout esterno (sidebar, intestazione, utente) è in
// components/layout/MainLayout.tsx.
import { useState, useEffect, useRef } from 'react';
import { Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { useCme } from '../context/CmeContext';
import { useApp } from '../context/AppContext';
import { SetupView } from './SetupView';
import { ProcessingView } from './ProcessingView';
import { ResultsView } from './ResultsView';
import { ReviewView } from './ReviewView';
import { ChatView } from './ChatView';
import { CmeSettingsPage } from './CmeSettingsPage';
import { listPrezzarios } from '../services/prezzarioService';
import { BYPASS_USER } from '../lib/currentUser';
import type { PrezzarioRecord } from '../types';

export function ComputoMetricoView() {
  const user = BYPASS_USER;
  const { moduleTheme, computoView: view, setComputoView: setView, prezzariVersion } = useApp();
  const { state } = useCme();
  // l'elaborazione termina in un callback creato prima dei risultati: serve lo stato più recente
  const stateRef = useRef(state);
  stateRef.current = state;
  const [activeTab, setActiveTab] = useState<'results' | 'chat'>('results');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Prezzari (caricati da Supabase, condivisi tra tutti gli utenti)
  const [prezzarios, setPrezzarios] = useState<PrezzarioRecord[]>([]);
  const [refPrezzarioId, setRefPrezzarioId] = useState<number | null>(null);
  const [targetPrezzarioId, setTargetPrezzarioId] = useState<number | null>(null);

  useEffect(() => {
    listPrezzarios()
      .then(list => {
        setPrezzarios(list);
        if (list.length > 0 && !refPrezzarioId) setRefPrezzarioId(list[0].id!);
        if (list.length > 0 && !targetPrezzarioId) setTargetPrezzarioId(list[list.length > 1 ? 1 : 0].id!);
      })
      .catch(() => {});
  }, [prezzariVersion]);

  const targetName = prezzarios.find(p => p.id === targetPrezzarioId)?.nome ?? 'Target';

  function handleElementSelect(id: string) {
    setSelectedElementId(id);
    setActiveTab('chat');
  }

  const NAV = [
    { id: 'setup',      label: '1 · Caricamento' },
    { id: 'processing', label: '2 · Elaborazione' },
    { id: 'review',     label: '3 · Revisione' },
    { id: 'results',    label: '4 · Risultati' },
  ] as const;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#0B1018] text-slate-900 dark:text-white">
      {/* ── Barra dei passi ── */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0B1018] shrink-0">
        <div className="flex gap-1">
          {NAV.map(step => (
            <button key={step.id}
              onClick={() => {
                if (step.id === 'results' && state.resultados.size === 0) return;
                if (step.id !== 'processing') setView(step.id);
              }}
              className={`px-2.5 py-1 rounded text-[12px] font-semibold transition-colors
                ${view === step.id ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'}`}
              style={view === step.id ? { boxShadow: `inset 0 -2px 0 ${moduleTheme.accent}` } : undefined}>
              {step.label}
            </button>
          ))}
        </div>

        {view === 'results' && (
          <>
            <div className="w-px h-4 bg-slate-200 dark:bg-white/15" />
            <div className="flex gap-1">
              {(['results', 'chat'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-2.5 py-1 rounded text-[12px] font-semibold transition-colors
                    ${activeTab === t ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'}`}>
                  {t === 'results' ? 'Risultati' : 'Chat IA'}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-3 ml-auto">

          {user.role === 'admin' && (
            <button
              onClick={() => setView('settings')}
              className={`p-1.5 rounded transition-colors ${view === 'settings' ? 'bg-slate-200 dark:bg-white/15 text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10'}`}
              title="Impostazioni"
            >
              <Settings size={16} />
            </button>
          )}
        </div>
      </div>

      {/* ── Corpo ── */}
      <div className="flex-1 flex overflow-hidden">
        <motion.div
          key={view}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col overflow-auto"
        >
          {view === 'setup' && (
            <SetupView
              user={user}
              prezzarios={prezzarios}
              refPrezzarioId={refPrezzarioId}
              setRefPrezzarioId={setRefPrezzarioId}
              targetPrezzarioId={targetPrezzarioId}
              setTargetPrezzarioId={setTargetPrezzarioId}
              onStartProcessing={() => setView('processing')}
              onGoToSettings={() => setView('settings')}
            />
          )}

          {view === 'processing' && (
            <ProcessingView
              targetPrezzarioId={targetPrezzarioId!}
              targetPrezzarioName={targetName}
              onDone={() => {
                // la revisione serve solo se ci sono voci da verificare (ALERT o NON TROVATO)
                const needsReview = [...stateRef.current.resultados.values()].some(r => r.status === 'ALERT' || r.status === 'NAO_ENCONTRADO');
                setView(needsReview ? 'review' : 'results');
              }}
            />
          )}

          {view === 'review' && (
            <ReviewView onFinish={() => setView('results')} />
          )}

          {view === 'results' && activeTab === 'results' && (
            <ResultsView onSelectElement={handleElementSelect} />
          )}

          {view === 'results' && activeTab === 'chat' && (
            <ChatView selectedId={selectedElementId} />
          )}

          {view === 'settings' && (
            <CmeSettingsPage user={user} prezzarios={prezzarios} setPrezzarios={setPrezzarios} />
          )}
        </motion.div>
      </div>
    </div>
  );
}
