alter table public.properties
  add column if not exists construction_year smallint
    constraint properties_construction_year_check
    check (construction_year between 1000 and 9999);
