import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Project, Structure, ProjectCable, TopologyCircuit, TopologyProjectConfig } from '../types';
import { useAuth } from './AuthContext';

interface ProjectContextType {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  activeProjectId: string;
  setActiveProjectId: (id: string) => void;
  activeProject: Project;
  savedProjects: Project[];
  updateActiveProject: (updates: Partial<Project>) => void;
  saveProject: (showToast: (msg: string, type: 'success' | 'error') => void, t: any) => Promise<void>;
  loadProject: (project: Project) => void;
  deleteSavedProject: (id: string) => Promise<void>;
  renameProject: (id: string, newName: string) => void;
  addNewProject: (t: any) => void;
  addProjectsFromTopology: (circuits: TopologyCircuit[], config: TopologyProjectConfig) => void;
  deleteProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  setStructure: (update: Structure | ((s: Structure) => Structure)) => void;
  setProjectCables: (update: ProjectCable[] | ((pc: ProjectCable[]) => ProjectCable[])) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { user, isSessionVerified } = useAuth();
  
  const [projects, setProjects] = useState<Project[]>([{
    id: crypto.randomUUID(),
    name: 'NUOVO PROGETTO',
    structure: { id: crypto.randomUUID(), type: 'tray', width: 300, height: 100, fillLimit: 40 },
    projectCables: []
  }]);
  
  const [activeProjectId, setActiveProjectId] = useState(projects[0].id);
  const [savedProjects, setSavedProjects] = useState<Project[]>([]);

  const activeProject = useMemo(() => 
    projects.find(p => p.id === activeProjectId) || projects[0], 
  [projects, activeProjectId]);

  useEffect(() => {
    if (user && isSessionVerified) {
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

            const parsedProjects = data.map(p => ({
              id: p.id,
              name: p.name,
              structure: safeParse(p.structure, { type: 'tray', width: 300, height: 100, fillLimit: 40 }),
              projectCables: safeParseArray(p.projectCables, []),
              lastSaved: p.lastSaved,
              notes: p.notes
            }));
            
            setSavedProjects(parsedProjects);
            if (parsedProjects.length > 0 && projects.length === 1 && projects[0].name === 'NUOVO PROGETTO' && projects[0].projectCables.length === 0) {
              setProjects([parsedProjects[0]]);
              setActiveProjectId(parsedProjects[0].id);
            }
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

  const updateActiveProject = (updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, ...updates } : p));
  };

  const saveProject = async (showToast: (msg: string, type: 'success' | 'error') => void, t: any) => {
    if (!user || !activeProject) {
      showToast(t.preview.mustBeLoggedIn, 'error');
      return;
    }
    const now = new Date().toLocaleString();
    const updatedProject = { ...activeProject, lastSaved: now };
    
    try {
      const { error } = await supabase
        .from('Project')
        .upsert({
          id: updatedProject.id,
          name: updatedProject.name,
          structure: JSON.stringify(updatedProject.structure),
          projectCables: JSON.stringify(updatedProject.projectCables),
          lastSaved: updatedProject.lastSaved,
          notes: updatedProject.notes,
          userId: user.id
        });
      
      if (!error) {
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
      name: c.id,
      structure: {
        id: crypto.randomUUID(),
        name: `${c.id} — ${c.from} → ${c.to}`,
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
      structure: { ...projectToCopy.structure, id: crypto.randomUUID() },
      projectCables: projectToCopy.projectCables.map(pc => ({
        ...pc,
        id: crypto.randomUUID()
      }))
    };
    
    setProjects(prev => [...prev, duplicatedProject]);
    setActiveProjectId(newId);
  };

  const setStructure = (update: Structure | ((s: Structure) => Structure)) => {
    const newStructure = typeof update === 'function' ? update(activeProject?.structure as Structure) : update;
    updateActiveProject({ structure: newStructure });
  };

  const setProjectCables = (update: ProjectCable[] | ((pc: ProjectCable[]) => ProjectCable[])) => {
    const newCables = typeof update === 'function' ? update(activeProject?.projectCables || []) : update;
    updateActiveProject({ projectCables: newCables });
  };

  return (
    <ProjectContext.Provider value={{
      projects, setProjects,
      activeProjectId, setActiveProjectId,
      activeProject, savedProjects,
      updateActiveProject, saveProject,
      loadProject, deleteSavedProject,
      renameProject, addNewProject, addProjectsFromTopology,
      deleteProject, duplicateProject, setStructure,
      setProjectCables
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
