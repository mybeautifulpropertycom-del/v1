-- Existing category URLs and RPCs use "rooms" as the search key for bedrooms.
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
    p.bathrooms, p.amenities, p.google_place_id, p.bedrooms
  from public.properties p
  join public.profiles a on a.id = p.owner_id
  where p.status = 'published';
