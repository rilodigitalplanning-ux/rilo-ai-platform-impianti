import React, { useState, useEffect } from 'react';
import { Database, Plus, Folder, FolderOpen, Trash2, ChevronLeft, ChevronRight, Layers, CircleDot, PlayCircle, LayoutGrid, List } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useApp } from '../../context/AppContext';
import { TRANSLATIONS } from '../../constants';
import { motion, AnimatePresence } from 'motion/react';

export const DatabaseView = () => {
  const { setActiveTab } = useApp();
  const t = TRANSLATIONS;
  const {
    projectGroups,
    savedProjects,
    addNewProject,
    deleteSavedProject,
    deleteProjectGroup,
    loadProject,
    loadAllInGroup,
  } = useProject();

  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    try { return (localStorage.getItem('db-view-mode') as 'grid' | 'list') || 'list'; } catch { return 'list'; }
  });
  useEffect(() => {
    try { localStorage.setItem('db-view-mode', viewMode); } catch { /* quota */ }
  }, [viewMode]);

  const handleLoadProject = (p: any) => {
    loadProject(p);
    setActiveTab('dashboard');
  };

  const handleLoadAll = (groupId: string) => {
    loadAllInGroup(groupId);
    setActiveTab('dashboard');
  };

  const structuresByGroup = (groupId: string) => savedProjects.filter(p => p.groupId === groupId);
  const orphanStructures = savedProjects.filter(p => !p.groupId || !projectGroups.some(g => g.id === p.groupId));

  const openGroup = projectGroups.find(g => g.id === openGroupId);

  return (
    <motion.div
      key="database"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="flex-1 p-8 overflow-y-auto custom-scrollbar"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-black/5 dark:border-white/5 pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#81292C]/10 rounded-xl flex items-center justify-center">
              <Database size={24} className="text-[#81292C]" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight dark:text-white uppercase">{t.sidebar.database}</h2>
              <p className="text-[10px] opacity-40 font-bold tracking-widest uppercase">{t.preview.savedProjects}</p>
            </div>
          </div>
          {!openGroup && (
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-black/5 dark:bg-white/5 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  title="Vista a lista"
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white dark:bg-[#141414] shadow-sm text-[#81292C]' : 'opacity-40 hover:opacity-70 dark:text-white'}`}
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  title="Vista a card"
                  className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-[#141414] shadow-sm text-[#81292C]' : 'opacity-40 hover:opacity-70 dark:text-white'}`}
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
              <button
                onClick={() => addNewProject(t)}
                className="px-6 py-2 bg-[#401318] dark:bg-white dark:text-black text-white text-[10px] font-bold rounded hover:opacity-90 transition-all flex items-center gap-2"
              >
                <Plus size={14} />
                {t.preview.newProject}
              </button>
            </div>
          )}
        </div>

        <AnimatePresence mode="wait">
          {!openGroup ? (
            /* ── Livello 1: card compatte per progetto ────────────────────── */
            <motion.div
              key="groups"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={viewMode === 'grid'
                ? 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4'
                : 'bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-xl divide-y divide-black/5 dark:divide-white/5 overflow-hidden'}
            >
              {projectGroups.map(g => {
                const count = structuresByGroup(g.id).length;
                return (
                  <button
                    key={g.id}
                    onClick={() => setOpenGroupId(g.id)}
                    className={viewMode === 'grid'
                      ? 'flex items-center gap-3 bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-4 rounded-xl shadow-sm hover:shadow-md hover:border-[#81292C]/40 transition-all text-left group w-full'
                      : 'flex items-center gap-3 px-5 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left group w-full'}
                  >
                    <div className={viewMode === 'grid' ? 'w-10 h-10 bg-[#81292C]/10 rounded-lg flex items-center justify-center shrink-0' : 'shrink-0'}>
                      <Folder size={viewMode === 'grid' ? 18 : 14} className={viewMode === 'grid' ? 'text-[#81292C]' : 'opacity-30'} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[11px] font-bold dark:text-white uppercase tracking-tight truncate">{g.name}</h3>
                      <p className="text-[9px] opacity-40 font-bold uppercase tracking-tighter">
                        {count} struttura{count === 1 ? '' : 'e'}
                      </p>
                    </div>
                    <ChevronRight size={16} className="opacity-20 group-hover:opacity-60 transition-opacity shrink-0" />
                  </button>
                );
              })}

              {orphanStructures.length > 0 && (
                <button
                  onClick={() => setOpenGroupId('__orphans__')}
                  className={viewMode === 'grid'
                    ? 'flex items-center gap-3 bg-white dark:bg-[#141414] border border-dashed border-black/10 dark:border-white/10 p-4 rounded-xl hover:border-[#81292C]/40 transition-all text-left group w-full'
                    : 'flex items-center gap-3 px-5 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left group w-full'}
                >
                  <div className={viewMode === 'grid' ? 'w-10 h-10 bg-black/5 dark:bg-white/5 rounded-lg flex items-center justify-center shrink-0' : 'shrink-0'}>
                    <Folder size={viewMode === 'grid' ? 18 : 14} className="opacity-40" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[11px] font-bold opacity-60 dark:text-white uppercase tracking-tight">Senza progetto</h3>
                    <p className="text-[9px] opacity-40 font-bold uppercase tracking-tighter">
                      {orphanStructures.length} struttura{orphanStructures.length === 1 ? '' : 'e'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="opacity-20 group-hover:opacity-60 transition-opacity shrink-0" />
                </button>
              )}

              {projectGroups.length === 0 && orphanStructures.length === 0 && (
                <div className="col-span-full py-20 text-center border-2 border-dashed border-black/5 dark:border-white/5 rounded-2xl">
                  <Database size={48} className="mx-auto opacity-10 mb-4" />
                  <p className="text-xs font-bold opacity-30 uppercase tracking-widest">{t.preview.noSavedProjects}</p>
                </div>
              )}
            </motion.div>
          ) : (
            /* ── Livello 2: lista snella delle strutture del progetto ─────── */
            <motion.div
              key="structures"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setOpenGroupId(null)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-50 hover:opacity-100 dark:text-white transition-opacity"
                >
                  <ChevronLeft size={14} />
                  Tutti i progetti
                </button>
                {openGroupId !== '__orphans__' && (
                  <button
                    onClick={() => handleLoadAll(openGroupId!)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white hover:opacity-90 transition-all"
                    style={{ backgroundColor: '#81292C' }}
                  >
                    <PlayCircle size={14} />
                    Carica tutto
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2">
                <FolderOpen size={16} style={{ color: '#81292C' }} />
                <h3 className="text-sm font-black uppercase tracking-tight dark:text-white">
                  {openGroupId === '__orphans__' ? 'Senza progetto' : openGroup?.name}
                </h3>
              </div>

              <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-xl divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
                {(openGroupId === '__orphans__' ? orphanStructures : structuresByGroup(openGroupId!)).map(p => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                    {p.structure?.type === 'tray'
                      ? <Layers size={14} className="opacity-30 shrink-0" />
                      : <CircleDot size={14} className="opacity-30 shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold dark:text-white uppercase truncate">{p.name}</p>
                      <p className="text-[9px] opacity-40 uppercase tracking-tight">
                        {p.lastSaved ? `${t.preview.lastSaved}: ${p.lastSaved}` : '—'} · {p.projectCables?.reduce((acc: number, pc: any) => acc + (pc.quantity || 0), 0) || 0} cavi
                      </p>
                    </div>
                    <button
                      onClick={() => handleLoadProject(p)}
                      className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-[#81292C] hover:text-white hover:border-[#81292C] transition-all shrink-0 dark:text-white"
                    >
                      {t.preview.loadProject}
                    </button>
                    <button
                      onClick={() => deleteSavedProject(p.id)}
                      className="p-1.5 text-black/20 hover:text-[#81292C] transition-colors shrink-0"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                {(openGroupId === '__orphans__' ? orphanStructures : structuresByGroup(openGroupId!)).length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-[10px] font-bold opacity-30 uppercase tracking-widest">Nessuna struttura in questo progetto</p>
                  </div>
                )}
              </div>

              {openGroupId !== '__orphans__' && projectGroups.length > 1 && (
                <button
                  onClick={() => { deleteProjectGroup(openGroupId!); setOpenGroupId(null); }}
                  className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-black/30 hover:text-[#81292C] dark:text-white/30 dark:hover:text-[#81292C] transition-colors"
                >
                  <Trash2 size={12} />
                  Elimina progetto e tutte le sue strutture
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
