-- Address-based public URLs. Existing property identifiers and shared URLs remain valid.
alter table public.properties add column if not exists address_slug text
  check (address_slug is null or address_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(address_slug) <= 110);
create unique index if not exists properties_address_slug_unique on public.properties(address_slug);

-- One namespace for current addresses, previous addresses and legacy links.
-- Private: resolving a URL still requires a published property through the RPC below.
create table if not exists public.property_url_slugs (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,110}$'),
  property_id uuid not null references public.properties(id) on delete cascade deferrable initially deferred
);
create index if not exists property_url_slugs_property on public.property_url_slugs(property_id);
alter table public.property_url_slugs enable row level security;
revoke all on public.property_url_slugs from public,anon,authenticated;

-- Remove combining marks before punctuation conversion (portable PostgreSQL Unicode escapes).
create or replace function public.address_slug_base(address text) returns text
language sql immutable set search_path='' as $$
  select coalesce(nullif(trim(both '-' from left(regexp_replace(
    regexp_replace(lower(translate(normalize(coalesce(address,''), NFD), 'ŁłØøĐđÆæŒœß', 'LlOoDdAaOos')),
      U&'[\0300-\036f]', '', 'g'), '[^a-z0-9]+', '-', 'g'),90)),''),'property');
$$;
revoke all on function public.address_slug_base(text) from public,anon,authenticated;

create or replace function public.assign_property_address_url() returns trigger
language plpgsql security definer set search_path='' as $$
declare base text; candidate text; holder uuid; suffix integer:=1;
begin
  -- Serialize namespace allocation, including two agents publishing the same address.
  perform pg_advisory_xact_lock(hashtextextended('property-public-url-namespace',0));
  insert into public.property_url_slugs(slug,property_id) values(new.slug,new.id)
    on conflict(slug) do nothing;
  select property_id into holder from public.property_url_slugs where slug=new.slug;
  if holder is distinct from new.id then raise exception 'Property URL is already in use'; end if;

  -- This is a server-owned field: callers cannot choose or steal another public URL.
  if tg_op='INSERT' then new.address_slug:=null;
  else new.address_slug:=old.address_slug;
  end if;
  if new.status<>'published' then return new; end if;
  -- Ordinary edits do not change a published URL even if a shorter alias becomes free.
  if tg_op='UPDATE' and old.status='published' and old.address_slug is not null
    and new.location is not distinct from old.location then return new; end if;
  base:=public.address_slug_base(new.location);
  if base=any(array['admin','api','dashboard','login','reset-password','templates','preview','p','_next','favicon','robots','sitemap','icon','signup','register','auth','account','settings','pricing','contact','about','terms','privacy','support']) then
    base:=base||'-property';
  end if;
  candidate:=base;
  loop
    insert into public.property_url_slugs(slug,property_id) values(candidate,new.id)
      on conflict(slug) do nothing;
    select property_id into holder from public.property_url_slugs where slug=candidate;
    exit when holder=new.id;
    suffix:=suffix+1;
    candidate:=base||'-'||suffix::text;
  end loop;
  new.address_slug:=candidate;
  return new;
end;
$$;
revoke all on function public.assign_property_address_url() from public,anon,authenticated;

-- Reserve existing links first, then generate addresses for already-published websites.
insert into public.property_url_slugs(slug,property_id)
  select slug,id from public.properties on conflict(slug) do nothing;
drop trigger if exists zz_property_address_url on public.properties;
create trigger zz_property_address_url before insert or update on public.properties
  for each row execute function public.assign_property_address_url();
update public.properties set location=location where status='published' and address_slug is null;

create or replace function public.get_public_property(property_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'property',to_jsonb(p)-array['owner_id','created_at','updated_at'],
    'profile',jsonb_build_object('name',a.name,'email',a.email,'phone',a.phone,'agency',a.agency,'bio',a.bio,'avatar_url',a.avatar_url),
    'film',(select jsonb_build_object('src',v.video_url,'poster',coalesce(v.poster_url,p.images[1])) from public.property_video_jobs v join public.property_orders o on o.id=v.order_id where v.property_id=p.id and v.video_url is not null and public.property_order_fulfilled(o.id))
  ) from public.property_url_slugs u join public.properties p on p.id=u.property_id
    join public.profiles a on a.id=p.owner_id
    where u.slug=property_slug and p.status='published' limit 1;
$$;
revoke all on function public.get_public_property(text) from public;
grant execute on function public.get_public_property(text) to anon,authenticated;
create or replace function public.admin_publish_property(listing_id uuid,actor_id uuid,grant_reason text,
  expected_session text default null,expected_attempt integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing public.properties; purchase public.property_orders; done boolean; is_free boolean;
begin
  perform 1 from public.platform_admins where user_id=actor_id for share;
  if not found then raise exception 'Administrator access required' using errcode='42501'; end if;
  if grant_reason is null or length(btrim(grant_reason))<1 or length(grant_reason)>500 then raise exception 'Add a reason for this publication'; end if;
  select * into listing from public.properties where id=listing_id for update;
  if not found then raise exception 'Property not available'; end if;
  insert into public.property_orders(property_id,owner_id) values(listing.id,listing.owner_id) on conflict(property_id) do nothing;
  select * into purchase from public.property_orders where property_id=listing.id for update;
  -- The server expires an existing open Stripe session before this transaction.
  -- Fence in-flight session creation by rotating the attempt under the same lock.
  if purchase.checkout_session_id is distinct from expected_session or
    (expected_attempt is not null and purchase.attempt<>expected_attempt) then
    raise exception 'Checkout changed. Refresh this property and try again' using errcode='P0409';
  end if;
  is_free:=purchase.status<>'paid';
  if is_free then
    insert into public.property_admin_grants(order_id,property_id,owner_id,granted_by,reason)
      values(purchase.id,listing.id,listing.owner_id,actor_id,btrim(grant_reason)) on conflict(order_id) do nothing;
  end if;
  update public.property_orders set attempt=attempt+1,publication_requested_at=now(),publication_completed_at=null,
    publication_error=null,video_status=case when video_status='delivered' then 'delivered' else 'pending' end
    where id=purchase.id;
  done:=public.finish_property_publication(purchase.id);
  if not done then raise exception 'Complete the property and agent contact details before publishing'; end if;
  insert into public.platform_admin_audit(actor_id,property_id,action,details)
    values(actor_id,listing.id,'publish',jsonb_build_object('complimentary',is_free,'reason',btrim(grant_reason),'title',listing.title));
  select * into listing from public.properties where id=listing_id;
  return jsonb_build_object('published',true,'complimentary',is_free,'paid',purchase.status='paid','publicPath',coalesce('/'||listing.address_slug,'/p/'||listing.slug));
end;
$$;
revoke all on function public.admin_publish_property(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.admin_publish_property(uuid,uuid,text,text,integer) to service_role;
notify pgrst,'reload schema';
