-- Run after deploying the `daily-payment-report` Edge Function.
-- Store project_url and publishable_key in Supabase Vault first.
select cron.schedule(
  'daily-school-payment-report',
  '0 17 * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
        || '/functions/v1/daily-payment-report',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name = 'publishable_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
