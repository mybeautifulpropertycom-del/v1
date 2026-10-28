-- Reuses the site origin and CRON_SECRET already saved for the video scheduler.
-- No email API key belongs in this SQL file.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
do $$
begin
  if not exists(select 1 from vault.secrets where name='mbp_higgsfield_site')
    or not exists(select 1 from vault.secrets where name='mbp_higgsfield_worker') then
    raise exception 'Configure the existing Higgsfield scheduler site origin and CRON_SECRET first.';
  end if;
  perform cron.schedule('mbp-lead-email-worker','* * * * *', $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='mbp_higgsfield_site') || '/api/notifications/worker',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='mbp_higgsfield_worker')),
      body := '{}'::jsonb, timeout_milliseconds := 60000
    );
  $job$);
end;
$$;
select 'MBP_LEAD_EMAILS_SCHEDULED' as status;
