import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { LoadProject } from '../types';
import { getModuleTheme, DEFAULT_THEME, type ModuleTheme } from '../config/moduleThemes';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export type AppTab = 'overview' | 'zones' | 'results';

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
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkModeState] = useState(false);
  const [toastData, setToastData] = useState<Toast | null>(null);
  const [currentProject, setCurrentProjectState] = useState<LoadProject | null>(null);
  const [savedProjects, setSavedProjects] = useState<LoadProject[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('overview');

  const moduleTheme = useMemo(() => getModuleTheme('load-analysis'), []);

  const setDarkMode = useCallback((v: boolean) => {
    setDarkModeState(v);
    document.documentElement.classList.toggle('dark', v);
  }, []);

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

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      moduleTheme,
      toastData, showToast,
      currentProject, setCurrentProject,
      savedProjects, setSavedProjects,
      activeTab, setActiveTab,
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
