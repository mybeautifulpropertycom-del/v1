-- Existing installations with property discovery enabled. Safe to rerun.
begin;
-- Append public card details without changing existing search filters or access.
create or replace view public.property_discovery as
  select p.id, p.slug, p.address_slug, p.title, p.location,
    p.price, p.currency, p.transaction, p.area, p.area_unit, p.rooms,
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
    p.bathrooms, p.amenities, p.google_place_id
  from public.properties p
  join public.profiles a on a.id = p.owner_id
  where p.status = 'published';
commit;
select 'MBP_DISCOVERY_CARD_DETAILS_READY' as status;
