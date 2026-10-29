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
