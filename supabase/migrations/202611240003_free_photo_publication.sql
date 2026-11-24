-- Free photo publication is an entitlement, without a Stripe payment.
alter table public.property_orders add column if not exists free_photos_granted_at timestamptz;
alter table public.property_orders drop constraint if exists property_orders_package_check;
alter table public.property_orders add constraint property_orders_package_check check (
  (free_photos_granted_at is null and (
    (includes_video and ((amount=24900 and currency='ron') or (amount=9700 and currency='usd')))
    or (not includes_video and amount=14900 and currency='ron')
  ))
  or (free_photos_granted_at is not null and not includes_video and amount=0 and currency='ron'
    and status='pending' and checkout_session_id is null and payment_intent_id is null and paid_at is null)
);

create or replace function public.property_order_fulfilled(purchase_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select exists(select 1 from public.property_orders o where o.id=purchase_id and
    (o.status='paid' or o.free_photos_granted_at is not null or exists(
      select 1 from public.property_admin_grants g
      where g.order_id=o.id and g.property_id=o.property_id and g.owner_id=o.owner_id)));
$$;

create or replace function public.publish_property_photos(
  listing_id uuid, agent_id uuid, expected_attempt integer, expected_session text
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing public.properties; purchase public.property_orders;
begin
  select * into listing from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then raise exception 'Property not available' using errcode='P0404'; end if;

  insert into public.property_orders(property_id,owner_id,includes_video,amount,currency,free_photos_granted_at)
    values(listing.id,listing.owner_id,false,0,'ron',now()) on conflict(property_id) do nothing;
  select * into purchase from public.property_orders where property_id=listing.id and owner_id=agent_id for update;
  if not found then raise exception 'Property order not available' using errcode='P0409'; end if;

  if not public.property_order_fulfilled(purchase.id) then
    -- The server expires an open Stripe session before making this request.
    -- Rotating the attempt also fences a checkout being created concurrently.
    if purchase.status<>'pending' or purchase.payment_intent_id is not null or
      purchase.checkout_session_id is distinct from expected_session or
      (expected_attempt is not null and purchase.attempt<>expected_attempt) then
      raise exception 'Review the existing payment' using errcode='P0409';
    end if;
    update public.property_orders set includes_video=false,amount=0,currency='ron',
      free_photos_granted_at=now(),checkout_session_id=null,attempt=attempt+1
      where id=purchase.id returning * into purchase;
  end if;

  if listing.status<>'published' or purchase.publication_completed_at is null then
    update public.property_orders set publication_requested_at=now(),publication_completed_at=null,publication_error=null
      where id=purchase.id;
    if not public.finish_property_publication(purchase.id) then
      raise exception 'Complete the property and contact details before publishing' using errcode='P0422';
    end if;
    select * into listing from public.properties where id=listing_id;
  end if;

  return jsonb_build_object('published',true,'allowed',true,'videoIncluded',purchase.includes_video,
    'package',case when purchase.includes_video then 'video' else 'photos' end,'paid',purchase.status='paid',
    'publicPath',coalesce('/'||listing.address_slug,'/p/'||listing.slug));
end;
$$;
revoke all on function public.publish_property_photos(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.publish_property_photos(uuid,uuid,integer,text) to service_role;
