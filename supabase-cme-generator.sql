-- ============================================================
-- CME GENERATOR — Prezzari, esempi di apprendimento IA, configurazione,
-- progetti e storage del template Excel.
-- Esegui questo script nell'SQL Editor di Supabase (è rieseguibile).
--
-- Adattato dal pacchetto originale cme-generator (sql/01, 02, 03):
--  * L'app gira senza login reale (AUTH_BYPASS, vedi
--    src/modules/cablefill/context/AuthContext.tsx): non esiste mai una
--    sessione Supabase, quindi auth.uid() è sempre NULL e le policy
--    "TO authenticated" / "auth.uid() = user_id" / cme_is_admin() bloccherebbero
--    ogni lettura e scrittura. Le policy qui sotto permettono l'accesso alla
--    chiave anon; il ruolo admin è controllato lato applicazione.
--  * SCHEMA SEPARATO: tutte le tabelle vivono nello schema "cme_generator",
--    non in "public", così i dati di questo modulo non si mescolano con quelli
--    degli altri moduli (CableFill, Impianto FV, ...). Il client Supabase del
--    modulo (src/modules/cme-generator/lib/supabase.ts) punta a questo schema.
--  * Le colonne user_id / uploaded_by / aprovado_por restano popolate con
--    l'utente fisso di bypass, ma senza chiave esterna verso auth.users
--    (quell'utente non esiste davvero in auth.users).
--  * cme_examples ha il vincolo UNIQUE (codice_dei, codice_target), richiesto
--    dall'upsert di examplesService.ts (lo script "all-in-one" originale non
--    lo creava e l'upsert falliva con 42P10).
-- ============================================================

-- ── Schema dedicato ──────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS cme_generator;

GRANT USAGE ON SCHEMA cme_generator TO anon, authenticated, service_role;

-- Privilegi su tutto ciò che verrà creato in questo schema (tabelle, sequenze, funzioni)
ALTER DEFAULT PRIVILEGES IN SCHEMA cme_generator
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA cme_generator
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA cme_generator
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

-- Esporre lo schema all'API (PostgREST). Equivale a Dashboard → Project Settings →
-- API → "Exposed schemas". Se nel progetto hai già altri schemi esposti oltre a
-- public e graphql_public, aggiungili a questa lista prima di eseguire.
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, graphql_public, cme_generator';
NOTIFY pgrst, 'reload config';

-- ── Prezzari (condivisi) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cme_generator.cme_prezzarios (
  id           BIGSERIAL PRIMARY KEY,
  uploaded_by  UUID,
  nome         TEXT NOT NULL,
  data_import  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_voci   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cme_generator.cme_prezzario_voci (
  id            BIGSERIAL PRIMARY KEY,
  prezzario_id  BIGINT NOT NULL REFERENCES cme_generator.cme_prezzarios(id) ON DELETE CASCADE,
  codice        TEXT NOT NULL,
  descrizione   TEXT NOT NULL DEFAULT '',
  valore        NUMERIC(14,4) NOT NULL DEFAULT 0,
  um            TEXT NOT NULL DEFAULT 'cad',
  categoria     TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS cme_voci_prezzario_idx ON cme_generator.cme_prezzario_voci (prezzario_id);
CREATE INDEX IF NOT EXISTS cme_voci_codice_idx    ON cme_generator.cme_prezzario_voci (prezzario_id, codice);

-- ── Configurazione per utente (chiave IA, metadati template) ──
-- ATTENZIONE: la chiave IA salvata qui (chave = 'gemini_api_key') è leggibile
-- da chiunque abbia la chiave anon dell'app, come già avviene per le chiavi
-- VITE_* incluse nel bundle. Va bene per uso interno; da rivedere se l'app
-- verrà esposta pubblicamente.
CREATE TABLE IF NOT EXISTS cme_generator.cme_config (
  user_id  UUID NOT NULL,
  chave    TEXT NOT NULL,
  valor    TEXT,
  PRIMARY KEY (user_id, chave)
);

-- ── Esempi confermati (banca di apprendimento IA) ────────────
CREATE TABLE IF NOT EXISTS cme_generator.cme_examples (
  id                    BIGSERIAL PRIMARY KEY,
  descrizione_elemento  TEXT NOT NULL,
  codice_dei            TEXT NOT NULL DEFAULT '',
  descrizione_dei       TEXT NOT NULL DEFAULT '',
  codice_target         TEXT NOT NULL,
  descrizione_target    TEXT NOT NULL DEFAULT '',
  valore_unitario       NUMERIC(14,4) NOT NULL DEFAULT 0,
  um                    TEXT NOT NULL DEFAULT 'cad',
  categoria             TEXT NOT NULL DEFAULT '',
  score_confirmacao     NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  vezes_usado           INTEGER NOT NULL DEFAULT 0,
  aprovado_por          UUID,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (codice_dei, codice_target)
);

-- Indice per la ricerca testuale usata da findSimilarExamples (textSearch su descrizione_elemento)
CREATE INDEX IF NOT EXISTS cme_examples_fts_idx
  ON cme_generator.cme_examples USING GIN (to_tsvector('simple', descrizione_elemento));
CREATE INDEX IF NOT EXISTS cme_examples_codice_dei_idx ON cme_generator.cme_examples (codice_dei);
CREATE INDEX IF NOT EXISTS cme_examples_vezes_idx      ON cme_generator.cme_examples (vezes_usado DESC);

CREATE OR REPLACE FUNCTION cme_generator.cme_increment_example_usage(example_ids BIGINT[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = cme_generator
AS $$
  UPDATE cme_generator.cme_examples
  SET vezes_usado = vezes_usado + 1,
      atualizado_em = NOW()
  WHERE id = ANY(example_ids);
$$;

GRANT EXECUTE ON FUNCTION cme_generator.cme_increment_example_usage(BIGINT[]) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Progetti CME (stato di lavoro: elementi, risultati, override) ──
CREATE TABLE IF NOT EXISTS cme_generator.cme_projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_id     UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Consulta BD: conversazioni con il consulente di prezzario (per utente) ──
CREATE TABLE IF NOT EXISTS cme_generator.cme_chat_conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  title       TEXT NOT NULL DEFAULT 'Nuova conversazione',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cme_generator.cme_chat_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES cme_generator.cme_chat_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content          TEXT NOT NULL DEFAULT '',
  images           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- immagini allegate (JPEG base64 ridimensionato)
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cme_chat_conv_user_idx ON cme_generator.cme_chat_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS cme_chat_msg_conv_idx  ON cme_generator.cme_chat_messages (conversation_id, created_at);

-- Indice trigram per la ricerca per sottostringa (ILIKE '%...%') nelle descrizioni delle voci
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;
CREATE INDEX IF NOT EXISTS cme_voci_descr_trgm_idx
  ON cme_generator.cme_prezzario_voci USING GIN (descrizione extensions.gin_trgm_ops);

GRANT ALL ON ALL TABLES IN SCHEMA cme_generator TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA cme_generator TO anon, authenticated, service_role;

-- ── RLS: accesso aperto alla chiave anon (vedi nota in testa) ──
ALTER TABLE cme_generator.cme_prezzarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_generator.cme_prezzario_voci  ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_generator.cme_config          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_generator.cme_examples        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_generator.cme_projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_generator.cme_chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cme_generator.cme_chat_messages      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cme_prezzarios_open"  ON cme_generator.cme_prezzarios;
DROP POLICY IF EXISTS "cme_voci_open"        ON cme_generator.cme_prezzario_voci;
DROP POLICY IF EXISTS "cme_config_open"      ON cme_generator.cme_config;
DROP POLICY IF EXISTS "cme_examples_open"    ON cme_generator.cme_examples;
DROP POLICY IF EXISTS "cme_projects_open"    ON cme_generator.cme_projects;
DROP POLICY IF EXISTS "cme_chat_conv_open"   ON cme_generator.cme_chat_conversations;
DROP POLICY IF EXISTS "cme_chat_msg_open"    ON cme_generator.cme_chat_messages;

CREATE POLICY "cme_prezzarios_open" ON cme_generator.cme_prezzarios
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cme_voci_open" ON cme_generator.cme_prezzario_voci
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cme_config_open" ON cme_generator.cme_config
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cme_examples_open" ON cme_generator.cme_examples
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cme_projects_open" ON cme_generator.cme_projects
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cme_chat_conv_open" ON cme_generator.cme_chat_conversations
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "cme_chat_msg_open" ON cme_generator.cme_chat_messages
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ── Storage: bucket privato per il template Excel del computo ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('cme-generator-templates', 'cme-generator-templates', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "cme_templates_select" ON storage.objects;
DROP POLICY IF EXISTS "cme_templates_insert" ON storage.objects;
DROP POLICY IF EXISTS "cme_templates_update" ON storage.objects;
DROP POLICY IF EXISTS "cme_templates_delete" ON storage.objects;

CREATE POLICY "cme_templates_select" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'cme-generator-templates');
CREATE POLICY "cme_templates_insert" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'cme-generator-templates');
CREATE POLICY "cme_templates_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'cme-generator-templates') WITH CHECK (bucket_id = 'cme-generator-templates');
CREATE POLICY "cme_templates_delete" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'cme-generator-templates');

-- Ricarica la cache dello schema dell'API
NOTIFY pgrst, 'reload schema';
