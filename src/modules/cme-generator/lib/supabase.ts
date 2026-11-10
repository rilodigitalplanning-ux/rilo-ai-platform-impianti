import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'placeholder';

// Schema dedicato: le tabelle del CME Generator vivono in "cme_generator" (vedi
// supabase-cme-generator.sql), separate dai dati degli altri moduli in "public".
const CME_SCHEMA = 'cme_generator';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: CME_SCHEMA },
});
