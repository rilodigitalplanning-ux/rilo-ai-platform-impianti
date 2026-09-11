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

-- Aggiunte per il modulo "Inverter & Stringa": catalogo inverter/pannelli
-- del progetto e le configurazioni di stringa verificate (compatibilità +
-- sezione cavo consigliata). ADD COLUMN IF NOT EXISTS è sicuro da rieseguire
-- anche se la tabella esiste già da una versione precedente dello script.
ALTER TABLE public."FvProject" ADD COLUMN IF NOT EXISTS "inverters" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE public."FvProject" ADD COLUMN IF NOT EXISTS "panels" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE public."FvProject" ADD COLUMN IF NOT EXISTS "stringConfigs" TEXT NOT NULL DEFAULT '[]';

-- L'utente "bypass" fisso (vedi nota sotto) non esiste davvero né in
-- public."User" né in auth.users, quindi il vincolo di chiave esterna
-- sopra fallisce sempre al salvataggio ("violates foreign key constraint
-- FvProject_userId_fkey"). Rimuovilo: la colonna userId resta comunque
-- popolata per coerenza/filtro, solo senza l'integrità referenziale.
ALTER TABLE public."FvProject" DROP CONSTRAINT IF EXISTS "FvProject_userId_fkey";

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

-- ============================================================
-- Catalogo globale inverter/pannelli: condiviso fra tutti i progetti
-- (non più legato a un singolo FvProject), così un progetto nuovo può
-- subito riselezionare inverter/pannelli già censiti in precedenza,
-- invece di doverli ricreare da zero ogni volta. Una sola riga per utente
-- (chiave primaria = userId), stesso "bypass" fisso di FvProject.
-- ============================================================
CREATE TABLE IF NOT EXISTS public."FvCatalog" (
  "userId" UUID PRIMARY KEY,
  "inverters" TEXT NOT NULL DEFAULT '[]',
  "panels" TEXT NOT NULL DEFAULT '[]'
);

ALTER TABLE public."FvCatalog" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon access to own FV catalog" ON public."FvCatalog";
CREATE POLICY "Allow anon access to own FV catalog"
ON public."FvCatalog" FOR ALL
TO anon
USING (true)
WITH CHECK (true);
