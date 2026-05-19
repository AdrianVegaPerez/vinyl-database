-- Vinyl Database shared cloud library.
-- Run this in the Supabase SQL editor for the project you want to use.
--
-- Prototype access model:
-- This lets the public anon key read/write rows in this table. That is convenient
-- for a personal prototype, but it is not private user authentication. The next
-- production step should add Supabase Auth and stricter owner-based policies.

create table if not exists public.vinyl_libraries (
  id text primary key,
  records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vinyl_libraries enable row level security;

drop policy if exists "Allow shared library reads" on public.vinyl_libraries;
create policy "Allow shared library reads"
on public.vinyl_libraries
for select
to anon, authenticated
using (true);

drop policy if exists "Allow shared library inserts" on public.vinyl_libraries;
create policy "Allow shared library inserts"
on public.vinyl_libraries
for insert
to anon, authenticated
with check (true);

drop policy if exists "Allow shared library updates" on public.vinyl_libraries;
create policy "Allow shared library updates"
on public.vinyl_libraries
for update
to anon, authenticated
using (true)
with check (true);
