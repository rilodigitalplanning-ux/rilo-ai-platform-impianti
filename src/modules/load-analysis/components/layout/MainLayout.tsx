import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'motion/react';
import { ChevronLeft, LayoutDashboard, Layers, BarChart2, Sun, Moon, LogOut, Save, Folder } from 'lucide-react';
import { useApp, type AppTab } from '../../context/AppContext';
import { Toast } from '../Toast';
import { AIChat } from '../AIChat';
import { Logo } from '@/components/Logo';

function NavItem({
  icon,
  label,
  active = false,
  onClick,
  accentColor = '#2d6a4f',
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
  const { darkMode, setDarkMode, moduleTheme, toastData, activeTab, setActiveTab, currentProject, showToast } = useApp();

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('cablefill_user') ?? 'null'); } catch { return null; }
  })();

  const tabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Panoramica', icon: <LayoutDashboard size={18} /> },
    { id: 'zones', label: 'Zone / Circuiti', icon: <Layers size={18} /> },
    { id: 'results', label: 'Risultati', icon: <BarChart2 size={18} /> },
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
            <h1 className="text-sm font-bold tracking-wider uppercase">Load Analysis</h1>
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

          {/* Current project info */}
          {currentProject && (
            <div>
              <p className="text-[10px] font-bold opacity-40 mb-4 tracking-widest">PROGETTO ATTIVO</p>
              <div className="px-3 py-2 rounded bg-white/5 border border-white/10">
                <div className="flex items-center gap-2">
                  <Folder size={14} className="text-white/50 shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-wider truncate">{currentProject.name}</span>
                </div>
              </div>
            </div>
          )}
        </nav>

        {/* Footer: user + actions */}
        <div className="p-6 border-t border-white/10">
          {/* Save + dark mode */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => showToast('Progetto salvato', 'success')}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white transition-all"
              style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})` }}
            >
              <Save size={13} />
              Salva
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-all text-white"
            >
              {darkMode ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>

          {/* User info */}
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
        {children}
      </main>

      {/* Toast */}
      <div className="fixed bottom-6 right-6 z-50">
        <AnimatePresence>
          {toastData && <Toast key="toast" message={toastData.message} type={toastData.type} />}
        </AnimatePresence>
      </div>

      {/* AI Chat */}
      <AIChat />
    </div>
  );
};
