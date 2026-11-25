-- Proof that group goals and children's names (migration
-- 20261125000200_group_goals_children.sql) let in exactly the right people,
-- and leave nothing behind. Same shape as groups_rls_probe.sql: one DO block,
-- acting as each caller in turn, ALWAYS ending with `raise exception 'RESULT
-- ...'`, which rolls everything back. Every check in RESULT must be "ok": true.
--
--   * PGlite: deno run --node-modules-dir=none --no-lock -A supabase/functions/_e2e/groups.ts
--   * production, after the migration: the Management API SQL endpoint with
--     read_only: false (it must run as postgres to switch roles).

do $$
declare
  v_a    uuid := gen_random_uuid();  -- creates the family: admin and a parent
  v_b    uuid := gen_random_uuid();  -- joins: a member and a parent
  v_c    uuid := gen_random_uuid();  -- never joins: an outsider
  v_res  jsonb := '[]';
  v_ok   boolean;
  v_n    int;
  v_r    jsonb;
  v_g    uuid;
  v_ma   uuid;
  v_mb   uuid;
  v_goal uuid := gen_random_uuid();
  v_con  uuid := gen_random_uuid();
  v_kid  uuid := gen_random_uuid();  -- A's child
  v_kid2 uuid := gen_random_uuid();  -- B's child
  v_exp  uuid := gen_random_uuid();
begin
  insert into auth.users (id, email)
  select u, 'probe-' || u || '@groups.invalid' from unnest(array[v_a, v_b, v_c]) as u;

  -- A creates a family; B joins it.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r := public.create_group('Probe family', '🏡', 'family', 'Asha', 'INR', true);
  v_g := (v_r ->> 'group_id')::uuid;
  select mm.member_id into v_ma from public.my_group_memberships() mm where mm.group_id = v_g;
  reset role;
  set local role service_role;
  perform public.group_join_by_code(v_b, v_r ->> 'code', 'Bala', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select mm.member_id into v_mb from public.my_group_memberships() mm where mm.group_id = v_g;

  -- ── Goals ──────────────────────────────────────────────────────────────
  insert into public.group_goals (id, group_id, name, emoji, target, target_date)
  values (v_goal, v_g, 'Goa holiday', '🏖️', 60000, date '2027-05-01');
  select created_by = v_mb and updated_by = v_mb into v_ok from public.group_goals where id = v_goal;
  v_res := v_res || jsonb_build_object('check', 'a member adds a goal, stamped with their member id', 'ok', coalesce(v_ok, false));

  begin
    insert into public.group_goals (group_id, name, target, created_by) values (v_g, 'Forged', 1, v_ma);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'nobody can send created_by for a goal', 'ok', v_ok);

  insert into public.group_goal_contributions (id, group_id, goal_id, member_id, amount, added_on)
  values (v_con, v_g, v_goal, v_ma, 15000, date '2026-11-25');
  insert into public.group_goal_contributions (group_id, goal_id, member_id, amount, added_on, note)
  values (v_g, v_goal, v_mb, 7500.50, date '2026-11-25', 'Diwali bonus');
  select sum(amount) = 22500.50 into v_ok from public.group_goal_contributions where goal_id = v_goal and deleted_at is null;
  v_res := v_res || jsonb_build_object('check', 'members record contributions for any member, and they add up', 'ok', coalesce(v_ok, false));

  begin
    insert into public.group_goal_contributions (group_id, goal_id, member_id, amount, added_on)
    values (v_g, v_goal, v_mb, 0, date '2026-11-25');
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a contribution must be more than zero', 'ok', v_ok);

  update public.group_goal_contributions set deleted_at = now() where id = v_con;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'a member can soft-delete a contribution', 'ok', v_n = 1);

  update public.group_goals set target = 65000 where id = v_goal;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'a member can change a goal''s target', 'ok', v_n = 1);

  begin
    update public.group_goals set group_id = gen_random_uuid() where id = v_goal;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a goal can''t be moved to another group', 'ok', v_ok);

  -- ── Children ───────────────────────────────────────────────────────────
  begin
    insert into public.group_dependents (group_id, display_name, guardian_confirmed) values (v_g, 'Riya', false);
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a child''s name needs the parent''s confirmation', 'ok', v_ok);

  insert into public.group_dependents (id, group_id, display_name, guardian_confirmed) values (v_kid2, v_g, 'Riya', true);
  select created_by = v_mb into v_ok from public.group_dependents where id = v_kid2;
  v_res := v_res || jsonb_build_object('check', 'the parent who adds a child is stamped as managing them', 'ok', coalesce(v_ok, false));
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.group_dependents (id, group_id, display_name, guardian_confirmed) values (v_kid, v_g, 'Aarav', true);
  insert into public.group_expenses (id, group_id, amount, category, spent_on, paid_by, for_dependent)
  values (v_exp, v_g, 4500, 'education', date '2026-11-25', v_ma, v_kid);
  select for_dependent = v_kid into v_ok from public.group_expenses where id = v_exp;
  v_res := v_res || jsonb_build_object('check', 'an expense can be "for" a child', 'ok', coalesce(v_ok, false));

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by, for_dependent)
    values (v_g, 1, 'other', date '2026-11-25', v_ma, gen_random_uuid());
    v_ok := false;
  exception when foreign_key_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'an expense can only be for a child in the same group', 'ok', v_ok);

  -- A is the admin: may rename B's child.
  update public.group_dependents set display_name = 'Riya S' where id = v_kid2;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'an admin can rename another parent''s child', 'ok', v_n = 1);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.group_dependents set display_name = 'Changed' where id = v_kid;
  get diagnostics v_n = row_count;
  delete from public.group_dependents where id = v_kid;
  get diagnostics v_r = row_count;
  select count(*) = 1 into v_ok from public.group_dependents where id = v_kid and display_name = 'Aarav';
  v_res := v_res || jsonb_build_object('check', 'another (non-admin) member can''t rename or remove someone else''s child',
    'ok', coalesce(v_ok and v_n = 0 and v_r::text = '0', false));
  reset role;

  -- ── Outsiders see and write nothing ────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select (select count(*) from public.group_goals) + (select count(*) from public.group_goal_contributions)
       + (select count(*) from public.group_dependents) into v_n;
  v_res := v_res || jsonb_build_object('check', 'an outsider sees no goals, contributions or children', 'ok', v_n = 0);
  begin
    insert into public.group_goals (group_id, name, target) values (v_g, 'Sneaky', 1);
    v_ok := false;
  exception when insufficient_privilege or foreign_key_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'an outsider can''t add a goal', 'ok', v_ok);
  begin
    insert into public.group_dependents (group_id, display_name, guardian_confirmed) values (v_g, 'Sneaky', true);
    v_ok := false;
  exception when insufficient_privilege or foreign_key_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'an outsider can''t add a child', 'ok', v_ok);
  reset role;

  set local role anon;
  begin
    perform 1 from public.group_dependents;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'signed-out visitors can''t read children''s names', 'ok', v_ok);
  reset role;

  -- ── A parent leaving takes their children's names ─────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_group(v_g);
  reset role;
  select count(*) into v_n from public.group_dependents where id = v_kid2;
  select count(*) = 1 into v_ok from public.group_dependents where id = v_kid;
  v_res := v_res || jsonb_build_object('check', 'when a parent leaves, their children''s names are deleted; others'' stay',
    'ok', coalesce(v_n = 0 and v_ok, false));

  -- Removing a child keeps the expense and clears the tag.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.group_dependents where id = v_kid;
  reset role;
  select for_dependent is null into v_ok from public.group_expenses where id = v_exp;
  v_res := v_res || jsonb_build_object('check', 'removing a child keeps their expenses and clears the tag', 'ok', coalesce(v_ok, false));

  -- ── Limits ─────────────────────────────────────────────────────────────
  set local role authenticated;
  for i in 1..9 loop
    insert into public.group_dependents (group_id, display_name, guardian_confirmed) values (v_g, 'Kid ' || i, true);
  end loop;
  begin
    insert into public.group_dependents (group_id, display_name, guardian_confirmed) values (v_g, 'Kid 10', true);
    insert into public.group_dependents (group_id, display_name, guardian_confirmed) values (v_g, 'Kid 11', true);
    v_ok := false;
  exception when raise_exception then v_ok := sqlerrm = 'too_many_children';
  end;
  v_res := v_res || jsonb_build_object('check', 'a group holds at most 10 children', 'ok', v_ok);
  reset role;

  -- ── Privileges and Realtime ────────────────────────────────────────────
  select not has_table_privilege('anon', 'public.group_goals', 'select')
     and not has_table_privilege('anon', 'public.group_goal_contributions', 'select')
     and not has_table_privilege('anon', 'public.group_dependents', 'select')
     and not has_table_privilege('authenticated', 'public.group_goals', 'delete')
     and not has_table_privilege('authenticated', 'public.group_goal_contributions', 'delete')
     and not has_column_privilege('authenticated', 'public.group_dependents', 'created_by', 'update')
    into v_ok;
  v_res := v_res || jsonb_build_object('check', 'no anon access; goals are never hard-deleted by members; nobody can reassign a child''s parent',
    'ok', coalesce(v_ok, false));

  select not has_function_privilege('authenticated', 'public.group_stage3_limits()', 'execute')
     and not has_function_privilege('authenticated', 'public.group_members_after_leave_dependents()', 'execute')
    into v_ok;
  v_res := v_res || jsonb_build_object('check', 'the new trigger functions can''t be called directly', 'ok', coalesce(v_ok, false));

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    select count(*) into v_n from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('group_goals', 'group_goal_contributions', 'group_dependents');
    v_res := v_res || jsonb_build_object('check', 'live updates are on for goals, contributions and children', 'ok', v_n = 3);
  end if;

  raise exception 'RESULT %', v_res::text;
end $$;
