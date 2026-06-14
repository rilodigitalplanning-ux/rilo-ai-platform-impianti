import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { ModuleTheme, getModuleTheme } from '../config/moduleThemes';

interface AppContextType {
  darkMode: boolean;
  setDarkMode: (mode: boolean) => void;
  activeTab: 'dashboard' | 'trays' | 'conduits' | 'cables' | 'database' | 'users';
  setActiveTab: (tab: 'dashboard' | 'trays' | 'conduits' | 'cables' | 'database' | 'users') => void;
  activeModule: 'cablefill';
  setActiveModule: (module: 'cablefill') => void;
  activeTheme: string | null;
  setActiveTheme: (theme: string | null) => void;
  moduleTheme: ModuleTheme;
  toastData: { message: string; type: 'success' | 'error' } | null;
  showToast: (message: string, type?: 'success' | 'error') => void;
  previewZoom: number;
  setPreviewZoom: (zoom: number) => void;
  isExporting: boolean;
  setIsExporting: (exporting: boolean) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trays' | 'conduits' | 'cables' | 'database' | 'users'>('dashboard');
  const [activeModule, setActiveModule] = useState<'cablefill'>('cablefill');
  const [activeTheme, setActiveTheme] = useState<string | null>(null);
  const [toastData, setToastData] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  const moduleTheme = useMemo(() => getModuleTheme(activeTheme || activeModule), [activeTheme, activeModule]);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastData({ message, type });
    setTimeout(() => setToastData(null), 3000);
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  return (
    <AppContext.Provider value={{
      darkMode, setDarkMode,
      activeTab, setActiveTab,
      activeModule, setActiveModule,
      activeTheme, setActiveTheme,
      moduleTheme,
      toastData, showToast,
      previewZoom, setPreviewZoom,
      isExporting, setIsExporting
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
