import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import {
  Sun, Moon, LogOut, Calculator, Database, BarChart3, ListOrdered, FolderKanban, Library, Save, Loader2, Sparkles, ListTree,
} from 'lucide-react';
import { useApp, type AppTab } from '../../context/AppContext';
import { BYPASS_USER } from '../../lib/currentUser';
import { useCme } from '../../context/CmeContext';
import { AgentPanel } from '../AgentPanel';
import { HierarchyDialog } from '../HierarchyDialog';
import { useDiscardGuard } from '../../hooks/useDiscardGuard';
import { useSaveProject } from '../../hooks/useSaveProject';
import { eur } from '../../lib/format';
import { Toast } from '../../../cme-editor/components/Toast';
import { Logo } from '@/components/Logo';

export const TABS: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'computo',        label: 'Computo',        icon: <Calculator size={14} /> },
  { id: 'consulta-bd',    label: 'Consulta BD',    icon: <Database size={14} /> },
  { id: 'analisi-prezzi', label: 'Analisi prezzi', icon: <BarChart3 size={14} /> },
  { id: 'elenco-prezzi',  label: 'Elenco prezzi',  icon: <ListOrdered size={14} /> },
  { id: 'prezzari',       label: 'Prezzari',       icon: <Library size={14} /> },
  { id: 'banco-progetti', label: 'Progetti',       icon: <FolderKanban size={14} /> },
];

const barBtn = 'flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-semibold transition-colors';
const barBtnIdle = 'border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10';

// Struttura "Ledger": barra superiore con logo e sezioni, barra del progetto con importo e azioni, contenuto a tutta larghezza
export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { darkMode, setDarkMode, moduleTheme, toastData, activeTab, setActiveTab, hierarchyOpen, setHierarchyOpen } = useApp();
  const user = BYPASS_USER;
  const { state, totalAmount } = useCme();
  const { save, isSaving } = useSaveProject();
  const { guard, dialog } = useDiscardGuard();
  const [agentOpen, setAgentOpen] = useState(false);
  const goModules = () => guard(() => navigate('/'));
  const hasProject = state.resultados.size > 0;
  const unsaved = state.dirty || !state.projectId;

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-[#0B1018] font-sans text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {/* Barra superiore */}
      <header
        className="h-11 shrink-0 flex items-center gap-1 px-3 text-white z-30"
        style={{ backgroundColor: darkMode ? moduleTheme.dark : moduleTheme.primary }}
      >
        <button onClick={goModules} className="flex items-center gap-2 pr-3 mr-1 border-r border-white/20 h-7" title="Torna ai moduli">
          <Logo className="h-6 w-auto" />
        </button>
        <span className="hidden md:block text-[10px] uppercase tracking-[0.18em] opacity-60 mr-3">CME Generator</span>
        <nav className="flex items-center gap-0.5 overflow-x-auto">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-[12px] font-semibold whitespace-nowrap transition-colors ${active ? 'bg-white' : 'text-white/80 hover:bg-white/10'}`}
                style={active ? { color: moduleTheme.primary } : undefined}
              >
                {tab.icon}{tab.label}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={goModules} className="px-2.5 py-1 rounded text-[11px] font-semibold text-white/80 hover:bg-white/10" title="Torna ai moduli">Moduli</button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-1.5 rounded hover:bg-white/10 text-white/80"
            title={darkMode ? 'Modalità chiara' : 'Modalità scura'}
            aria-label={darkMode ? 'Modalità chiara' : 'Modalità scura'}
          >
            {darkMode ? <Sun size={15} className="text-yellow-300" /> : <Moon size={15} />}
          </button>
          <div className="flex items-center gap-2 pl-2 ml-1 border-l border-white/20">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold uppercase"
              style={{ backgroundColor: moduleTheme.accent }}
              title={user.email}
            >
              {(user.name || user.email || 'U').charAt(0)}
            </div>
            <button onClick={goModules} className="p-1.5 rounded hover:bg-white/10 text-white/70" title="Esci" aria-label="Esci">
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Barra del progetto: nome, stato, importo sempre visibile e azioni */}
      {(hasProject || state.projectName) && (
        <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0E1522]">
          <span className="text-[14px] font-bold truncate max-w-[320px]" title={state.projectName || undefined}>
            {state.projectName || 'Progetto non salvato'}
          </span>
          {hasProject && unsaved && <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">non salvato</span>}
          {hasProject && <span className="text-[12px] text-slate-500 dark:text-slate-400">{state.resultados.size.toLocaleString('it-IT')} elementi</span>}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[16px] font-bold font-mono tabular-nums" style={{ color: moduleTheme.accent }} title="Importo totale del computo">
              {eur(totalAmount)}
            </span>
            {hasProject && (
              <button onClick={() => setHierarchyOpen(true)} className={`${barBtn} ${barBtnIdle}`} title="Ordine e nomi dei livelli del progetto">
                <ListTree size={13} /> Livelli
              </button>
            )}
            <button
              onClick={() => setAgentOpen(o => !o)}
              className={`${barBtn} ${agentOpen ? 'text-white border-transparent' : barBtnIdle}`}
              style={agentOpen ? { backgroundColor: moduleTheme.accent } : undefined}
              title="Assistente IA del progetto"
            >
              <Sparkles size={13} /> Assistente IA
            </button>
            {hasProject && (
              <button
                onClick={save}
                disabled={isSaving || (!state.dirty && !!state.projectId)}
                className={`${barBtn} disabled:opacity-60 ${unsaved ? 'text-white border-transparent' : barBtnIdle}`}
                style={unsaved ? { backgroundColor: moduleTheme.primary } : undefined}
                title={unsaved ? 'Salva il progetto' : 'Tutte le modifiche sono salvate'}
              >
                {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                {isSaving ? 'Salvataggio…' : unsaved ? 'Salva' : 'Salvato'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden relative">{children}</main>
        {agentOpen && <AgentPanel onClose={() => setAgentOpen(false)} />}
      </div>

      {hierarchyOpen && <HierarchyDialog onClose={() => setHierarchyOpen(false)} />}

      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {toastData && <Toast key="toast" message={toastData.message} type={toastData.type} />}
        </AnimatePresence>
      </div>
      {dialog}
    </div>
  );
};
