import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { getModuleTheme, DEFAULT_THEME, type ModuleTheme } from '../config/moduleThemes';
import type { ElencoPrezziResult } from '../types';
import { getSystemPrefersDark, subscribeToSystemTheme } from '@/utils/systemTheme';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export type AppTab = 'elenco-prezzi';

interface AppContextType {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  moduleTheme: ModuleTheme;
  toastData: Toast | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  result: ElencoPrezziResult | null;
  setResult: (r: ElencoPrezziResult | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkModeState] = useState(getSystemPrefersDark);
  const [toastData, setToastData] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('elenco-prezzi');
  const [result, setResult] = useState<ElencoPrezziResult | null>(null);

  const moduleTheme = useMemo(() => getModuleTheme('cme-editor'), []);

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
      result, setResult,
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

export { DEFAULT_THEME };
