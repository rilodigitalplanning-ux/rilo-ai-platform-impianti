import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft, FileSpreadsheet, Table2, Sun, Moon, LogOut, Undo2, Redo2 } from 'lucide-react';
import { useApp, type AppTab } from '../../context/AppContext';
import { Toast } from '../Toast';
import { Logo } from '@/components/Logo';

function NavItem({
  icon,
  label,
  active = false,
  onClick,
  accentColor = '#1f7a8c',
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
  accentColor?: string;
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

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const { darkMode, setDarkMode, moduleTheme, toastData, activeTab, setActiveTab, undo, redo, canUndo, canRedo } = useApp();

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('cablefill_user') ?? 'null'); } catch { return null; }
  })();

  const tabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
    { id: 'lettura', label: 'Lettura Schemi', icon: <FileSpreadsheet size={18} /> },
    { id: 'risultati', label: 'Tabella Risultati', icon: <Table2 size={18} /> },
  ];

  return (
    <div className="flex h-screen bg-[#efefef] dark:bg-[#0A0A0A] font-sans text-[#5a5a5a] dark:text-[#F5F5F5] transition-colors duration-300">
      {/* Sidebar */}
      <aside
        className="w-64 text-white flex flex-col border-r border-white/5 shrink-0 z-20 transition-colors duration-300"
        style={{ backgroundColor: darkMode ? moduleTheme.dark : moduleTheme.primary }}
      >
        {/* Header */}
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <Logo className="w-10 h-10 text-white" />
          <div>
            <h1 className="text-xs font-bold tracking-wider uppercase leading-tight">Relazione di Calcolo Elettrico</h1>
            <p className="text-[10px] opacity-50">SISTEMA DI INGEGNERIA</p>
          </div>
        </div>

        {/* Back to module selector */}
        <button
          onClick={() => navigate('/')}
          className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all text-[10px] font-bold uppercase tracking-widest"
        >
          <ChevronLeft size={14} />
          Moduli
        </button>

        {/* Navigation */}
        <nav className="flex-1 py-8 px-4 space-y-8 overflow-y-auto custom-scrollbar">
          <div>
            <p className="text-[10px] font-bold opacity-40 mb-4 tracking-widest">NAVIGAZIONE</p>
            <div className="space-y-1">
              {tabs.map(tab => (
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

        {/* Footer: user */}
        <div className="p-6 border-t border-white/10">
          {user && (
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
                onClick={() => { localStorage.removeItem('cablefill_user'); navigate('/'); }}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white flex-shrink-0"
                title="Logout"
              >
                <LogOut size={15} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-[#141414] border-b border-black/5 dark:border-white/5 flex items-center justify-between px-8 transition-colors shrink-0 z-30">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded flex items-center justify-center shadow-sm"
              style={{ backgroundColor: moduleTheme.accent }}
            >
              <Table2 size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest dark:text-white/40">
                Relazione di Calcolo Elettrico
              </p>
              <h2 className="text-[11px] font-bold uppercase tracking-tight dark:text-white">
                {tabs.find(tab => tab.id === activeTab)?.label ?? ''}
              </h2>
            </div>

            <div className="flex items-center gap-1 ml-2 pl-3 border-l border-black/10 dark:border-white/10">
              <button
                onClick={undo}
                disabled={!canUndo}
                title="Annulla (Ctrl+Z)"
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors dark:text-white"
              >
                <Undo2 size={16} />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                title="Ripeti (Ctrl+Shift+Z)"
                className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors dark:text-white"
              >
                <Redo2 size={16} />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-6">
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

      {/* Toast */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {toastData && <Toast key="toast" message={toastData.message} type={toastData.type} />}
        </AnimatePresence>
      </div>
    </div>
  );
};
