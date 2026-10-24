-- Schedules the careers-scan edge function hourly. Each call scans the 8 employers due next, so every
-- employer in the registry is read roughly every (employers / 8) hours.
--
-- Before applying, store the two values the job reads, once, in Vault:
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/careers-scan', 'careers_scan_url');
--   select vault.create_secret('<same value as the CAREERS_SCAN_SECRET function secret, 32+ chars>', 'careers_scan_secret');
-- Until both exist the job runs and does nothing useful (pg_net records the failed call); it never errors the
-- database. cron.schedule() with an existing job name reschedules it, so this migration is safe to re-run.

create extension if not exists pg_net;

select cron.schedule(
  'careers-scan',
  '17 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'careers_scan_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-scan-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'careers_scan_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $$
);
