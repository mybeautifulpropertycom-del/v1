-- Read-only diagnostics. Does not retry, rebuild, publish, or spend API credits.
-- No credentials, image URLs, prompts, or customer contact details are returned.
select
  j.property_id,
  j.status,
  j.provider_phase,
  case
    when j.model_config->>'engine' = 'photo-montage-v1' then 'original_photographs'
    when j.model_config->'profile'->>'provider' = 'byteplus' then 'byteplus'
    when j.model_config->'profile'->>'endpoint' is not null then 'higgsfield'
    when j.model_config->>'endpoint' is not null then coalesce(j.model_config->>'provider', 'higgsfield')
    else 'not_assigned'
  end as saved_provider,
  coalesce(j.model_config->'profile'->>'endpoint', j.model_config->>'endpoint') as model,
  j.attempts,
  j.montage_failures,
  (j.montage_plan is not null) as has_saved_plan,
  j.montage_next_shot as completed_scenes,
  j.montage_edited_shots as edited_scenes,
  (select count(*) from public.property_film_scenes s
    where s.order_id = j.order_id and s.generation = j.montage_generation
      and s.request_id is not null) as saved_provider_requests,
  j.last_error,
  j.updated_at
from public.property_video_jobs j
order by j.updated_at desc
limit 10;
