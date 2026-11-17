-- Read-only checks in the existing Supabase project's SQL Editor.
-- No keys, recipients, buyer details or messages are returned. Nothing is sent.
select
  to_regclass('public.lead_email_jobs') is not null as coada_email_instalata,
  exists(select 1 from pg_trigger
    where tgname='inquiry_email_notification'
      and tgrelid=to_regclass('public.inquiries')
      and tgenabled in ('O','A')) as notificari_noi_active,
  exists(select 1 from cron.job
    where jobname='mbp-lead-email-worker' and active) as programare_email_activa;
