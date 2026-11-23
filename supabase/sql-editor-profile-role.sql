-- Existing installations: run the entire file. Safe to rerun.
begin;
alter table public.profiles
  add column if not exists profile_role text
    constraint profiles_profile_role_check
    check (profile_role in ('agent', 'owner'));
notify pgrst, 'reload schema';
commit;
select 'MBP_PROFILE_ROLE_READY' as status;
