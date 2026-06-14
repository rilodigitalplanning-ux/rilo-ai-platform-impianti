-- ─────────────────────────────────────────────────────────────────────────────
-- SQL FOR PROJECT MANAGEMENT MODULE
-- Run this in the Supabase SQL Editor to create the necessary tables
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Table: projects
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT UNIQUE NOT NULL,
    project_name TEXT NOT NULL,
    client_name TEXT,
    description TEXT,
    start_date DATE DEFAULT CURRENT_DATE,
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS for projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- 2. Table: project_phases
CREATE TABLE IF NOT EXISTS public.project_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_db_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    phase_id TEXT NOT NULL, -- e.g. "ph-1"
    title TEXT NOT NULL,
    status TEXT DEFAULT 'locked', -- 'locked', 'active', 'completed'
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for project_phases
ALTER TABLE public.project_phases ENABLE ROW LEVEL SECURITY;

-- 3. Table: checklist_items
CREATE TABLE IF NOT EXISTS public.checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phase_db_id UUID REFERENCES public.project_phases(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL, -- e.g. "item-1"
    label TEXT NOT NULL,
    checked BOOLEAN DEFAULT FALSE,
    order_index INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for checklist_items
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;

-- 4. Policies (Simple: Allow authenticated users to do everything for now)
-- You can restrict these later based on roles if needed.

CREATE POLICY "Allow all actions for authenticated users on projects" 
ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all actions for authenticated users on project_phases" 
ON public.project_phases FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Allow all actions for authenticated users on checklist_items" 
ON public.checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
