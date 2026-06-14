import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://poqdfjpjnrjoindalbnn.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvcWRmanBqbnJqb2luZGFsYm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODU5NjgsImV4cCI6MjA4Nzg2MTk2OH0.q6-VSWg--VZdUqJQvhMLvBRqerDo9aezQKdM_Iln0qc';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Secondary client for admin operations (like creating users) without affecting the main session
export const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});
