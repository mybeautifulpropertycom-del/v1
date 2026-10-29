-- One-time Seedance 2.5 minimum-duration repair. Installation starts no jobs.
create or replace function public.admin_repair_byteplus_duration(listing_id uuid,actor_id uuid,p_rate numeric,p_max numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes;
  old_budget jsonb; new_budget jsonb; sources jsonb; total_seconds integer; total_cost numeric;
  rate numeric; max_usd numeric; cap numeric; total integer;
begin
  perform 1 from public.platform_admins where user_id=actor_id for share;
  if not found then raise exception 'Administrator access required' using errcode='42501'; end if;
  if p_rate is null or not (p_rate>0 and p_rate<=100) or p_max is null or not (p_max>0 and p_max<=20) then
    raise exception 'Invalid budget configuration' using errcode='P0409'; end if;
  perform 1 from public.properties where id=listing_id for update;
  if not found then raise exception 'Property unavailable' using errcode='P0409'; end if;
  select * into purchase from public.property_orders where property_id=listing_id for update;
  if not found or not public.property_order_fulfilled(purchase.id) then
    raise exception 'Publication access required' using errcode='P0409'; end if;
  select * into job from public.property_video_jobs where order_id=purchase.id for update;
  if not found or job.status<>'failed' or job.provider_phase is distinct from 'provider_failed' or job.lease_until>now()
    or job.model_config->'profile'->>'provider' is distinct from 'byteplus'
    or job.model_config->'profile'->>'endpoint' is distinct from 'dreamina-seedance-2-5-260628'
    or job.model_config->'profile'->'input'->>'resolution' is distinct from '720p'
    or job.model_config->'profile'->'input'->>'generate_audio' is distinct from 'false'
    or job.montage_plan->>'timing' is distinct from 'variable-v1'
    or jsonb_typeof(job.montage_plan->'shots') is distinct from 'array'
    or job.montage_plan->'generationBudget'->>'version' is distinct from '2'
    or coalesce(job.last_error,'') !~ '^BytePlus rejected scene [0-9]+ \(HTTP 400; code InvalidParameter[^;]*; duration [23]s\)' then
    raise exception 'This film is not eligible for the duration repair' using errcode='P0409'; end if;
  old_budget:=job.montage_plan->'generationBudget';
  if old_budget->>'model' is distinct from 'dreamina-seedance-2-5-260628'
    or old_budget->>'resolution' is distinct from '720p'
    or old_budget->>'usdPerSecond' is null or not ((old_budget->>'usdPerSecond')::numeric>0 and (old_budget->>'usdPerSecond')::numeric<=100)
    or old_budget->>'maxUsd' is null or not ((old_budget->>'maxUsd')::numeric>0 and (old_budget->>'maxUsd')::numeric<=20) then
    raise exception 'Saved budget needs review' using errcode='P0409'; end if;
  total:=jsonb_array_length(job.montage_plan->'shots');
  if total<1 or total>23 or job.montage_next_shot>=total or exists(
    select 1 from jsonb_array_elements(job.montage_plan->'shots') s where coalesce(s->>'seconds','') !~ '^[2-5]$') then
    raise exception 'Invalid scene timeline' using errcode='P0409'; end if;
  select * into scene from public.property_film_scenes where order_id=job.order_id
    and generation=job.montage_generation and shot_index=job.montage_next_shot for update;
  if not found or scene.request_id is not null or scene.status is distinct from 'submitting'
    or scene.model_config->>'provider' is distinct from 'byteplus'
    or coalesce(scene.model_input->>'duration','') !~ '^[23]$' then
    raise exception 'The scene request needs reconciliation' using errcode='P0409'; end if;
  -- All previous scenes must already be saved, with exactly the generated length
  -- the corrected budget will count. Never erase a possibly accepted request.
  if (select count(*) from public.property_film_scenes s where s.order_id=job.order_id
      and s.generation=job.montage_generation and s.shot_index<job.montage_next_shot
      and s.status='completed' and s.request_id is not null
      and s.model_config->>'provider'='byteplus'
      and (s.model_input->>'duration')::integer=greatest(4,(job.montage_plan->'shots'->s.shot_index->>'seconds')::integer))<>job.montage_next_shot
    or exists(select 1 from public.property_film_scenes s where s.order_id=job.order_id
      and s.generation=job.montage_generation and s.shot_index>job.montage_next_shot) then
    raise exception 'Existing scenes need review' using errcode='P0409'; end if;
  rate:=greatest(p_rate,(old_budget->>'usdPerSecond')::numeric);
  max_usd:=least(p_max,(old_budget->>'maxUsd')::numeric);
  cap:=floor(max_usd*100*0.8)/100;
  select jsonb_agg(greatest(4,(s->>'seconds')::integer) order by n),
    sum(greatest(4,(s->>'seconds')::integer)),sum(ceil(rate*greatest(4,(s->>'seconds')::integer)*100))/100
    into sources,total_seconds,total_cost from jsonb_array_elements(job.montage_plan->'shots') with ordinality as x(s,n);
  if total_cost>cap then raise exception 'Corrected durations exceed the approved budget' using errcode='P0409'; end if;
  new_budget:=jsonb_build_object('version',3,'model',old_budget->>'model','resolution','720p',
    'sceneSeconds',sources,'generatedSeconds',total_seconds,'usdPerSecond',rate,'maxUsd',max_usd,
    'plannedScenes',total,'estimatedGenerationUsd',total_cost,'reserveUsd',max_usd-cap);
  insert into public.platform_admin_audit(actor_id,property_id,action,details) values(actor_id,listing_id,
    'repair_byteplus_duration',jsonb_build_object('generation',job.montage_generation,'previous_budget',old_budget,
    'corrected_budget',new_budget,'completed_scenes',job.montage_next_shot));
  delete from public.property_film_scenes where order_id=job.order_id and generation=job.montage_generation and shot_index=job.montage_next_shot;
  -- Source generation is corrected; photographs, final shot lengths, artifacts,
  -- model snapshot, music and generation ID remain unchanged.
  update public.property_video_jobs set montage_plan=jsonb_set(montage_plan,'{generationBudget}',new_budget),
    status='processing',provider_phase='generating',attempts=attempts+1,montage_failures=0,last_error=null,
    lease_token=null,lease_until=null,next_poll_at=now(),updated_at=now() where order_id=job.order_id;
  return jsonb_build_object('videoStatus','processing','savedScenes',job.montage_next_shot,'budget',new_budget);
end;
$$;
revoke all on function public.admin_repair_byteplus_duration(uuid,uuid,numeric,numeric) from public,anon,authenticated;
grant execute on function public.admin_repair_byteplus_duration(uuid,uuid,numeric,numeric) to service_role;
