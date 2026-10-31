-- Existing installations: adds Town House without changing saved properties.
begin;
-- Extend the allowed types while preserving all existing property records.
alter table public.properties
  drop constraint if exists properties_type_check;
alter table public.properties
  add constraint properties_type_check
  check (type in ('House', 'Town House', 'Condo', 'Penthouse', 'Land'));
notify pgrst, 'reload schema';
commit;
select 'MBP_TOWN_HOUSE_READY' as status;
