import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Project, ProjectGroup, Structure, ProjectCable, TopologyCircuit, TopologyProjectConfig, ManualSpareStructure } from '../types';
import { useAuth } from './AuthContext';

const DEFAULT_GROUP_NAME = 'NUOVO PROGETTO';

interface ProjectContextType {
  // Progetto (ombrello, es. "LA SUVERA")
  projectGroups: ProjectGroup[];
  activeGroupId: string;
  activeGroup: ProjectGroup;
  setActiveGroupId: (id: string) => void;
  createProjectGroup: (name?: string) => void;
  renameProjectGroup: (id: string, name: string) => void;
  deleteProjectGroup: (id: string) => Promise<void>;

  // Strutture (Project) all'interno del progetto attivo
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeProject: Project;
  savedProjects: Project[];
  updateActiveProject: (updates: Partial<Project>) => void;
  saveProject: (showToast: (msg: string, type: 'success' | 'error') => void, t: any) => Promise<void>;
  loadProject: (project: Project) => void;
  loadAllInGroup: (groupId: string) => void;
  deleteSavedProject: (id: string) => Promise<void>;
  renameProject: (id: string, newName: string) => void;
  addNewProject: (t: any) => void;
  addProjectsFromTopology: (circuits: TopologyCircuit[], config: TopologyProjectConfig) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  setStructure: (update: Structure | ((s: Structure) => Structure)) => void;
  setProjectCables: (update: ProjectCable[] | ((pc: ProjectCable[]) => ProjectCable[])) => void;
  addManualSpareStructure: (spare: Omit<ManualSpareStructure, 'id'>) => void;
  removeManualSpareStructure: (id: string) => void;
  updateManualSpareStructure: (id: string, updates: Partial<Omit<ManualSpareStructure, 'id'>>) => void;

  // Cronologia modifiche (struttura + cavi della struttura attiva) — fino a 10 passi
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

function makeBlankStructure(groupId: string): Project {
  return {
    id: crypto.randomUUID(),
    name: 'NUOVA STRUTTURA',
    groupId,
    structure: { id: crypto.randomUUID(), type: 'tray', width: 300, height: 100, fillLimit: 40 },
    projectCables: [],
  };
}

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user, isSessionVerified } = useAuth();

  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>(() => [
    { id: crypto.randomUUID(), name: DEFAULT_GROUP_NAME },
  ]);
  const [activeGroupId, setActiveGroupIdState] = useState(projectGroups[0].id);

  const [projects, setProjects] = useState<Project[]>(() => [makeBlankStructure(projectGroups[0].id)]);
  const [activeProjectId, setActiveProjectId] = useState(projects[0].id);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);

  const activeGroup = useMemo(() =>
    projectGroups.find(g => g.id === activeGroupId) || projectGroups[0],
  [projectGroups, activeGroupId]);

  const activeProject = useMemo(() =>
    projects.find(p => p.id === activeProjectId) || projects[0],
  [projects, activeProjectId]);

  // ── Caricamento dati utente (progetti + strutture salvate) ──────────────────
  useEffect(() => {
    if (user && isSessionVerified) {
      supabase
        .from('ProjectGroup')
        .select('*')
        .eq('userId', user.id)
        .order('lastSaved', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching project groups:', error);
            return;
          }
          if (data && data.length > 0) {
            const groups: ProjectGroup[] = data.map(g => ({ id: g.id, name: g.name, lastSaved: g.lastSaved }));
            setProjectGroups(groups);
            setActiveGroupIdState(groups[0].id);
          }
        });

      supabase
        .from('Project')
        .select('*')
        .eq('userId', user.id)
        .order('lastSaved', { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching projects:', error);
          } else if (data) {
            const safeParse = (str: string | null | undefined, fallback: any) => {
              if (!str) return fallback;
              try {
                const parsed = JSON.parse(str);
                return parsed !== null && typeof parsed === 'object' ? parsed : fallback;
              } catch (e) {
                console.error('Failed to parse JSON:', str, e);
                return fallback;
              }
            };

            const safeParseArray = (str: string | null | undefined, fallback: any[]) => {
              if (!str) return fallback;
              try {
                const parsed = JSON.parse(str);
                return Array.isArray(parsed) ? parsed : fallback;
              } catch (e) {
                console.error('Failed to parse JSON array:', str, e);
                return fallback;
              }
            };

            const parsedProjects: Project[] = data.map(p => ({
              id: p.id,
              name: p.name,
              groupId: p.groupId || undefined,
              structure: safeParse(p.structure, { type: 'tray', width: 300, height: 100, fillLimit: 40 }),
              projectCables: safeParseArray(p.projectCables, []),
              lastSaved: p.lastSaved,
              notes: p.notes,
            }));

            setSavedProjects(parsedProjects);
            // Sempre inizia con una struttura vuota — nessun auto-caricamento dell'ultimo stato
          }
        });
    } else if (!user && isSessionVerified) {
      setSavedProjects([]);
    }
  }, [user, isSessionVerified]);

  useEffect(() => {
    if (activeProject && activeProject.projectCables.some(pc => !pc.id)) {
      updateActiveProject({
        projectCables: activeProject.projectCables.map(pc => ({
          ...pc,
          id: pc.id || Math.random().toString(36).substr(2, 9)
        }))
      });
    }
  }, [activeProject]);

  // ── Gestione Progetto (ombrello) ─────────────────────────────────────────────
  const setActiveGroupId = (id: string) => {
    setActiveGroupIdState(id);
    // Popola le tab con le strutture già salvate per questo progetto, o una vuota
    const groupStructures = savedProjects.filter(p => p.groupId === id);
    if (groupStructures.length > 0) {
      setProjects(groupStructures.map(p => ({ ...p })));
      setActiveProjectId(groupStructures[0].id);
    } else {
      const blank = makeBlankStructure(id);
      setProjects([blank]);
      setActiveProjectId(blank.id);
    }
  };

  const createProjectGroup = (name?: string) => {
    const newGroup: ProjectGroup = { id: crypto.randomUUID(), name: (name || 'NUOVO PROGETTO').toUpperCase() };
    setProjectGroups(prev => [newGroup, ...prev]);
    setActiveGroupId(newGroup.id);
  };

  const renameProjectGroup = (id: string, name: string) => {
    setProjectGroups(prev => prev.map(g => g.id === id ? { ...g, name } : g));
    if (user) {
      supabase.from('ProjectGroup').update({ name }).eq('id', id).then(({ error }) => {
        if (error) console.error('Error renaming project group:', error);
      });
    }
  };

  const deleteProjectGroup = async (id: string) => {
    if (projectGroups.length <= 1) return;
    try {
      // Elimina anche le strutture appartenenti al progetto
      await supabase.from('Project').delete().eq('groupId', id);
      const { error } = await supabase.from('ProjectGroup').delete().eq('id', id);
      if (error) {
        console.error('Error deleting project group:', error);
        return;
      }
      setSavedProjects(prev => prev.filter(p => p.groupId !== id));
      setProjectGroups(prev => {
        const next = prev.filter(g => g.id !== id);
        if (activeGroupId === id && next.length > 0) {
          setActiveGroupId(next[0].id);
        }
        return next;
      });
    } catch (error) {
      console.error('Error deleting project group:', error);
    }
  };

  // ── Gestione Struttura (Project) ────────────────────────────────────────────
  const updateActiveProject = (updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, ...updates } : p));
  };

  const saveProject = async (showToast: (msg: string, type: 'success' | 'error') => void, t: any) => {
    if (!user || !activeProject) {
      showToast(t.preview.mustBeLoggedIn, 'error');
      return;
    }
    const now = new Date().toLocaleString();
    const updatedProject = { ...activeProject, groupId: activeProject.groupId || activeGroupId, lastSaved: now };

    try {
      // Assicura che il progetto ombrello esista lato Supabase prima della struttura (FK)
      await supabase.from('ProjectGroup').upsert({ id: activeGroupId, name: activeGroup.name, lastSaved: now, userId: user.id });
      setProjectGroups(prev => prev.map(g => g.id === activeGroupId ? { ...g, lastSaved: now } : g));

      const { error } = await supabase
        .from('Project')
        .upsert({
          id: updatedProject.id,
          name: updatedProject.name,
          groupId: updatedProject.groupId,
          structure: JSON.stringify(updatedProject.structure),
          projectCables: JSON.stringify(updatedProject.projectCables),
          lastSaved: updatedProject.lastSaved,
          notes: updatedProject.notes,
          userId: user.id
        });

      if (!error) {
        updateActiveProject({ groupId: updatedProject.groupId, lastSaved: now });
        setSavedProjects(prev => {
          const existingIndex = prev.findIndex(p => p.id === updatedProject.id);
          if (existingIndex >= 0) {
            return prev.map((p, i) => i === existingIndex ? updatedProject : p);
          }
          return [updatedProject, ...prev];
        });
        showToast(t.preview.savedSuccessfully || 'Project Saved', 'success');
      } else {
        console.error('Error saving project:', error);
        showToast(`${t.preview.saveError}: ${error.message}`, 'error');
      }
    } catch (error: any) {
      console.error('Error saving project:', error);
      showToast(`${t.preview.unexpectedError}: ${error.message}`, 'error');
    }
  };

  const loadProject = (project: Project) => {
    const targetGroupId = project.groupId || activeGroupId;
    if (targetGroupId !== activeGroupId) {
      // Cambia progetto: sostituisce le tab aperte con le strutture salvate
      // di quel progetto, per non mischiare strutture di progetti diversi.
      const groupStructures = savedProjects.filter(p => p.groupId === targetGroupId);
      const alreadyIncluded = groupStructures.some(p => p.id === project.id);
      const nextProjects = alreadyIncluded ? groupStructures : [...groupStructures, project];
      setActiveGroupIdState(targetGroupId);
      setProjects(nextProjects);
      setActiveProjectId(project.id);
      return;
    }
    setProjects(prev => {
      if (prev.find(p => p.id === project.id)) {
        setActiveProjectId(project.id);
        return prev;
      }
      const newList = [...prev, project];
      setActiveProjectId(project.id);
      return newList;
    });
  };

  const loadAllInGroup = (groupId: string) => {
    const groupStructures = savedProjects.filter(p => p.groupId === groupId);
    if (groupStructures.length === 0) return;
    setActiveGroupIdState(groupId);
    setProjects(groupStructures.map(p => ({ ...p })));
    setActiveProjectId(groupStructures[0].id);
  };

  const deleteSavedProject = async (id: string) => {
    try {
      const { error } = await supabase
        .from('Project')
        .delete()
        .eq('id', id);

      if (!error) {
        setSavedProjects(prev => prev.filter(p => p.id !== id));
      } else {
        console.error('Error deleting project:', error);
      }
    } catch (error) {
      console.error('Error deleting project:', error);
    }
  };

  const renameProject = (id: string, newName: string) => {
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
  };

  const addNewProject = (t: any) => {
    const newId = crypto.randomUUID();
    const newProject: Project = {
      id: newId,
      name: `${t.preview.project.toUpperCase()} ${projects.length + 1}`,
      groupId: activeGroupId,
      structure: { ...activeProject.structure, id: crypto.randomUUID() },
      projectCables: []
    };
    setProjects(prev => [...prev, newProject]);
    setActiveProjectId(newId);
  };

  const addProjectsFromTopology = (circuits: TopologyCircuit[], config: TopologyProjectConfig) => {
    const defaultDim = config.structureType === 'conduit'
      ? { width: config.fixedDimension?.width ?? 32, height: config.fixedDimension?.height ?? 32 }
      : { width: config.fixedDimension?.width ?? 200, height: config.fixedDimension?.height ?? 60 };

    const newProjects: Project[] = circuits.map(c => ({
      id: crypto.randomUUID(),
      name: c.tag,
      groupId: activeGroupId,
      structure: {
        id: crypto.randomUUID(),
        name: `${c.tag} — ${c.from} → ${c.to}`,
        type: config.structureType,
        width: defaultDim.width,
        height: defaultDim.height,
        fillLimit: config.fillLimit,
        hasSeparator: config.hasSeparator,
        spareTubes: config.spareTubes,
      },
      projectCables: [],
    }));

    setProjects(prev => [...prev, ...newProjects]);
    setActiveProjectId(newProjects[0].id);
  };

  const deleteProject = (id: string) => {
    if (projects.length <= 1) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(projects.find(p => p.id !== id)?.id || projects[0].id);
    }
  };

  const duplicateProject = (id: string) => {
    const projectToCopy = projects.find(p => p.id === id);
    if (!projectToCopy) return;

    const newId = crypto.randomUUID();
    const duplicatedProject: Project = {
      ...projectToCopy,
      id: newId,
      name: `${projectToCopy.name} - Cópia`,
      groupId: projectToCopy.groupId || activeGroupId,
      structure: { ...projectToCopy.structure, id: crypto.randomUUID() },
      projectCables: projectToCopy.projectCables.map(pc => ({
        ...pc,
        id: crypto.randomUUID()
      }))
    };

    setProjects(prev => [...prev, duplicatedProject]);
    setActiveProjectId(newId);
  };

  // ── Cronologia (undo/redo) — struttura + cavi della struttura attiva, max 10 passi ──
  const MAX_HISTORY = 10;
  type HistorySnapshot = { structure: Structure; projectCables: ProjectCable[] };
  const [history, setHistory] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // Cambiando struttura attiva, la cronologia della struttura precedente non ha più senso qui
  useEffect(() => {
    setHistory([]);
    setRedoStack([]);
  }, [activeProjectId]);

  const pushHistory = () => {
    if (!activeProject) return;
    setHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), { structure: activeProject.structure, projectCables: activeProject.projectCables }]);
    setRedoStack([]);
  };

  const setStructure = (update: Structure | ((s: Structure) => Structure)) => {
    const newStructure = typeof update === 'function' ? update(activeProject?.structure as Structure) : update;
    pushHistory();
    updateActiveProject({ structure: newStructure });
  };

  const setProjectCables = (update: ProjectCable[] | ((pc: ProjectCable[]) => ProjectCable[])) => {
    const newCables = typeof update === 'function' ? update(activeProject?.projectCables || []) : update;
    pushHistory();
    updateActiveProject({ projectCables: newCables });
  };

  const addManualSpareStructure = (spare: Omit<ManualSpareStructure, 'id'>) => {
    if (!activeProject) return;
    const newSpare: ManualSpareStructure = { ...spare, id: crypto.randomUUID() };
    updateActiveProject({ manualSpareStructures: [...(activeProject.manualSpareStructures || []), newSpare] });
  };

  const removeManualSpareStructure = (id: string) => {
    if (!activeProject) return;
    updateActiveProject({ manualSpareStructures: (activeProject.manualSpareStructures || []).filter(s => s.id !== id) });
  };

  const updateManualSpareStructure = (id: string, updates: Partial<Omit<ManualSpareStructure, 'id'>>) => {
    if (!activeProject) return;
    updateActiveProject({
      manualSpareStructures: (activeProject.manualSpareStructures || []).map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const undo = () => {
    if (!activeProject || history.length === 0) return;
    const last = history[history.length - 1];
    setRedoStack(prev => [...prev.slice(-(MAX_HISTORY - 1)), { structure: activeProject.structure, projectCables: activeProject.projectCables }]);
    setHistory(prev => prev.slice(0, -1));
    updateActiveProject({ structure: last.structure, projectCables: last.projectCables });
  };

  const redo = () => {
    if (!activeProject || redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev.slice(-(MAX_HISTORY - 1)), { structure: activeProject.structure, projectCables: activeProject.projectCables }]);
    setRedoStack(prev => prev.slice(0, -1));
    updateActiveProject({ structure: last.structure, projectCables: last.projectCables });
  };

  // Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y) — ignorati mentre si scrive in un campo di testo,
  // per non rompere l'undo nativo del browser dentro gli input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y') return;
      const target = e.target as HTMLElement;
      const isEditable = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (isEditable) return;
      e.preventDefault();
      if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [history, redoStack, activeProject]);

  return (
    <ProjectContext.Provider value={{
      projectGroups, activeGroupId, activeGroup, setActiveGroupId,
      createProjectGroup, renameProjectGroup, deleteProjectGroup,
      projects, setProjects,
      activeProjectId, setActiveProjectId,
      activeProject, savedProjects,
      updateActiveProject, saveProject,
      loadProject, loadAllInGroup, deleteSavedProject,
      renameProject, addNewProject, addProjectsFromTopology,
      deleteProject, duplicateProject, setStructure,
      setProjectCables,
      addManualSpareStructure, removeManualSpareStructure, updateManualSpareStructure,
      undo, redo, canUndo: history.length > 0, canRedo: redoStack.length > 0
    }}>
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
