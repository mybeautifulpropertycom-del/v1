-- Existing installations with publication packages and profile roles. Safe to rerun.
begin;
create or replace function public.get_public_property(property_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'property',to_jsonb(p)-array['owner_id','created_at','updated_at'],
    'profile',jsonb_build_object(
      'name',a.name,'email',a.email,'phone',a.phone,'agency',a.agency,
      'bio',a.bio,'avatar_url',a.avatar_url,'profile_role',a.profile_role
    ),
    'videoIncluded',coalesce((select o.includes_video from public.property_orders o where o.property_id=p.id),true),
    'film',(select jsonb_build_object('src',v.video_url,'poster',coalesce(v.poster_url,p.images[1]))
      from public.property_video_jobs v join public.property_orders o on o.id=v.order_id
      where v.property_id=p.id and o.includes_video and v.video_url is not null and public.property_order_fulfilled(o.id))
  ) from public.property_url_slugs u join public.properties p on p.id=u.property_id
    join public.profiles a on a.id=p.owner_id where u.slug=property_slug and p.status='published' limit 1;
$$;
revoke all on function public.get_public_property(text) from public;
grant execute on function public.get_public_property(text) to anon,authenticated;
notify pgrst, 'reload schema';
commit;
select 'MBP_PUBLIC_PROPERTY_PROFILE_ROLE_READY' as status;
