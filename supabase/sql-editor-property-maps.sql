-- Existing installations: adds optional map place IDs. No existing addresses are changed.
begin;
-- Additive: no geocoding, billing, or changes to existing addresses.
alter table public.properties add column if not exists google_place_id text;
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.properties'::regclass and conname='properties_google_place_id_valid') then
    alter table public.properties add constraint properties_google_place_id_valid
      check (google_place_id is null or (length(google_place_id) between 1 and 512 and google_place_id ~ '^[A-Za-z0-9_-]+$'));
  end if;
end $$;

-- Protect every write path (including inline preview edits/API clients) from
-- leaving the old pin attached to an edited address. A fresh selection supplies
-- a new place ID. No RLS policies or publication rules are changed.
create or replace function public.clear_changed_property_map() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.location is distinct from old.location and new.google_place_id is not distinct from old.google_place_id then
    new.google_place_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists clear_changed_property_map on public.properties;
create trigger clear_changed_property_map before update on public.properties
for each row execute function public.clear_changed_property_map();
-- Existing get_public_property uses to_jsonb(p) and returns this public place ID
-- for published properties only, with its existing owner/status restrictions.
notify pgrst, 'reload schema';
commit;
select 'MBP_PROPERTY_MAPS_READY' as status;
