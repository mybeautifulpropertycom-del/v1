-- Public discovery exposes only canonical slugs and modification dates of published listings.
-- Table RLS and all existing publication rules remain unchanged.
create index if not exists properties_public_sitemap on public.properties(id) where status = 'published';

create or replace function public.get_public_sitemap(sitemap_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if sitemap_page < 0 or sitemap_page > 49998 or sitemap_page is null then
    raise exception 'Invalid sitemap page' using errcode = '22023';
  end if;
  select jsonb_build_object(
    'total', (select count(*) from public.properties p join public.profiles a on a.id=p.owner_id where p.status='published'),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'slug', page.slug, 'address_slug', page.address_slug, 'updated_at', page.updated_at
    ) order by page.id) from (
      select p.id, p.slug, to_jsonb(p)->>'address_slug' as address_slug, p.updated_at
      from public.properties p join public.profiles a on a.id=p.owner_id
      where p.status='published' order by p.id
      limit 1000 offset (sitemap_page::bigint * 1000)
    ) page), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_public_sitemap(integer) from public;
grant execute on function public.get_public_sitemap(integer) to anon, authenticated;
