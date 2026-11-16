-- Run in the EXISTING Supabase project's SQL Editor, after the new HTTPS
-- domain serves the app. Updates only the origin; never prints worker secrets.
begin;
do $migration$
declare site_secret_id uuid;
begin
  select id into site_secret_id from vault.secrets where name = 'mbp_higgsfield_site';
  if site_secret_id is null then
    raise exception 'Existing scheduler site secret was not found; check the connected Supabase project before migrating';
  end if;
  perform vault.update_secret(site_secret_id, 'https://urmatoarea-proprietate.ro');
end;
$migration$;
select
  'PLATFORM_DOMAIN_UPDATED' as status,
  (select decrypted_secret = 'https://urmatoarea-proprietate.ro'
   from vault.decrypted_secrets where name = 'mbp_higgsfield_site') as site_origin_updated,
  exists(select 1 from vault.secrets where name = 'mbp_higgsfield_worker') as worker_secret_present;
commit;
