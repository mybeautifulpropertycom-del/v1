-- Existing installations: run the entire file. Safe to rerun.
begin;
alter table public.properties
  add column if not exists construction_year smallint
    constraint properties_construction_year_check
    check (construction_year between 1000 and 9999);
notify pgrst, 'reload schema';
commit;
select 'MBP_PROPERTY_CONSTRUCTION_YEAR_READY' as status;
