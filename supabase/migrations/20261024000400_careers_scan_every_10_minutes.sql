-- careers-scan now stops each call after one large board (or a few small ones), to stay inside the edge
-- function's CPU allowance. Running it every 10 minutes instead of hourly keeps the 99-employer registry
-- cycling in hours rather than days. Only the schedule changes; the job body from 20261024000300 stays.
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'careers-scan'),
  schedule := '*/10 * * * *'
);
