-- Mon Budget — Supabase setup
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Ce script crée UN snapshot privé par utilisateur.

create table if not exists public.budget_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.budget_snapshots enable row level security;

grant select, insert, update, delete
on table public.budget_snapshots
to authenticated;

drop policy if exists "budget_snapshots_select_own" on public.budget_snapshots;
drop policy if exists "budget_snapshots_insert_own" on public.budget_snapshots;
drop policy if exists "budget_snapshots_update_own" on public.budget_snapshots;
drop policy if exists "budget_snapshots_delete_own" on public.budget_snapshots;

create policy "budget_snapshots_select_own"
on public.budget_snapshots
for select
to authenticated
using (auth.uid() = user_id);

create policy "budget_snapshots_insert_own"
on public.budget_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "budget_snapshots_update_own"
on public.budget_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "budget_snapshots_delete_own"
on public.budget_snapshots
for delete
to authenticated
using (auth.uid() = user_id);
