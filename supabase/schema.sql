-- FinatriX backend schema
-- Run this once in your Supabase project: SQL Editor → New query → paste → Run.
--
-- It creates a single per-user table that holds each user's tool data as JSON,
-- protected by Row Level Security so a user can only ever read/write their own row.
-- (Display names are stored in Supabase Auth user metadata, so no separate
--  profiles table is required.)

create table if not exists public.tool_data (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.tool_data enable row level security;

-- A user can read their own row.
drop policy if exists "tool_data_select_own" on public.tool_data;
create policy "tool_data_select_own"
  on public.tool_data for select
  using (auth.uid() = user_id);

-- A user can create their own row.
drop policy if exists "tool_data_insert_own" on public.tool_data;
create policy "tool_data_insert_own"
  on public.tool_data for insert
  with check (auth.uid() = user_id);

-- A user can update their own row.
drop policy if exists "tool_data_update_own" on public.tool_data;
create policy "tool_data_update_own"
  on public.tool_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Defense-in-depth: cap the per-user JSON payload so a signed-in user cannot
-- write an unbounded blob (storage abuse / cost). ~1 MB is orders of magnitude
-- above any legitimate tool dataset (real data is KB-scale). Idempotent:
-- drop-then-add so re-running this file is safe.
alter table public.tool_data drop constraint if exists tool_data_size_cap;
alter table public.tool_data add constraint tool_data_size_cap
  check (pg_column_size(data) <= 1048576);

-- Keep updated_at honest: the column default only fires on INSERT, and a client
-- could otherwise send a spoofed/backdated value on upsert. This trigger stamps
-- the server's time on every write. `set search_path = ''` prevents object
-- resolution hijacking (Supabase "mutable search path" hardening).
create or replace function public.fx_touch_updated_at()
returns trigger language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tool_data_touch on public.tool_data;
create trigger tool_data_touch
  before update on public.tool_data
  for each row execute function public.fx_touch_updated_at();
