-- ============================================================
-- IMPIANTO FV — Salvataggio progetti e calcoli (cavo DC di stringa)
-- Esegui questo script nell'SQL Editor di Supabase.
-- Segue esattamente lo stesso pattern già in uso per "Project"
-- (colonna "calculations" TEXT con JSON, RLS auth.uid() = "userId").
-- ============================================================

CREATE TABLE IF NOT EXISTS public."FvProject" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  "calculations" TEXT NOT NULL DEFAULT '[]',
  "lastSaved" TEXT,
  "userId" UUID NOT NULL REFERENCES public."User"(id) ON DELETE CASCADE
);

ALTER TABLE public."FvProject" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own FV projects" ON public."FvProject";
CREATE POLICY "Users can manage own FV projects"
ON public."FvProject" FOR ALL
USING (auth.uid() = "userId");
