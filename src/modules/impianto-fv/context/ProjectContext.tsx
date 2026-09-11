import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { InverterSpec, PanelSpec, StringConfig } from '../utils/pvStringCalc';

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

export type { InverterSpec, PanelSpec, StringConfig };

export interface FvProject {
  id: string;
  name: string;
  calculations: SavedCalculation[];
  stringConfigs: StringConfig[];
  lastSaved?: string;
}

function makeBlankProject(): FvProject {
  return { id: crypto.randomUUID(), name: 'NUOVO PROGETTO', calculations: [], stringConfigs: [] };
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

  catalogInverters: InverterSpec[];
  catalogPanels: PanelSpec[];

  addInverter: (inv: Omit<InverterSpec, 'id'>) => InverterSpec;
  updateInverter: (id: string, updates: Partial<Omit<InverterSpec, 'id'>>) => void;
  removeInverter: (id: string) => void;

  addPanel: (panel: Omit<PanelSpec, 'id'>) => PanelSpec;
  updatePanel: (id: string, updates: Partial<Omit<PanelSpec, 'id'>>) => void;
  removePanel: (id: string) => void;

  addStringConfig: (cfg: Omit<StringConfig, 'id'>) => void;
  updateStringConfig: (id: string, updates: Partial<Omit<StringConfig, 'id'>>) => void;
  removeStringConfig: (id: string) => void;

  saveProject: (showToast: (msg: string, type: 'success' | 'error') => void) => Promise<void>;
  loadProject: (project: FvProject) => void;
  deleteSavedProject: (id: string, showToast: (msg: string, type: 'success' | 'error') => void) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

function safeParseArray<T>(raw: any): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<FvProject[]>(() => [makeBlankProject()]);
  const [activeProjectId, setActiveProjectId] = useState(projects[0].id);
  const [savedProjects, setSavedProjects] = useState<FvProject[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);

  // Catalogo globale di inverter/pannelli (condiviso fra tutti i progetti,
  // non legato a un singolo progetto): salvato in un'unica riga per utente
  // nella tabella FvCatalog, così un progetto nuovo può subito riusare
  // inverter/pannelli già censiti in progetti precedenti.
  const [catalogInverters, setCatalogInverters] = useState<InverterSpec[]>([]);
  const [catalogPanels, setCatalogPanels] = useState<PanelSpec[]>([]);

  React.useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from('FvCatalog')
        .select('inverters, panels')
        .eq('userId', BYPASS_USER_ID)
        .maybeSingle();
      if (error) {
        console.error('Errore nel caricamento del catalogo inverter/pannelli:', error);
        return;
      }
      if (data) {
        setCatalogInverters(safeParseArray<InverterSpec>(data.inverters));
        setCatalogPanels(safeParseArray<PanelSpec>(data.panels));
      }
    })();
  }, []);

  const persistCatalog = (inverters: InverterSpec[], panels: PanelSpec[]) => {
    supabase
      .from('FvCatalog')
      .upsert({ userId: BYPASS_USER_ID, inverters: JSON.stringify(inverters), panels: JSON.stringify(panels) })
      .then(({ error }) => {
        if (error) console.error('Errore nel salvataggio del catalogo inverter/pannelli:', error);
      });
  };

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

      const parsed: FvProject[] = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        calculations: safeParseArray<SavedCalculation>(p.calculations),
        stringConfigs: safeParseArray<StringConfig>(p.stringConfigs),
        lastSaved: p.lastSaved,
      }));
      setSavedProjects(parsed);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  const addNewProject = () => {
    const blank = { ...makeBlankProject(), name: `NUOVO PROGETTO ${projects.length + 1}` };
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

  const addInverter = (inv: Omit<InverterSpec, 'id'>): InverterSpec => {
    const newInverter: InverterSpec = { ...inv, id: crypto.randomUUID() };
    const next = [...catalogInverters, newInverter];
    setCatalogInverters(next);
    persistCatalog(next, catalogPanels);
    return newInverter;
  };

  const updateInverter = (id: string, updates: Partial<Omit<InverterSpec, 'id'>>) => {
    const next = catalogInverters.map(i => i.id === id ? { ...i, ...updates } : i);
    setCatalogInverters(next);
    persistCatalog(next, catalogPanels);
  };

  const removeInverter = (id: string) => {
    const next = catalogInverters.filter(i => i.id !== id);
    setCatalogInverters(next);
    persistCatalog(next, catalogPanels);
  };

  const addPanel = (panel: Omit<PanelSpec, 'id'>): PanelSpec => {
    const newPanel: PanelSpec = { ...panel, id: crypto.randomUUID() };
    const next = [...catalogPanels, newPanel];
    setCatalogPanels(next);
    persistCatalog(catalogInverters, next);
    return newPanel;
  };

  const updatePanel = (id: string, updates: Partial<Omit<PanelSpec, 'id'>>) => {
    const next = catalogPanels.map(p => p.id === id ? { ...p, ...updates } : p);
    setCatalogPanels(next);
    persistCatalog(catalogInverters, next);
  };

  const removePanel = (id: string) => {
    const next = catalogPanels.filter(p => p.id !== id);
    setCatalogPanels(next);
    persistCatalog(catalogInverters, next);
  };

  const addStringConfig = (cfg: Omit<StringConfig, 'id'>) => {
    const newCfg: StringConfig = { ...cfg, id: crypto.randomUUID() };
    updateActiveProject({ stringConfigs: [...activeProject.stringConfigs, newCfg] });
  };

  const updateStringConfig = (id: string, updates: Partial<Omit<StringConfig, 'id'>>) => {
    updateActiveProject({ stringConfigs: activeProject.stringConfigs.map(s => s.id === id ? { ...s, ...updates } : s) });
  };

  const removeStringConfig = (id: string) => {
    updateActiveProject({ stringConfigs: activeProject.stringConfigs.filter(s => s.id !== id) });
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
          stringConfigs: JSON.stringify(updated.stringConfigs),
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
      catalogInverters, catalogPanels,
      addInverter, updateInverter, removeInverter,
      addPanel, updatePanel, removePanel,
      addStringConfig, updateStringConfig, removeStringConfig,
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
