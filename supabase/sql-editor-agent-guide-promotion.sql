-- Existing installations with the agent guide. Run the ENTIRE file. Safe to rerun.
-- Remembers the optional promotion step only. Does not reopen guides, charge, publish or launch campaigns.
begin;
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
notify pgrst, 'reload schema';
commit;
select 'MBP_AGENT_GUIDE_PROMOTION_READY' as status;
