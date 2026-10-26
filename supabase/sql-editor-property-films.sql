-- Existing installations: run this ENTIRE file after MBP_HIGGSFIELD_READY.
-- Adds private original-photo film progress. Does not start rendering or make payments.
begin;
-- Original-photo films: resumable local rendering, no billable video provider calls.
alter table public.property_video_jobs add column if not exists montage_plan jsonb;
alter table public.property_video_jobs add column if not exists montage_next_shot integer not null default 0;
alter table public.property_video_jobs add column if not exists montage_failures integer not null default 0;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('property-video-work','property-video-work',false,52428800,array['video/mp4']) on conflict(id) do nothing;

create or replace function public.claim_property_montage(p_order uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return null; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or purchase.status<>'paid' or job.status not in ('queued','processing')
    or job.next_poll_at>now() or job.lease_until>now() or job.provider_request_id is not null then return null; end if;
  if job.status='queued' then
    if job.attempts>=3 then return null; end if;
    update public.property_video_jobs set status='processing',provider_phase='rendering',attempts=attempts+1,
      model_config='{"engine":"photo-montage-v1"}'::jsonb,model_input=null,montage_plan=null,montage_next_shot=0,montage_failures=0,
      last_error=null,lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  else
    if job.model_config->>'engine' is distinct from 'photo-montage-v1' then return null; end if;
    update public.property_video_jobs set lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  end if;
  return to_jsonb(job);
end;
$$;
revoke all on function public.claim_property_montage(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_property_montage(uuid,uuid) to service_role;

create or replace function public.checkpoint_property_montage(p_order uuid,p_lease uuid,p_attempt integer,
  p_plan jsonb default null,p_next integer default null,p_url text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; shot_count integer;
begin
  if num_nonnulls(p_plan,p_next,p_url,p_error)<>1 then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or purchase.status<>'paid' or job.status<>'processing' or job.lease_token is distinct from p_lease
    or job.attempts<>p_attempt or job.model_config->>'engine' is distinct from 'photo-montage-v1' then return false; end if;
  if p_error is not null then
    update public.property_video_jobs set montage_failures=montage_failures+1,
      status=case when montage_failures>=2 then 'failed' else 'processing' end,
      provider_phase=case when montage_failures>=2 then 'failed' else 'rendering' end,
      last_error=left(p_error,500),next_poll_at=now()+interval '5 minutes',lease_token=null,lease_until=null,updated_at=now()
      where order_id=p_order;
    return true;
  end if;
  if p_plan is not null then
    if job.montage_plan is not null or p_plan->>'engine' is distinct from 'photo-montage-v1'
      or jsonb_typeof(p_plan->'shots') is distinct from 'array' or octet_length(p_plan::text)>128000 then return false; end if;
    shot_count:=jsonb_array_length(p_plan->'shots');
    if shot_count<1 or shot_count>23 then return false; end if;
    update public.property_video_jobs set montage_plan=p_plan where order_id=p_order returning * into job;
  end if;
  shot_count:=jsonb_array_length(job.montage_plan->'shots');
  if p_next is not null then
    if shot_count is null or p_next<>job.montage_next_shot+1 or p_next>shot_count then return false; end if;
    update public.property_video_jobs set montage_next_shot=p_next where order_id=p_order returning * into job;
  end if;
  if p_url is not null then
    if shot_count is null or job.montage_next_shot<>shot_count or p_url !~ '^https://' then return false; end if;
    update public.property_video_jobs set status='completed',provider_phase='completed',video_url=p_url,
      poster_url=montage_plan->'shots'->0->>'image' where order_id=p_order;
    update public.property_orders set video_status='delivered' where id=p_order;
  end if;
  update public.property_video_jobs set montage_failures=0,last_error=null,lease_token=null,lease_until=null,
    next_poll_at=now()+interval '10 seconds',updated_at=now() where order_id=p_order;
  return true;
end;
$$;
revoke all on function public.checkpoint_property_montage(uuid,uuid,integer,jsonb,integer,text,text) from public,anon,authenticated;
grant execute on function public.checkpoint_property_montage(uuid,uuid,integer,jsonb,integer,text,text) to service_role;

-- Reinstated purchases resume completed film shots after a won dispute.
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
          when public.property_video_jobs.provider_request_id is not null or public.property_video_jobs.provider_phase in ('submitting','submitted','uncertain') or public.property_video_jobs.model_config->>'engine'='photo-montage-v1' then 'processing'
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
commit;
select 'MBP_PROPERTY_FILMS_READY' as status;
