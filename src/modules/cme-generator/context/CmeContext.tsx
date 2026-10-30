// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/context/CmeContext.tsx
// Global state for the CME Generator module
// ─────────────────────────────────────────────────────────────────────────────
import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';
import type { Elemento, ResultadoItem, CmeState, ChatMessage } from '../types';

type Action =
  | { type: 'SET_ELEMENTOS'; payload: Elemento[] }
  | { type: 'SET_PROCESSING'; payload: boolean }
  | { type: 'SET_PROGRESS'; payload: CmeState['progress'] }
  | { type: 'ADD_RESULTADO'; payload: ResultadoItem }
  | { type: 'APPLY_OVERRIDE'; payload: { id: string; changes: Partial<ResultadoItem> } }
  | { type: 'ADD_CHAT_MSG'; payload: { id: string; msg: ChatMessage } }
  | { type: 'SET_RAW_BIM_OFF_DATA'; payload: any[][] | undefined }
  | { type: 'SET_PROJECT_ID'; payload: { id: string; name: string } | null }
  | { type: 'LOAD_PROJECT'; payload: any }
  | { type: 'APPLY_CHANGES'; payload: { upsert: ResultadoItem[]; remove: string[] } }
  | { type: 'MARK_SAVED' }
  | { type: 'RESET' };

const initialState: CmeState = {
  elementos:   [],
  resultados:  new Map(),
  overrides:   new Map(),
  chatHistory: new Map(),
  isProcessing: false,
  progress:    { current: 0, total: 0, message: '' },
  dirty:       false,
};

function reducer(state: CmeState, action: Action): CmeState {
  switch (action.type) {
    case 'SET_ELEMENTOS':
      return { ...state, elementos: action.payload };
    case 'SET_PROCESSING':
      return { ...state, isProcessing: action.payload };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'ADD_RESULTADO': {
      const next = new Map(state.resultados);
      next.set(action.payload.idElemento, action.payload);
      return { ...state, resultados: next, dirty: true };
    }
    case 'APPLY_OVERRIDE': {
      const overrides = new Map(state.overrides);
      const existing  = overrides.get(action.payload.id) ?? {};
      overrides.set(action.payload.id, { ...existing, ...action.payload.changes });
      return { ...state, overrides, dirty: true };
    }
    case 'ADD_CHAT_MSG': {
      const history = new Map(state.chatHistory);
      const msgs = [...(history.get(action.payload.id) ?? []), action.payload.msg];
      history.set(action.payload.id, msgs);
      return { ...state, chatHistory: history };
    }
    case 'APPLY_CHANGES': {
      // Modifiche in blocco (Elenco/Analisi Prezzi): i risultati scritti sono già "effettivi",
      // quindi gli override degli id toccati vanno azzerati, altrimenti oscurerebbero i nuovi valori.
      const resultados = new Map(state.resultados);
      const overrides = new Map(state.overrides);
      for (const r of action.payload.upsert) {
        resultados.set(r.idElemento, r);
        overrides.delete(r.idElemento);
      }
      for (const id of action.payload.remove) {
        resultados.delete(id);
        overrides.delete(id);
      }
      return { ...state, resultados, overrides, dirty: true };
    }
    case 'MARK_SAVED':
      return { ...state, dirty: false };
    case 'RESET':
      return { ...initialState, resultados: new Map(), overrides: new Map(), chatHistory: new Map(), rawBimOffData: undefined };
    case 'SET_RAW_BIM_OFF_DATA':
      return { ...state, rawBimOffData: action.payload };
    case 'SET_PROJECT_ID':
      return { ...state, projectId: action.payload?.id || null, projectName: action.payload?.name || null };
    case 'LOAD_PROJECT':
      return {
        ...state,
        elementos: action.payload.elementos || [],
        resultados: new Map(action.payload.resultados || []),
        overrides: new Map(action.payload.overrides || []),
        rawBimOffData: action.payload.rawBimOffData,
        projectId: action.payload.id,
        projectName: action.payload.name,
        dirty: false,
      };
    default:
      return state;
  }
}

interface CmeContextType {
  state: CmeState;
  getEffectiveResult: (id: string) => ResultadoItem | undefined;
  getAllEffectiveResults: () => ResultadoItem[];
  /** Importo totale del computo (risultati effettivi, override inclusi) */
  totalAmount: number;
  dispatch: React.Dispatch<Action>;
}

const CmeContext = createContext<CmeContextType | null>(null);

export function CmeProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const getEffectiveResult = useCallback((id: string): ResultadoItem | undefined => {
    const original = state.resultados.get(id);
    if (!original) return undefined;
    const overrides = state.overrides.get(id) ?? {};
    return { ...original, ...overrides };
  }, [state.resultados, state.overrides]);

  const getAllEffectiveResults = useCallback((): ResultadoItem[] => {
    return Array.from(state.resultados.keys())
      .map(id => getEffectiveResult(id)!)
      .filter(Boolean);
  }, [state.resultados, getEffectiveResult]);

  const totalAmount = useMemo(
    () => getAllEffectiveResults().reduce((s, r) => s + r.total, 0),
    [getAllEffectiveResults],
  );

  return (
    <CmeContext.Provider value={{ state, getEffectiveResult, getAllEffectiveResults, totalAmount, dispatch }}>
      {children}
    </CmeContext.Provider>
  );
}

export function useCme(): CmeContextType {
  const ctx = useContext(CmeContext);
  if (!ctx) throw new Error('useCme must be used within CmeProvider');
  return ctx;
}
