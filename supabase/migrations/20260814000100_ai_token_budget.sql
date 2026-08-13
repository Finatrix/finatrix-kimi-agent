-- ═══════════════════════════════════════════════════════════════════════════
-- AI cost controls: token budgets, a global ceiling, and a response cache.
--
-- WHY
-- ---
-- `increment_ai_usage` meters CALLS. Cost is driven by TOKENS, and the two are
-- not proportional: the daily limit of 60 calls permits anywhere between ~15K
-- and ~500K output tokens depending on what is asked, a >30x spread on the
-- same nominal quota. A per-user call cap also says nothing about total spend —
-- a thousand accounts each politely under quota is still a thousand quotas.
--
-- Three additions, each doing one job:
--   1. Per-user daily TOKEN budget, checked before the model is called and
--      updated with the real usage after it answers.
--   2. A GLOBAL daily ceiling, so total spend has a hard stop that does not
--      depend on how many accounts exist.
--   3. A per-user response cache, so a repeated identical question is free.
--
-- Backwards compatible: `increment_ai_usage` is left in place and the edge
-- function still falls back to it, so an un-migrated deployment keeps working.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────── token columns ─────────────────────────
alter table public.careers_ai_usage
  add column if not exists prompt_tokens     bigint not null default 0,
  add column if not exists completion_tokens bigint not null default 0;

-- ───────────────────────── global daily meter ─────────────────────────
-- A single row per day covering every user. Deliberately NOT a view over
-- careers_ai_usage: this is read on the hot path of every AI request, and an
-- aggregate over a growing per-user table gets slower exactly as the bill it
-- guards gets larger.
create table if not exists public.ai_usage_global (
  day    date primary key default current_date,
  calls  bigint not null default 0,
  tokens bigint not null default 0
);

alter table public.ai_usage_global enable row level security;
-- No policies: service_role bypasses RLS, and nothing else may read the
-- platform's aggregate spend.

-- ───────────────────────── response cache ─────────────────────────
-- Keyed by (user_id, prompt_hash), never by hash alone. A shared-key cache
-- would make it *structurally possible* to serve one user's financial answer
-- to another on a hash collision; scoping by owner removes that class of bug
-- rather than arguing about its probability.
create table if not exists public.ai_response_cache (
  user_id     uuid not null references auth.users (id) on delete cascade,
  prompt_hash text not null,
  task        text not null default 'unknown',
  model       text not null default '',
  content     text not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, prompt_hash)
);

create index if not exists ai_response_cache_created_idx
  on public.ai_response_cache (created_at);

alter table public.ai_response_cache enable row level security;
-- No policies, for the same reason as above: only the edge function touches it.

-- ───────────────────────── begin_ai_call ─────────────────────────
-- One atomic gate for a request. Returns:
--   -1  per-user daily CALL limit reached
--   -2  per-user daily TOKEN budget reached
--   -3  GLOBAL daily token ceiling reached
--   >=1 the post-increment call count for this user
--
-- Token limits are checked against what has ALREADY been spent: a request is
-- admitted whenever the user is under budget, and the call it makes may carry
-- them over it. Reserving tokens up-front would mean refunding the difference
-- on every request, and a small overshoot on the last call of the day is a far
-- better failure than systematically under-serving every call before it.
create or replace function public.begin_ai_call(
  p_user_id      uuid,
  p_day          date,
  p_call_limit   int,
  p_token_limit  bigint,
  p_global_limit bigint
) returns int language plpgsql
set search_path = ''
as $$
declare
  v_calls        int;
  v_user_tokens  bigint;
  v_global_tokens bigint;
begin
  -- Global ceiling first: it is the cheapest check and the one that protects
  -- the platform rather than the individual.
  if p_global_limit > 0 then
    select tokens into v_global_tokens
      from public.ai_usage_global where day = p_day;
    if coalesce(v_global_tokens, 0) >= p_global_limit then
      return -3;
    end if;
  end if;

  if p_token_limit > 0 then
    select prompt_tokens + completion_tokens into v_user_tokens
      from public.careers_ai_usage
     where user_id = p_user_id and day = p_day;
    if coalesce(v_user_tokens, 0) >= p_token_limit then
      return -2;
    end if;
  end if;

  insert into public.careers_ai_usage (user_id, day, calls)
  values (p_user_id, p_day, 1)
  on conflict (user_id, day) do update
    set calls = public.careers_ai_usage.calls + 1
  where public.careers_ai_usage.calls < p_call_limit
  returning calls into v_calls;

  if v_calls is null then
    select calls into v_calls from public.careers_ai_usage
     where user_id = p_user_id and day = p_day;
    if coalesce(v_calls, 0) >= p_call_limit then
      return -1;
    end if;
  end if;

  insert into public.ai_usage_global (day, calls)
  values (p_day, 1)
  on conflict (day) do update set calls = public.ai_usage_global.calls + 1;

  return coalesce(v_calls, 1);
end $$;

-- ───────────────────────── record_ai_tokens ─────────────────────────
-- Called after the model answers, with the real usage. Separate from the gate
-- because the true cost is not knowable until the response exists.
create or replace function public.record_ai_tokens(
  p_user_id    uuid,
  p_day        date,
  p_prompt     bigint,
  p_completion bigint
) returns void language plpgsql
set search_path = ''
as $$
begin
  update public.careers_ai_usage
     set prompt_tokens     = prompt_tokens + greatest(p_prompt, 0),
         completion_tokens = completion_tokens + greatest(p_completion, 0)
   where user_id = p_user_id and day = p_day;

  insert into public.ai_usage_global (day, tokens)
  values (p_day, greatest(p_prompt, 0) + greatest(p_completion, 0))
  on conflict (day) do update
    set tokens = public.ai_usage_global.tokens + greatest(p_prompt, 0) + greatest(p_completion, 0);
end $$;

-- ───────────────────────── cache maintenance ─────────────────────────
-- Opportunistic pruning, called by the edge function on a cache write. Keeps
-- the table bounded without depending on a scheduled job being healthy.
create or replace function public.prune_ai_cache(p_max_age interval default '2 hours')
returns void language sql
set search_path = ''
as $$
  delete from public.ai_response_cache where created_at < now() - p_max_age;
$$;

-- ───────────────────────── grants ─────────────────────────
-- Same posture as increment_ai_usage: these are edge-function internals and
-- must never be reachable through PostgREST by a signed-in user.
revoke execute on function public.begin_ai_call(uuid, date, int, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.begin_ai_call(uuid, date, int, bigint, bigint) to service_role;

revoke execute on function public.record_ai_tokens(uuid, date, bigint, bigint) from public, anon, authenticated;
grant  execute on function public.record_ai_tokens(uuid, date, bigint, bigint) to service_role;

revoke execute on function public.prune_ai_cache(interval) from public, anon, authenticated;
grant  execute on function public.prune_ai_cache(interval) to service_role;
