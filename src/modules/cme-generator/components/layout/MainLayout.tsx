import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import {
  ChevronLeft, Sun, Moon, LogOut, Calculator, Database, BarChart3, ListOrdered, FolderKanban, Library, Save, Loader2, Sparkles, ListTree,
} from 'lucide-react';
import { useApp, type AppTab } from '../../context/AppContext';
import { BYPASS_USER } from '../../lib/currentUser';
import { useCme } from '../../context/CmeContext';
import { AgentPanel } from '../AgentPanel';
import { HierarchyDialog } from '../HierarchyDialog';
import { useDiscardGuard } from '../../hooks/useDiscardGuard';
import { useSaveProject } from '../../hooks/useSaveProject';
import { Toast } from '../../../cme-editor/components/Toast';
import { Logo } from '@/components/Logo';

function NavItem({
  icon, label, active = false, onClick, accentColor,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  accentColor: string;
}) {
  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-all border border-transparent hover:border-white/10"
      onClick={onClick}
    >
      <div
        className={`p-2 rounded ${active ? 'bg-white' : 'bg-white/5 text-white/60'}`}
        style={active ? { color: accentColor } : {}}
      >
        {icon}
      </div>
      <span className={`text-[10px] font-bold tracking-wider uppercase ${active ? 'text-white' : 'text-white/60'}`}>
        {label}
      </span>
      {active && <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full" />}
    </div>
  );
}

export const TABS: { id: AppTab; label: string; icon: React.ReactNode }[] = [
  { id: 'computo',        label: 'Computo Metrico',   icon: <Calculator size={18} /> },
  { id: 'consulta-bd',    label: 'Consulta BD',       icon: <Database size={18} /> },
  { id: 'analisi-prezzi', label: 'Analisi Prezzi',    icon: <BarChart3 size={18} /> },
  { id: 'elenco-prezzi',  label: 'Elenco Prezzi',     icon: <ListOrdered size={18} /> },
  { id: 'prezzari',       label: 'Prezzari',          icon: <Library size={18} /> },
  { id: 'banco-progetti', label: 'Banco di Progetti', icon: <FolderKanban size={18} /> },
];

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { darkMode, setDarkMode, moduleTheme, toastData, activeTab, setActiveTab } = useApp();
  const user = BYPASS_USER;
  const { state, totalAmount } = useCme();
  const { save, isSaving } = useSaveProject();
  const { guard, dialog } = useDiscardGuard();
  const [agentOpen, setAgentOpen] = useState(false);
  const [hierarchyOpen, setHierarchyOpen] = useState(false);
  const goModules = () => guard(() => navigate('/'));
  const hasProject = state.resultados.size > 0;

  return (
    <div className="flex h-screen bg-[#efefef] dark:bg-[#0A0A0A] font-sans text-[#5a5a5a] dark:text-[#F5F5F5] transition-colors duration-300">
      {/* Sidebar */}
      <aside
        className="w-64 text-white flex flex-col border-r border-white/5 shrink-0 z-20 transition-colors duration-300"
        style={{ backgroundColor: darkMode ? moduleTheme.dark : moduleTheme.primary }}
      >
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <Logo className="w-10 h-10 text-white" />
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase">CME Generator</h1>
            <p className="text-[10px] opacity-50">SISTEMA DI INGEGNERIA</p>
          </div>
        </div>

        <button
          onClick={goModules}
          className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all text-[10px] font-bold uppercase tracking-widest"
        >
          <ChevronLeft size={14} />
          Moduli
        </button>

        <nav className="flex-1 py-8 px-4 space-y-8 overflow-y-auto custom-scrollbar">
          <div>
            <p className="text-[10px] font-bold opacity-40 mb-4 tracking-widest">CME GENERATOR</p>
            <div className="space-y-1">
              {TABS.map(tab => (
                <NavItem
                  key={tab.id}
                  icon={tab.icon}
                  label={tab.label}
                  active={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  accentColor={moduleTheme.accent}
                />
              ))}
            </div>
          </div>
        </nav>

        {/* Footer: utente */}
        <div className="p-6 border-t border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold uppercase text-sm"
              style={{ backgroundColor: moduleTheme.accent }}
            >
              {(user.name || user.email || 'U').charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold leading-tight uppercase truncate">{user.name || user.email}</p>
              <p className="text-[9px] opacity-50 uppercase tracking-tighter truncate">{user.email}</p>
            </div>
            <button
              onClick={goModules}
              className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white flex-shrink-0"
              title="Esci"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Contenuto */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <header className="h-16 bg-white dark:bg-[#141414] border-b border-black/5 dark:border-white/5 flex items-center justify-between px-8 transition-colors shrink-0 z-30">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded flex items-center justify-center shadow-sm"
              style={{ backgroundColor: moduleTheme.accent }}
            >
              <Calculator size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest dark:text-white/40">CME Generator</p>
              <h2 className="text-[11px] font-bold uppercase tracking-tight dark:text-white">
                {TABS.find(t => t.id === activeTab)?.label ?? ''}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-5">
          {/* Progetto in corso: importo totale sempre visibile + stato di salvataggio */}
          {(hasProject || state.projectName) && (
            <div className="flex items-center gap-4">
              <div className="text-right leading-tight">
                <p className="text-[9px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 truncate max-w-[200px]">
                  {state.projectName || 'Progetto non salvato'}
                </p>
                <p className="text-[15px] font-black dark:text-white" style={{ color: moduleTheme.accent }} title="Importo totale del computo">
                  € {totalAmount.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              {hasProject && (
                <button
                  onClick={save}
                  disabled={isSaving || (!state.dirty && !!state.projectId)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all disabled:opacity-60 ${
                    state.dirty || !state.projectId ? 'text-white' : 'border border-black/10 dark:border-white/10 dark:text-white/60'
                  }`}
                  style={state.dirty || !state.projectId ? { backgroundColor: moduleTheme.accent } : undefined}
                  title={state.dirty || !state.projectId ? 'Salva il progetto' : 'Tutte le modifiche sono salvate'}
                >
                  {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {isSaving ? 'Salvataggio…' : state.dirty || !state.projectId ? 'Salva · modifiche non salvate' : 'Salvato'}
                </button>
              )}
            </div>
          )}
          {hasProject && (
            <button
              onClick={() => setHierarchyOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-[#efefef] dark:bg-white/5 border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 transition-all shadow-sm"
              title="Ordine e nomi dei livelli del progetto"
            >
              <ListTree size={14} />
              <span className="text-[9px] font-bold uppercase tracking-wider">Livelli</span>
            </button>
          )}
          <button
            onClick={() => setAgentOpen(o => !o)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all shadow-sm ${agentOpen ? 'text-white border-transparent' : 'bg-[#efefef] dark:bg-white/5 border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10'}`}
            style={agentOpen ? { backgroundColor: moduleTheme.accent } : undefined}
            title="Assistente IA del progetto"
          >
            <Sparkles size={14} />
            <span className="text-[9px] font-bold uppercase tracking-wider">Assistente IA</span>
          </button>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 transition-all shadow-sm"
            title={darkMode ? 'Modalità chiara' : 'Modalità scura'}
          >
            {darkMode ? (
              <>
                <Sun size={14} className="text-yellow-400" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Chiaro</span>
              </>
            ) : (
              <>
                <Moon size={14} className="opacity-60" />
                <span className="text-[9px] font-bold uppercase tracking-wider">Scuro</span>
              </>
            )}
          </button>
          </div>
        </header>

        {children}
      </main>

      {agentOpen && <AgentPanel onClose={() => setAgentOpen(false)} />}
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
