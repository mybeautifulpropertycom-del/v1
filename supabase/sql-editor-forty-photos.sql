-- Run the ENTIRE file. Raises the property photo limit to 40; existing photos are preserved.
begin;
-- Extend the existing photo limit without changing ownership or publication checks.
alter table public.properties drop constraint if exists properties_images_check;
alter table public.properties add constraint properties_images_check check (cardinality(images) <= 40);
notify pgrst,'reload schema';
commit;
select 'MBP_40_PHOTOS_READY' as status;
