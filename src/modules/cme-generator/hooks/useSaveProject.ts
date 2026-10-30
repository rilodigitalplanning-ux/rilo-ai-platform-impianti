import { useState, useCallback } from 'react';
import { useCme } from '../context/CmeContext';
import { useApp } from '../context/AppContext';
import { saveProject } from '../services/projectService';

// Salvataggio del progetto in corso (usato dalla barra superiore e da Risultati).
export function useSaveProject() {
  const { state, dispatch } = useCme();
  const { showToast } = useApp();
  const [isSaving, setIsSaving] = useState(false);

  const save = useCallback(async (): Promise<boolean> => {
    let nameToSave = state.projectName;
    if (!nameToSave) {
      const input = window.prompt('Qual è il nome di questo nuovo progetto (computo)?');
      if (!input || !input.trim()) return false;
      nameToSave = input.trim();
    }

    setIsSaving(true);
    try {
      const id = await saveProject(nameToSave, state, state.projectId || undefined);
      dispatch({ type: 'SET_PROJECT_ID', payload: { id, name: nameToSave } });
      dispatch({ type: 'MARK_SAVED' });
      showToast('Progetto salvato con successo!', 'success');
      return true;
    } catch (err: any) {
      showToast(err?.message || 'Errore durante il salvataggio del progetto.', 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [state, dispatch, showToast]);

  return { save, isSaving };
}
