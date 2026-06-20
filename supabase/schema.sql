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
