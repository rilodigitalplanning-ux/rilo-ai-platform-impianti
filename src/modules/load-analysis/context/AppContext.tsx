import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import type { LoadProject } from '../types';
import { getModuleTheme, DEFAULT_THEME, type ModuleTheme } from '../config/moduleThemes';
import { getSystemPrefersDark, subscribeToSystemTheme } from '@/utils/systemTheme';

const LS_KEY = 'savedProjects';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export type AppTab = 'overview' | 'zones' | 'results';

export const EMPTY_PROJECT = (): LoadProject => ({
  id: crypto.randomUUID(),
  name: '',
  client: '',
  buildingType: 'uffici',
  qualityLevel: 'standard',
  climateZone: 'E',
  envelopeType: 'muratura_pesante',
  hvacMode: 'parametrico',
  hvacEquipment: { heatPumps: [], ahus: [], pumps: [] },
  zones: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

interface AppContextType {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  moduleTheme: ModuleTheme;
  toastData: Toast | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  currentProject: LoadProject | null;
  setCurrentProject: (p: LoadProject | null) => void;
  savedProjects: LoadProject[];
  setSavedProjects: React.Dispatch<React.SetStateAction<LoadProject[]>>;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;

  // Progetto in modifica (bozza di lavoro) — cronologia undo/redo, max 10 passi
  editingProject: LoadProject;
  setEditingProject: (update: LoadProject | ((p: LoadProject) => LoadProject)) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkModeState] = useState(getSystemPrefersDark);
  const [toastData, setToastData] = useState<Toast | null>(null);
  const [currentProject, setCurrentProjectState] = useState<LoadProject | null>(null);
  const [savedProjects, setSavedProjects] = useState<LoadProject[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as LoadProject[]) : [];
    } catch { return []; }
  });
  const [activeTab, setActiveTab] = useState<AppTab>('overview');

  const moduleTheme = useMemo(() => getModuleTheme('load-analysis'), []);

  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(savedProjects)); } catch { /* quota */ }
  }, [savedProjects]);

  const setDarkMode = useCallback((v: boolean) => {
    setDarkModeState(v);
    document.documentElement.classList.toggle('dark', v);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, []);

  useEffect(() => subscribeToSystemTheme(setDarkMode), [setDarkMode]);

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToastData({ message, type });
    setTimeout(() => setToastData(null), 3000);
  }, []);

  const setCurrentProject = useCallback((p: LoadProject | null) => {
    setCurrentProjectState(p);
    if (p) {
      setSavedProjects(prev => {
        const idx = prev.findIndex(x => x.id === p.id);
        if (idx >= 0) { const next = [...prev]; next[idx] = p; return next; }
        return [...prev, p];
      });
    }
  }, []);

  // ── Cronologia (undo/redo) del progetto in modifica — max 10 passi ──
  const MAX_HISTORY = 10;
  const [editingProject, setEditingProjectState] = useState<LoadProject>(EMPTY_PROJECT);
  const [history, setHistory] = useState<LoadProject[]>([]);
  const [redoStack, setRedoStack] = useState<LoadProject[]>([]);

  const setEditingProject = useCallback((update: LoadProject | ((p: LoadProject) => LoadProject)) => {
    setEditingProjectState(prev => {
      const next = typeof update === 'function' ? (update as (p: LoadProject) => LoadProject)(prev) : update;
      setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), prev]);
      setRedoStack([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setRedoStack(r => [...r.slice(-(MAX_HISTORY - 1)), editingProject]);
      setEditingProjectState(last);
      return h.slice(0, -1);
    });
  }, [editingProject]);

  const redo = useCallback(() => {
    setRedoStack(r => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), editingProject]);
      setEditingProjectState(last);
      return r.slice(0, -1);
    });
  }, [editingProject]);

  // Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y) — ignorati mentre si scrive in un campo di testo,
  // per non rompere l'undo nativo del browser dentro gli input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || (e.key.toLowerCase() !== 'z' && e.key.toLowerCase() !== 'y')) return;
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
  }, [undo, redo]);

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      moduleTheme,
      toastData, showToast,
      currentProject, setCurrentProject,
      savedProjects, setSavedProjects,
      activeTab, setActiveTab,
      editingProject, setEditingProject,
      undo, redo, canUndo: history.length > 0, canRedo: redoStack.length > 0,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

// Re-export DEFAULT_THEME for convenience
export { DEFAULT_THEME };
