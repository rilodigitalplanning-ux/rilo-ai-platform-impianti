import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { getSystemPrefersDark, subscribeToSystemTheme } from '@/utils/systemTheme';
import { getModuleTheme, type ModuleTheme } from '../config/moduleThemes';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export type AppTab = 'computo' | 'consulta-bd' | 'analisi-prezzi' | 'elenco-prezzi' | 'prezzari' | 'banco-progetti';

// Passi del flusso "Computo Metrico" (la vista del computo in lavorazione)
export type ComputoView = 'setup' | 'processing' | 'review' | 'results' | 'settings';

interface AppContextType {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  moduleTheme: ModuleTheme;
  toastData: Toast | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  computoView: ComputoView;
  setComputoView: (view: ComputoView) => void;
  /** Si incrementa ogni volta che i prezzari nel database cambiano (caricamento/eliminazione) */
  prezzariVersion: number;
  bumpPrezzari: () => void;
  /** Finestra "Livelli" (ordine e nomi della gerarchia) aperta */
  hierarchyOpen: boolean;
  setHierarchyOpen: (v: boolean) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkModeState] = useState(getSystemPrefersDark);
  const [toastData, setToastData] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('computo');
  const [computoView, setComputoView] = useState<ComputoView>('setup');
  const [prezzariVersion, setPrezzariVersion] = useState(0);
  const bumpPrezzari = useCallback(() => setPrezzariVersion(v => v + 1), []);
  const [hierarchyOpen, setHierarchyOpen] = useState(false);

  const moduleTheme = useMemo(() => getModuleTheme('cme-generator'), []);

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

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      moduleTheme,
      toastData, showToast,
      activeTab, setActiveTab,
      computoView, setComputoView,
      prezzariVersion, bumpPrezzari,
      hierarchyOpen, setHierarchyOpen,
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
