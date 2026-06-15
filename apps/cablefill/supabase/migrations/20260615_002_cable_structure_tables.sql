-- =============================================================================
-- rilo-platform-impianti — CableFill module tables
-- Cable and Structure shared database (admin-managed, all users can read)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Cable table
-- ---------------------------------------------------------------------------
create table if not exists public."Cable" (
  id         uuid        primary key default uuid_generate_v4(),
  indice     integer,
  name       text        not null,
  type       text        not null check (type in ('power', 'data', 'evac', 'irai')),
  diameter   numeric(8,3) not null,
  size       text,
  weight     numeric(8,3) default 0,
  "userId"   uuid        references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public."Cable" enable row level security;

-- All authenticated users can read cables
create policy "cables_read_all" on public."Cable"
  for select using (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
create policy "cables_admin_write" on public."Cable"
  for all using (
    exists (select 1 from public."User" u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- Structure table
-- ---------------------------------------------------------------------------
create table if not exists public."Structure" (
  id          uuid        primary key default uuid_generate_v4(),
  name        text        not null,
  type        text        not null check (type in ('tray', 'conduit')),
  width       numeric(8,2) not null,
  height      numeric(8,2) not null default 0,
  "fillLimit" integer     not null default 40 check ("fillLimit" between 1 and 100),
  "userId"    uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public."Structure" enable row level security;

-- All authenticated users can read structures
create policy "structures_read_all" on public."Structure"
  for select using (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
create policy "structures_admin_write" on public."Structure"
  for all using (
    exists (select 1 from public."User" u where u.id = auth.uid() and u.role = 'admin')
  );

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_cable_type    on public."Cable" (type);
create index if not exists idx_cable_indice  on public."Cable" (indice);
create index if not exists idx_structure_type on public."Structure" (type, width);
