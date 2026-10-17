-- careers_analytics accepted any row from any signed-in user: `with check (true)`.
-- Nothing could be READ through it (select is admin-only), but one account could
-- fill the table with unbounded text and jsonb. Bound what a client may write.
-- The app only ever sends a short event name, a number and a small meta object
-- (src/careers/services/analytics.ts).
drop policy if exists "careers_analytics_insert" on public.careers_analytics;

create policy "careers_analytics_insert" on public.careers_analytics
  for insert to authenticated
  with check (
    char_length(event) between 1 and 64
    and (meta is null or pg_column_size(meta) <= 2048)
  );
