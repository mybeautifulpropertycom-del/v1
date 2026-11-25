-- Existing installations: run the entire file. Safe to rerun.
begin;
alter table public.properties
  add column if not exists land_area numeric
    constraint properties_land_area_check check (
      land_area is null or (type in ('House', 'Town House') and land_area > 0 and land_area <= 999999999)
    ),
  add column if not exists floor smallint,
  add column if not exists total_floors smallint
    constraint properties_floor_check check (
      (floor is null and total_floors is null) or (
        type in ('Condo', 'Studio', 'Penthouse') and floor is not null and total_floors is not null
        and total_floors between 0 and 100 and floor between -1 and total_floors
      )
    );
notify pgrst, 'reload schema';
commit;
select 'MBP_PROPERTY_LAND_AREA_AND_FLOOR_READY' as status;
