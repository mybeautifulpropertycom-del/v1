-- Shared BytePlus queue: 3 active provider scenes across all properties.
-- Run the ENTIRE file after the multi-photo film setup. Includes the previous parallel upgrade.
-- Preserves films, payments and accepted requests. Does not start or rebuild any film.
begin;
-- Overlap two BytePlus generations per film, while committing saved clips in order.
-- Completed films are never requeued. New workers remain sequential before this upgrade.
alter table public.property_video_jobs add column if not exists byteplus_parallel boolean not null default true;

create or replace function public.reserve_byteplus_lookahead(p_order uuid,p_lease uuid,p_attempt integer,p_index integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes;
begin
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return null; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(p_order) or job.status<>'processing'
    or job.lease_token is distinct from p_lease or job.attempts<>p_attempt or job.lease_until<=now()
    or not job.byteplus_parallel or job.model_config->'profile'->>'provider' is distinct from 'byteplus'
    or job.model_config->>'engine' is distinct from 'higgsfield-montage-v1'
    or job.montage_plan->'generationBudget'->>'version' is distinct from '3'
    or p_index is null or p_index<>job.montage_next_shot+1 or p_index>=jsonb_array_length(job.montage_plan->'shots') then return null; end if;
  -- The previous POST must already have an accepted ID before overlapping work.
  if not exists(select 1 from public.property_film_scenes where order_id=p_order and generation=job.montage_generation
    and shot_index=job.montage_next_shot and status='submitted' and request_id is not null) then return null; end if;
  select * into scene from public.property_film_scenes where order_id=p_order and generation=job.montage_generation and shot_index=p_index for update;
  if found then
    if scene.request_id is null then
      update public.property_film_scenes set status='uncertain',updated_at=now() where order_id=p_order and generation=scene.generation and shot_index=p_index;
      update public.property_video_jobs set provider_phase='uncertain',lease_token=null,lease_until=null,
        last_error='The next scene submission needs reconciliation. No automatic resubmission.',updated_at=now() where order_id=p_order;
      return null;
    end if;
    return to_jsonb(scene)||jsonb_build_object('submit',false);
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>128000
    or p_input->'duration' is distinct from job.montage_plan->'generationBudget'->'sceneSeconds'->p_index
    or p_input->>'resolution' is distinct from '720p' or p_input->>'generate_audio' is distinct from 'false'
    or p_input ? 'frames' then return null; end if;
  insert into public.property_film_scenes(order_id,generation,shot_index,status,model_config,model_input)
    values(p_order,job.montage_generation,p_index,'submitting',job.model_config->'profile',p_input) returning * into scene;
  return to_jsonb(scene)||jsonb_build_object('submit',true);
end;
$$;
revoke all on function public.reserve_byteplus_lookahead(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_byteplus_lookahead(uuid,uuid,integer,integer,jsonb) to service_role;

create or replace function public.bind_property_film_scene(p_order uuid,p_generation uuid,p_index integer,p_request text)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes;
begin
  if p_request !~ '^[a-zA-Z0-9_-]{1,160}$' then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(p_order) or job.status<>'processing'
    or job.montage_generation is distinct from p_generation or (job.montage_next_shot<>p_index and not (job.byteplus_parallel and job.model_config->'profile'->>'provider'='byteplus' and p_index=job.montage_next_shot+1))
    or job.model_config->>'engine' is distinct from 'higgsfield-montage-v1' then return false; end if;
  select * into scene from public.property_film_scenes where order_id=p_order and generation=p_generation and shot_index=p_index for update;
  if not found or scene.status not in ('submitting','submitted','uncertain') or (scene.request_id is not null and scene.request_id<>p_request) then return false; end if;
  update public.property_film_scenes set request_id=p_request,status='submitted',updated_at=now() where order_id=p_order and generation=p_generation and shot_index=p_index;
  update public.property_video_jobs set provider_phase='generating',last_error=null,next_poll_at=now(),updated_at=now() where order_id=p_order;
  return true;
end;
$$;
revoke all on function public.bind_property_film_scene(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.bind_property_film_scene(uuid,uuid,integer,text) to service_role;

create or replace function public.checkpoint_property_ai_film(p_order uuid,p_lease uuid,p_attempt integer,
  p_plan jsonb default null,p_scene integer default null,p_edit integer default null,p_url text default null,
  p_error text default null,p_failure text default 'delayed')
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; total integer; known boolean;
begin
  if num_nonnulls(p_plan,p_scene,p_edit,p_url,p_error)>1 then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(p_order) or job.status<>'processing' or job.lease_token is distinct from p_lease
    or job.attempts<>p_attempt or job.model_config->>'engine' is distinct from 'higgsfield-montage-v1' then return false; end if;
  if p_error is not null then
    if job.byteplus_parallel and job.model_config->'profile'->>'provider'='byteplus' then
      select not exists(select 1 from public.property_film_scenes where order_id=p_order and generation=job.montage_generation
        and shot_index between job.montage_next_shot and job.montage_next_shot+1 and request_id is null
        and status in ('submitting','uncertain')) into known;
    else
      select exists(select 1 from public.property_film_scenes where order_id=p_order and generation=job.montage_generation and shot_index=job.montage_next_shot and request_id is not null) into known;
    end if;
    if p_failure='uncertain' and not known then
      update public.property_film_scenes set status='uncertain',updated_at=now() where order_id=p_order and generation=job.montage_generation and request_id is null
        and shot_index between job.montage_next_shot and job.montage_next_shot+case when job.byteplus_parallel and job.model_config->'profile'->>'provider'='byteplus' then 1 else 0 end;
    end if;
    update public.property_video_jobs set montage_failures=montage_failures+1,
      status=case when p_failure='failed' or (p_failure='delayed' and montage_failures>=2) then 'failed' else 'processing' end,
      provider_phase=case when p_failure='uncertain' and not known then 'uncertain' when p_failure='failed' then 'provider_failed' when p_failure='delayed' and montage_failures>=2 then 'failed' else 'generating' end,
      last_error=left(p_error,500),lease_token=null,lease_until=null,next_poll_at=now()+interval '2 minutes',updated_at=now() where order_id=p_order;
    return true;
  end if;
  if p_plan is not null then
    if job.montage_plan is not null or p_plan->>'engine' is distinct from 'higgsfield-montage-v1'
      or jsonb_typeof(p_plan->'shots') is distinct from 'array' or octet_length(p_plan::text)>128000 then return false; end if;
    total:=jsonb_array_length(p_plan->'shots');
    if total<1 or total>23 then return false; end if;
    update public.property_video_jobs set montage_plan=p_plan where order_id=p_order returning * into job;
  end if;
  total:=jsonb_array_length(job.montage_plan->'shots');
  if p_scene is not null then
    if total is null or p_scene<>job.montage_next_shot or p_scene>=total then return false; end if;
    update public.property_film_scenes set status='completed',updated_at=now()
      where order_id=p_order and generation=job.montage_generation and shot_index=p_scene and request_id is not null and status='submitted';
    if not found then return false; end if;
    update public.property_video_jobs set montage_next_shot=montage_next_shot+1 where order_id=p_order returning * into job;
  end if;
  if p_edit is not null then
    if total is null or job.montage_next_shot<>total or p_edit<>job.montage_edited_shots or p_edit>=total then return false; end if;
    update public.property_video_jobs set montage_edited_shots=montage_edited_shots+1 where order_id=p_order returning * into job;
  end if;
  if p_url is not null then
    if total is null or job.montage_next_shot<>total or job.montage_edited_shots<>total or p_url !~ '^https://' then return false; end if;
    update public.property_video_jobs set status='completed',provider_phase='completed',video_url=p_url,replacement_pending=false,
      poster_url=montage_plan->'shots'->0->>'image' where order_id=p_order;
    update public.property_orders set video_status='delivered' where id=p_order;
  end if;
  update public.property_video_jobs set montage_failures=0,last_error=null,lease_token=null,lease_until=null,
    next_poll_at=case when num_nonnulls(p_plan,p_scene,p_edit,p_url)>0 then now() else now()+interval '30 seconds' end,updated_at=now() where order_id=p_order;
  return true;
end;
$$;
revoke all on function public.checkpoint_property_ai_film(uuid,uuid,integer,jsonb,integer,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.checkpoint_property_ai_film(uuid,uuid,integer,jsonb,integer,integer,text,text,text) to service_role;

create or replace function public.admin_resume_byteplus_film(listing_id uuid,actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes; rejected_index integer;
begin
  perform 1 from public.platform_admins where user_id=actor_id for share;
  if not found then raise exception 'Administrator access required' using errcode='42501'; end if;
  perform 1 from public.properties where id=listing_id for update;
  if not found then raise exception 'Property unavailable' using errcode='P0409'; end if;
  select * into purchase from public.property_orders where property_id=listing_id for update;
  if not found or not public.property_order_fulfilled(purchase.id) then
    raise exception 'Publication access required' using errcode='P0409';
  end if;
  select * into job from public.property_video_jobs where order_id=purchase.id for update;
  if not found or job.status<>'failed' or job.provider_phase is distinct from 'provider_failed'
    or job.lease_until>now() or job.attempts>=3
    or job.model_config->'profile'->>'provider' is distinct from 'byteplus'
    or job.montage_plan is null or job.montage_next_shot>=jsonb_array_length(job.montage_plan->'shots') then
    raise exception 'This film cannot be resumed safely' using errcode='P0409';
  end if;
  -- Only a definitive POST rejection may release its reservation. Timeouts,
  -- accepted tasks, failed GETs and provider-completed failures must not re-POST.
  if coalesce(job.last_error,'') <> 'The video provider rejected this scene. Check API credentials, API credits and model settings. No new generation will be submitted automatically.'
    and coalesce(job.last_error,'') !~ '^BytePlus rejected scene [0-9]+ \(HTTP (400|401|402|403|404|422|429)[;)]' then
    raise exception 'Review the original provider request before retrying' using errcode='P0409';
  end if;
  rejected_index:=coalesce(substring(job.last_error from '^BytePlus rejected scene ([0-9]+) ')::integer-1,job.montage_next_shot);
  if rejected_index<>job.montage_next_shot and not (job.byteplus_parallel and rejected_index=job.montage_next_shot+1) then
    raise exception 'The rejected scene needs review' using errcode='P0409'; end if;
  select * into scene from public.property_film_scenes where order_id=job.order_id
    and generation=job.montage_generation and shot_index=rejected_index for update;
  if not found or scene.request_id is not null or scene.status is distinct from 'submitting'
    or scene.model_config->>'provider' is distinct from 'byteplus' then
    raise exception 'The existing scene request needs reconciliation' using errcode='P0409';
  end if;
  insert into public.platform_admin_audit(actor_id,property_id,action,details)
    values(actor_id,listing_id,'resume_byteplus_film',jsonb_build_object(
      'generation',job.montage_generation,'scene',rejected_index,
      'previous_error',job.last_error,'completed_scenes',job.montage_next_shot));
  delete from public.property_film_scenes where order_id=job.order_id
    and generation=job.montage_generation and shot_index=rejected_index;
  update public.property_video_jobs set status='processing',provider_phase='generating',
    byteplus_parallel=case when job.last_error ~ '^BytePlus rejected scene [0-9]+ \(HTTP 429[;)]' then false else byteplus_parallel end,
    attempts=attempts+1,montage_failures=0,last_error=null,lease_token=null,lease_until=null,
    next_poll_at=now(),updated_at=now() where order_id=job.order_id;
  return jsonb_build_object('videoStatus','processing','savedScenes',job.montage_next_shot);
end;
$$;
revoke all on function public.admin_resume_byteplus_film(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_resume_byteplus_film(uuid,uuid) to service_role;
-- One shared BytePlus capacity pool, independent of property/job deletion.
-- Three is the published Individual limit; raise only after BytePlus confirms the account quota.
create table if not exists public.byteplus_queue_settings (
  id boolean primary key default true check(id),
  max_active integer not null default 3 check(max_active between 1 and 10),
  cooldown_until timestamptz not null default '-infinity'
);
insert into public.byteplus_queue_settings(id) values(true) on conflict do nothing;
alter table public.byteplus_queue_settings enable row level security;
revoke all on public.byteplus_queue_settings from public,anon,authenticated,service_role;
grant select on public.byteplus_queue_settings to service_role;

alter table public.property_video_jobs add column if not exists byteplus_last_dispatch timestamptz not null default '-infinity';
alter table public.property_video_jobs add column if not exists byteplus_rate_limits integer not null default 0;
create table if not exists public.byteplus_scene_slots (
  order_id uuid not null,
  generation uuid not null,
  shot_index integer not null,
  request_id text unique,
  active boolean not null default true,
  next_check_at timestamptz not null default now(),
  primary key(order_id,generation,shot_index)
);
alter table public.byteplus_scene_slots enable row level security;
revoke all on public.byteplus_scene_slots from public,anon,authenticated,service_role;
grant select on public.byteplus_scene_slots to service_role;
create index if not exists byteplus_active_slots on public.byteplus_scene_slots(next_check_at) where active;
-- Preserve existing accepted and ambiguous requests. Never free unknown submissions by time alone.
insert into public.byteplus_scene_slots(order_id,generation,shot_index,request_id,active)
  select order_id,generation,shot_index,request_id,status in ('submitting','submitted','uncertain')
  from public.property_film_scenes where model_config->>'provider'='byteplus'
  on conflict do nothing;

create or replace function public.guard_byteplus_scene_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare settings public.byteplus_queue_settings; job public.property_video_jobs; own_active boolean;
begin
  if new.model_config->>'provider' is distinct from 'byteplus' then return new; end if;
  if new.status in ('completed','failed') then return new; end if;
  -- The singleton lock serializes reservations across Vercel instances, not just within one film.
  select * into settings from public.byteplus_queue_settings where id=true for update;
  if not found or settings.cooldown_until>now() then return null; end if;
  if (select count(*) from public.byteplus_scene_slots where active)>=settings.max_active then return null; end if;
  if exists(select 1 from public.byteplus_scene_slots where order_id=new.order_id and generation=new.generation
    and shot_index=new.shot_index and (active or request_id is not null)) then return null; end if;
  select * into job from public.property_video_jobs where order_id=new.order_id;
  select exists(select 1 from public.byteplus_scene_slots where order_id=new.order_id and active) into own_active;
  -- Give a ready film with no active scene a turn before a second scene of another film.
  -- Among films without a slot, the least recently served film goes first.
  if exists(select 1 from public.property_video_jobs j
    where j.order_id<>new.order_id and j.status='processing' and j.provider_phase not in ('uncertain','provider_failed')
      and j.model_config->'profile'->>'provider'='byteplus' and j.montage_plan is not null
      and j.montage_next_shot<jsonb_array_length(j.montage_plan->'shots') and j.next_poll_at<=now()
      and public.property_order_fulfilled(j.order_id)
      and not exists(select 1 from public.property_film_scenes f where f.order_id=j.order_id and f.generation=j.montage_generation and f.shot_index=j.montage_next_shot)
      and not exists(select 1 from public.byteplus_scene_slots s where s.order_id=j.order_id and s.active)
      and (own_active or (j.byteplus_last_dispatch,j.created_at,j.order_id)<(job.byteplus_last_dispatch,job.created_at,job.order_id))
  ) then return null; end if;
  insert into public.byteplus_scene_slots(order_id,generation,shot_index)
    values(new.order_id,new.generation,new.shot_index)
    on conflict(order_id,generation,shot_index) do update set active=true,request_id=null,next_check_at=now();
  update public.property_video_jobs set byteplus_last_dispatch=clock_timestamp() where order_id=new.order_id;
  return new;
end;
$$;
revoke all on function public.guard_byteplus_scene_capacity() from public,anon,authenticated,service_role;
drop trigger if exists byteplus_capacity_before_scene on public.property_film_scenes;
create trigger byteplus_capacity_before_scene before insert on public.property_film_scenes
  for each row execute function public.guard_byteplus_scene_capacity();

create or replace function public.sync_byteplus_scene_slot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.model_config->>'provider'='byteplus' then
    update public.byteplus_scene_slots set request_id=coalesce(new.request_id,request_id),
      active=case when new.status in ('completed','failed') then false else active end
      where order_id=new.order_id and generation=new.generation and shot_index=new.shot_index
        and (request_id is null or request_id=new.request_id);
  end if;
  return new;
end;
$$;
revoke all on function public.sync_byteplus_scene_slot() from public,anon,authenticated,service_role;
drop trigger if exists byteplus_slot_after_scene on public.property_film_scenes;
create trigger byteplus_slot_after_scene after insert or update on public.property_film_scenes
  for each row execute function public.sync_byteplus_scene_slot();


-- Keep prior recovery/duration-repair installers compatible with the shared pool.
-- Deleting a property or an unknown submission does NOT free an in-flight slot.
create or replace function public.release_rejected_byteplus_slot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if old.model_config->>'provider'='byteplus' and old.request_id is null and old.status='submitting'
    and exists(select 1 from public.property_video_jobs j where j.order_id=old.order_id
      and j.montage_generation=old.generation and j.status='failed' and j.provider_phase='provider_failed'
      and ((j.last_error ~ '^BytePlus rejected scene [0-9]+ \(HTTP (400|401|402|403|404|422|429)[;)]'
        and substring(j.last_error from '^BytePlus rejected scene ([0-9]+) ')::integer=old.shot_index+1)
        or (j.last_error='The video provider rejected this scene. Check API credentials, API credits and model settings. No new generation will be submitted automatically.'
          and j.montage_next_shot=old.shot_index))) then
    update public.byteplus_scene_slots set active=false where order_id=old.order_id and generation=old.generation
      and shot_index=old.shot_index and request_id is null;
  end if;
  return old;
end;
$$;
revoke all on function public.release_rejected_byteplus_slot() from public,anon,authenticated,service_role;
drop trigger if exists byteplus_rejected_slot_before_delete on public.property_film_scenes;
create trigger byteplus_rejected_slot_before_delete before delete on public.property_film_scenes
  for each row execute function public.release_rejected_byteplus_slot();

-- A short polling lease prevents simultaneous wakeups from all checking the same provider task.
create or replace function public.claim_byteplus_slot_checks() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  with due as (select order_id,generation,shot_index from public.byteplus_scene_slots
    where active and request_id is not null and next_check_at<=now()
    order by next_check_at limit 10 for update skip locked), claimed as (
    update public.byteplus_scene_slots s set next_check_at=now()+interval '30 seconds' from due d
      where (s.order_id,s.generation,s.shot_index)=(d.order_id,d.generation,d.shot_index)
      returning s.request_id
  ) select coalesce(jsonb_agg(claimed),'[]'::jsonb) into result from claimed;
  return result;
end;
$$;
revoke all on function public.claim_byteplus_slot_checks() from public,anon,authenticated;
grant execute on function public.claim_byteplus_slot_checks() to service_role;
create or replace function public.finish_byteplus_scene_slot(p_request text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.byteplus_scene_slots set active=false where request_id=p_request and active;
  return found;
end;
$$;
revoke all on function public.finish_byteplus_scene_slot(text) from public,anon,authenticated;
grant execute on function public.finish_byteplus_scene_slot(text) to service_role;

-- Only an explicit rejected POST can release an unbound slot. 429 is deferred, not a failed film.
create or replace function public.reject_byteplus_scene(p_order uuid,p_lease uuid,p_attempt integer,p_generation uuid,p_index integer,p_http integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes; delay_seconds integer;
begin
  if p_http is null or p_http not in (400,401,402,403,404,422,429) then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or job.status<>'processing' or job.lease_token is distinct from p_lease or job.attempts<>p_attempt
    or job.montage_generation is distinct from p_generation or job.model_config->'profile'->>'provider' is distinct from 'byteplus'
    or not public.property_order_fulfilled(p_order) then return false; end if;
  select * into scene from public.property_film_scenes where order_id=p_order and generation=p_generation and shot_index=p_index for update;
  if not found or scene.status<>'submitting' or scene.request_id is not null then return false; end if;
  update public.byteplus_scene_slots set active=false
    where order_id=p_order and generation=p_generation and shot_index=p_index and request_id is null;
  if p_http<>429 or job.byteplus_rate_limits>=5 then return false; end if;
  delay_seconds:=least(480,60*(2^job.byteplus_rate_limits)::integer);
  update public.byteplus_queue_settings set cooldown_until=greatest(cooldown_until,now()+make_interval(secs=>delay_seconds)) where id=true;
  delete from public.property_film_scenes where order_id=p_order and generation=p_generation and shot_index=p_index;
  update public.property_video_jobs set provider_phase='generating',byteplus_rate_limits=byteplus_rate_limits+1,
    lease_token=null,lease_until=null,last_error=null,next_poll_at=now()+make_interval(secs=>delay_seconds),updated_at=now() where order_id=p_order;
  return true;
end;
$$;
revoke all on function public.reject_byteplus_scene(uuid,uuid,integer,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.reject_byteplus_scene(uuid,uuid,integer,uuid,integer,integer) to service_role;

create or replace function public.reserve_property_film_scene(p_order uuid,p_lease uuid,p_attempt integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes;
begin
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return null; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(p_order) or job.status<>'processing' or job.lease_token is distinct from p_lease
    or job.lease_until<=now() or job.attempts<>p_attempt or job.model_config->>'engine' is distinct from 'higgsfield-montage-v1'
    or job.montage_plan is null or job.montage_next_shot>=jsonb_array_length(job.montage_plan->'shots') then return null; end if;
  select * into scene from public.property_film_scenes where order_id=p_order and generation=job.montage_generation and shot_index=job.montage_next_shot for update;
  if found then
    if scene.request_id is null then
      update public.property_film_scenes set status='uncertain',updated_at=now() where order_id=p_order and generation=scene.generation and shot_index=scene.shot_index;
      update public.property_video_jobs set provider_phase='uncertain',lease_token=null,lease_until=null,
        last_error='A scene submission needs reconciliation. No additional generation will be submitted automatically.',updated_at=now() where order_id=p_order;
      return null;
    end if;
    return to_jsonb(scene)||jsonb_build_object('submit',false);
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>128000 then return null; end if;
  insert into public.property_film_scenes(order_id,generation,shot_index,status,model_config,model_input)
    values(p_order,job.montage_generation,job.montage_next_shot,'submitting',job.model_config->'profile',p_input) returning * into scene;
  if not found then return null; end if;
  update public.property_video_jobs set provider_phase='submitting',updated_at=now() where order_id=p_order;
  return to_jsonb(scene)||jsonb_build_object('submit',true);
end;
$$;
revoke all on function public.reserve_property_film_scene(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_property_film_scene(uuid,uuid,integer,jsonb) to service_role;


create or replace function public.reserve_byteplus_lookahead(p_order uuid,p_lease uuid,p_attempt integer,p_index integer,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes;
begin
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return null; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(p_order) or job.status<>'processing'
    or job.lease_token is distinct from p_lease or job.attempts<>p_attempt or job.lease_until<=now()
    or not job.byteplus_parallel or job.model_config->'profile'->>'provider' is distinct from 'byteplus'
    or job.model_config->>'engine' is distinct from 'higgsfield-montage-v1'
    or job.montage_plan->'generationBudget'->>'version' is distinct from '3'
    or p_index is null or p_index<>job.montage_next_shot+1 or p_index>=jsonb_array_length(job.montage_plan->'shots') then return null; end if;
  -- The previous POST must already have an accepted ID before overlapping work.
  if not exists(select 1 from public.property_film_scenes where order_id=p_order and generation=job.montage_generation
    and shot_index=job.montage_next_shot and status='submitted' and request_id is not null) then return null; end if;
  select * into scene from public.property_film_scenes where order_id=p_order and generation=job.montage_generation and shot_index=p_index for update;
  if found then
    if scene.request_id is null then
      update public.property_film_scenes set status='uncertain',updated_at=now() where order_id=p_order and generation=scene.generation and shot_index=p_index;
      update public.property_video_jobs set provider_phase='uncertain',lease_token=null,lease_until=null,
        last_error='The next scene submission needs reconciliation. No automatic resubmission.',updated_at=now() where order_id=p_order;
      return null;
    end if;
    return to_jsonb(scene)||jsonb_build_object('submit',false);
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or octet_length(p_input::text)>128000
    or p_input->'duration' is distinct from job.montage_plan->'generationBudget'->'sceneSeconds'->p_index
    or p_input->>'resolution' is distinct from '720p' or p_input->>'generate_audio' is distinct from 'false'
    or p_input ? 'frames' then return null; end if;
  insert into public.property_film_scenes(order_id,generation,shot_index,status,model_config,model_input)
    values(p_order,job.montage_generation,p_index,'submitting',job.model_config->'profile',p_input) returning * into scene;
  if not found then return null; end if;
  return to_jsonb(scene)||jsonb_build_object('submit',true);
end;
$$;
revoke all on function public.reserve_byteplus_lookahead(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_byteplus_lookahead(uuid,uuid,integer,integer,jsonb) to service_role;


notify pgrst,'reload schema';
commit;
select 'MBP_BYTEPLUS_QUEUE_READY' as status;
