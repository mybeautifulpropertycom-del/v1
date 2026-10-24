-- Additive update for existing installations. No API keys are stored here.
alter table public.properties add column if not exists website_copy jsonb
  check (website_copy is null or (
    jsonb_typeof(website_copy) = 'object' and octet_length(website_copy::text) <= 100000
  ));

-- Durable per-agent budget; callers cannot reset the counter directly.
create table if not exists public.property_story_usage (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  usage_day date not null,
  attempts integer not null check (attempts between 0 and 5),
  last_started_at timestamptz not null
);
alter table public.property_story_usage enable row level security;
revoke all on public.property_story_usage from public, anon, authenticated;

create or replace function public.reserve_property_story(property_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare agent_id uuid := auth.uid();
declare today date := (now() at time zone 'UTC')::date;
declare usage public.property_story_usage;
begin
  if agent_id is null or not exists (
    select 1 from public.properties p where p.id = property_id and p.owner_id = agent_id
  ) then return 'unavailable'; end if;
  perform pg_advisory_xact_lock(hashtextextended('property-story:' || agent_id::text, 0));
  select * into usage from public.property_story_usage where owner_id = agent_id;
  if found then
    if usage.last_started_at > now() - interval '1 minute'
      then return 'cooldown'; end if;
    if usage.usage_day = today and usage.attempts >= 5
      then return 'daily_limit'; end if;
  end if;
  insert into public.property_story_usage(owner_id, usage_day, attempts, last_started_at)
  values (agent_id, today, 1, now())
  on conflict (owner_id) do update set
    attempts = case when property_story_usage.usage_day = today then property_story_usage.attempts + 1 else 1 end,
    usage_day = today, last_started_at = now();
  return 'reserved';
end;
$$;
revoke all on function public.reserve_property_story(uuid) from public;
grant execute on function public.reserve_property_story(uuid) to authenticated;

notify pgrst, 'reload schema';
