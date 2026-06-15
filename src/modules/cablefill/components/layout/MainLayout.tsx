import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useApp } from '../../context/AppContext';
import { useProject } from '../../context/ProjectContext';
import { TRANSLATIONS } from '../../constants';
// Icons
import {
  LayoutDashboard, Layers, CircleDot, Database, ChevronLeft, Save, Folder, LogOut, Sun, Moon, Keyboard, Plus, Zap, User as UserIcon, X, Download, FileText, Globe, GitBranch
} from 'lucide-react';
import { Cable, StandardStructure, TopologyCircuit, TopologyProjectConfig } from '../../types';
import { Toast } from '../Toast';
import { Logo } from '../Logo';
import { AIChat } from '../AIChat';
import { ReportModal } from '../ReportModal';
import { ShortcutsModal } from '../ShortcutsModal';
import { TopologyModal } from '../topology/TopologyModal';
import { supabase } from '../../lib/supabase';
import { motion, AnimatePresence } from 'motion/react';

interface MainLayoutProps {
  children: React.ReactNode;
  isShortcutsModalOpen: boolean;
  setIsShortcutsModalOpen: (open: boolean) => void;
  isReportModalOpen: boolean;
  setIsReportModalOpen: (open: boolean) => void;
  customCables: Cable[];
  customStructures: StandardStructure[];
}

function NavItem({ icon, label, active = false, onClick, accentColor = '#81292C' }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void, accentColor?: string }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer transition-all border border-transparent hover:border-white/10`} onClick={onClick}>
      <div 
        className={`p-2 rounded ${active ? 'bg-white' : 'bg-white/5 text-white/60'}`}
        style={active ? { color: accentColor } : {}}
      >
        {icon}
      </div>
      <span className={`text-[10px] font-bold tracking-wider uppercase ${active ? 'text-white' : 'text-white/60'}`}>{label}</span>
      {active && <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full"></div>}
    </div>
  );
}

export const MainLayout: React.FC<MainLayoutProps> = ({ 
  children, 
  isShortcutsModalOpen, 
  setIsShortcutsModalOpen,
  isReportModalOpen,
  setIsReportModalOpen,
  customCables,
  customStructures
}) => {
  const navigate = useNavigate();
  const { darkMode, setDarkMode, activeTab, setActiveTab, moduleTheme, toastData, showToast } = useApp();
  const { user, setUser } = useAuth();
  const {
    projects,
    activeProject,
    activeProjectId,
    setActiveProjectId,
    savedProjects,
    loadProject,
    saveProject,
    addNewProject,
    addProjectsFromTopology,
    deleteProject,
    renameProject
  } = useProject();

  const [isTopologyModalOpen, setIsTopologyModalOpen] = useState(false);

  const handleTopologyConfirm = (circuits: TopologyCircuit[], config: TopologyProjectConfig) => {
    addProjectsFromTopology(circuits, config);
    showToast(`${circuits.length} circuito(s) criado(s) com sucesso!`, 'success');
  };

  const t = TRANSLATIONS;

  if (!activeProject) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f5] dark:bg-[#0a0a0a]">
        <div className="text-sm font-bold animate-pulse" style={{ color: moduleTheme.accent }}>CARICAMENTO PROGETTO...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#efefef] dark:bg-[#0A0A0A] font-sans text-[#5a5a5a] dark:text-[#F5F5F5] transition-colors duration-300">
      {/* Sidebar */}
      <aside
        className="w-64 text-white flex flex-col border-r border-white/5 shrink-0 z-20 transition-colors duration-300"
        style={{ backgroundColor: darkMode ? moduleTheme.dark : moduleTheme.primary }}
      >
        <div className="p-6 flex items-center gap-3 border-b border-white/10">
          <Logo className="w-10 h-10 text-white dark:text-[#6A1B1B]" />
          <div>
            <h1 className="text-sm font-bold tracking-wider uppercase">CableFill Calculator</h1>
            <p className="text-[10px] opacity-50">SISTEMA DI INGEGNERIA</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/')}
          className="mx-4 mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-all text-[10px] font-bold uppercase tracking-widest"
        >
          <ChevronLeft size={14} />
          Moduli
        </button>

        <nav className="flex-1 py-8 px-4 space-y-8 overflow-y-auto custom-scrollbar">
          <div>
            <p className="text-[10px] font-bold opacity-40 mb-4 tracking-widest">{t.sidebar.overview}</p>
            <div className="space-y-1">
              <NavItem 
                icon={<LayoutDashboard size={18} />} 
                label={t.sidebar.overview} 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')}
                accentColor={moduleTheme.accent}
              />
              <NavItem 
                icon={<Layers size={18} />} 
                label={t.sidebar.cableTrays} 
                active={activeTab === 'trays'} 
                onClick={() => setActiveTab('trays')}
                accentColor={moduleTheme.accent}
              />
              <NavItem 
                icon={<CircleDot size={18} />} 
                label={t.sidebar.conduits} 
                active={activeTab === 'conduits'} 
                onClick={() => setActiveTab('conduits')}
                accentColor={moduleTheme.accent}
              />
              <NavItem 
                icon={<Zap size={18} />} 
                label={t.sidebar.cables} 
                active={activeTab === 'cables'} 
                onClick={() => setActiveTab('cables')}
                accentColor={moduleTheme.accent}
              />
              {user?.role === 'admin' && (
                <NavItem 
                  icon={<UserIcon size={18} />} 
                  label={t.userManagement.title} 
                  active={activeTab === 'users'} 
                  onClick={() => setActiveTab('users')}
                  accentColor={moduleTheme.accent}
                />
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold opacity-40 mb-4 tracking-widest">{t.sidebar.projectManagement}</p>
            <div className="space-y-1">
              <NavItem 
                icon={<Database size={18} />} 
                label={t.sidebar.database} 
                active={activeTab === 'database'} 
                onClick={() => setActiveTab('database')}
                accentColor={moduleTheme.accent}
              />
            </div>
          </div>
        </nav>

        <div className="p-6 border-t border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/10 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden">
              <div
              className="w-full h-full flex items-center justify-center text-white font-bold uppercase"
              style={{ backgroundColor: moduleTheme.accent }}
            >
                {(user?.name || user?.email || 'U').charAt(0)}
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold leading-tight uppercase truncate">{user?.name || user?.email}</p>
              <p className="text-[9px] opacity-50 uppercase tracking-tighter truncate">{user?.email}</p>
            </div>
          </div>
          <button 
            onClick={() => setIsShortcutsModalOpen(true)}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white flex-shrink-0"
            title={t.misc.keyboardShortcuts}
          >
            <Keyboard size={18} />
          </button>
          <button 
            onClick={async () => {
              try {
                await supabase.auth.signOut();
              } catch (e) {
                // Ignore
              } finally {
                setUser(null);
                localStorage.removeItem('cablefill_user');
              }
            }}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/40 hover:text-white flex-shrink-0"
            title={t.auth.logout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-[#141414] border-b border-black/5 dark:border-white/5 flex items-center justify-between px-8 transition-colors shrink-0 z-30">
          <div className="flex items-center gap-3">
            <div
              className="w-7 h-7 rounded flex items-center justify-center shadow-sm"
              style={{ backgroundColor: moduleTheme.accent }}
            >
              <Layers size={14} className="text-white" />
            </div>
            <div>
              <p className="text-[9px] font-bold opacity-40 uppercase tracking-widest">
                {t.title}
              </p>
              <h2 className="text-[11px] font-bold uppercase tracking-tight dark:text-white">
                {activeTab === 'dashboard' ? t.sidebar.overview : 
                 activeTab === 'trays' ? t.sidebar.cableTrays : 
                 activeTab === 'conduits' ? t.sidebar.conduits : 
                 activeTab === 'cables' ? t.sidebar.cables : 
                 activeTab === 'database' ? t.sidebar.database : 
                 activeTab === 'users' ? t.userManagement.title : 
                 t.sidebar.overview}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button 
              onClick={() => setDarkMode(!darkMode)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/10 transition-all shadow-sm"
              title={darkMode ? t.header.lightMode : t.header.darkMode}
            >
              {darkMode ? (
                <>
                  <Sun size={14} className="text-yellow-400" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">{t.header.lightMode}</span>
                </>
              ) : (
                <>
                  <Moon size={14} className="opacity-60" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">{t.header.darkMode}</span>
                </>
              )}
            </button>
            
            <button 
              onClick={() => saveProject(showToast, t)}
              className="relative px-6 py-2.5 rounded-xl text-[10px] font-bold text-white active:scale-95 transition-all flex items-center gap-2 overflow-hidden group"
              style={{
                background: `linear-gradient(135deg, ${moduleTheme.primary}, ${moduleTheme.accent})`,
                boxShadow: `0 4px 15px ${moduleTheme.primary}40`,
              }}
            >
              <Save size={14} className="relative z-10" />
              <span className="relative z-10">{t.preview.saveProject}</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            </button>

            <div id="export-portal" className="flex items-center"></div>
          </div>
        </header>

        {/* Project Tabs - Always Visible */}
        <div className="bg-white dark:bg-[#141414] border-b border-black/5 dark:border-white/5 px-8 flex items-center gap-6 overflow-x-auto custom-scrollbar transition-colors shrink-0">
          <div className="flex items-center gap-2 border-r border-black/5 dark:border-white/5 pr-6 py-4 shrink-0">
            <Folder size={14} className="opacity-40" />
            <span className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{t.sidebar.projectManagement}</span>
          </div>
          <div className="flex items-center gap-3">
            {projects.map(p => (
              <div key={p.id} className="flex items-center group">
                <div 
                  className={`px-6 py-4 transition-all relative flex items-center gap-2 ${
                    activeProjectId === p.id 
                      ? 'text-[var(--module-accent)]' 
                      : 'text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white'
                  }`}
                  style={{ '--module-accent': moduleTheme.accent } as React.CSSProperties}
                >
                  {activeProjectId === p.id ? (
                    <input 
                      type="text"
                      value={p.name}
                      onChange={(e) => renameProject(p.id, e.target.value.toUpperCase())}
                      className="bg-transparent border-none outline-none focus:ring-0 p-0 text-[10px] font-bold tracking-widest uppercase w-24"
                      autoFocus
                    />
                  ) : (
                    <button 
                      onClick={() => setActiveProjectId(p.id)}
                      className="text-[10px] font-bold tracking-widest uppercase"
                    >
                      {p.name}
                    </button>
                  )}
                  {activeProjectId === p.id && (
                    <motion.div 
                      layoutId="activeProjectTab"
                      className="absolute bottom-0 left-0 w-full h-[2px] z-10"
                      style={{ backgroundColor: moduleTheme.accent }}
                    />
                  )}
                </div>
                {projects.length > 1 && (
                  <button 
                    onClick={() => deleteProject(p.id)}
                    className={`p-1.5 transition-all rounded hover:bg-white/10 ${
                      activeProjectId === p.id ? 'opacity-100 mr-2' : 'opacity-0 group-hover:opacity-100'
                    }`}
                    style={{ color: moduleTheme.accent }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => addNewProject(t)}
              className="p-4 rounded-xl text-white/60 hover:text-white transition-all relative overflow-hidden group"
              style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}80, ${moduleTheme.accent}80)` }}
              title={t.preview.newProject}
            >
              <Plus size={18} className="relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
            </button>
            <button
              onClick={() => setIsTopologyModalOpen(true)}
              className="p-4 rounded-xl text-white/60 hover:text-white transition-all relative overflow-hidden group"
              style={{ background: `linear-gradient(135deg, ${moduleTheme.primary}80, ${moduleTheme.accent}80)` }}
              title="Nuovo Progetto da Topologia"
            >
              <GitBranch size={18} className="relative z-10" />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
            </button>
          </div>
        </div>

        {/* Dynamic Content */}
        <AnimatePresence mode="wait">
          {children}
        </AnimatePresence>

      </main>

      <AIChat accentColor={moduleTheme.accent} darkMode={darkMode} />
      <Toast data={toastData} />
      {isShortcutsModalOpen && (
        <ShortcutsModal
          isOpen={isShortcutsModalOpen}
          onClose={() => setIsShortcutsModalOpen(false)}
          t={t}
        />
      )}
      <TopologyModal
        isOpen={isTopologyModalOpen}
        onClose={() => setIsTopologyModalOpen(false)}
        onConfirm={handleTopologyConfirm}
        darkMode={darkMode}
      />
    </div>
  );
};
