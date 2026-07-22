import React, { createContext, useContext, useState, useMemo, useCallback, useEffect } from 'react';
import { getModuleTheme, DEFAULT_THEME, type ModuleTheme } from '../config/moduleThemes';
import type { ParsedSchema } from '../types';
import { getSystemPrefersDark, subscribeToSystemTheme } from '@/utils/systemTheme';

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

  // Cronologia (undo/redo) dello schema estratto — max 10 passi
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [darkMode, setDarkModeState] = useState(getSystemPrefersDark);
  const [toastData, setToastData] = useState<Toast | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>('lettura');
  const [parsedSchema, setParsedSchemaState] = useState<ParsedSchema | null>(null);

  const moduleTheme = useMemo(() => getModuleTheme('panel-schedule'), []);

  // ── Cronologia (undo/redo) dello schema estratto — max 10 passi ──
  const MAX_HISTORY = 10;
  const [history, setHistory] = useState<(ParsedSchema | null)[]>([]);
  const [redoStack, setRedoStack] = useState<(ParsedSchema | null)[]>([]);

  const setParsedSchema = useCallback((s: ParsedSchema | null) => {
    setParsedSchemaState(prev => {
      setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), prev]);
      setRedoStack([]);
      return s;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory(h => {
      if (h.length === 0) return h;
      const last = h[h.length - 1];
      setRedoStack(r => [...r.slice(-(MAX_HISTORY - 1)), parsedSchema]);
      setParsedSchemaState(last);
      return h.slice(0, -1);
    });
  }, [parsedSchema]);

  const redo = useCallback(() => {
    setRedoStack(r => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), parsedSchema]);
      setParsedSchemaState(last);
      return r.slice(0, -1);
    });
  }, [parsedSchema]);

  // Ctrl+Z / Ctrl+Shift+Z (o Ctrl+Y) — ignorati mentre si scrive in un campo di testo.
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
      parsedSchema, setParsedSchema,
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

export { DEFAULT_THEME };
