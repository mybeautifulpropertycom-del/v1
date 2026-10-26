-- Isolate regenerated intermediate files from stale workers. Existing in-flight
-- jobs retain their original paths; only new jobs/rebuilds receive a generation.
alter table public.property_video_jobs add column if not exists montage_generation uuid;
alter table public.property_video_jobs add column if not exists replacement_pending boolean not null default false;
alter table public.property_video_jobs alter column montage_generation set default gen_random_uuid();

create or replace function public.admin_rebuild_property_film(listing_id uuid,actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare listing public.properties; purchase public.property_orders; job public.property_video_jobs;
begin
  perform 1 from public.platform_admins where user_id=actor_id for share;
  if not found then raise exception 'Administrator access required' using errcode='42501'; end if;
  select * into listing from public.properties where id=listing_id for update;
  if not found then raise exception 'Property not available'; end if;
  select * into purchase from public.property_orders where property_id=listing_id for update;
  if not found or not public.property_order_fulfilled(purchase.id) then
    raise exception 'Publish this property before rebuilding its film' using errcode='P0409';
  end if;
  select * into job from public.property_video_jobs where order_id=purchase.id for update;
  if not found or job.status not in ('completed','failed') or job.lease_until>now() then
    raise exception 'A film is already processing or is not ready to rebuild' using errcode='P0409';
  end if;
  if job.provider_request_id is not null or job.model_config->>'engine' is distinct from 'photo-montage-v1' then
    raise exception 'Only original-photo films can be rebuilt here' using errcode='P0409';
  end if;
  if coalesce(cardinality(listing.images),0)<1 then raise exception 'Add property photographs first'; end if;
  update public.property_video_jobs set
    status='queued',provider_phase='ready',attempts=0,replacement_pending=true,
    model_config='{"engine":"photo-montage-v1"}',model_input=null,
    source=to_jsonb(listing)-array['owner_id','created_at','updated_at'],
    montage_generation=gen_random_uuid(),montage_plan=null,montage_next_shot=0,montage_failures=0,
    lease_token=null,lease_until=null,next_poll_at=now(),last_error=null,updated_at=now()
    where order_id=purchase.id;
  -- Keep the previous public asset until checkpoint_property_montage atomically
  -- replaces it. No Stripe status, entitlement or publication changes here.
  update public.property_orders set video_status='pending' where id=purchase.id;
  insert into public.platform_admin_audit(actor_id,property_id,action,details)
    values(actor_id,listing_id,'rebuild_film',jsonb_build_object('previous_video',job.video_url,'renderer',2));
  return jsonb_build_object('videoStatus','queued','previousVideoRetained',job.video_url is not null);
end;
$$;
revoke all on function public.admin_rebuild_property_film(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_rebuild_property_film(uuid,uuid) to service_role;

create or replace function public.get_public_property(property_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'property',to_jsonb(p)-array['owner_id','created_at','updated_at'],
    'profile',jsonb_build_object('name',a.name,'email',a.email,'phone',a.phone,'agency',a.agency,'bio',a.bio,'avatar_url',a.avatar_url),
    'film',(select jsonb_build_object('src',v.video_url,'poster',coalesce(v.poster_url,p.images[1])) from public.property_video_jobs v join public.property_orders o on o.id=v.order_id where v.property_id=p.id and v.video_url is not null and public.property_order_fulfilled(o.id))
  ) from public.properties p join public.profiles a on a.id=p.owner_id where p.slug=property_slug and p.status='published' limit 1;
$$;
notify pgrst,'reload schema';

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
  if not found or not public.property_order_fulfilled(purchase.id) or job.status<>'processing' or job.lease_token is distinct from p_lease
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
    update public.property_video_jobs set status='completed',provider_phase='completed',video_url=p_url,replacement_pending=false,
      poster_url=montage_plan->'shots'->0->>'image' where order_id=p_order;
    update public.property_orders set video_status='delivered' where id=p_order;
  end if;
  update public.property_video_jobs set montage_failures=0,last_error=null,lease_token=null,lease_until=null,
    next_poll_at=now()+interval '10 seconds',updated_at=now() where order_id=p_order;
  return true;
end;
$$;



-- A retained previous video must not mark an in-progress replacement complete.
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
  if not public.property_order_fulfilled(purchase.id) or purchase.publication_requested_at is null then return false; end if;
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
        case when public.property_video_jobs.replacement_pending then
          case when public.property_video_jobs.provider_phase in ('failed','provider_failed') then 'failed'
            when (public.property_video_jobs.model_config->>'engine'='higgsfield-montage-v1' and public.property_video_jobs.model_config ? 'profile')
              or (public.property_video_jobs.model_config->>'engine'='photo-montage-v1' and public.property_video_jobs.attempts>0) then 'processing'
            else 'queued' end
          when public.property_video_jobs.video_url is not null then 'completed'
          when public.property_video_jobs.provider_phase in ('failed','provider_failed') then 'failed'
          when public.property_video_jobs.provider_request_id is not null or public.property_video_jobs.provider_phase in ('submitting','submitted','uncertain') or public.property_video_jobs.model_config->>'engine'='photo-montage-v1' or (public.property_video_jobs.model_config->>'engine'='higgsfield-montage-v1' and public.property_video_jobs.model_config ? 'profile') then 'processing'
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
