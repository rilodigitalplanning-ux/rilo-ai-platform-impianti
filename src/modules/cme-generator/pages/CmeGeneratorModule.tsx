// src/modules/cme-generator/pages/CmeGeneratorModule.tsx
// Vista "Computo Metrico": il computo in lavorazione (caricamento → elaborazione →
// revisione → risultati). Il layout esterno (sidebar, intestazione, utente) è in
// components/layout/MainLayout.tsx.
import React, { useState, useEffect } from 'react';
import { Brain, Settings } from 'lucide-react';
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
import { getExamplesCount } from '../services/examplesService';
import { BYPASS_USER } from '../lib/currentUser';
import type { PrezzarioRecord } from '../types';

export function ComputoMetricoView() {
  const user = BYPASS_USER;
  const { moduleTheme, computoView: view, setComputoView: setView, prezzariVersion } = useApp();
  const { state } = useCme();
  const [activeTab, setActiveTab] = useState<'results' | 'chat'>('results');
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [examplesCount, setExamplesCount] = useState(0);

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
    getExamplesCount().then(setExamplesCount).catch(() => {});
  }, [prezzariVersion]);

  const refName    = prezzarios.find(p => p.id === refPrezzarioId)?.nome ?? 'DEI';
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
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#060A12] text-gray-900 dark:text-white">
      {/* ── Barra dei passi ── */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-white/5 bg-white dark:bg-[#080C14] shrink-0">
        <div className="flex gap-1">
          {NAV.map(step => (
            <button key={step.id}
              onClick={() => {
                if (step.id === 'results' && state.resultados.size === 0) return;
                if (step.id !== 'processing') setView(step.id);
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all
                ${view === step.id ? 'border' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:text-white/60'}`}
              style={view === step.id ? {
                backgroundColor: `${moduleTheme.accent}33`,
                color: moduleTheme.accent,
                borderColor: `${moduleTheme.accent}4d`,
              } : undefined}>
              {step.label}
            </button>
          ))}
        </div>

        {view === 'results' && (
          <>
            <div className="w-px h-5 bg-gray-200 dark:bg-white/10" />
            <div className="flex gap-1">
              {(['results', 'chat'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold tracking-widest uppercase transition-all
                    ${activeTab === t ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-400 dark:text-white/30 hover:text-gray-600 dark:text-white/60'}`}>
                  {t === 'results' ? 'Risultati' : 'Chat IA'}
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 text-xs text-gray-500 dark:text-white/40">
            <Brain size={12} style={{ color: `${moduleTheme.accent}99` }} />
            <span>{examplesCount.toLocaleString('it-IT')} esempi</span>
          </div>

          {user.role === 'admin' && (
            <button
              onClick={() => setView('settings')}
              className={`p-2 rounded-lg transition-colors ${view === 'settings' ? 'bg-gray-200 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-500 dark:text-white/40 hover:text-gray-800 dark:hover:text-white/80 hover:bg-gray-100 dark:bg-white/5'}`}
              title="Impostazioni"
            >
              <Settings size={18} />
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
              refPrezzarioId={refPrezzarioId!}
              targetPrezzarioId={targetPrezzarioId!}
              refPrezzarioName={refName}
              targetPrezzarioName={targetName}
              onDone={() => setView('review')}
            />
          )}

          {view === 'review' && (
            <ReviewView
              user={user}
              onFinish={() => { setView('results'); getExamplesCount().then(setExamplesCount).catch(() => {}); }}
              onSkip={() => setView('results')}
            />
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
