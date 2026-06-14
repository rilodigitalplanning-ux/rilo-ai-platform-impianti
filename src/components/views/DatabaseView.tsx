import React from 'react';
import { Database, Plus, Folder, Trash2 } from 'lucide-react';
import { useProject } from '../../context/ProjectContext';
import { useApp } from '../../context/AppContext';
import { TRANSLATIONS } from '../../constants';
import { motion, AnimatePresence } from 'motion/react';

export const DatabaseView = () => {
  const { setActiveTab } = useApp();
  const t = TRANSLATIONS;
  const { 
    savedProjects, 
    addNewProject, 
    deleteSavedProject, 
    loadProject 
  } = useProject();

  const handleLoadProject = (p: any) => {
    loadProject(p);
    setActiveTab('dashboard');
  };

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
          <button 
            onClick={addNewProject}
            className="px-6 py-2 bg-[#401318] dark:bg-white dark:text-black text-white text-[10px] font-bold rounded hover:opacity-90 transition-all flex items-center gap-2"
          >
            <Plus size={14} />
            {t.preview.newProject}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <AnimatePresence mode="popLayout">
            {savedProjects.length > 0 ? (
              savedProjects.map((p) => (
                <motion.div 
                  key={p.id} 
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6 rounded-xl shadow-sm hover:shadow-md transition-all group"
                >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black/5 dark:bg-white/5 rounded-lg flex items-center justify-center">
                      <Folder size={20} className="opacity-40" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold dark:text-white uppercase tracking-tight">{p.name}</h3>
                      <p className="text-[9px] opacity-40 font-bold uppercase tracking-tighter">
                        {t.preview.lastSaved}: {p.lastSaved}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => deleteSavedProject(p.id)}
                    className="p-2 text-black/20 hover:text-[#81292C] transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-lg p-3">
                    <p className="text-[9px] opacity-40 font-bold uppercase mb-1">{t.input.structureType}</p>
                    <p className="text-[10px] font-bold dark:text-white uppercase">
                      {p.structure?.type === 'tray' ? t.sidebar.cableTrays : t.sidebar.conduits}
                    </p>
                  </div>
                  <div className="flex-1 bg-black/5 dark:bg-white/5 rounded-lg p-3">
                    <p className="text-[9px] opacity-40 font-bold uppercase mb-1">{t.sidebar.cables}</p>
                    <p className="text-[10px] font-bold dark:text-white uppercase">
                      {p.projectCables?.reduce((acc: number, pc: any) => acc + (pc.quantity || 0), 0) || 0} UN
                    </p>
                  </div>
                </div>

                <button 
                  onClick={() => handleLoadProject(p)}
                  className="w-full py-3 bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-[#81292C] hover:text-white hover:border-[#81292C] transition-all"
                >
                  {t.preview.loadProject}
                </button>
              </motion.div>
            ))
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="col-span-full py-20 text-center border-2 border-dashed border-black/5 dark:border-white/5 rounded-2xl"
            >
              <Database size={48} className="mx-auto opacity-10 mb-4" />
              <p className="text-xs font-bold opacity-30 uppercase tracking-widest">{t.preview.noSavedProjects}</p>
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
