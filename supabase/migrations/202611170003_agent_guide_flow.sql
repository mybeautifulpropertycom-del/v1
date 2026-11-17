-- Remember the completed creation walkthrough independently of publication.
alter table public.agent_onboarding
  add column if not exists creation_seen boolean not null default false;
grant update(creation_seen) on public.agent_onboarding to authenticated;

create or replace function public.guard_agent_onboarding() returns trigger
language plpgsql set search_path='' as $$
begin
  -- Old tabs cannot reopen a closed guide or undo the creation milestone.
  if old.status <> 'active' then new.status:=old.status; end if;
  new.creation_seen:=old.creation_seen or new.creation_seen;
  new.updated_at:=now();
  return new;
end; $$;
revoke all on function public.guard_agent_onboarding() from public,anon,authenticated;
