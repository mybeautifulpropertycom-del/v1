-- Durable, leased generation jobs. Only server workers can submit or deliver.
alter table public.property_video_jobs add column if not exists provider_phase text not null default 'ready';
alter table public.property_video_jobs add column if not exists provider_request_id text;
alter table public.property_video_jobs add column if not exists model_config jsonb;
alter table public.property_video_jobs add column if not exists model_input jsonb;
alter table public.property_video_jobs add column if not exists lease_token uuid;
alter table public.property_video_jobs add column if not exists lease_until timestamptz;
alter table public.property_video_jobs add column if not exists next_poll_at timestamptz not null default now();
alter table public.property_video_jobs add column if not exists last_error text;
create unique index if not exists video_provider_request_unique on public.property_video_jobs(provider_request_id) where provider_request_id is not null;
create index if not exists video_jobs_due on public.property_video_jobs(next_poll_at) where status in ('queued','processing');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('property-videos','property-videos',true,52428800,array['video/mp4','video/webm']) on conflict(id) do nothing;

create or replace function public.claim_property_video(p_order uuid,p_lease uuid,p_model jsonb default null,p_input jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return null; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or purchase.status<>'paid' or job.status not in ('queued','processing') or job.provider_phase='uncertain'
     or job.next_poll_at>now() or job.lease_until>now() then return null; end if;
  if job.status='queued' then
    if job.attempts>=3 or jsonb_typeof(p_model) is distinct from 'object' or jsonb_typeof(p_input) is distinct from 'object'
      or octet_length(p_model::text)>64000 or octet_length(p_input::text)>128000 then return null; end if;
    update public.property_video_jobs set status='processing',provider_phase='submitting',attempts=attempts+1,
      model_config=p_model,model_input=p_input,provider_request_id=null,last_error=null,
      lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  else
    -- A crashed/timed-out submission may already have spent credits. Never resubmit it.
    if job.provider_request_id is null then
      update public.property_video_jobs set provider_phase='uncertain',lease_token=null,lease_until=null,
        last_error='Generation confirmation is delayed. Support must reconcile this request before another submission.',updated_at=now() where order_id=p_order;
      return null;
    end if;
    update public.property_video_jobs set lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  end if;
  return to_jsonb(job);
end;
$$;
revoke all on function public.claim_property_video(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.claim_property_video(uuid,uuid,jsonb,jsonb) to service_role;

-- Callback and submission acknowledgements can both attach the same request ID.
-- The server verifies the per-attempt callback token and provider response first.
create or replace function public.bind_property_video_request(p_order uuid,p_attempt integer,p_request text)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  if p_request !~ '^[a-zA-Z0-9_-]{1,160}$' then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or purchase.status<>'paid' or job.status<>'processing' or job.attempts<>p_attempt
      or (job.provider_request_id is not null and job.provider_request_id<>p_request) then return false; end if;
  update public.property_video_jobs set provider_request_id=p_request,provider_phase='submitted',last_error=null,next_poll_at=now(),updated_at=now() where order_id=p_order;
  return true;
end;
$$;
revoke all on function public.bind_property_video_request(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.bind_property_video_request(uuid,integer,text) to service_role;

create or replace function public.advance_property_video(p_order uuid,p_lease uuid,p_attempt integer,p_phase text,p_url text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  if p_phase not in ('submitted','uncertain','failed','completed') then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or purchase.status<>'paid' or job.status<>'processing' or job.lease_token is distinct from p_lease or job.attempts<>p_attempt then return false; end if;
  if p_phase='completed' and (job.provider_request_id is null or p_url is null or p_url !~ '^https://') then return false; end if;
  -- A callback may have recovered an ambiguous submission before this lease ends.
  if p_phase='uncertain' and job.provider_request_id is not null then p_phase:='submitted'; end if;
  update public.property_video_jobs set
    status=case when p_phase='completed' then 'completed' when p_phase='failed' then 'failed' else 'processing' end,
    provider_phase=p_phase,video_url=case when p_phase='completed' then p_url else video_url end,
    poster_url=case when p_phase='completed' then source->'images'->>0 else poster_url end,
    lease_token=null,lease_until=null,next_poll_at=now()+interval '30 seconds',last_error=left(p_error,500),updated_at=now()
    where order_id=p_order;
  if p_phase='completed' then update public.property_orders set video_status='delivered' where id=p_order; end if;
  return true;
end;
$$;
revoke all on function public.advance_property_video(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.advance_property_video(uuid,uuid,integer,text,text,text) to service_role;

create or replace function public.retry_property_video(listing_id uuid,agent_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders;
begin
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then return false; end if;
  select * into purchase from public.property_orders where property_id=listing_id and owner_id=agent_id for update;
  if not found or purchase.status<>'paid' then return false; end if;
  update public.property_video_jobs set status='queued',provider_phase='ready',provider_request_id=null,
    model_config=null,model_input=null,lease_token=null,lease_until=null,next_poll_at=now(),last_error=null,updated_at=now()
    where order_id=purchase.id and owner_id=agent_id and status='failed' and attempts<3
    and updated_at<now()-interval '1 minute';
  return found;
end;
$$;
revoke all on function public.retry_property_video(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_property_video(uuid,uuid) to service_role;
-- Reinstated purchases resume their original render instead of submitting twice.
create or replace function public.finish_property_publication(purchase_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders;
declare listing public.properties;
begin
  select * into purchase from public.property_orders where id=purchase_id;
  if not found or purchase.property_id is null then return false; end if;
  select * into listing from public.properties where id=purchase.property_id and owner_id=purchase.owner_id for update;
  if not found then return false; end if;
  select * into purchase from public.property_orders where id=purchase_id for update;
  if purchase.status<>'paid' or purchase.publication_requested_at is null then return false; end if;
  if purchase.publication_completed_at is not null then return listing.status='published'; end if;
  begin
    update public.properties set status='published' where id=listing.id;
  exception when check_violation or raise_exception then
    update public.property_orders set publication_error='Your payment is confirmed. Review your property and contact details, then publish again at no extra charge.' where id=purchase_id;
    return false;
  end;
  insert into public.property_video_jobs(order_id,property_id,owner_id,source)
    values(purchase.id,listing.id,listing.owner_id,to_jsonb(listing)-array['owner_id','created_at','updated_at'])
    on conflict(order_id) do update set
      status=case when public.property_video_jobs.status='cancelled' then
        case when public.property_video_jobs.video_url is not null then 'completed'
          when public.property_video_jobs.provider_phase='failed' then 'failed'
          when public.property_video_jobs.provider_request_id is not null or public.property_video_jobs.provider_phase in ('submitting','submitted','uncertain') then 'processing'
          else 'queued' end
        else public.property_video_jobs.status end,
      next_poll_at=now(),
      lease_token=case when public.property_video_jobs.status='cancelled' then null else public.property_video_jobs.lease_token end,
      lease_until=case when public.property_video_jobs.status='cancelled' then null else public.property_video_jobs.lease_until end,
      updated_at=now();
  update public.property_orders set publication_completed_at=now(),publication_error=null where id=purchase_id;
  return true;
end;
$$;
revoke all on function public.finish_property_publication(uuid) from public,anon,authenticated;
grant execute on function public.finish_property_publication(uuid) to service_role;

notify pgrst,'reload schema';
