-- Run after MBP_ACCOUNT_LIFECYCLE_READY. Reuses the existing scheduler's vault values.
-- The scheduled worker permanently removes expired unpaid drafts and their files.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
do $$
begin
 if not exists(select 1 from vault.secrets where name='mbp_higgsfield_site')
   or not exists(select 1 from vault.secrets where name='mbp_higgsfield_worker') then
   raise exception 'Configure the existing video scheduler site origin and CRON_SECRET first.';
 end if;
 perform cron.schedule('mbp-account-cleanup','*/5 * * * *', $job$
   select net.http_post(
     url := (select decrypted_secret from vault.decrypted_secrets where name='mbp_higgsfield_site') || '/api/maintenance/cleanup',
     headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='mbp_higgsfield_worker')),
     body := '{}'::jsonb, timeout_milliseconds := 120000
   );
 $job$);
end;
$$;
select 'MBP_ACCOUNT_CLEANUP_SCHEDULED' as status;
