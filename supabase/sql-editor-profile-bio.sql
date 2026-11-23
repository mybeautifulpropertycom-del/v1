-- Existing installations: run the entire file. Safe to rerun.
begin;
create table if not exists public.profile_bio_usage (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  generations integer not null default 0 check (generations between 0 and 3),
  request_id uuid,
  reserved_until timestamptz
);
alter table public.profile_bio_usage enable row level security;
revoke all on public.profile_bio_usage from public, anon, authenticated;
grant select on public.profile_bio_usage to service_role;

-- Positive values are the remaining generations. Zero means exhausted; -1 means busy.
create or replace function public.reserve_profile_bio(agent_id uuid, attempt_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare remaining integer;
begin
  insert into public.profile_bio_usage(owner_id, request_id, reserved_until)
    values (agent_id, attempt_id, now() + interval '90 seconds')
  on conflict (owner_id) do update
    set request_id = excluded.request_id, reserved_until = excluded.reserved_until
    where profile_bio_usage.generations < 3
      and (profile_bio_usage.reserved_until is null or profile_bio_usage.reserved_until <= now())
  returning 3 - generations into remaining;
  if found then return remaining; end if;

  select 3 - generations into remaining from public.profile_bio_usage where owner_id = agent_id;
  return case when remaining = 0 then 0 else -1 end;
end;
$$;

create or replace function public.finish_profile_bio(agent_id uuid, attempt_id uuid, succeeded boolean)
returns integer language sql security definer set search_path = '' as $$
  update public.profile_bio_usage
    set generations = generations + case when succeeded then 1 else 0 end,
        request_id = null,
        reserved_until = case when succeeded then null else now() + interval '10 seconds' end
    where owner_id = agent_id and request_id = attempt_id
    returning 3 - generations;
$$;

revoke all on function public.reserve_profile_bio(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_profile_bio(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.reserve_profile_bio(uuid, uuid) to service_role;
grant execute on function public.finish_profile_bio(uuid, uuid, boolean) to service_role;
notify pgrst, 'reload schema';
commit;
select 'MBP_PROFILE_BIO_READY' as status;
