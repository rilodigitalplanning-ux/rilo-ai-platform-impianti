import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/currentUser';
import type { CmeState } from '../types';

export interface CmeProject {
  id: string;
  name: string;
  state: Partial<CmeState>;
  created_at: string;
  updated_at: string;
  user_id: string;
}

// La tabella cme_projects è definita in supabase-cme-generator.sql (root del repo).

export async function listProjects(): Promise<CmeProject[]> {
  const { data, error } = await supabase
    .from('cme_projects')
    .select('id, name, created_at, updated_at, user_id') // Avoid loading heavy state array for listing
    .order('updated_at', { ascending: false });

  if (error) {
    if (error.code === '42P01') {
      throw new Error('La tabella "cme_projects" non esiste in Supabase (schema cme_generator). Eseguire lo script SQL supabase-cme-generator.sql presente nella radice del repository.');
    }
    throw new Error('Errore nel caricamento dei progetti: ' + error.message);
  }
  return data as CmeProject[];
}

export async function loadProject(id: string): Promise<CmeProject> {
  const { data, error } = await supabase
    .from('cme_projects')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error('Errore nel caricamento del progetto: ' + error.message);
  return data as CmeProject;
}

export async function saveProject(name: string, state: Partial<CmeState>, id?: string): Promise<string> {
  const user = getCurrentUser();

  // We need to serialize the Maps in CmeState to Arrays/Objects for JSON storage
  const serializedState = {
    elementos: state.elementos || [],
    resultados: state.resultados ? Array.from(state.resultados.entries()) : [],
    overrides: state.overrides ? Array.from(state.overrides.entries()) : [],
    rawBimOffData: state.rawBimOffData,
  };

  if (id) {
    const { error } = await supabase
      .from('cme_projects')
      .update({ name, state: serializedState, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error("Errore nell'aggiornamento del progetto: " + error.message);
    return id;
  } else {
    const { data, error } = await supabase
      .from('cme_projects')
      .insert([{ name, state: serializedState, user_id: user.id }])
      .select('id')
      .single();
    if (error) throw new Error('Errore nel salvataggio del nuovo progetto: ' + error.message);
    return data.id;
  }
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase
    .from('cme_projects')
    .delete()
    .eq('id', id);
  if (error) throw new Error("Errore nell'eliminazione del progetto: " + error.message);
}
