-- Existing installations: run the ENTIRE file. Safe to rerun.
-- Allows Garsonieră (Studio). Preserves properties, amenities, payments and publications.
begin;
-- Add studios while retaining every existing property type and record.
alter table public.properties
  drop constraint if exists properties_type_check;
alter table public.properties
  add constraint properties_type_check
  check (type in ('House', 'Town House', 'Condo', 'Studio', 'Penthouse', 'Land'));
notify pgrst, 'reload schema';
commit;
select 'MBP_PROPERTY_OPTIONS_READY' as status;
