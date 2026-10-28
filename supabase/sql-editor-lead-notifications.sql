-- Run the ENTIRE file. Adds unread lead state and a private email outbox.
-- Existing leads remain saved and are marked unread; historical emails are NOT sent.
begin;
-- Read state is private to the listing owner; email jobs are server-only.
alter table public.inquiries add column if not exists read_at timestamptz;
create index if not exists inquiries_owner_unread on public.inquiries(owner_id) where read_at is null;

create or replace function public.mark_inquiries_read(inquiry_ids uuid[]) returns integer
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  if auth.uid() is null or coalesce(cardinality(inquiry_ids),0) > 100 then return 0; end if;
  update public.inquiries set read_at=now()
    where owner_id=auth.uid() and id=any(inquiry_ids) and read_at is null;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.mark_inquiries_read(uuid[]) from public,anon;
grant execute on function public.mark_inquiries_read(uuid[]) to authenticated;

create table if not exists public.lead_email_jobs (
  inquiry_id uuid primary key references public.inquiries(id) on delete cascade,
  recipient text not null,
  details jsonb not null,
  email_payload jsonb,
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  first_attempt_at timestamptz,
  locked_until timestamptz,
  lease_token uuid,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.lead_email_jobs enable row level security;
revoke all on public.lead_email_jobs from public,anon,authenticated;
grant select,update on public.lead_email_jobs to service_role;
create index if not exists lead_email_jobs_due on public.lead_email_jobs(available_at) where status in ('pending','processing');

create or replace function public.enqueue_lead_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.lead_email_jobs(inquiry_id,recipient,details)
  select new.id,coalesce(u.email,''),jsonb_build_object(
    'agentName',p.name,'propertyTitle',coalesce(l.title,'Property inquiry'),
    'name',new.name,'email',new.email,'phone',new.phone,'message',new.message)
  from auth.users u join public.profiles p on p.id=u.id
  left join public.properties l on l.id=new.property_id
  where u.id=new.owner_id
  on conflict(inquiry_id) do nothing;
  return new;
end;
$$;
revoke all on function public.enqueue_lead_email() from public,anon,authenticated;
drop trigger if exists inquiry_email_notification on public.inquiries;
create trigger inquiry_email_notification after insert on public.inquiries
for each row execute function public.enqueue_lead_email();

create or replace function public.claim_lead_emails(batch_size integer default 2)
returns setof public.lead_email_jobs
language plpgsql security definer set search_path='' as $$
begin
  -- Resend's idempotency keys expire after 24h. Never retry an uncertain send
  -- beyond 20h, even if a worker stopped after the provider accepted it.
  update public.lead_email_jobs set status='failed',last_error='retry_window_expired',lease_token=null,locked_until=null
    where status in ('pending','processing') and first_attempt_at < now()-interval '20 hours'
      and (locked_until is null or locked_until < now());
  return query
  with due as (
    select j.inquiry_id from public.lead_email_jobs j
    where ((j.status='pending' and j.available_at<=now())
      or (j.status='processing' and j.locked_until<now()))
      and j.attempts<8
    order by j.available_at,j.created_at for update skip locked
    limit greatest(1,least(coalesce(batch_size,2),5))
  )
  update public.lead_email_jobs j set status='processing',attempts=j.attempts+1,
    first_attempt_at=coalesce(j.first_attempt_at,now()),locked_until=now()+interval '2 minutes',lease_token=gen_random_uuid()
  from due where j.inquiry_id=due.inquiry_id returning j.*;
end;
$$;
revoke all on function public.claim_lead_emails(integer) from public,anon,authenticated;
grant execute on function public.claim_lead_emails(integer) to service_role;

create or replace function public.finish_lead_email(job_id uuid,job_lease uuid,delivered_id text default null,failure_code text default null,retryable boolean default true)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  update public.lead_email_jobs set
    status=case when delivered_id is not null then 'sent' when retryable and attempts<8 then 'pending' else 'failed' end,
    sent_at=case when delivered_id is not null then now() else null end,
    provider_id=delivered_id,last_error=left(failure_code,80),
    available_at=now()+make_interval(secs=>least(3600,60*power(2,attempts-1))::integer),
    lease_token=null,locked_until=null
  where inquiry_id=job_id and lease_token=job_lease and status='processing' and locked_until>now();
  return found;
end;
$$;
revoke all on function public.finish_lead_email(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.finish_lead_email(uuid,uuid,text,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
select 'MBP_LEAD_NOTIFICATIONS_READY' as status;
