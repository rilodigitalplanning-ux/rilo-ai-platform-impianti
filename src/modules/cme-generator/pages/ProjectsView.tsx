import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Folder, Plus, Trash2, FolderOpen, Loader2, FileUp } from 'lucide-react';
import { listProjects, loadProject, deleteProject, CmeProject } from '../services/projectService';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { useCme } from '../context/CmeContext';
import { useApp } from '../context/AppContext';
import { parseXpwe, xpweToResults } from '../services/xpwe';
import { defaultHierarchy } from '../lib/hierarchy';

interface ProjectsViewProps {
  onNext: () => void;
  /** Dopo l'importazione di un XPWE: apre il computo sui risultati */
  onImported?: () => void;
}

export function ProjectsView({ onNext, onImported }: ProjectsViewProps) {
  const { showToast } = useApp();
  const fileRef = React.useRef<HTMLInputElement>(null);
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

  async function handleImportXpwe(file: File) {
    setError(null);
    try {
      const doc = parseXpwe(await file.text());
      const { resultados, warnings } = xpweToResults(doc);
      if (resultados.length === 0) throw new Error('Nessuna voce di computo trovata nel file XPWE.');
      const name = file.name.replace(/.[^.]+$/, '');
      guard(() => {
        // le categorie di PriMus sono già i livelli WBS: la categoria non si ripete come livello a parte
        const hierarchy = defaultHierarchy(resultados).map(i => (i.id === 'cat' ? { ...i, enabled: false } : i));
        dispatch({ type: 'IMPORT_PROJECT', payload: { name, resultados, hierarchy } });
        showToast(
          `XPWE importato: ${resultados.length} elementi${warnings.length ? ` (${warnings.length} righe ignorate)` : ''}. Salva il progetto per conservarlo.`,
          'success',
        );
        onImported?.();
      });
    } catch (err: any) {
      setError(`Importazione XPWE non riuscita: ${err.message}`);
    }
  }

  function handleNewProject() {
    guard(() => { dispatch({ type: 'RESET' }); onNext(); });
  }

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' });
  const btn = 'flex items-center gap-1.5 px-3 py-1 rounded text-[11px] font-semibold transition-colors';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-[#0B1018] text-slate-900 dark:text-slate-100">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-b border-slate-200 dark:border-white/10">
        <h2 className="text-[14px] font-bold">Progetti</h2>
        <span className="text-[12px] text-slate-500 dark:text-slate-400">{projects.length} computi salvati</span>
        <input
          ref={fileRef} type="file" accept=".xpwe,.xml" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleImportXpwe(f); }}
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className={`${btn} border border-slate-300 dark:border-white/15 bg-white dark:bg-white/5 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10`}
          >
            <FileUp size={13} /> Importa XPWE
          </button>
          <button onClick={handleNewProject} className={`${btn} text-white`} style={{ backgroundColor: '#0F3460' }}>
            <Plus size={13} /> Nuovo progetto
          </button>
        </div>
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mx-4 mt-2 rounded border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[12px] text-red-700 dark:text-red-300"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-20 text-slate-500 dark:text-slate-400">
            <Loader2 size={28} className="animate-spin mb-3" />
            <p className="text-[12px]">Caricamento progetti in corso…</p>
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center p-16 text-slate-500 dark:text-slate-400">
            <Folder size={40} className="mb-3 opacity-40" />
            <h3 className="font-semibold mb-1">Nessun progetto trovato</h3>
            <p className="text-[12px] max-w-md">Non hai ancora computi salvati. Inizia un nuovo progetto caricando il file di Revit o importando un XPWE.</p>
          </div>
        ) : (
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-[#0E1522]">
              <tr className="text-left text-[11px] text-slate-500 dark:text-slate-400">
                <th className="px-4 py-1.5 font-semibold border-b border-slate-200 dark:border-white/10">Nome</th>
                <th className="py-1.5 font-semibold border-b border-slate-200 dark:border-white/10 w-44">Aggiornato</th>
                <th className="py-1.5 font-semibold border-b border-slate-200 dark:border-white/10 w-44">Creato</th>
                <th className="py-1.5 px-4 border-b border-slate-200 dark:border-white/10 w-44" />
              </tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id} className="border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5">
                  <td className="px-4 py-1.5">
                    <button onClick={() => handleLoadProject(p)} className="flex items-center gap-2 font-semibold hover:underline text-left" title={p.name}>
                      <FolderOpen size={14} className="text-[#E94560] shrink-0" />
                      <span className="truncate max-w-[520px]">{p.name}</span>
                    </button>
                  </td>
                  <td className="py-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">{fmtDate(p.updated_at)}</td>
                  <td className="py-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">{fmtDate(p.created_at)}</td>
                  <td className="py-1.5 px-4">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => handleLoadProject(p)}
                        className={`${btn} border border-slate-300 dark:border-white/15 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10`}
                      >Apri</button>
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={isDeleting === p.id}
                        className="p-1 rounded text-red-500 hover:bg-red-500/10"
                        title="Elimina progetto" aria-label="Elimina progetto"
                      >
                        {isDeleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {dialog}
    </div>
  );
}
