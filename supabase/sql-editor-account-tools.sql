-- Existing installations: run this ENTIRE file in Supabase SQL Editor.
-- Adds agent photos and preserves leads when a property is deleted.
begin;
-- Add public agent portraits and retain leads when a property is deleted.
alter table public.profiles add column if not exists avatar_url text not null default ''
  check (char_length(avatar_url) <= 2048 and (avatar_url = '' or avatar_url ~ '^https://'));

alter table public.inquiries alter column property_id drop not null;
alter table public.inquiries drop constraint if exists inquiries_property_id_fkey;
alter table public.inquiries add constraint inquiries_property_id_fkey
  foreign key (property_id) references public.properties(id) on delete set null;

create or replace function public.delete_owned_property(property_id uuid) returns boolean
language sql security invoker set search_path = '' as $$
  with removed as (
    delete from public.properties p where p.id = property_id and p.owner_id = auth.uid() returning p.id
  ) select exists(select 1 from removed);
$$;
revoke all on function public.delete_owned_property(uuid) from public;
grant execute on function public.delete_owned_property(uuid) to authenticated;

create or replace function public.get_public_property(property_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'property', to_jsonb(p) - array['owner_id', 'created_at', 'updated_at'],
    'profile', jsonb_build_object('name', a.name, 'email', a.email, 'phone', a.phone, 'agency', a.agency, 'bio', a.bio, 'avatar_url', a.avatar_url)
  )
  from public.properties p join public.profiles a on a.id = p.owner_id
  where p.slug = property_slug and p.status = 'published'
  limit 1;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('agent-avatars', 'agent-avatars', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "Agents upload their own avatar" on storage.objects;
create policy "Agents upload their own avatar" on storage.objects for insert to authenticated
with check (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Agents read their own avatar metadata" on storage.objects;
create policy "Agents read their own avatar metadata" on storage.objects for select to authenticated
using (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Agents delete their own avatar" on storage.objects;
create policy "Agents delete their own avatar" on storage.objects for delete to authenticated
using (bucket_id = 'agent-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
notify pgrst, 'reload schema';
commit;
select 'MBP_ACCOUNT_TOOLS_OK' as status;
