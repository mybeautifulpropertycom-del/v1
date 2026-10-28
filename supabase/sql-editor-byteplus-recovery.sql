-- Run after the multi-photo film upgrade. Installs recovery only; no video generation is started.
begin;
-- Installs a protected manual recovery action; installation starts no jobs.
create or replace function public.admin_resume_byteplus_film(listing_id uuid,actor_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; scene public.property_film_scenes;
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
  select * into scene from public.property_film_scenes where order_id=job.order_id
    and generation=job.montage_generation and shot_index=job.montage_next_shot for update;
  if not found or scene.request_id is not null or scene.status is distinct from 'submitting'
    or scene.model_config->>'provider' is distinct from 'byteplus' then
    raise exception 'The existing scene request needs reconciliation' using errcode='P0409';
  end if;
  insert into public.platform_admin_audit(actor_id,property_id,action,details)
    values(actor_id,listing_id,'resume_byteplus_film',jsonb_build_object(
      'generation',job.montage_generation,'scene',job.montage_next_shot,
      'previous_error',job.last_error,'completed_scenes',job.montage_next_shot));
  delete from public.property_film_scenes where order_id=job.order_id
    and generation=job.montage_generation and shot_index=job.montage_next_shot;
  update public.property_video_jobs set status='processing',provider_phase='generating',
    attempts=attempts+1,montage_failures=0,last_error=null,lease_token=null,lease_until=null,
    next_poll_at=now(),updated_at=now() where order_id=job.order_id;
  return jsonb_build_object('videoStatus','processing','savedScenes',job.montage_next_shot);
end;
$$;
revoke all on function public.admin_resume_byteplus_film(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_resume_byteplus_film(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
commit;
select 'MBP_BYTEPLUS_RECOVERY_READY' as status;
