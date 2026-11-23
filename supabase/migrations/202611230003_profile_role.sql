alter table public.profiles
  add column if not exists profile_role text
    constraint profiles_profile_role_check
    check (profile_role in ('agent', 'owner'));
