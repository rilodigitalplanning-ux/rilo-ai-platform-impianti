-- ============================================================
-- IMPIANTO FV — Salvataggio progetti e calcoli (cavo DC di stringa)
-- Esegui questo script nell'SQL Editor di Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."FvProject" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  "calculations" TEXT NOT NULL DEFAULT '[]',
  "lastSaved" TEXT,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE
);

ALTER TABLE public."FvProject" ENABLE ROW LEVEL SECURITY;

-- NOTA: l'app gira senza login reale (stesso "bypass" usato da CableFill,
-- vedi src/modules/cablefill/context/AuthContext.tsx, AUTH_BYPASS = true):
-- non esiste mai una sessione Supabase autenticata, quindi auth.uid() è
-- sempre NULL e una policy "auth.uid() = userId" blocca SEMPRE la scrittura
-- (errore 42501 "new row violates row-level security policy"). Finché
-- l'app non fa un login reale, la policy deve permettere l'accesso alla
-- chiave anon, filtrando comunque per userId lato applicazione.
DROP POLICY IF EXISTS "Users can manage own FV projects" ON public."FvProject";
DROP POLICY IF EXISTS "Allow anon access to own FV projects" ON public."FvProject";
CREATE POLICY "Allow anon access to own FV projects"
ON public."FvProject" FOR ALL
TO anon
USING (true)
WITH CHECK (true);
