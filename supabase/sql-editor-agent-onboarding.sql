-- Existing installations: run this ENTIRE file. Safe to rerun.
-- Enrols only future profiles. Does not change existing accounts, properties or payments.
begin;
-- Enrol only profiles created after activation. Existing agents keep their workspace.
create table if not exists public.agent_onboarding (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','dismissed','completed')),
  updated_at timestamptz not null default now()
);
alter table public.agent_onboarding enable row level security;
revoke all on public.agent_onboarding from public,anon,authenticated;
grant select on public.agent_onboarding to authenticated;
grant update(status) on public.agent_onboarding to authenticated;
drop policy if exists "Agents read their guide" on public.agent_onboarding;
create policy "Agents read their guide" on public.agent_onboarding for select to authenticated
  using (owner_id=(select auth.uid()));
drop policy if exists "Agents close their guide" on public.agent_onboarding;
create policy "Agents close their guide" on public.agent_onboarding for update to authenticated
  using (owner_id=(select auth.uid())) with check (owner_id=(select auth.uid()));

create or replace function public.enrol_agent_onboarding() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.agent_onboarding(owner_id) values(new.id) on conflict do nothing;
  return new;
end; $$;
revoke all on function public.enrol_agent_onboarding() from public,anon,authenticated;
drop trigger if exists enrol_agent_onboarding on public.profiles;
create trigger enrol_agent_onboarding after insert on public.profiles
  for each row execute function public.enrol_agent_onboarding();

create or replace function public.guard_agent_onboarding() returns trigger
language plpgsql set search_path='' as $$
begin
  -- Closing is permanent; a stale tab cannot reopen the guide.
  if old.status <> 'active' then new.status:=old.status; end if;
  new.updated_at:=now();
  return new;
end; $$;
revoke all on function public.guard_agent_onboarding() from public,anon,authenticated;
drop trigger if exists guard_agent_onboarding on public.agent_onboarding;
create trigger guard_agent_onboarding before update on public.agent_onboarding
  for each row execute function public.guard_agent_onboarding();
notify pgrst, 'reload schema';
commit;
select 'MBP_AGENT_ONBOARDING_READY' as status;
