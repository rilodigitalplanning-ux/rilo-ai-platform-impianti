-- =============================================================================
-- rilo-platform-impianti — Initial schema
-- Module: CableFill Pro (cable tray / conduit fill calculator)
-- Project ID: qbgmdcsxbwywpizqgozh
-- =============================================================================

-- Enable UUID extension (already available on Supabase by default)
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- User table
-- Mirrors Supabase auth.users; stores role, approval status and module access.
-- ---------------------------------------------------------------------------
create table if not exists public."User" (
  id                 uuid        primary key references auth.users(id) on delete cascade,
  email              text        not null unique,
  name               text,
  full_name          text,
  role               text        not null default 'user',          -- 'admin' | 'user'
  is_approved        smallint    not null default 0,               -- 0 = pending, 1 = approved
  accessible_modules text[]      not null default array['cablefill'],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Auto-update updated_at on row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_user_updated_at
  before update on public."User"
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public."User" enable row level security;

-- Authenticated users can read their own row
create policy "users_read_own" on public."User"
  for select using (auth.uid() = id);

-- Admins can read all rows
create policy "admin_read_all" on public."User"
  for select using (
    exists (
      select 1 from public."User" u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- Admins can update any row
create policy "admin_update_all" on public."User"
  for update using (
    exists (
      select 1 from public."User" u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- Admins can delete any row
create policy "admin_delete_all" on public."User"
  for delete using (
    exists (
      select 1 from public."User" u
      where u.id = auth.uid() and u.role = 'admin'
    )
  );

-- Service-role bypass is handled automatically by Supabase for the service_role key.

-- ---------------------------------------------------------------------------
-- Auto-insert User row when a new auth user registers
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public."User" (id, email, name, full_name, role, is_approved, accessible_modules)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'full_name',
    'user',
    0,
    array['cablefill']
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Notes
-- ---------------------------------------------------------------------------
-- Projects and cables are stored client-side / in localStorage for now.
-- When the platform migrates to server-side persistence, add:
--   public."Project"  (id, user_id, name, structure jsonb, cables jsonb, created_at, updated_at)
-- and reference it here.
