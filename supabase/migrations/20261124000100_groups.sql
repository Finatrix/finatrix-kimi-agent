-- Groups: shared spaces where a family, flatmates or friends track money
-- together (NEW_FEATURES.md item 12, build step 2.2).
--
-- This is FinatriX's first data that more than one person can see. Everything
-- else syncs as one private snapshot per user (`tool_data`), so groups get
-- their own tables, and Row Level Security lets only a group's CURRENT members
-- read or write its rows.
--
--   groups                   name, emoji, type, one currency, which modes are on
--   group_members            role, display name, joined and left. The row stays
--                            as "Former member" after its person leaves, is
--                            removed or deletes their account, so past expenses
--                            keep a payer, but the person's details are cleared.
--   group_invites            one room code per group, 7-day expiry, admin reset
--   group_expenses           paid by, split rule and shares (soft-deleted)
--   group_settlements        "Mark as paid" records (soft-deleted)
--   group_budgets            Budget together: a monthly budget by category
--   group_age_confirmations  the 18+ confirmation, given once per person
--
-- The client writes expenses, settlements and budgets directly (PostgREST,
-- checked by RLS), plus a group's settings (admins only) and its own display
-- name. Everything that changes who is in a group goes through functions:
-- create_group, reset_group_code, leave_group and remove_group_member for
-- signed-in users, and group_join_by_code for the service role only. The
-- `group-join` edge function calls it after verifying the caller and limiting
-- lookups per user and per IP, so room codes can't be guessed.
--
-- created_by and updated_by on shared rows are member ids, stamped by a
-- trigger from the caller's session, so "Edited by Priya" can't be forged.
--
-- Contract for the app: docs/GROUPS.md. Policy proof: supabase/probes/
-- groups_rls_probe.sql. Idempotent: safe to run again.

-- ── Tables ───────────────────────────────────────────────────────────────

create table if not exists public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null
                   check (char_length(name) between 1 and 60 and name = btrim(name) and name !~ '[[:cntrl:]]'),
  emoji            text not null check (char_length(emoji) between 1 and 16 and emoji !~ '[[:cntrl:]]'),
  type             text not null check (type in ('family', 'couple', 'home', 'trip', 'friends')),
  currency         text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  budget_together  boolean not null,
  split_costs      boolean not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint groups_one_mode_on check (budget_together or split_costs)
);

create table if not exists public.group_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references public.groups (id) on delete cascade,
  -- Set null when the account is deleted; the trigger below then clears the
  -- person's details, exactly as leaving does.
  user_id       uuid references auth.users (id) on delete set null,
  role          text not null default 'member' check (role in ('admin', 'member')),
  display_name  text,
  -- clock_timestamp, not now(): joins inside one transaction still get a
  -- distinct order, and "longest-standing member" means exactly that.
  joined_at     timestamptz not null default clock_timestamp(),
  left_at       timestamptz,
  -- Lets expenses and settlements point at a member of THEIR OWN group with a
  -- plain foreign key, instead of trusting the client.
  constraint group_members_group_member_key unique (group_id, id),
  constraint group_members_one_row_per_person unique (group_id, user_id),
  -- A current member is a person; a former member is no one.
  constraint group_members_current_xor_former check ((user_id is null) = (left_at is not null)),
  constraint group_members_details check (
    case when user_id is null
      then display_name is null and role = 'member'
      else display_name is not null
           and char_length(display_name) between 1 and 40
           and display_name = btrim(display_name)
           and display_name !~ '[[:cntrl:]]'
    end
  )
);
create index if not exists group_members_person_idx on public.group_members (user_id) where user_id is not null;

create table if not exists public.group_invites (
  group_id    uuid primary key references public.groups (id) on delete cascade,
  -- Crockford base32 (no I, L, O or U), shown as FX-7K2P9Q.
  code        text not null unique check (code ~ '^[0-9A-HJKMNP-TV-Z]{6}$'),
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_expenses (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  amount      numeric(14, 2) not null check (amount > 0),
  category    text not null check (char_length(category) between 1 and 60),
  note        text check (char_length(note) <= 200),
  spent_on    date not null check (spent_on between date '2000-01-01' and date '2100-12-31'),
  paid_by     uuid not null,
  -- How the cost is shared, for "Split costs". Null for a group that only
  -- budgets together. The maths that turns these into balances is step 2.4's.
  split_rule  text check (split_rule in ('equal', 'shares', 'exact')),
  shares      jsonb,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint group_expenses_split_complete check ((split_rule is null) = (shares is null)),
  constraint group_expenses_paid_by_member foreign key (group_id, paid_by)
    references public.group_members (group_id, id),
  constraint group_expenses_created_by_member foreign key (group_id, created_by)
    references public.group_members (group_id, id),
  constraint group_expenses_updated_by_member foreign key (group_id, updated_by)
    references public.group_members (group_id, id)
);
create index if not exists group_expenses_group_day_idx on public.group_expenses (group_id, spent_on desc);
create index if not exists group_expenses_group_changed_idx on public.group_expenses (group_id, updated_at);

create table if not exists public.group_settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  from_member  uuid not null,
  to_member    uuid not null,
  amount       numeric(14, 2) not null check (amount > 0),
  settled_on   date not null check (settled_on between date '2000-01-01' and date '2100-12-31'),
  note         text check (char_length(note) <= 200),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_by   uuid,
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint group_settlements_two_people check (from_member <> to_member),
  constraint group_settlements_from_member foreign key (group_id, from_member)
    references public.group_members (group_id, id),
  constraint group_settlements_to_member foreign key (group_id, to_member)
    references public.group_members (group_id, id),
  constraint group_settlements_created_by_member foreign key (group_id, created_by)
    references public.group_members (group_id, id),
  constraint group_settlements_updated_by_member foreign key (group_id, updated_by)
    references public.group_members (group_id, id)
);
create index if not exists group_settlements_group_changed_idx on public.group_settlements (group_id, updated_at);

create table if not exists public.group_budgets (
  -- A random key rather than (group, month, category). Realtime sends a
  -- deleted row's key to every subscriber, because no policy can be checked
  -- against a row that's gone, and a category name is the household's own words.
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  month       text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  category    text not null check (char_length(category) between 1 and 60),
  amount      numeric(14, 2) not null check (amount >= 0),
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_by  uuid,
  updated_at  timestamptz not null default now(),
  -- A plain unique constraint, not a partial index, so PostgREST's upsert can
  -- target it: on_conflict=group_id,month,category.
  constraint group_budgets_one_per_category unique (group_id, month, category),
  constraint group_budgets_created_by_member foreign key (group_id, created_by)
    references public.group_members (group_id, id),
  constraint group_budgets_updated_by_member foreign key (group_id, updated_by)
    references public.group_members (group_id, id)
);

create table if not exists public.group_age_confirmations (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  confirmed_at  timestamptz not null default now()
);

-- ── Helpers for the policies ─────────────────────────────────────────────

-- The caller's current groups. SECURITY DEFINER because a policy on
-- group_members that read group_members as the caller would recurse into
-- itself; the empty search_path prevents object-resolution hijacking.
-- Policies use `group_id in (select public.my_group_ids())`, which the planner
-- evaluates once per statement rather than once per row.
create or replace function public.my_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.group_id from public.group_members m
  where m.user_id = (select auth.uid()) and m.left_at is null
$$;

create or replace function public.my_admin_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.group_id from public.group_members m
  where m.user_id = (select auth.uid()) and m.left_at is null and m.role = 'admin'
$$;

-- The caller's own member row in each of their current groups, so the app can
-- tell which member is "you". Members can't read group_members.user_id (that
-- is the person's account id, which would let members of different groups
-- tell that they share someone), so this is the only way to find it.
create or replace function public.my_group_memberships()
returns table (group_id uuid, member_id uuid, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.group_id, m.id, m.role from public.group_members m
  where m.user_id = (select auth.uid()) and m.left_at is null
$$;

-- ── Room codes ───────────────────────────────────────────────────────────

create or replace function public.group_new_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  -- Crockford base32: no I, L, O or U, so a code read out on a call is hard
  -- to mishear. 32^6 is about a billion codes.
  v_alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  -- gen_random_uuid() draws from the server's strong random source, and the
  -- first six bytes of a v4 UUID are fully random (the version and variant
  -- bits sit in bytes 6 and 8).
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code  text := '';
begin
  for i in 0..5 loop
    -- 256 is a multiple of 32, so keeping the low five bits is unbiased.
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end $$;

-- Give a group a fresh code that expires in 7 days (first code or a reset).
create or replace function public.group_issue_code(p_group_id uuid)
returns public.group_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.group_invites;
begin
  for attempt in 1..8 loop
    begin
      insert into public.group_invites (group_id, code, expires_at, created_at)
      values (p_group_id, public.group_new_code(), now() + interval '7 days', now())
      on conflict (group_id) do update
        set code = excluded.code, expires_at = excluded.expires_at, created_at = excluded.created_at
      returning * into v_invite;
      return v_invite;
    exception when unique_violation then
      -- The new code already belongs to another group: draw again.
      null;
    end;
  end loop;
  raise exception 'group_code_unavailable' using errcode = 'P0001';
end $$;

-- 18+: given once, then remembered. True when the person has confirmed now or before.
create or replace function public.group_adult_confirmed(p_user uuid, p_confirm boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(p_confirm, false) then
    insert into public.group_age_confirmations (user_id) values (p_user)
    on conflict (user_id) do nothing;
    return true;
  end if;
  return exists (select 1 from public.group_age_confirmations where user_id = p_user);
end $$;

-- ── Triggers ─────────────────────────────────────────────────────────────

-- Who did what, from the session rather than the request body. A group row
-- never moves to another group, and its creation stamp never changes. The
-- service role (no session) keeps what it sends.
create or replace function public.group_rows_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if tg_op = 'UPDATE' then
    new.group_id   := old.group_id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  if auth.uid() is not null then
    -- A non-member finds nothing here, and RLS then rejects the row anyway.
    select mm.member_id into v_member from public.my_group_memberships() mm
    where mm.group_id = new.group_id;
    if tg_op = 'INSERT' then
      new.created_by := v_member;
    end if;
    new.updated_by := v_member;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists group_expenses_stamp on public.group_expenses;
create trigger group_expenses_stamp before insert or update on public.group_expenses
  for each row execute function public.group_rows_stamp();
drop trigger if exists group_settlements_stamp on public.group_settlements;
create trigger group_settlements_stamp before insert or update on public.group_settlements
  for each row execute function public.group_rows_stamp();
drop trigger if exists group_budgets_stamp on public.group_budgets;
create trigger group_budgets_stamp before insert or update on public.group_budgets
  for each row execute function public.group_rows_stamp();

-- Shares: [{ "member": "<group_members.id>", "value": <number> }, ...]
--   equal   everyone listed shares equally (any value is ignored)
--   shares  value is a weight, more than 0
--   exact   value is that person's part, in paise precision, adding up to the amount
-- Every person must be in this group. A former member is allowed, so an old
-- expense can still be edited after someone leaves.
-- Triggers fire in name order, so this runs after group_expenses_stamp has
-- pinned group_id, and checks the group the row will really be in.
create or replace function public.group_expenses_validate_shares()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item    jsonb;
  v_members uuid[] := '{}';
  v_member  uuid;
  v_value   numeric;
  v_total   numeric := 0;
begin
  if new.shares is null then
    return new;
  end if;
  if jsonb_typeof(new.shares) <> 'array' or jsonb_array_length(new.shares) not between 1 and 20 then
    raise exception 'group_expense_shares_invalid' using errcode = '23514',
      detail = 'shares must list 1 to 20 people';
  end if;
  for v_item in select value from jsonb_array_elements(new.shares) loop
    if jsonb_typeof(v_item) <> 'object' or coalesce(jsonb_typeof(v_item -> 'member'), '') <> 'string' then
      raise exception 'group_expense_shares_invalid' using errcode = '23514',
        detail = 'each share needs a member';
    end if;
    begin
      v_member := (v_item ->> 'member')::uuid;
    exception when invalid_text_representation then
      raise exception 'group_expense_shares_invalid' using errcode = '23514',
        detail = 'a share names something that is not a member';
    end;
    if v_member = any (v_members) then
      raise exception 'group_expense_shares_invalid' using errcode = '23514',
        detail = 'a person is listed twice';
    end if;
    v_members := v_members || v_member;
    if new.split_rule <> 'equal' then
      if coalesce(jsonb_typeof(v_item -> 'value'), '') <> 'number' then
        raise exception 'group_expense_shares_invalid' using errcode = '23514',
          detail = 'each share needs a value';
      end if;
      v_value := (v_item ->> 'value')::numeric;
      if new.split_rule = 'shares' and not (v_value > 0 and v_value <= 1000) then
        raise exception 'group_expense_shares_invalid' using errcode = '23514',
          detail = 'a weight must be more than 0';
      end if;
      if new.split_rule = 'exact' and not (v_value >= 0 and v_value = round(v_value, 2)) then
        raise exception 'group_expense_shares_invalid' using errcode = '23514',
          detail = 'an exact part must be 0 or more, to the paisa';
      end if;
      v_total := v_total + v_value;
    end if;
  end loop;
  if new.split_rule = 'exact' and v_total <> new.amount then
    raise exception 'group_expense_shares_invalid' using errcode = '23514',
      detail = 'exact parts must add up to the amount';
  end if;
  if (select count(*) from public.group_members m
      where m.group_id = new.group_id and m.id = any (v_members)) <> cardinality(v_members) then
    raise exception 'group_expense_shares_invalid' using errcode = '23514',
      detail = 'everyone in a split must be in this group';
  end if;
  return new;
end $$;

drop trigger if exists group_expenses_validate_shares on public.group_expenses;
create trigger group_expenses_validate_shares before insert or update on public.group_expenses
  for each row execute function public.group_expenses_validate_shares();

-- Settings edits stamp the time; the creation time never changes.
create or replace function public.groups_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists groups_before_update on public.groups;
create trigger groups_before_update before update on public.groups
  for each row execute function public.groups_before_update();

-- Limits, enforced however a member row arrives: 20 current members per
-- group, and 50 current groups per person (so one account can't fill the
-- database with groups). The group row lock makes two people joining at the
-- same moment queue for the last place instead of both taking it.
create or replace function public.group_members_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform 1 from public.groups where id = new.group_id for update;
  select count(*) into v_count from public.group_members
  where group_id = new.group_id and left_at is null;
  if v_count >= 20 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  if new.user_id is not null then
    select count(*) into v_count from public.group_members
    where user_id = new.user_id and left_at is null;
    if v_count >= 50 then
      raise exception 'too_many_groups' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists group_members_before_insert on public.group_members;
create trigger group_members_before_insert before insert on public.group_members
  for each row execute function public.group_members_before_insert();

-- A member row always belongs to the same group and person. Leaving, being
-- removed and deleting the account all end the same way: the person is
-- cleared (user_id set null, here or by the foreign key), and so are their
-- details. What stays is a "Former member" that past expenses still point at.
create or replace function public.group_members_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.group_id  := old.group_id;
  new.joined_at := old.joined_at;
  if new.user_id is distinct from old.user_id then
    if new.user_id is not null then
      raise exception 'group_member_person_is_fixed' using errcode = 'P0001';
    end if;
    new.display_name := null;
    new.role := 'member';
    new.left_at := now();
  end if;
  return new;
end $$;

drop trigger if exists group_members_before_update on public.group_members;
create trigger group_members_before_update before update on public.group_members
  for each row execute function public.group_members_before_update();

-- After someone goes: a group nobody is left in is deleted with everything in
-- it, and a group whose last admin went gets the longest-standing member as
-- its admin. SECURITY DEFINER because it also runs when an account is deleted.
create or replace function public.group_members_after_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.group_members where group_id = new.group_id and left_at is null) then
    delete from public.groups where id = new.group_id;
  elsif not exists (
    select 1 from public.group_members where group_id = new.group_id and left_at is null and role = 'admin'
  ) then
    update public.group_members set role = 'admin'
    where id = (
      select id from public.group_members
      where group_id = new.group_id and left_at is null
      order by joined_at, id
      limit 1
    );
  end if;
  return null;
end $$;

drop trigger if exists group_members_after_leave on public.group_members;
create trigger group_members_after_leave after update on public.group_members
  for each row when (old.user_id is not null and new.user_id is null)
  execute function public.group_members_after_leave();

-- ── Functions the app calls ──────────────────────────────────────────────

-- Create a group with the caller as its admin, and its first room code.
create or replace function public.create_group(
  p_name          text,
  p_emoji         text,
  p_type          text,
  p_display_name  text,
  p_currency      text default 'INR',
  p_confirm_adult boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_group  uuid;
  v_invite public.group_invites;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not public.group_adult_confirmed(v_uid, p_confirm_adult) then
    raise exception 'adult_confirmation_required' using errcode = 'P0001';
  end if;
  -- The type sets the starting mode: families and couples budget together;
  -- flatmates, trips and friends split costs. Admins can switch either on.
  insert into public.groups (name, emoji, type, currency, budget_together, split_costs)
  values (
    btrim(p_name), btrim(p_emoji), p_type, upper(btrim(coalesce(p_currency, 'INR'))),
    p_type in ('family', 'couple'), p_type in ('home', 'trip', 'friends')
  )
  returning id into v_group;
  insert into public.group_members (group_id, user_id, role, display_name)
  values (v_group, v_uid, 'admin', btrim(p_display_name));
  v_invite := public.group_issue_code(v_group);
  return jsonb_build_object('group_id', v_group, 'code', v_invite.code, 'expires_at', v_invite.expires_at);
end $$;

-- A new code for the group (admins only). The old code stops working at once.
create or replace function public.reset_group_code(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.group_invites;
begin
  if not exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and left_at is null and role = 'admin'
  ) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  v_invite := public.group_issue_code(p_group_id);
  return jsonb_build_object('code', v_invite.code, 'expires_at', v_invite.expires_at);
end $$;

-- Leave a group. Your past expenses stay for the others as "Former member".
create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_members set user_id = null
  where group_id = p_group_id and user_id = auth.uid() and left_at is null;
  if not found then
    raise exception 'not_group_member' using errcode = 'P0001';
  end if;
end $$;

-- Remove someone from a group (admins only). To go yourself, leave instead.
-- The removed person knew the room code, so it is reset too, and the new one
-- is returned for the admin to share with anyone still to join.
create or replace function public.remove_group_member(p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.group_members;
  v_invite public.group_invites;
begin
  select * into v_target from public.group_members where id = p_member_id;
  -- Same answer for "no such member" and "not your group", so member ids
  -- can't be probed.
  if not found or not exists (
    select 1 from public.group_members
    where group_id = v_target.group_id and user_id = auth.uid() and left_at is null and role = 'admin'
  ) then
    raise exception 'not_group_admin' using errcode = '42501';
  end if;
  if v_target.user_id = auth.uid() then
    raise exception 'use_leave_group' using errcode = 'P0001';
  end if;
  if v_target.user_id is null then
    return null;  -- already a Former member: nothing changes
  end if;
  update public.group_members set user_id = null where id = p_member_id;
  v_invite := public.group_issue_code(v_target.group_id);
  return jsonb_build_object('code', v_invite.code, 'expires_at', v_invite.expires_at);
end $$;

-- Look a room code up, and join with it. Service role only: the `group-join`
-- edge function verifies the caller and limits lookups per user and per IP
-- first, so p_user is always the verified caller. Every outcome comes back as
-- a status rather than an error; only a joined (or existing) member learns the
-- group's id, and nobody outside it learns who is in it.
create or replace function public.group_join_by_code(
  p_user          uuid,
  p_code          text,
  p_display_name  text default null,
  p_confirm_adult boolean default false,
  p_preview       boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.group_invites;
  v_group  public.groups;
  v_count  int;
  v_status text;
  v_card   jsonb;
begin
  select * into v_invite from public.group_invites where code = upper(btrim(p_code));
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_invite.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  select * into v_group from public.groups where id = v_invite.group_id;
  select count(*) into v_count from public.group_members where group_id = v_group.id and left_at is null;

  if exists (
    select 1 from public.group_members where group_id = v_group.id and user_id = p_user and left_at is null
  ) then
    v_status := 'already_member';
  elsif v_count >= 20 then
    v_status := 'group_full';
  elsif p_preview then
    v_status := 'ok';
  elsif not public.group_adult_confirmed(p_user, p_confirm_adult) then
    v_status := 'adult_confirmation_required';
  else
    begin
      insert into public.group_members (group_id, user_id, role, display_name)
      values (v_group.id, p_user, 'member', btrim(p_display_name));
      v_status := 'joined';
      v_count := v_count + 1;
    exception
      when raise_exception then
        -- 'group_full' (someone took the last place first) or 'too_many_groups'.
        v_status := sqlerrm;
      when unique_violation then
        -- The same person's other join (a double tap) got in first.
        v_status := 'already_member';
        select count(*) into v_count from public.group_members where group_id = v_group.id and left_at is null;
    end;
  end if;

  v_card := jsonb_build_object('name', v_group.name, 'emoji', v_group.emoji, 'type', v_group.type, 'members', v_count);
  if v_status in ('joined', 'already_member') then
    v_card := v_card || jsonb_build_object('id', v_group.id);
  end if;
  return jsonb_build_object('status', v_status, 'group', v_card);
end $$;

-- ── Row Level Security ───────────────────────────────────────────────────

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_expenses enable row level security;
alter table public.group_settlements enable row level security;
alter table public.group_budgets enable row level security;
alter table public.group_age_confirmations enable row level security;

drop policy if exists "groups_select_member" on public.groups;
create policy "groups_select_member" on public.groups
  for select to authenticated using (id in (select public.my_group_ids()));
drop policy if exists "groups_update_admin" on public.groups;
create policy "groups_update_admin" on public.groups
  for update to authenticated
  using (id in (select public.my_admin_group_ids()))
  with check (id in (select public.my_admin_group_ids()));
drop policy if exists "groups_delete_admin" on public.groups;
create policy "groups_delete_admin" on public.groups
  for delete to authenticated using (id in (select public.my_admin_group_ids()));

drop policy if exists "group_members_select_member" on public.group_members;
create policy "group_members_select_member" on public.group_members
  for select to authenticated using (group_id in (select public.my_group_ids()));
drop policy if exists "group_members_update_own_name" on public.group_members;
create policy "group_members_update_own_name" on public.group_members
  for update to authenticated
  using (user_id = (select auth.uid()) and left_at is null)
  with check (user_id = (select auth.uid()) and left_at is null);

drop policy if exists "group_invites_select_member" on public.group_invites;
create policy "group_invites_select_member" on public.group_invites
  for select to authenticated using (group_id in (select public.my_group_ids()));

drop policy if exists "group_expenses_select_member" on public.group_expenses;
create policy "group_expenses_select_member" on public.group_expenses
  for select to authenticated using (group_id in (select public.my_group_ids()));
drop policy if exists "group_expenses_insert_member" on public.group_expenses;
create policy "group_expenses_insert_member" on public.group_expenses
  for insert to authenticated with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_expenses_update_member" on public.group_expenses;
create policy "group_expenses_update_member" on public.group_expenses
  for update to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (group_id in (select public.my_group_ids()));

drop policy if exists "group_settlements_select_member" on public.group_settlements;
create policy "group_settlements_select_member" on public.group_settlements
  for select to authenticated using (group_id in (select public.my_group_ids()));
drop policy if exists "group_settlements_insert_member" on public.group_settlements;
create policy "group_settlements_insert_member" on public.group_settlements
  for insert to authenticated with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_settlements_update_member" on public.group_settlements;
create policy "group_settlements_update_member" on public.group_settlements
  for update to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (group_id in (select public.my_group_ids()));

drop policy if exists "group_budgets_select_member" on public.group_budgets;
create policy "group_budgets_select_member" on public.group_budgets
  for select to authenticated using (group_id in (select public.my_group_ids()));
drop policy if exists "group_budgets_insert_member" on public.group_budgets;
create policy "group_budgets_insert_member" on public.group_budgets
  for insert to authenticated with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_budgets_update_member" on public.group_budgets;
create policy "group_budgets_update_member" on public.group_budgets
  for update to authenticated
  using (group_id in (select public.my_group_ids()))
  with check (group_id in (select public.my_group_ids()));
drop policy if exists "group_budgets_delete_member" on public.group_budgets;
create policy "group_budgets_delete_member" on public.group_budgets
  for delete to authenticated using (group_id in (select public.my_group_ids()));

drop policy if exists "group_age_confirmations_select_own" on public.group_age_confirmations;
create policy "group_age_confirmations_select_own" on public.group_age_confirmations
  for select to authenticated using (user_id = (select auth.uid()));

-- ── Privileges ───────────────────────────────────────────────────────────
-- Supabase grants every new public table to anon and authenticated by default.
-- Start from nothing and grant only what the policies above are meant to
-- allow; column lists keep ids, groups, stamps and roles out of reach.

revoke all on table
  public.groups, public.group_members, public.group_invites, public.group_expenses,
  public.group_settlements, public.group_budgets, public.group_age_confirmations
from anon, authenticated;

grant select on table
  public.groups, public.group_invites, public.group_expenses,
  public.group_settlements, public.group_budgets, public.group_age_confirmations
to authenticated;
-- Every column but user_id, the person's account id: members see each other by
-- name, never by account (Realtime leaves out columns the subscriber can't
-- select, too). my_group_memberships() tells the app which row is "you".
grant select (id, group_id, role, display_name, joined_at, left_at) on public.group_members to authenticated;

grant update (name, emoji, budget_together, split_costs) on public.groups to authenticated;
grant delete on public.groups to authenticated;
grant update (display_name) on public.group_members to authenticated;
grant insert (id, group_id, amount, category, note, spent_on, paid_by, split_rule, shares)
  on public.group_expenses to authenticated;
grant update (amount, category, note, spent_on, paid_by, split_rule, shares, deleted_at)
  on public.group_expenses to authenticated;
grant insert (id, group_id, from_member, to_member, amount, settled_on, note)
  on public.group_settlements to authenticated;
grant update (from_member, to_member, amount, settled_on, note, deleted_at)
  on public.group_settlements to authenticated;
-- Budgets are saved with an upsert, which sets every key column it sends;
-- the stamp trigger keeps group_id fixed.
grant insert (group_id, month, category, amount), update (group_id, month, category, amount), delete
  on public.group_budgets to authenticated;

grant all on table
  public.groups, public.group_members, public.group_invites, public.group_expenses,
  public.group_settlements, public.group_budgets, public.group_age_confirmations
to service_role;

-- Functions: the app's four, the policy helpers (my_group_memberships is also
-- the app's way to find its own member rows), and nothing else for users.
revoke execute on function public.my_group_ids() from public, anon;
revoke execute on function public.my_admin_group_ids() from public, anon;
grant execute on function public.my_group_ids() to authenticated, service_role;
grant execute on function public.my_admin_group_ids() to authenticated, service_role;
revoke execute on function public.my_group_memberships() from public, anon;
grant execute on function public.my_group_memberships() to authenticated, service_role;

revoke execute on function public.create_group(text, text, text, text, text, boolean) from public, anon;
revoke execute on function public.reset_group_code(uuid) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.remove_group_member(uuid) from public, anon;
grant execute on function public.create_group(text, text, text, text, text, boolean) to authenticated, service_role;
grant execute on function public.reset_group_code(uuid) to authenticated, service_role;
grant execute on function public.leave_group(uuid) to authenticated, service_role;
grant execute on function public.remove_group_member(uuid) to authenticated, service_role;

revoke execute on function public.group_join_by_code(uuid, text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.group_join_by_code(uuid, text, text, boolean, boolean) to service_role;

revoke execute on function public.group_new_code() from public, anon, authenticated;
revoke execute on function public.group_issue_code(uuid) from public, anon, authenticated;
revoke execute on function public.group_adult_confirmed(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.group_rows_stamp() from public, anon, authenticated;
revoke execute on function public.group_expenses_validate_shares() from public, anon, authenticated;
revoke execute on function public.groups_before_update() from public, anon, authenticated;
revoke execute on function public.group_members_before_insert() from public, anon, authenticated;
revoke execute on function public.group_members_before_update() from public, anon, authenticated;
revoke execute on function public.group_members_after_leave() from public, anon, authenticated;

-- ── Live updates ─────────────────────────────────────────────────────────
-- The activity feed listens to these through Supabase Realtime. Realtime
-- applies the SELECT policies to inserts and updates, but it can't check a
-- delete against a row that's gone, so every subscriber of a table hears every
-- delete, with the row's primary key. So every table here has a random id as
-- its key, and expenses and settlements are soft-deleted: an update, which is
-- checked.
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['group_members', 'group_expenses', 'group_settlements', 'group_budgets'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end $$;

-- ── Room-code lookup limits ──────────────────────────────────────────────
-- `group-join` counts lookups in provider_quota under two hourly scopes. Keep
-- them as short-lived as the AI's hourly IP windows (48 hours). Everything
-- else here is unchanged from 20261106000100_prune_quota_windows.sql.
create or replace function public.prune_quota_windows() returns void
  language sql set search_path = '' as $$
  delete from public.provider_quota
  where (scope in ('analytics:global:min', 'ai:user:min', 'ip:preauth', 'ip:min')
         and window_start < floor(extract(epoch from now()) / 60)::bigint - 1440)
     or (scope in ('ai:ip:hour', 'group-join:user:hour', 'group-join:ip:hour')
         and window_start < floor(extract(epoch from now()) / 3600)::bigint - 48);
$$;
revoke execute on function public.prune_quota_windows() from public, anon, authenticated;
grant execute on function public.prune_quota_windows() to service_role;
