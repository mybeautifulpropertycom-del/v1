-- Existing installations with property discovery enabled. Safe to rerun in order.
begin;
alter table public.properties
  add column if not exists county text
  check (county is null or char_length(btrim(county)) between 1 and 80);

create or replace function public.discovery_in_bucharest_ilfov(county text, address text, city text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  region_names constant text[] := array[
    'bucuresti', 'municipiul-bucuresti', 'bucharest',
    'ilfov', 'judetul-ilfov', 'jud-ilfov', 'ilfov-county'
  ];
begin
  if nullif(btrim(county), '') is not null then
    return public.address_slug_base(county) = any(region_names || array['b', 'if']);
  end if;
  if public.address_slug_base(city) in ('bucuresti', 'bucharest') or exists (
    select 1 from unnest(string_to_array(address, ',')) part
      where public.address_slug_base(part) = any(region_names)
  ) then return true; end if;
  if address ~* '\m(RO[-[:space:]]*)?[0-9]{6}\M' then
    return address ~* '\m(RO[-[:space:]]*)?0[1-7][0-9]{4}\M';
  end if;
  -- Older addresses may omit the county. Only infer it for distinctive place names.
  return public.address_slug_base(coalesce(city, split_part(address, ',', 1))) in (
    'buftea', 'chitila', 'otopeni', 'popesti-leordeni', 'voluntari', 'chiajna',
    'corbeanca', 'ciolpani', 'ciorogarla', 'darasti-ilfov', 'dragomiresti-vale',
    'dragomiresti-deal', 'jilava', 'moara-vlasiei', 'mogosoaia', 'petrachioaia',
    'snagov', 'stefanestii-de-jos', 'stefanestii-de-sus'
  );
end;
$$;
revoke all on function public.discovery_in_bucharest_ilfov(text, text, text) from public, anon, authenticated;

create or replace view public.property_discovery as
  select p.id, p.slug, p.address_slug, p.title, p.location,
    p.price, p.currency, p.transaction, p.area, p.area_unit,
    case when p.type <> 'Land' then nullif(p.bedrooms, 0)::smallint end as rooms,
    p.images[1] as image, p.updated_at,
    case p.type
      when 'Condo' then 'apartamente'
      when 'Studio' then 'garsoniere'
      when 'House' then 'case'
      when 'Town House' then 'case'
      when 'Penthouse' then 'penthouse-uri'
      when 'Land' then 'terenuri'
    end as kind,
    coalesce(nullif(btrim(p.city), ''), public.discovery_legacy_city(p.location)) as city,
    case when coalesce(nullif(btrim(p.city), ''), public.discovery_legacy_city(p.location)) is not null
      then public.address_slug_base(coalesce(nullif(btrim(p.city), ''), public.discovery_legacy_city(p.location)))
    end as city_slug,
    p.bathrooms, p.amenities, p.google_place_id, p.bedrooms,
    public.discovery_in_bucharest_ilfov(p.county, p.location,
      coalesce(nullif(btrim(p.city), ''), public.discovery_legacy_city(p.location))) as bucharest_ilfov
  from public.properties p
  join public.profiles a on a.id = p.owner_id
  where p.status = 'published';
notify pgrst, 'reload schema';
commit;
select 'MBP_DISCOVERY_COUNTY_READY' as status;
