// L'app gira senza login reale (stesso "bypass" di CableFill, vedi
// src/modules/cablefill/context/AuthContext.tsx, AUTH_BYPASS = true): non esiste
// mai una sessione Supabase, quindi supabase.auth.getUser()/getSession()
// restituiscono sempre null. Tutti i servizi del modulo usano questo utente fisso.
export type UserProfile = {
  id: string;
  email: string;
  name?: string;
  role: string;
};

export const BYPASS_USER: UserProfile = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'r.azevedo@rilodp.it',
  name: 'Rafael Azevedo',
  role: 'admin',
};

export const getCurrentUser = (): UserProfile => BYPASS_USER;
