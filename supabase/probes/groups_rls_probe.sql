-- Proof that the groups tables (migration 20261124000100_groups.sql) let in
-- exactly the right people, and leave nothing behind.
--
-- One DO block creates throwaway accounts, then acts as each of them in turn,
-- with the JWT claims PostgREST would set and `set local role authenticated`,
-- `anon` or `service_role`. It records whether each attempt was allowed, and it
-- ALWAYS ends with `raise exception 'RESULT ...'`, which rolls back every row
-- and role switch. The run passes when every check in RESULT has "ok": true.
--
-- Run it:
--   * on PGlite, against a Supabase-shaped database, with
--       deno run --node-modules-dir=none --no-lock -A supabase/functions/_e2e/groups.ts
--   * on production once the migration is applied, through the Management API
--     SQL endpoint with read_only: false (it must run as postgres to switch
--     roles). The API answers HTTP 400 carrying the RESULT message.

do $$
declare
  v_a     uuid := gen_random_uuid();  -- creates the family group and the flat: their admin
  v_b     uuid := gen_random_uuid();  -- joins the family with the code
  v_c     uuid := gen_random_uuid();  -- never joins anything: an outsider
  v_d     uuid := gen_random_uuid();  -- joins the family, ends up its last member
  v_e     uuid := gen_random_uuid();  -- joins the flat, then deletes their account
  v_f     uuid := gen_random_uuid();  -- creates a group that fills up
  v_x     uuid := gen_random_uuid();  -- joins the family and is removed by the admin
  v_mx    uuid;                       -- X's member id
  v_res   jsonb := '[]';
  v_ok    boolean;
  v_n     int;
  v_r     jsonb;
  v_t     text;
  v_u     uuid;
  v_g     uuid;  -- the family group
  v_g2    uuid;  -- the flat
  v_g3    uuid;  -- the group that fills up
  v_code  text;
  v_code2 text;
  v_code3 text;
  v_ma    uuid;  -- A's member id in the family
  v_mb    uuid;  -- B's member id in the family
  v_ma2   uuid;  -- A's member id in the flat
  v_exp   uuid;
  v_tables text[] := array['groups', 'group_members', 'group_invites', 'group_expenses',
                           'group_settlements', 'group_budgets', 'group_age_confirmations'];
  v_functions text[] := array['my_group_ids', 'my_admin_group_ids', 'group_new_code', 'group_issue_code',
                              'group_adult_confirmed', 'group_rows_stamp', 'group_expenses_validate_shares',
                              'groups_before_update', 'group_members_before_insert',
                              'group_members_before_update', 'group_members_after_leave', 'create_group',
                              'reset_group_code', 'leave_group', 'remove_group_member', 'group_join_by_code'];
  v_user_callable text[] := array['my_group_ids', 'my_admin_group_ids', 'create_group', 'reset_group_code',
                                  'leave_group', 'remove_group_member'];
begin
  -- Accounts, as the auth server would add them.
  insert into auth.users (id, email)
  select u, 'probe-' || u || '@groups.invalid' from unnest(array[v_a, v_b, v_c, v_d, v_e, v_f, v_x]) as u;

  -- ── A creates two groups ───────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  begin
    perform public.create_group('Probe family', '🏡', 'family', 'Asha');
    v_ok := false;
  exception when raise_exception then v_ok := sqlerrm = 'adult_confirmation_required';
  end;
  v_res := v_res || jsonb_build_object('check', 'creating a group needs the 18+ confirmation first', 'ok', v_ok);

  v_r := public.create_group('Probe family', '🏡', 'family', 'Asha', 'INR', true);
  v_g := (v_r ->> 'group_id')::uuid;
  v_code := v_r ->> 'code';
  v_res := v_res || jsonb_build_object('check', 'create_group returns a 6-character code that lasts 7 days',
    'ok', coalesce(v_code ~ '^[0-9A-HJKMNP-TV-Z]{6}$'
                   and (v_r ->> 'expires_at')::timestamptz = now() + interval '7 days', false));

  select g.budget_together and not g.split_costs into v_ok from public.groups g where g.id = v_g;
  v_res := v_res || jsonb_build_object('check', 'a family group starts in Budget together', 'ok', coalesce(v_ok, false));

  select m.id, m.role = 'admin' and m.display_name = 'Asha' into v_ma, v_ok
  from public.group_members m where m.group_id = v_g and m.user_id = v_a;
  v_res := v_res || jsonb_build_object('check', 'the creator is its admin, under the name they gave', 'ok', coalesce(v_ok, false));

  v_r := public.create_group('Probe flat', '🏢', 'home', 'Asha');
  v_g2 := (v_r ->> 'group_id')::uuid;
  v_code2 := v_r ->> 'code';
  select g.split_costs and not g.budget_together into v_ok from public.groups g where g.id = v_g2;
  v_res := v_res || jsonb_build_object('check', 'the 18+ confirmation is remembered, and a flatmates group starts in Split costs',
    'ok', coalesce(v_ok, false));
  select m.id into v_ma2 from public.group_members m where m.group_id = v_g2 and m.user_id = v_a;

  begin
    perform public.group_join_by_code(v_a, v_code);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'signed-in users cannot call group_join_by_code (only the edge function can)', 'ok', v_ok);
  reset role;

  -- ── Joining with the code (the edge function's service role) ───────────
  set local role service_role;
  v_r := public.group_join_by_code(v_b, v_code, null, false, true);
  v_res := v_res || jsonb_build_object('check', 'a preview shows the group''s name and size, never its id',
    'ok', coalesce(v_r ->> 'status' = 'ok' and v_r -> 'group' ->> 'name' = 'Probe family'
                   and (v_r -> 'group' ->> 'members')::int = 1 and not (v_r -> 'group' ? 'id'), false));

  v_r := public.group_join_by_code(v_b, v_code, 'Bala');
  v_res := v_res || jsonb_build_object('check', 'joining needs the 18+ confirmation the first time',
    'ok', coalesce(v_r ->> 'status' = 'adult_confirmation_required', false));

  v_r := public.group_join_by_code(v_b, lower(v_code), 'Bala', true);
  v_res := v_res || jsonb_build_object('check', 'joining with the confirmation works, whatever the letter case',
    'ok', coalesce(v_r ->> 'status' = 'joined' and (v_r -> 'group' ->> 'id')::uuid = v_g
                   and (v_r -> 'group' ->> 'members')::int = 2, false));

  v_r := public.group_join_by_code(v_b, v_code, 'Bala', true);
  v_res := v_res || jsonb_build_object('check', 'joining twice is harmless', 'ok', coalesce(v_r ->> 'status' = 'already_member', false));

  v_r := public.group_join_by_code(v_c, 'UUUUUU', 'Chitra', true, true);
  v_res := v_res || jsonb_build_object('check', 'an unknown code is not_found', 'ok', coalesce(v_r ->> 'status' = 'not_found', false));

  v_r := public.group_join_by_code(v_d, v_code, 'Dev', true);
  v_res := v_res || jsonb_build_object('check', 'a third person joins', 'ok', coalesce(v_r ->> 'status' = 'joined', false));
  reset role;

  select m.id into v_mb from public.group_members m where m.group_id = v_g and m.user_id = v_b;

  update public.group_invites set expires_at = now() - interval '1 second' where group_id = v_g2;
  set local role service_role;
  v_r := public.group_join_by_code(v_c, v_code2, 'Chitra', true);
  reset role;
  v_res := v_res || jsonb_build_object('check', 'an expired code is refused', 'ok', coalesce(v_r ->> 'status' = 'expired', false));
  update public.group_invites set expires_at = now() + interval '7 days' where group_id = v_g2;

  -- ── C, an outsider ─────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.groups where id in (v_g, v_g2);
  v_ok := v_n = 0;
  select count(*) into v_n from public.group_members where group_id in (v_g, v_g2);
  v_ok := v_ok and v_n = 0;
  select count(*) into v_n from public.group_invites where group_id in (v_g, v_g2);
  v_ok := v_ok and v_n = 0;
  select count(*) into v_n from public.group_age_confirmations;
  v_ok := v_ok and v_n = 0;
  v_res := v_res || jsonb_build_object('check', 'an outsider sees no group, member, code or anyone''s 18+ confirmation', 'ok', v_ok);

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by)
    values (v_g, 100, 'groceries', current_date, v_ma);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'an outsider cannot add an expense to a group', 'ok', v_ok);

  update public.groups set name = 'Taken over' where id = v_g;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'an outsider cannot rename a group', 'ok', v_n = 0);

  begin
    perform public.reset_group_code(v_g);
    v_ok := false;
  exception when insufficient_privilege then v_ok := sqlerrm = 'not_group_admin';
  end;
  v_res := v_res || jsonb_build_object('check', 'an outsider cannot reset a code', 'ok', v_ok);

  begin
    perform public.remove_group_member(v_mb);
    v_ok := false;
  exception when insufficient_privilege then v_ok := sqlerrm = 'not_group_admin';
  end;
  v_res := v_res || jsonb_build_object('check', 'an outsider cannot remove a member', 'ok', v_ok);

  begin
    perform public.leave_group(v_g);
    v_ok := false;
  exception when raise_exception then v_ok := sqlerrm = 'not_group_member';
  end;
  v_res := v_res || jsonb_build_object('check', 'leave_group refuses someone who is not in the group', 'ok', v_ok);
  reset role;

  -- ── B, a member ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select count(*) into v_n from public.groups where id = v_g;
  v_ok := v_n = 1;
  select count(*) into v_n from public.group_members where group_id = v_g;
  v_ok := v_ok and v_n = 3;
  select count(*) into v_n from public.group_invites where group_id = v_g;
  v_ok := v_ok and v_n = 1;
  v_res := v_res || jsonb_build_object('check', 'a member sees the group, everyone in it and its code', 'ok', v_ok);

  update public.groups set name = 'Renamed by B' where id = v_g;
  get diagnostics v_n = row_count;
  v_ok := v_n = 0;
  delete from public.groups where id = v_g;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'only an admin can change or delete a group', 'ok', v_ok and v_n = 0);

  update public.group_members set display_name = 'Bala K' where id = v_mb;
  get diagnostics v_n = row_count;
  v_ok := v_n = 1;
  update public.group_members set display_name = 'Not Asha' where id = v_ma;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'a member can rename themselves, and nobody else', 'ok', v_ok and v_n = 0);

  begin
    update public.group_members set role = 'admin' where id = v_mb;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a member cannot make themselves admin', 'ok', v_ok);

  begin
    insert into public.group_members (group_id, user_id, display_name) values (v_g, v_c, 'Let in by B');
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'members are only added by create_group and the join function', 'ok', v_ok);

  begin
    update public.group_invites set expires_at = now() + interval '1 year' where group_id = v_g;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'nobody edits a code directly', 'ok', v_ok);

  begin
    perform public.reset_group_code(v_g);
    v_ok := false;
  exception when insufficient_privilege then v_ok := sqlerrm = 'not_group_admin';
  end;
  v_res := v_res || jsonb_build_object('check', 'only an admin can reset the code', 'ok', v_ok);

  insert into public.group_expenses (group_id, amount, category, spent_on, paid_by, split_rule, shares)
  values (v_g, 1200, 'groceries', current_date, v_mb, 'equal',
          jsonb_build_array(jsonb_build_object('member', v_ma), jsonb_build_object('member', v_mb)))
  returning id into v_exp;
  select x.created_by = v_mb and x.updated_by = v_mb into v_ok from public.group_expenses x where x.id = v_exp;
  v_res := v_res || jsonb_build_object('check', 'a member adds an expense, stamped as theirs', 'ok', coalesce(v_ok, false));

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by, created_by)
    values (v_g, 10, 'groceries', current_date, v_mb, v_ma);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'nobody can write "added by" for someone else', 'ok', v_ok);

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by)
    values (v_g, 10, 'groceries', current_date, v_ma2);
    v_ok := false;
  exception when foreign_key_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'the payer must be in the same group', 'ok', v_ok);

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by, split_rule, shares)
    values (v_g, 10, 'groceries', current_date, v_mb, 'equal',
            jsonb_build_array(jsonb_build_object('member', v_mb), jsonb_build_object('member', v_ma2)));
    v_ok := false;
  exception when check_violation then v_ok := sqlerrm = 'group_expense_shares_invalid';
  end;
  v_res := v_res || jsonb_build_object('check', 'everyone in a split must be in the same group', 'ok', v_ok);

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by, split_rule, shares)
    values (v_g, 100, 'groceries', current_date, v_mb, 'exact',
            jsonb_build_array(jsonb_build_object('member', v_ma, 'value', 60), jsonb_build_object('member', v_mb, 'value', 30)));
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'exact parts must add up to the amount', 'ok', v_ok);

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by, split_rule, shares)
    values (v_g, 100, 'groceries', current_date, v_mb, 'shares',
            jsonb_build_array(jsonb_build_object('member', v_ma, 'value', 0)));
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a split weight must be more than 0', 'ok', v_ok);

  update public.group_expenses set amount = 1300 where id = v_exp;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'a member edits an expense', 'ok', v_n = 1);

  begin
    update public.group_expenses set group_id = v_g2 where id = v_exp;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'an expense never moves to another group', 'ok', v_ok);

  update public.group_expenses set deleted_at = now() where id = v_exp;
  get diagnostics v_n = row_count;
  begin
    delete from public.group_expenses where id = v_exp;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'expenses are deleted softly, so the feed can say who deleted what', 'ok', v_ok and v_n = 1);
  update public.group_expenses set deleted_at = null where id = v_exp;

  insert into public.group_settlements (group_id, from_member, to_member, amount, settled_on)
  values (v_g, v_mb, v_ma, 600, current_date);
  begin
    insert into public.group_settlements (group_id, from_member, to_member, amount, settled_on)
    values (v_g, v_mb, v_mb, 600, current_date);
    v_ok := false;
  exception when check_violation then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a member records a payment between two different people', 'ok', v_ok);

  -- The upsert PostgREST sends: every column it was given goes in the update.
  insert into public.group_budgets as gb (group_id, month, category, amount)
  values (v_g, to_char(current_date, 'YYYY-MM'), 'groceries', 8000)
  on conflict (group_id, month, category) do update
    set group_id = excluded.group_id, month = excluded.month, category = excluded.category, amount = excluded.amount;
  insert into public.group_budgets as gb (group_id, month, category, amount)
  values (v_g, to_char(current_date, 'YYYY-MM'), 'groceries', 9000)
  on conflict (group_id, month, category) do update
    set group_id = excluded.group_id, month = excluded.month, category = excluded.category, amount = excluded.amount;
  select gb.amount = 9000 and gb.updated_by = v_mb into v_ok from public.group_budgets gb
  where gb.group_id = v_g and gb.category = 'groceries';
  v_res := v_res || jsonb_build_object('check', 'a member sets the shared monthly budget', 'ok', coalesce(v_ok, false));

  begin
    insert into public.group_expenses (group_id, amount, category, spent_on, paid_by)
    values (v_g2, 10, 'rent', current_date, v_ma2);
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a member of one group cannot write to another', 'ok', v_ok);

  select count(*) into v_n from public.group_age_confirmations;
  v_res := v_res || jsonb_build_object('check', 'a person sees only their own 18+ confirmation', 'ok', v_n = 1);
  reset role;

  -- Even the service role, which may write any column, can't move an expense:
  -- the stamp trigger pins group_id before the shares are checked against it.
  set local role service_role;
  begin
    update public.group_expenses set group_id = v_g2 where id = v_exp;
    select x.group_id = v_g into v_ok from public.group_expenses x where x.id = v_exp;
  exception when others then v_ok := false;
  end;
  reset role;
  v_res := v_res || jsonb_build_object('check', 'an expense stays in its group even when the service role edits it', 'ok', coalesce(v_ok, false));

  -- ── A, the admin ───────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;

  update public.groups set name = 'Probe home', split_costs = true where id = v_g;
  get diagnostics v_n = row_count;
  v_res := v_res || jsonb_build_object('check', 'the admin renames the group and switches Split costs on', 'ok', v_n = 1);

  begin
    update public.groups set currency = 'USD' where id = v_g;
    v_ok := false;
  exception when insufficient_privilege then v_ok := true;
  end;
  v_res := v_res || jsonb_build_object('check', 'a group''s currency never changes', 'ok', v_ok);

  select m.display_name = 'Bala K' into v_ok from public.group_members m where m.id = v_mb;
  v_res := v_res || jsonb_build_object('check', 'everyone sees a member''s new name', 'ok', coalesce(v_ok, false));

  v_r := public.reset_group_code(v_g);
  reset role;
  set local role service_role;
  v_res := v_res || jsonb_build_object('check', 'the admin resets the code, and the old one stops working at once',
    'ok', coalesce(v_r ->> 'code' <> v_code
                   and public.group_join_by_code(v_c, v_code, 'Chitra', true, true) ->> 'status' = 'not_found', false));
  v_code := v_r ->> 'code';
  reset role;

  -- ── Removing someone ───────────────────────────────────────────────────
  set local role service_role;
  v_r := public.group_join_by_code(v_x, v_code, 'Xavier', true);
  reset role;
  select m.id into v_mx from public.group_members m where m.group_id = v_g and m.user_id = v_x;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r := public.remove_group_member(v_mx);
  reset role;
  select m.user_id is null and m.display_name is null and m.left_at is not null into v_ok
  from public.group_members m where m.id = v_mx;
  set local role service_role;
  v_res := v_res || jsonb_build_object('check', 'removing someone clears them and resets the code, so the one they knew stops working',
    'ok', coalesce(v_ok and v_r ->> 'code' <> v_code
                   and public.group_join_by_code(v_x, v_code, 'Xavier', true) ->> 'status' = 'not_found'
                   and public.group_join_by_code(v_c, v_r ->> 'code', 'Chitra', true, true) ->> 'status' = 'ok', false));
  reset role;
  v_code := v_r ->> 'code';

  -- ── Signed-out visitors ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  v_ok := true;
  foreach v_t in array v_tables loop
    begin
      execute format('select count(*) from public.%I', v_t) into v_n;
      v_ok := false;
    exception when insufficient_privilege then null;
    end;
  end loop;
  begin
    perform public.create_group('Probe', '🏡', 'family', 'Anon', 'INR', true);
    v_ok := false;
  exception when insufficient_privilege then null;
  end;
  v_res := v_res || jsonb_build_object('check', 'signed-out visitors can read nothing and create nothing', 'ok', v_ok);
  reset role;

  -- ── Leaving ────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_group(v_g);
  select count(*) into v_n from public.groups where id = v_g;
  reset role;
  v_res := v_res || jsonb_build_object('check', 'after leaving, B no longer sees the group', 'ok', v_n = 0);

  select m.user_id is null and m.display_name is null and m.left_at is not null and m.role = 'member'
  into v_ok from public.group_members m where m.id = v_mb;
  select count(*) into v_n from public.group_expenses where id = v_exp and paid_by = v_mb;
  v_res := v_res || jsonb_build_object('check', 'leaving clears B''s details; the expense B paid stays, as a Former member''s',
    'ok', coalesce(v_ok, false) and v_n = 1);

  set local role service_role;
  v_r := public.group_join_by_code(v_b, v_code, 'Bala');
  reset role;
  v_res := v_res || jsonb_build_object('check', 'someone who left can rejoin with a valid code, as a new member',
    'ok', coalesce(v_r ->> 'status' = 'joined', false));

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_group(v_g);
  reset role;
  select m.role = 'admin' into v_ok from public.group_members m where m.group_id = v_g and m.user_id = v_d;
  v_res := v_res || jsonb_build_object('check', 'when the last admin leaves, the longest-standing member becomes admin',
    'ok', coalesce(v_ok, false));

  perform set_config('request.jwt.claims', json_build_object('sub', v_d, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.remove_group_member(v_ma);
    v_ok := true;  -- A already left: removing a Former member is a no-op
  exception when others then v_ok := false;
  end;
  perform public.leave_group(v_g);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.leave_group(v_g);
  reset role;
  select v_ok and not exists (select 1 from public.groups where id = v_g)
         and not exists (select 1 from public.group_members where group_id = v_g)
         and not exists (select 1 from public.group_expenses where group_id = v_g)
         and not exists (select 1 from public.group_invites where group_id = v_g)
  into v_ok;
  v_res := v_res || jsonb_build_object('check', 'when the last member leaves, the group and everything in it is deleted', 'ok', v_ok);

  -- ── Deleting an account ────────────────────────────────────────────────
  set local role service_role;
  v_r := public.group_join_by_code(v_e, v_code2, 'Esha', true);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', v_e, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.group_expenses (group_id, amount, category, spent_on, paid_by)
  select v_g2, 500, 'rent', current_date, m.id from public.group_members m where m.group_id = v_g2 and m.user_id = v_e
  returning id into v_exp;
  reset role;

  delete from auth.users where id = v_e;  -- what the auth server does
  select m.user_id is null and m.display_name is null and m.left_at is not null
  into v_ok from public.group_members m join public.group_expenses x on x.paid_by = m.id where x.id = v_exp;
  select count(*) into v_n from public.group_age_confirmations where user_id = v_e;
  v_res := v_res || jsonb_build_object('check', 'deleting an account clears the person from their groups; their expenses stay as a Former member''s',
    'ok', coalesce(v_ok, false) and v_n = 0);

  delete from auth.users where id = v_a;  -- A is now the flat's only member
  v_res := v_res || jsonb_build_object('check', 'deleting the account of a group''s last member deletes the group',
    'ok', not exists (select 1 from public.groups where id = v_g2));

  -- ── Limits ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  v_r := public.create_group('Probe club', '⚽', 'friends', 'Farah', 'INR', true);
  v_g3 := (v_r ->> 'group_id')::uuid;
  v_code3 := v_r ->> 'code';
  reset role;
  for i in 1..20 loop
    v_u := gen_random_uuid();
    insert into auth.users (id, email) values (v_u, 'probe-' || v_u || '@groups.invalid');
    set local role service_role;
    v_r := public.group_join_by_code(v_u, v_code3, 'Member ' || i, true);
    reset role;
    exit when v_r ->> 'status' <> 'joined';
  end loop;
  select count(*) into v_n from public.group_members where group_id = v_g3 and left_at is null;
  v_res := v_res || jsonb_build_object('check', 'a group takes 20 members and refuses the 21st',
    'ok', coalesce(v_n = 20 and v_r ->> 'status' = 'group_full', false));

  perform set_config('request.jwt.claims', json_build_object('sub', v_f, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for i in 1..49 loop
    perform public.create_group('Probe trip ' || i, '🧳', 'trip', 'Farah');
  end loop;
  begin
    perform public.create_group('One too many', '🧳', 'trip', 'Farah');
    v_ok := false;
  exception when raise_exception then v_ok := sqlerrm = 'too_many_groups';
  end;
  reset role;
  v_res := v_res || jsonb_build_object('check', 'one person can be in at most 50 groups', 'ok', v_ok);

  -- ── Structure ──────────────────────────────────────────────────────────
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = any (v_tables) and c.relrowsecurity;
  v_res := v_res || jsonb_build_object('check', 'row level security is on for all 7 tables', 'ok', v_n = 7);

  select count(*) into v_n from pg_policies
  where schemaname = 'public' and tablename = any (v_tables) and roles <> '{authenticated}';
  v_res := v_res || jsonb_build_object('check', 'every policy is for signed-in users only', 'ok', v_n = 0);

  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any (v_functions)
    and not coalesce('search_path=""' = any (p.proconfig), false);
  v_res := v_res || jsonb_build_object('check', 'every new function pins an empty search_path', 'ok', v_n = 0);

  select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
     and bool_and(has_function_privilege('authenticated', p.oid, 'execute') = (p.proname = any (v_user_callable)))
     and count(*) = cardinality(v_functions)
  into v_ok
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = any (v_functions);
  v_res := v_res || jsonb_build_object('check', 'signed-in users can run exactly the six functions meant for them; signed-out visitors none',
    'ok', coalesce(v_ok, false));

  -- Realtime sends every subscriber a deleted row's primary key, unchecked.
  select count(*) into v_n
  from pg_index i
  join pg_class c on c.oid = i.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
  where i.indisprimary and n.nspname = 'public' and i.indnatts = 1 and a.attname = 'id'
    and c.relname in ('group_members', 'group_expenses', 'group_settlements', 'group_budgets');
  v_res := v_res || jsonb_build_object('check', 'every table Realtime publishes is keyed by a random id, so a delete event carries nothing else',
    'ok', v_n = 4);

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    select count(*) into v_n from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in ('group_members', 'group_expenses', 'group_settlements', 'group_budgets');
    v_res := v_res || jsonb_build_object('check', 'live updates are on for members, expenses, settlements and budgets', 'ok', v_n = 4);
  end if;

  raise exception 'RESULT %', v_res::text;
end $$;
