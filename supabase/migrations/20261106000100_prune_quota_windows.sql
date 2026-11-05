-- provider_quota had no retention: prune_provider_quota() was never scheduled, and it compares against
-- day numbers, so it could not clear minute or hour windows even if it ran. This prunes only scopes
-- whose window length is known. `ip:preauth` and `ip:min` keys are raw addresses, so they must not outlive their
-- use. Longer-lived provider and user counters are left alone.
create or replace function public.prune_quota_windows() returns void
  language sql set search_path = '' as $$
  delete from public.provider_quota
  where (scope in ('analytics:global:min', 'ai:user:min', 'ip:preauth', 'ip:min')
         and window_start < floor(extract(epoch from now()) / 60)::bigint - 1440)
     or (scope = 'ai:ip:hour'
         and window_start < floor(extract(epoch from now()) / 3600)::bigint - 48);
$$;
revoke execute on function public.prune_quota_windows() from public, anon, authenticated;
grant execute on function public.prune_quota_windows() to service_role;

select cron.schedule('prune-quota-windows', '23 * * * *', 'select public.prune_quota_windows();');
