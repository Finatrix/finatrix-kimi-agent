-- Groups stage 3 (NEW_FEATURES.md item 12, build step 3.9): group savings
-- goals, and children as names a parent manages.
--
--   group_goals               a shared savings goal ("Goa holiday", ₹60,000)
--   group_goal_contributions  money a member set aside towards a goal. A
--                             record only: no money moves through FinatriX.
--   group_dependents          a child's first name, added and managed by a
--                             parent or guardian in the group. No account, no
--                             login, no age or birthday: India's DPDP Act needs
--                             verifiable parental consent before a child's data
--                             is processed, so the parent confirms it on every
--                             name they add (guardian_confirmed), only the
--                             parent (or an admin) can change or remove it, and
--                             it is deleted outright when removed, when the
--                             parent leaves or deletes their account, or with
--                             the group.
--   group_expenses.for_dependent  "for Aarav" on a group expense (school
--                             fees, pocket money). Children never hold a share
--                             or a balance; the parent pays for them.
--
-- Builds on 20261124000100_groups.sql and reuses its helpers: the same
-- membership policies, the same session stamps (group_rows_stamp, so "Edited
-- by" can't be forged), the same rules for Realtime. Contract for the app:
-- docs/GROUPS.md. Policy proof: supabase/probes/group_goals_children_probe.sql.
-- Idempotent: safe to run again.

-- ── Tables ───────────────────────────────────────────────────────────────

create table if not exists public.group_goals (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  name         text not null
               check (char_length(name) between 1 and 60 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  emoji        text not null default '🎯' check (char_length(emoji) between 1 and 16 and emoji !~ '[[:cntrl:]]'),
  target       numeric(14, 2) not null check (target > 0),
  target_date  date check (target_date between date '2000-01-01' and date '2100-12-31'),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  -- Soft-deleted, like expenses, so the feed can say who removed it and undo works.
  deleted_at   timestamptz,
  constraint group_goals_group_goal_key unique (group_id, id),
  constraint group_goals_created_by_member foreign key (group_id, created_by)
    references public.group_members (group_id, id),
  constraint group_goals_updated_by_member foreign key (group_id, updated_by)
    references public.group_members (group_id, id)
);
create index if not exists group_goals_group_changed_idx on public.group_goals (group_id, updated_at);

create table if not exists public.group_goal_contributions (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  goal_id     uuid not null,
  -- Who set the money aside. Any member of the group (a parent can record a
  -- teenager's savings, say); a former member keeps their past contributions.
  member_id   uuid not null,
  amount      numeric(14, 2) not null check (amount > 0),
  added_on    date not null check (added_on between date '2000-01-01' and date '2100-12-31'),
  note        text check (char_length(note) <= 200 and note !~ '[[:cntrl:]]'),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint group_goal_contributions_goal foreign key (group_id, goal_id)
    references public.group_goals (group_id, id) on delete cascade,
  constraint group_goal_contributions_member foreign key (group_id, member_id)
    references public.group_members (group_id, id),
  constraint group_goal_contributions_created_by_member foreign key (group_id, created_by)
    references public.group_members (group_id, id),
  constraint group_goal_contributions_updated_by_member foreign key (group_id, updated_by)
    references public.group_members (group_id, id)
);
create index if not exists group_goal_contributions_goal_idx on public.group_goal_contributions (goal_id);
create index if not exists group_goal_contributions_group_changed_idx on public.group_goal_contributions (group_id, updated_at);

create table if not exists public.group_dependents (
  id                  uuid primary key default gen_random_uuid(),
  group_id            uuid not null references public.groups (id) on delete cascade,
  display_name        text not null
                      check (char_length(display_name) between 1 and 40
                             and display_name = btrim(display_name) and display_name !~ '[[:cntrl:]]'),
  -- The parent's confirmation, sent with every name: "I'm their parent or
  -- guardian and agree to their name being used in this group".
  guardian_confirmed  boolean not null check (guardian_confirmed),
  -- created_by is the managing parent: stamped from the session, never sent.
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_by          uuid,
  updated_at          timestamptz not null default now(),
  constraint group_dependents_group_dependent_key unique (group_id, id),
  constraint group_dependents_created_by_member foreign key (group_id, created_by)
    references public.group_members (group_id, id),
  constraint group_dependents_updated_by_member foreign key (group_id, updated_by)
    references public.group_members (group_id, id)
);
create index if not exists group_dependents_parent_idx on public.group_dependents (created_by);

alter table public.group_expenses add column if not exists for_dependent uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'group_expenses_for_dependent') then
    -- Removing a child clears the tag only; the expense stays for the others.
    alter table public.group_expenses add constraint group_expenses_for_dependent
      foreign key (group_id, for_dependent) references public.group_dependents (group_id, id)
      on delete set null (for_dependent);
  end if;
end $$;
create index if not exists group_expenses_for_dependent_idx on public.group_expenses (for_dependent)
  where for_dependent is not null;

-- ── Triggers ─────────────────────────────────────────────────────────────

drop trigger if exists group_goals_stamp on public.group_goals;
create trigger group_goals_stamp before insert or update on public.group_goals
  for each row execute function public.group_rows_stamp();
drop trigger if exists group_goal_contributions_stamp on public.group_goal_contributions;
create trigger group_goal_contributions_stamp before insert or update on public.group_goal_contributions
  for each row execute function public.group_rows_stamp();
drop trigger if exists group_dependents_stamp on public.group_dependents;
create trigger group_dependents_stamp before insert or update on public.group_dependents
  for each row execute function public.group_rows_stamp();

-- Limits: 20 live goals and 10 children per group. The group row lock makes
-- two adds at the same moment queue for the last place. SECURITY DEFINER so the
-- count and the lock see the whole group whatever the caller's role; it checks
-- no role, so the definer rights decide nothing.
create or replace function public.group_stage3_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform 1 from public.groups where id = new.group_id for update;
  if tg_table_name = 'group_goals' then
    select count(*) into v_count from public.group_goals where group_id = new.group_id and deleted_at is null;
    if v_count >= 20 then
      raise exception 'too_many_goals' using errcode = 'P0001';
    end if;
  else
    select count(*) into v_count from public.group_dependents where group_id = new.group_id;
    if v_count >= 10 then
      raise exception 'too_many_children' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- Named to fire before the stamp trigger (triggers run in name order).
drop trigger if exists group_goals_limit on public.group_goals;
create trigger group_goals_limit before insert on public.group_goals
  for each row execute function public.group_stage3_limits();
drop trigger if exists group_dependents_limit on public.group_dependents;
create trigger group_dependents_limit before insert on public.group_dependents
  for each row execute function public.group_stage3_limits();

-- A parent who leaves, is removed or deletes their account takes their
-- children's names with them: the consent was theirs. SECURITY DEFINER because
-- it also runs when an account is deleted; it checks no role.
create or replace function public.group_members_after_leave_dependents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.group_dependents where group_id = new.group_id and created_by = new.id;
  return null;
end $$;

drop trigger if exists group_members_after_leave_dependents on public.group_members;
create trigger group_members_after_leave_dependents after update on public.group_members
  for each row when (old.user_id is not null and new.user_id is null)
  execute function public.group_members_after_leave_dependents();

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.group_goals enable row level security;
alter table public.group_goal_contributions enable row level security;
alter table public.group_dependents enable row level security;

drop policy if exists "group_goals_select_member" on public.group_goals;
create policy "group_goals_select_member" on public.group_goals
  for select to authenticated using (group_id in (select public.my_group_ids()));
drop policy if exists "group_goals_insert_member" on public.group_goals;
create policy "group_goals_insert_member" on public.group_goals
  for insert to authenticated with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_goals_update_member" on public.group_goals;
create policy "group_goals_update_member" on public.group_goals
  for update to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (group_id in (select public.my_group_ids()));

drop policy if exists "group_goal_contributions_select_member" on public.group_goal_contributions;
create policy "group_goal_contributions_select_member" on public.group_goal_contributions
  for select to authenticated using (group_id in (select public.my_group_ids()));
drop policy if exists "group_goal_contributions_insert_member" on public.group_goal_contributions;
create policy "group_goal_contributions_insert_member" on public.group_goal_contributions
  for insert to authenticated with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_goal_contributions_update_member" on public.group_goal_contributions;
create policy "group_goal_contributions_update_member" on public.group_goal_contributions
  for update to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (group_id in (select public.my_group_ids()));

-- Every member sees the names (to tag "for Aarav"); only the parent who added
-- a child, or an admin, can rename or remove them.
drop policy if exists "group_dependents_select_member" on public.group_dependents;
create policy "group_dependents_select_member" on public.group_dependents
  for select to authenticated using (group_id in (select public.my_group_ids()));
drop policy if exists "group_dependents_insert_member" on public.group_dependents;
create policy "group_dependents_insert_member" on public.group_dependents
  for insert to authenticated with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_dependents_update_parent" on public.group_dependents;
create policy "group_dependents_update_parent" on public.group_dependents
  for update to authenticated
  using (
    group_id in (select public.my_group_ids())
    and (created_by in (select mm.member_id from public.my_group_memberships() mm)
         or group_id in (select public.my_admin_group_ids()))
  )
  with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_dependents_delete_parent" on public.group_dependents;
create policy "group_dependents_delete_parent" on public.group_dependents
  for delete to authenticated
  using (
    group_id in (select public.my_group_ids())
    and (created_by in (select mm.member_id from public.my_group_memberships() mm)
         or group_id in (select public.my_admin_group_ids()))
  );

-- ── Privileges ───────────────────────────────────────────────────────────
-- Start from nothing, as the groups migration does; column lists keep ids,
-- groups and stamps out of reach.

revoke all on table public.group_goals, public.group_goal_contributions, public.group_dependents
from anon, authenticated;

grant select on table public.group_goals, public.group_goal_contributions, public.group_dependents
to authenticated;

grant insert (id, group_id, name, emoji, target, target_date) on public.group_goals to authenticated;
grant update (name, emoji, target, target_date, deleted_at) on public.group_goals to authenticated;
grant insert (id, group_id, goal_id, member_id, amount, added_on, note)
  on public.group_goal_contributions to authenticated;
grant update (member_id, amount, added_on, note, deleted_at) on public.group_goal_contributions to authenticated;
grant insert (id, group_id, display_name, guardian_confirmed) on public.group_dependents to authenticated;
grant update (display_name) on public.group_dependents to authenticated;
grant delete on public.group_dependents to authenticated;
grant insert (for_dependent), update (for_dependent) on public.group_expenses to authenticated;

grant all on table public.group_goals, public.group_goal_contributions, public.group_dependents to service_role;

revoke execute on function public.group_stage3_limits() from public, anon, authenticated;
revoke execute on function public.group_members_after_leave_dependents() from public, anon, authenticated;

-- ── Live updates ─────────────────────────────────────────────────────────
-- Same rules as the groups migration: random keys, so a delete broadcast to
-- every subscriber carries nothing meaningful; goals and contributions are
-- soft-deleted (an update, which Realtime checks against the policies). A
-- child's name is hard-deleted on purpose, and its key says nothing.
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['group_goals', 'group_goal_contributions', 'group_dependents'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end $$;
