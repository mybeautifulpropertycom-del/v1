-- Remember the optional promotion tour separately from creation and closing.
alter table public.agent_onboarding
  add column if not exists promotion_seen boolean not null default false;
grant update(promotion_seen) on public.agent_onboarding to authenticated;

create or replace function public.guard_agent_onboarding() returns trigger
language plpgsql set search_path='' as $$
begin
  -- Stale tabs cannot reopen a closed guide or undo either milestone.
  if old.status <> 'active' then new.status:=old.status; end if;
  new.creation_seen:=old.creation_seen or new.creation_seen;
  new.promotion_seen:=old.promotion_seen or new.promotion_seen;
  new.updated_at:=now();
  return new;
end; $$;
revoke all on function public.guard_agent_onboarding() from public,anon,authenticated;
