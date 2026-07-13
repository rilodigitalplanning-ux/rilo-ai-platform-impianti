import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import { getModuleTheme, DEFAULT_THEME, type ModuleTheme } from '../config/moduleThemes';
import type { ParsedSchema } from '../types';

interface Toast {
  message: string;
  type: 'success' | 'error';
}

export type AppTab = 'lettura' | 'risultati';

interface AppContextType {
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  moduleTheme: ModuleTheme;
  toastData: Toast | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  parsedSchema: ParsedSchema | null;
  setParsedSchema: (s: ParsedSchema | null) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkModeState] = useState(false);
  const [toastData, setToastData] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('lettura');
  const [parsedSchema, setParsedSchema] = useState<ParsedSchema | null>(null);

  const moduleTheme = useMemo(() => getModuleTheme('panel-schedule'), []);

  const setDarkMode = useCallback((v: boolean) => {
    setDarkModeState(v);
    document.documentElement.classList.toggle('dark', v);
  }, []);

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
      parsedSchema, setParsedSchema,
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
