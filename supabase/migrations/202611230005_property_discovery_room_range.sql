-- Preserve exact room filters and reserve -8 for eight or more rooms.
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
     or (room_filter is not null and room_filter <> -8 and room_filter not between 1 and 100)
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
        and (
          room_filter is null
          or (room_filter = -8 and p.rooms >= 8)
          or p.rooms = room_filter
        )
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
