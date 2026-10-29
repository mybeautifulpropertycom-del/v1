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
