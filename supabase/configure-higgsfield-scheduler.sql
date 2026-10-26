-- Optional scheduler for Supabase-hosted deployments. Run once in SQL Editor.
-- No provider calls are made by installing this function.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.configure_higgsfield_schedule(site_origin text,worker_secret text) returns text
language plpgsql security definer set search_path='' as $function$
declare secret_id uuid;
begin
  if site_origin !~ '^https://[a-zA-Z0-9.-]+$' or length(worker_secret)<32 or worker_secret ~ '\s' then
    raise exception 'Provide the HTTPS site origin (no trailing slash) and the same CRON_SECRET as Vercel';
  end if;
  select id into secret_id from vault.secrets where name='mbp_higgsfield_site';
  if secret_id is null then perform vault.create_secret(site_origin,'mbp_higgsfield_site');
  else perform vault.update_secret(secret_id,site_origin); end if;
  select id into secret_id from vault.secrets where name='mbp_higgsfield_worker';
  if secret_id is null then perform vault.create_secret(worker_secret,'mbp_higgsfield_worker');
  else perform vault.update_secret(secret_id,worker_secret); end if;
  perform cron.schedule('mbp-higgsfield-worker','* * * * *', $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name='mbp_higgsfield_site') || '/api/video/worker',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='mbp_higgsfield_worker')),
      body := '{}'::jsonb,
      timeout_milliseconds := 180000
    );
  $cron$);
  return 'MBP_HIGGSFIELD_SCHEDULED';
end;
$function$;
revoke all on function public.configure_higgsfield_schedule(text,text) from public,anon,authenticated,service_role;

-- After storing CRON_SECRET in Vercel, execute this separately as the dashboard
-- database administrator, replacing the placeholder locally. Never share the secret.
-- select public.configure_higgsfield_schedule('https://www.mybeautifulproperty.com','YOUR_CRON_SECRET');
select 'MBP_HIGGSFIELD_SCHEDULER_READY' as status;
