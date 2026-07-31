-- Schedules public.expire_subscriptions() hourly, mirroring the documented
-- prune-analytics pattern (docs/OBSERVABILITY.md §7). cron.schedule() with an
-- existing job name reschedules it, so this migration is safe to re-run.
select cron.schedule('expire-subscriptions', '0 * * * *', $$ select public.expire_subscriptions(); $$);
