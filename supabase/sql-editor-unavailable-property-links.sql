-- Existing installations with address URLs. Safe to rerun.
begin;
-- Keep only a hash of each former public URL key and its last published offer.
create table if not exists public.unavailable_property_links (
  slug_hash bytea primary key,
  offer text not null check (offer in ('sale', 'rent'))
);
alter table public.unavailable_property_links enable row level security;
revoke all on public.unavailable_property_links from public, anon, authenticated;

create or replace function public.remember_unavailable_property_links() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'published' and (tg_op = 'DELETE' or new.status <> 'published') then
    insert into public.unavailable_property_links (slug_hash, offer)
      select sha256(convert_to(u.slug, 'UTF8')), old.transaction
      from public.property_url_slugs u where u.property_id = old.id
      on conflict (slug_hash) do update set offer = excluded.offer;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.remember_unavailable_property_links() from public, anon, authenticated;

drop trigger if exists remember_unavailable_property_links on public.properties;
create trigger remember_unavailable_property_links
  before update of status or delete on public.properties
  for each row execute function public.remember_unavailable_property_links();

-- Previously withdrawn listings still have their published address and alias records.
insert into public.unavailable_property_links (slug_hash, offer)
  select sha256(convert_to(u.slug, 'UTF8')), p.transaction
  from public.property_url_slugs u join public.properties p on p.id = u.property_id
  where p.status <> 'published' and p.address_slug is not null
  on conflict (slug_hash) do nothing;

create or replace function public.get_unavailable_property_offer(property_slug text) returns text
language sql stable security definer set search_path = '' as $$
  select archived.offer
  from public.unavailable_property_links archived
  where property_slug ~ '^[a-z0-9-]{1,110}$'
    and archived.slug_hash = sha256(convert_to(property_slug, 'UTF8'))
    and not exists (
      select 1
      from public.property_url_slugs u join public.properties p on p.id = u.property_id
      where u.slug = property_slug and (p.status = 'published' or p.address_slug is null)
    );
$$;
revoke all on function public.get_unavailable_property_offer(text) from public, anon, authenticated;
grant execute on function public.get_unavailable_property_offer(text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
select 'MBP_UNAVAILABLE_PROPERTY_LINKS_READY' as status;
