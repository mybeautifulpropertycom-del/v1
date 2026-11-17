-- Existing installations: run the ENTIRE file after the Romania and address URL upgrades.
-- Adds 149 RON without film and 249 RON with film. Preserves receipts, active checkouts and existing films.
-- Does not charge, publish drafts, submit provider requests or grant administrator roles.
begin;
-- Two publication packages. Existing receipts and active checkouts are preserved.
alter table public.property_orders add column if not exists includes_video boolean not null default true;
alter table public.stripe_test_orders add column if not exists includes_video boolean not null default true;
-- Earlier SQL Editor upgrades may have retained the original separate checks.
alter table public.property_orders drop constraint if exists property_orders_amount_check;
alter table public.property_orders drop constraint if exists property_orders_currency_check;
alter table public.stripe_test_orders drop constraint if exists stripe_test_orders_amount_check;
alter table public.stripe_test_orders drop constraint if exists stripe_test_orders_currency_check;
alter table public.property_orders drop constraint if exists property_orders_package_check;
alter table public.property_orders add constraint property_orders_package_check check (
  (includes_video and ((amount=24900 and currency='ron') or (amount=9700 and currency='usd')))
  or (not includes_video and amount=14900 and currency='ron'));
alter table public.stripe_test_orders drop constraint if exists stripe_test_orders_package_check;
alter table public.stripe_test_orders add constraint stripe_test_orders_package_check check (
  (includes_video and ((amount=24900 and currency='ron') or (amount=9700 and currency='usd')))
  or (not includes_video and amount=14900 and currency='ron'));

-- A paid/granted package or a reserved film cannot be silently downgraded/upgraded.
create or replace function public.guard_publication_package() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.includes_video is distinct from old.includes_video
    or new.amount is distinct from old.amount or new.currency is distinct from old.currency) then
    if old.status<>'pending' or old.payment_intent_id is not null
      or exists(select 1 from public.property_admin_grants where order_id=old.id)
      or exists(select 1 from public.property_video_jobs where order_id=old.id) then
      raise exception 'Pachetul unei comenzi confirmate nu poate fi schimbat.' using errcode='P0409';
    end if;
  end if;
  if not new.includes_video then new.video_status:='not_ordered'; end if;
  return new;
end;
$$;
revoke all on function public.guard_publication_package() from public,anon,authenticated;
drop trigger if exists property_order_package_guard on public.property_orders;
create trigger property_order_package_guard before insert or update on public.property_orders
  for each row execute function public.guard_publication_package();

-- Defence at the durable queue boundary: no engine can claim an image-only job.
create or replace function public.require_video_package() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'cancelled' then
    perform 1 from public.property_orders where id=new.order_id and includes_video for share;
    if not found then raise exception 'Această prezentare nu include videoclip.' using errcode='P0409'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.require_video_package() from public,anon,authenticated;
drop trigger if exists property_video_package_guard on public.property_video_jobs;
create trigger property_video_package_guard before insert or update on public.property_video_jobs
  for each row execute function public.require_video_package();

create or replace function public.reserve_property_order(listing_id uuid,agent_id uuid,include_video boolean)
returns public.property_orders language plpgsql security definer set search_path='' as $$
declare result public.property_orders;
begin
  if include_video is null then raise exception 'Alege o variantă de publicare'; end if;
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then raise exception 'Property not available'; end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-live:'||listing_id::text,0));
  insert into public.property_orders(property_id,owner_id,includes_video,amount,currency)
    values(listing_id,agent_id,include_video,case when include_video then 24900 else 14900 end,'ron')
    on conflict(property_id) do nothing;
  select * into result from public.property_orders where property_id=listing_id for update;
  if result.status='pending' and result.checkout_session_id is null and result.payment_intent_id is null
    and not public.property_order_fulfilled(result.id) and not exists(select 1 from public.property_video_jobs where order_id=result.id)
    and result.includes_video is distinct from include_video then
    update public.property_orders set includes_video=include_video,amount=case when include_video then 24900 else 14900 end,
      currency='ron',attempt=attempt+1,expires_at=now()+interval '1 hour' where id=result.id returning * into result;
  elsif result.status='pending' and result.expires_at<now() then
    update public.property_orders set attempt=attempt+1,expires_at=now()+interval '1 hour'
      where id=result.id returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.reserve_property_order(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_property_order(uuid,uuid,boolean) to service_role;
create or replace function public.reserve_property_order(listing_id uuid,agent_id uuid)
returns public.property_orders language sql security definer set search_path='' as $$
  select public.reserve_property_order(listing_id,agent_id,true);
$$;

create or replace function public.reserve_stripe_test_order(listing_id uuid,agent_id uuid,include_video boolean)
returns public.stripe_test_orders language plpgsql security definer set search_path='' as $$
declare result public.stripe_test_orders;
begin
  if include_video is null then raise exception 'Alege o variantă de publicare'; end if;
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then raise exception 'Property not available'; end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-test:'||listing_id::text,0));
  insert into public.stripe_test_orders(property_id,owner_id,includes_video,amount,currency)
    values(listing_id,agent_id,include_video,case when include_video then 24900 else 14900 end,'ron')
    on conflict(property_id) do nothing;
  select * into result from public.stripe_test_orders where property_id=listing_id for update;
  if result.status='pending' and result.checkout_session_id is null and result.stripe_session_id is null
    and result.includes_video is distinct from include_video then
    update public.stripe_test_orders set includes_video=include_video,amount=case when include_video then 24900 else 14900 end,
      currency='ron',attempt=attempt+1,expires_at=now()+interval '1 hour' where id=result.id returning * into result;
  elsif result.status='pending' and result.expires_at<now() then
    update public.stripe_test_orders set attempt=attempt+1,expires_at=now()+interval '1 hour'
      where id=result.id returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.reserve_stripe_test_order(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_stripe_test_order(uuid,uuid,boolean) to service_role;
create or replace function public.reserve_stripe_test_order(listing_id uuid,agent_id uuid)
returns public.stripe_test_orders language sql security definer set search_path='' as $$
  select public.reserve_stripe_test_order(listing_id,agent_id,true);
$$;

-- Called only AFTER Stripe confirms that the previous session is expired.
-- The attempt/session fence also rejects concurrent plan changes and admin grants.
create or replace function public.change_publication_package(listing_id uuid,agent_id uuid,include_video boolean,
  expected_attempt integer,expected_session text,test_mode boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; sandbox public.stripe_test_orders;
begin
  if include_video is null or test_mode is null or expected_attempt is null then raise exception 'Invalid package'; end if;
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then raise exception 'Property not available'; end if;
  if test_mode then
    select * into sandbox from public.stripe_test_orders where property_id=listing_id and owner_id=agent_id for update;
    if not found or sandbox.status<>'pending' or sandbox.stripe_session_id is not null
      or sandbox.attempt<>expected_attempt or sandbox.checkout_session_id is distinct from expected_session then
      raise exception 'Sesiunea de plată s-a schimbat.' using errcode='P0409';
    end if;
    update public.stripe_test_orders set includes_video=include_video,amount=case when include_video then 24900 else 14900 end,
      currency='ron',attempt=attempt+1,checkout_session_id=null,expires_at=now()+interval '1 hour'
      where id=sandbox.id returning * into sandbox;
    return to_jsonb(sandbox);
  end if;
  select * into purchase from public.property_orders where property_id=listing_id and owner_id=agent_id for update;
  if not found or purchase.status<>'pending' or purchase.payment_intent_id is not null
    or public.property_order_fulfilled(purchase.id) or purchase.attempt<>expected_attempt
    or purchase.checkout_session_id is distinct from expected_session then
    raise exception 'Sesiunea de plată s-a schimbat.' using errcode='P0409';
  end if;
  update public.property_orders set includes_video=include_video,amount=case when include_video then 24900 else 14900 end,
    currency='ron',attempt=attempt+1,checkout_session_id=null,expires_at=now()+interval '1 hour'
    where id=purchase.id returning * into purchase;
  return to_jsonb(purchase);
end;
$$;
revoke all on function public.change_publication_package(uuid,uuid,boolean,integer,text,boolean) from public,anon,authenticated;
grant execute on function public.change_publication_package(uuid,uuid,boolean,integer,text,boolean) to service_role;

create or replace function public.request_property_publication(listing_id uuid,agent_id uuid,include_video boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; done boolean;
begin
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then raise exception 'Property not available'; end if;
  if exists(select 1 from public.property_legacy_access where property_id=listing_id and owner_id=agent_id) then
    update public.properties set status='published' where id=listing_id;
    return jsonb_build_object('published',true,'legacy',true,'videoIncluded',include_video);
  end if;
  purchase:=public.reserve_property_order(listing_id,agent_id,include_video);
  if purchase.status in ('refunded','disputed') and not public.property_order_fulfilled(purchase.id) then
    raise exception 'Contact support about this payment before publishing';
  end if;
  update public.property_orders set publication_requested_at=now(),publication_completed_at=null,publication_error=null
    where id=purchase.id returning * into purchase;
  if public.property_order_fulfilled(purchase.id) then
    done:=public.finish_property_publication(purchase.id);
    select * into purchase from public.property_orders where id=purchase.id;
    return jsonb_build_object('published',done,'videoIncluded',purchase.includes_video,'paid',purchase.status='paid',
      'complimentary',purchase.status<>'paid','publicationError',purchase.publication_error);
  end if;
  return jsonb_build_object('published',false,'order',to_jsonb(purchase));
end;
$$;
revoke all on function public.request_property_publication(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.request_property_publication(uuid,uuid,boolean) to service_role;
create or replace function public.request_property_publication(listing_id uuid,agent_id uuid) returns jsonb
language sql security definer set search_path='' as $$
  select public.request_property_publication(listing_id,agent_id,true);
$$;


create or replace function public.finish_property_publication(purchase_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders;
declare listing public.properties;
begin
  select * into purchase from public.property_orders where id=purchase_id;
  if not found or purchase.property_id is null then return false; end if;
  select * into listing from public.properties where id=purchase.property_id and owner_id=purchase.owner_id for update;
  if not found then return false; end if;
  select * into purchase from public.property_orders where id=purchase_id for update;
  if not public.property_order_fulfilled(purchase.id) or purchase.publication_requested_at is null then return false; end if;
  if purchase.publication_completed_at is not null then return listing.status='published'; end if;
  begin
    update public.properties set status='published' where id=listing.id;
  exception when check_violation or raise_exception then
    update public.property_orders set publication_error='Your payment is confirmed. Review your property and contact details, then publish again at no extra charge.' where id=purchase_id;
    return false;
  end;
  if not purchase.includes_video then
    update public.property_orders set publication_completed_at=now(),publication_error=null,video_status='not_ordered' where id=purchase_id;
    return true;
  end if;
  insert into public.property_video_jobs(order_id,property_id,owner_id,source)
    values(purchase.id,listing.id,listing.owner_id,to_jsonb(listing)-array['owner_id','created_at','updated_at'])
    on conflict(order_id) do update set
      status=case when public.property_video_jobs.status='cancelled' then
        case when public.property_video_jobs.replacement_pending then
          case when public.property_video_jobs.provider_phase in ('failed','provider_failed') then 'failed'
            when (public.property_video_jobs.model_config->>'engine'='higgsfield-montage-v1' and public.property_video_jobs.model_config ? 'profile')
              or (public.property_video_jobs.model_config->>'engine'='photo-montage-v1' and public.property_video_jobs.attempts>0) then 'processing'
            else 'queued' end
          when public.property_video_jobs.video_url is not null then 'completed'
          when public.property_video_jobs.provider_phase in ('failed','provider_failed') then 'failed'
          when public.property_video_jobs.provider_request_id is not null or public.property_video_jobs.provider_phase in ('submitting','submitted','uncertain') or public.property_video_jobs.model_config->>'engine'='photo-montage-v1' or (public.property_video_jobs.model_config->>'engine'='higgsfield-montage-v1' and public.property_video_jobs.model_config ? 'profile') then 'processing'
          else 'queued' end
        else public.property_video_jobs.status end,
      next_poll_at=now(),
      lease_token=case when public.property_video_jobs.status='cancelled' then null else public.property_video_jobs.lease_token end,
      lease_until=case when public.property_video_jobs.status='cancelled' then null else public.property_video_jobs.lease_until end,
      updated_at=now();
  update public.property_orders set publication_completed_at=now(),publication_error=null where id=purchase_id;
  return true;
end;
$$;

create or replace function public.admin_publish_property(listing_id uuid,actor_id uuid,grant_reason text,
  expected_session text,expected_attempt integer,include_video boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare listing public.properties; purchase public.property_orders; done boolean; is_free boolean;
begin
  perform 1 from public.platform_admins where user_id=actor_id for share;
  if not found then raise exception 'Administrator access required' using errcode='42501'; end if;
  if grant_reason is null or length(btrim(grant_reason))<1 or length(grant_reason)>500 then raise exception 'Add a reason for this publication'; end if;
  select * into listing from public.properties where id=listing_id for update;
  if not found then raise exception 'Property not available'; end if;
  if include_video is null then raise exception 'Alege o variantă de publicare'; end if;
  insert into public.property_orders(property_id,owner_id,includes_video,amount,currency)
    values(listing.id,listing.owner_id,include_video,case when include_video then 24900 else 14900 end,'ron') on conflict(property_id) do nothing;
  select * into purchase from public.property_orders where property_id=listing.id for update;
  -- The server expires an existing open Stripe session before this transaction.
  -- Fence in-flight session creation by rotating the attempt under the same lock.
  if purchase.checkout_session_id is distinct from expected_session or
    (expected_attempt is not null and purchase.attempt<>expected_attempt) then
    raise exception 'Checkout changed. Refresh this property and try again' using errcode='P0409';
  end if;
  if purchase.includes_video is distinct from include_video then
    if public.property_order_fulfilled(purchase.id) then
      raise exception 'Pachetul confirmat nu poate fi schimbat din publicare.' using errcode='P0409';
    end if;
    update public.property_orders set includes_video=include_video,amount=case when include_video then 24900 else 14900 end,currency='ron'
      where id=purchase.id returning * into purchase;
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
    values(actor_id,listing.id,'publish',jsonb_build_object('complimentary',is_free,'reason',btrim(grant_reason),'title',listing.title,'includes_video',purchase.includes_video));
  select * into listing from public.properties where id=listing_id;
  return jsonb_build_object('published',true,'videoIncluded',purchase.includes_video,'complimentary',is_free,'paid',purchase.status='paid','publicPath',coalesce('/'||listing.address_slug,'/p/'||listing.slug));
end;
$$;
revoke all on function public.admin_publish_property(uuid,uuid,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.admin_publish_property(uuid,uuid,text,text,integer,boolean) to service_role;
create or replace function public.admin_publish_property(listing_id uuid,actor_id uuid,grant_reason text,
  expected_session text default null,expected_attempt integer default null) returns jsonb
language sql security definer set search_path='' as $$
  select public.admin_publish_property(listing_id,actor_id,grant_reason,expected_session,expected_attempt,true);
$$;

create or replace function public.get_public_property(property_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'property',to_jsonb(p)-array['owner_id','created_at','updated_at'],
    'profile',jsonb_build_object('name',a.name,'email',a.email,'phone',a.phone,'agency',a.agency,'bio',a.bio,'avatar_url',a.avatar_url),
    'videoIncluded',coalesce((select o.includes_video from public.property_orders o where o.property_id=p.id),true),
    'film',(select jsonb_build_object('src',v.video_url,'poster',coalesce(v.poster_url,p.images[1]))
      from public.property_video_jobs v join public.property_orders o on o.id=v.order_id
      where v.property_id=p.id and o.includes_video and v.video_url is not null and public.property_order_fulfilled(o.id))
  ) from public.property_url_slugs u join public.properties p on p.id=u.property_id
    join public.profiles a on a.id=p.owner_id where u.slug=property_slug and p.status='published' limit 1;
$$;
revoke all on function public.get_public_property(text) from public;
grant execute on function public.get_public_property(text) to anon,authenticated;
notify pgrst,'reload schema';
notify pgrst, 'reload schema';
commit;
select 'MBP_PUBLICATION_PACKAGES_READY' as status;
