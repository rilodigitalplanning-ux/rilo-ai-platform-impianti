import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { supabase } from '../lib/supabase';

// Stesso utente "bypass" usato da CableFill (src/modules/cablefill/context/AuthContext.tsx):
// l'app gira senza login reale, quindi tutti i moduli salvano sotto lo stesso
// profilo fisso già presente nella tabella "User" di Supabase.
const BYPASS_USER_ID = '00000000-0000-0000-0000-000000000001';

export interface SavedCalculation {
  id: string;
  stringName: string;
  lengthM: number;
  currentA: number;
  deltaVoltsV: number;
  cableTypeId: string;
  selectedSectionMm2: number | null;
}

export interface FvProject {
  id: string;
  name: string;
  calculations: SavedCalculation[];
  lastSaved?: string;
}

function makeBlankProject(): FvProject {
  return { id: crypto.randomUUID(), name: 'NUOVO PROGETTO', calculations: [] };
}

interface ProjectContextType {
  projects: FvProject[];
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeProject: FvProject;
  savedProjects: FvProject[];
  isLoadingSaved: boolean;
  refreshSavedProjects: () => Promise<void>;

  addNewProject: () => void;
  renameProject: (id: string, name: string) => void;
  closeProject: (id: string) => void;

  addCalculation: (calc: Omit<SavedCalculation, 'id'>) => void;
  updateCalculation: (id: string, updates: Partial<Omit<SavedCalculation, 'id'>>) => void;
  removeCalculation: (id: string) => void;

  saveProject: (showToast: (msg: string, type: 'success' | 'error') => void) => Promise<void>;
  loadProject: (project: FvProject) => void;
  deleteSavedProject: (id: string, showToast: (msg: string, type: 'success' | 'error') => void) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<FvProject[]>(() => [makeBlankProject()]);
  const [activeProjectId, setActiveProjectId] = useState(projects[0].id);
  const [savedProjects, setSavedProjects] = useState<FvProject[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  const activeProject = useMemo(() =>
    projects.find(p => p.id === activeProjectId) || projects[0],
  [projects, activeProjectId]);

  const updateActiveProject = (updates: Partial<FvProject>) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, ...updates } : p));
  };

  const refreshSavedProjects = async () => {
    setIsLoadingSaved(true);
    try {
      const { data, error } = await supabase
        .from('FvProject')
        .select('*')
        .eq('userId', BYPASS_USER_ID)
        .order('lastSaved', { ascending: false });

      if (error) {
        console.error('Errore nel caricamento dei progetti FV:', error);
        return;
      }

      const parsed: FvProject[] = (data || []).map(p => {
        let calculations: SavedCalculation[] = [];
        try { calculations = JSON.parse(p.calculations || '[]'); } catch { /* ignora */ }
        return { id: p.id, name: p.name, calculations, lastSaved: p.lastSaved };
      });
      setSavedProjects(parsed);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const addNewProject = () => {
    const blank = makeBlankProject();
    setProjects(prev => [...prev, blank]);
    setActiveProjectId(blank.id);
  };

  const renameProject = (id: string, name: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name } : p));
  };

  const closeProject = (id: string) => {
    if (projects.length <= 1) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(projects.find(p => p.id !== id)?.id || projects[0].id);
    }
  };

  const addCalculation = (calc: Omit<SavedCalculation, 'id'>) => {
    const newCalc: SavedCalculation = { ...calc, id: crypto.randomUUID() };
    updateActiveProject({ calculations: [...activeProject.calculations, newCalc] });
  };

  const updateCalculation = (id: string, updates: Partial<Omit<SavedCalculation, 'id'>>) => {
    updateActiveProject({
      calculations: activeProject.calculations.map(c => c.id === id ? { ...c, ...updates } : c),
    });
  };

  const removeCalculation = (id: string) => {
    updateActiveProject({ calculations: activeProject.calculations.filter(c => c.id !== id) });
  };

  const saveProject = async (showToast: (msg: string, type: 'success' | 'error') => void) => {
    const now = new Date().toLocaleString();
    const updated = { ...activeProject, lastSaved: now };

    try {
      const { error } = await supabase
        .from('FvProject')
        .upsert({
          id: updated.id,
          name: updated.name,
          calculations: JSON.stringify(updated.calculations),
          lastSaved: updated.lastSaved,
          userId: BYPASS_USER_ID,
        });

      if (error) {
        console.error('Errore nel salvataggio del progetto FV:', error);
        showToast(`Errore nel salvataggio: ${error.message}`, 'error');
        return;
      }

      updateActiveProject({ lastSaved: now });
      setSavedProjects(prev => {
        const idx = prev.findIndex(p => p.id === updated.id);
        if (idx >= 0) return prev.map((p, i) => i === idx ? updated : p);
        return [updated, ...prev];
      });
      showToast('Progetto salvato con successo!', 'success');
    } catch (e: any) {
      showToast(`Errore imprevisto: ${e?.message || e}`, 'error');
    }
  };

  const loadProject = (project: FvProject) => {
    setProjects(prev => {
      if (prev.find(p => p.id === project.id)) {
        setActiveProjectId(project.id);
        return prev;
      }
      setActiveProjectId(project.id);
      return [...prev, project];
    });
  };

  const deleteSavedProject = async (id: string, showToast: (msg: string, type: 'success' | 'error') => void) => {
    try {
      const { error } = await supabase.from('FvProject').delete().eq('id', id);
      if (error) {
        showToast(`Errore nell'eliminazione: ${error.message}`, 'error');
        return;
      }
      setSavedProjects(prev => prev.filter(p => p.id !== id));
      showToast('Progetto eliminato.', 'success');
    } catch (e: any) {
      showToast(`Errore imprevisto: ${e?.message || e}`, 'error');
    }
  };

  return (
    <ProjectContext.Provider value={{
      projects, activeProjectId, setActiveProjectId, activeProject,
      savedProjects, isLoadingSaved, refreshSavedProjects,
      addNewProject, renameProject, closeProject,
      addCalculation, updateCalculation, removeCalculation,
      saveProject, loadProject, deleteSavedProject,
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within a ProjectProvider');
  return ctx;
};
