alter table public.properties
  add column if not exists city text check (city is null or char_length(btrim(city)) between 1 and 80),
  add column if not exists rooms smallint check (rooms between 1 and 100);

-- Existing addresses can supply a locality when the street and locality occupy
-- separate parts. Do not infer a city from a street-only address or a sector.
create or replace function public.discovery_legacy_city(address text)
returns text language plpgsql immutable set search_path = '' as $$
declare parts text[] := string_to_array(coalesce(address, ''), ',');
declare candidate text;
declare part text;
begin
  if cardinality(parts) < 2 or not (
    btrim(parts[1]) ~ '[[:alpha:]][[:space:]]+[0-9]{1,5}([[:alpha:]]|[[:space:]]|$)' or
    btrim(parts[1]) ~* '^(str(ada)?[.]?|șos(eaua)?[.]?|soseaua|bulevardul|bd[.]?|b-dul|calea|aleea|intrarea|splaiul|piața)([[:space:]]|$)'
  ) then return null; end if;
  foreach part in array parts[2:] loop
    candidate := btrim(regexp_replace(part, '\m(RO[-[:space:]]*)?[0-9]{6}\M', '', 'gi'));
    if candidate ~* '^sector[[:space:]]+[1-6]$' then continue; end if;
    if char_length(candidate) between 2 and 80
       and candidate !~* '^(românia|romania|ro|județul.*|judetul.*|jud[.].*)$'
       and candidate !~* '(^|[[:space:]])(nr[.]?|bloc|scara|etaj)([[:space:]]|$)'
       and candidate ~ '^[[:alpha:][:space:].-]+$|^[0-9]{1,2} [[:alpha:][:space:].-]+$'
      then return candidate;
    end if;
    return null;
  end loop;
  return null;
end;
$$;
revoke all on function public.discovery_legacy_city(text) from public, anon, authenticated;

create index if not exists properties_discovery_feed
  on public.properties(transaction, updated_at desc, id)
  where status = 'published';

-- Keep the projection internal. Anonymous callers only receive public cards,
-- city options, and category links through the bounded read functions below.
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
    end as city_slug
  from public.properties p
  join public.profiles a on a.id = p.owner_id
  where p.status = 'published';

revoke all on public.property_discovery from public, anon, authenticated;

create or replace function public.find_public_listings(
  offer text,
  kind_filter text default null,
  room_filter integer default null,
  city_filter text default null,
  budget_min numeric default null,
  budget_max numeric default null,
  budget_currency text default null,
  result_page integer default 1
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if offer is null or offer not in ('sale', 'rent')
     or (kind_filter is not null and kind_filter not in ('apartamente', 'case', 'garsoniere', 'penthouse-uri', 'terenuri'))
     or (room_filter is not null and room_filter not between 1 and 100)
     or (city_filter is not null and city_filter !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
     or char_length(city_filter) > 90
     or (budget_currency is not null and budget_currency not in ('EUR', 'RON', 'USD'))
     or ((budget_min is not null or budget_max is not null) and budget_currency is null)
     or (budget_min is not null and budget_min not between 0 and 999999999999)
     or (budget_max is not null and budget_max not between 0 and 999999999999)
     or budget_min > budget_max
     or result_page is null or result_page not between 1 and 5000
  then raise exception 'Invalid listing filters' using errcode = '22023'; end if;

  with matching as not materialized (
    select * from public.property_discovery p
      where p.transaction = offer
        and (kind_filter is null or p.kind = kind_filter)
        and (room_filter is null or p.rooms = room_filter)
        and (city_filter is null or p.city_slug = city_filter)
        and (budget_currency is null or p.currency = budget_currency)
        and (budget_min is null or p.price >= budget_min)
        and (budget_max is null or p.price <= budget_max)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'city', (select min(p.city) from public.property_discovery p where p.city_slug = city_filter),
    'items', coalesce((
      select jsonb_agg(to_jsonb(page) - array['updated_at', 'id'] order by page.updated_at desc, page.id)
      from (select * from matching order by updated_at desc, id limit 24 offset (result_page - 1) * 24) page
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_public_listing_cities()
returns table(slug text, name text, has_sales boolean) language sql stable security definer set search_path = '' as $$
  select p.city_slug, min(p.city), bool_or(p.transaction = 'sale')
  from public.property_discovery p where p.city_slug is not null
  group by p.city_slug order by min(p.city), p.city_slug limit 1000;
$$;

create or replace function public.get_public_listing_categories()
returns table(transaction text, kind text, rooms integer, city_slug text)
language sql stable security definer set search_path = '' as $$
  select p.transaction, p.kind, p.rooms::integer, p.city_slug
  from public.property_discovery p
  group by p.transaction, cube(p.kind, p.rooms, p.city_slug)
  having (grouping(p.kind) = 1 or p.kind is not null)
     and (grouping(p.rooms) = 1 or p.rooms is not null)
     and (grouping(p.city_slug) = 1 or p.city_slug is not null)
  order by count(*) desc, p.transaction, p.kind, p.rooms, p.city_slug limit 10000;
$$;

revoke all on function public.find_public_listings(text, text, integer, text, numeric, numeric, text, integer) from public, anon, authenticated;
revoke all on function public.get_public_listing_cities() from public, anon, authenticated;
revoke all on function public.get_public_listing_categories() from public, anon, authenticated;
grant execute on function public.find_public_listings(text, text, integer, text, numeric, numeric, text, integer) to anon, authenticated;
grant execute on function public.get_public_listing_cities() to anon, authenticated;
grant execute on function public.get_public_listing_categories() to anon, authenticated;

notify pgrst, 'reload schema';
