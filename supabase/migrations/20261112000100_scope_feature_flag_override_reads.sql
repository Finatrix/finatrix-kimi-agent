-- Stop every signed-in user reading every other user's feature-flag overrides.
--
-- `feature_flag_overrides_select` was `using (true)`: the client downloaded the
-- whole table and picked out the rows that applied to it. A row scoped to a
-- user carries that user's id in `scope_id`, so any account could list other
-- people's ids together with which beta features and kill switches they hold.
--
-- A user now reads the rows that are not about a single person (plan and org
-- overrides, which the client still needs to resolve its own flags) and the
-- rows about themselves. Platform admins keep full access through
-- `feature_flag_overrides_admin_write`, which is FOR ALL and so covers SELECT.
--
-- `(select auth.uid())` rather than `auth.uid()` so the planner evaluates it
-- once per statement instead of once per row.
--
-- Idempotent: safe to run again.

drop policy if exists "feature_flag_overrides_select" on public.feature_flag_overrides;
create policy "feature_flag_overrides_select" on public.feature_flag_overrides
  for select to authenticated
  using (scope <> 'user' or scope_id = (select auth.uid())::text);
