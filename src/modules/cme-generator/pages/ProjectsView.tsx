import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Folder, Plus, Trash2, FolderOpen, Loader2 } from 'lucide-react';
import { listProjects, loadProject, deleteProject, CmeProject } from '../services/projectService';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { useCme } from '../context/CmeContext';

interface ProjectsViewProps {
  onNext: () => void;
}

export function ProjectsView({ onNext }: ProjectsViewProps) {
  const { dispatch } = useCme();
  const { guard, dialog } = useDiscardGuard();
  const [projects, setProjects] = useState<CmeProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    setError(null);
    try {
      const data = await listProjects();
      setProjects(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleLoadProject(project: CmeProject) {
    guard(() => { void doLoadProject(project); });
  }

  async function doLoadProject(project: CmeProject) {
    try {
      const fullProject = await loadProject(project.id);
      dispatch({ 
        type: 'LOAD_PROJECT', 
        payload: { 
          id: fullProject.id, 
          name: fullProject.name, 
          ...fullProject.state 
        } 
      });
      onNext();
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Eliminare questo progetto?')) return;
    setIsDeleting(id);
    try {
      await deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDeleting(null);
    }
  }

  function handleNewProject() {
    guard(() => { dispatch({ type: 'RESET' }); onNext(); });
  }

  return (
    <div className="flex-1 overflow-auto p-8 space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">I Miei Progetti</h2>
          <p className="text-gray-500 dark:text-white/40 text-sm">Continua un computo salvato o iniziane uno nuovo.</p>
        </div>
        <button
          onClick={handleNewProject}
          className="flex items-center gap-2 px-6 py-3 bg-[#E94560] text-white rounded-xl font-bold tracking-widest uppercase text-sm hover:bg-[#E94560]/80 transition-colors"
        >
          <Plus size={18} />
          Nuovo Progetto
        </button>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="bg-red-900/30 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex flex-col items-center justify-center p-20 text-gray-500 dark:text-white/40">
          <Loader2 size={32} className="animate-spin mb-4" />
          <p>Caricamento progetti in corso...</p>
        </div>
      ) : projects.length === 0 ? (
        <div className="border-2 border-dashed border-gray-300 dark:border-white/10 rounded-2xl p-16 flex flex-col items-center justify-center text-center">
          <Folder size={48} className="text-gray-300 dark:text-white/10 mb-4" />
          <h3 className="text-gray-600 dark:text-white/60 font-bold mb-2">Nessun progetto trovato</h3>
          <p className="text-gray-400 dark:text-white/30 text-sm max-w-md">
            Non hai ancora computi salvati. Inizia un nuovo progetto importando il file Revit.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map(p => (
            <div key={p.id} className="bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 rounded-2xl p-6 hover:bg-gray-200 dark:bg-white/10 transition-colors flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-gray-900 dark:text-white font-bold text-lg truncate pr-4" title={p.name}>{p.name}</h3>
                <FolderOpen className="text-[#E94560]" size={24} />
              </div>
              <div className="text-gray-500 dark:text-white/40 text-xs space-y-1 mb-6">
                <p>Aggiornato il: {new Date(p.updated_at).toLocaleString('it-IT')}</p>
                <p>Creato il: {new Date(p.created_at).toLocaleString('it-IT')}</p>
              </div>
              
              <div className="mt-auto flex gap-3">
                <button
                  onClick={() => handleLoadProject(p)}
                  className="flex-1 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:bg-white/20 text-gray-900 dark:text-white rounded-lg py-2 font-bold text-sm transition-colors"
                >
                  Apri
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={isDeleting === p.id}
                  className="px-4 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-lg transition-colors flex items-center justify-center"
                >
                  {isDeleting === p.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
