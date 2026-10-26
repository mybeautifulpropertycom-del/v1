-- Existing installations: run this ENTIRE file after MBP_PROPERTY_FILMS_READY.
-- Adds protected admin roles and complimentary publication. Does not grant a role automatically.
begin;
-- Platform roles are never read from editable profile fields or JWT user metadata.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now()
);
create table if not exists public.property_admin_grants (
  order_id uuid primary key references public.property_orders(id) on delete cascade,
  property_id uuid unique not null references public.properties(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid not null,
  reason text not null check(length(reason) between 1 and 500),
  granted_at timestamptz not null default now()
);
create table if not exists public.platform_admin_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  property_id uuid not null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
alter table public.property_admin_grants enable row level security;
alter table public.platform_admin_audit enable row level security;
revoke all on public.platform_admins,public.property_admin_grants,public.platform_admin_audit from public,anon,authenticated,service_role;
grant select on public.platform_admins,public.property_admin_grants,public.platform_admin_audit to service_role;
-- Explicit server read privileges; client RLS and grants remain unchanged.
grant select on public.profiles,public.properties to service_role;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.platform_admins where user_id=auth.uid());
$$;
revoke all on function public.is_platform_admin() from public,anon;
grant execute on function public.is_platform_admin() to authenticated;

-- SQL Editor / database owner only. Neither the app nor an authenticated agent
-- can call this bootstrap function to promote an account.
create or replace function public.grant_platform_admin(account_email text) returns text
language plpgsql security definer set search_path='' as $$
declare target uuid; matches integer;
begin
  select count(*) into matches from auth.users where lower(email)=lower(btrim(account_email));
  if matches<>1 then raise exception 'Choose the exact login email of one existing account'; end if;
  select id into target from auth.users where lower(email)=lower(btrim(account_email));
  insert into public.platform_admins(user_id) values(target) on conflict do nothing;
  return 'MBP_ADMIN_GRANTED';
end;
$$;
revoke all on function public.grant_platform_admin(text) from public,anon,authenticated,service_role;

create or replace view public.platform_account_directory as
select p.id,p.name,p.email as contact_email,p.phone,p.agency,p.avatar_url,
  u.email as login_email,u.created_at,u.last_sign_in_at,
  (select count(*) from public.properties x where x.owner_id=p.id) as property_count
from public.profiles p join auth.users u on u.id=p.id;
revoke all on public.platform_account_directory from public,anon,authenticated;
grant select on public.platform_account_directory to service_role;

-- A complimentary grant is a separate entitlement, never a fake Stripe payment.
create or replace function public.property_order_fulfilled(purchase_id uuid) returns boolean
language sql volatile security definer set search_path='' as $$
  select exists(select 1 from public.property_orders o where o.id=purchase_id and
    (o.status='paid' or exists(select 1 from public.property_admin_grants g
      where g.order_id=o.id and g.property_id=o.property_id and g.owner_id=o.owner_id)));
$$;
revoke all on function public.property_order_fulfilled(uuid) from public,anon,authenticated;
grant execute on function public.property_order_fulfilled(uuid) to service_role;

create or replace function public.property_has_live_access(listing_id uuid,agent_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.property_legacy_access where property_id=listing_id and owner_id=agent_id)
    or exists(select 1 from public.property_orders where property_id=listing_id and owner_id=agent_id and public.property_order_fulfilled(id));
$$;
revoke all on function public.property_has_live_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.property_has_live_access(uuid,uuid) to service_role;

create or replace function public.require_property_payment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and coalesce((select enabled from public.property_billing_settings where singleton),false) then
    if exists(select 1 from public.property_legacy_access where property_id=new.id and owner_id=new.owner_id) then return new; end if;
    perform 1 from public.property_orders where property_id=new.id and owner_id=new.owner_id and public.property_order_fulfilled(id) for share;
    if not found then raise exception 'PAYMENT_REQUIRED: Complete the $97 property purchase before publishing' using errcode='P0402'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.require_property_payment() from public,anon,authenticated;

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
  return jsonb_build_object('published',true,'complimentary',is_free,'paid',purchase.status='paid','publicPath','/p/'||listing.slug);
end;
$$;
revoke all on function public.admin_publish_property(uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.admin_publish_property(uuid,uuid,text,text,integer) to service_role;


create or replace function public.claim_property_video(p_order uuid,p_lease uuid,p_model jsonb default null,p_input jsonb default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return null; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(purchase.id) or job.status not in ('queued','processing') or job.provider_phase='uncertain'
     or job.next_poll_at>now() or job.lease_until>now() then return null; end if;
  if job.status='queued' then
    if job.attempts>=3 or jsonb_typeof(p_model) is distinct from 'object' or jsonb_typeof(p_input) is distinct from 'object'
      or octet_length(p_model::text)>64000 or octet_length(p_input::text)>128000 then return null; end if;
    update public.property_video_jobs set status='processing',provider_phase='submitting',attempts=attempts+1,
      model_config=p_model,model_input=p_input,provider_request_id=null,last_error=null,
      lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  else
    -- A crashed/timed-out submission may already have spent credits. Never resubmit it.
    if job.provider_request_id is null then
      update public.property_video_jobs set provider_phase='uncertain',lease_token=null,lease_until=null,
        last_error='Generation confirmation is delayed. Support must reconcile this request before another submission.',updated_at=now() where order_id=p_order;
      return null;
    end if;
    update public.property_video_jobs set lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  end if;
  return to_jsonb(job);
end;
$$;


create or replace function public.bind_property_video_request(p_order uuid,p_attempt integer,p_request text)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  if p_request !~ '^[a-zA-Z0-9_-]{1,160}$' then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(purchase.id) or job.status<>'processing' or job.attempts<>p_attempt
      or (job.provider_request_id is not null and job.provider_request_id<>p_request) then return false; end if;
  update public.property_video_jobs set provider_request_id=p_request,provider_phase='submitted',last_error=null,next_poll_at=now(),updated_at=now() where order_id=p_order;
  return true;
end;
$$;


create or replace function public.advance_property_video(p_order uuid,p_lease uuid,p_attempt integer,p_phase text,p_url text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  if p_phase not in ('submitted','uncertain','failed','completed') then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(purchase.id) or job.status<>'processing' or job.lease_token is distinct from p_lease or job.attempts<>p_attempt then return false; end if;
  if p_phase='completed' and (job.provider_request_id is null or p_url is null or p_url !~ '^https://') then return false; end if;
  -- A callback may have recovered an ambiguous submission before this lease ends.
  if p_phase='uncertain' and job.provider_request_id is not null then p_phase:='submitted'; end if;
  update public.property_video_jobs set
    status=case when p_phase='completed' then 'completed' when p_phase='failed' then 'failed' else 'processing' end,
    provider_phase=p_phase,video_url=case when p_phase='completed' then p_url else video_url end,
    poster_url=case when p_phase='completed' then source->'images'->>0 else poster_url end,
    lease_token=null,lease_until=null,next_poll_at=now()+interval '30 seconds',last_error=left(p_error,500),updated_at=now()
    where order_id=p_order;
  if p_phase='completed' then update public.property_orders set video_status='delivered' where id=p_order; end if;
  return true;
end;
$$;


create or replace function public.retry_property_video(listing_id uuid,agent_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders;
begin
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then return false; end if;
  select * into purchase from public.property_orders where property_id=listing_id and owner_id=agent_id for update;
  if not found or not public.property_order_fulfilled(purchase.id) then return false; end if;
  update public.property_video_jobs set status='queued',provider_phase='ready',provider_request_id=null,
    model_config=null,model_input=null,lease_token=null,lease_until=null,next_poll_at=now(),last_error=null,updated_at=now()
    where order_id=purchase.id and owner_id=agent_id and status='failed' and attempts<3
    and updated_at<now()-interval '1 minute';
  return found;
end;
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
  insert into public.property_video_jobs(order_id,property_id,owner_id,source)
    values(purchase.id,listing.id,listing.owner_id,to_jsonb(listing)-array['owner_id','created_at','updated_at'])
    on conflict(order_id) do update set
      status=case when public.property_video_jobs.status='cancelled' then
        case when public.property_video_jobs.video_url is not null then 'completed'
          when public.property_video_jobs.provider_phase='failed' then 'failed'
          when public.property_video_jobs.provider_request_id is not null or public.property_video_jobs.provider_phase in ('submitting','submitted','uncertain') or public.property_video_jobs.model_config->>'engine'='photo-montage-v1' then 'processing'
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


create or replace function public.claim_property_montage(p_order uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs;
begin
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return null; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(purchase.id) or job.status not in ('queued','processing')
    or job.next_poll_at>now() or job.lease_until>now() or job.provider_request_id is not null then return null; end if;
  if job.status='queued' then
    if job.attempts>=3 then return null; end if;
    update public.property_video_jobs set status='processing',provider_phase='rendering',attempts=attempts+1,
      model_config='{"engine":"photo-montage-v1"}'::jsonb,model_input=null,montage_plan=null,montage_next_shot=0,montage_failures=0,
      last_error=null,lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  else
    if job.model_config->>'engine' is distinct from 'photo-montage-v1' then return null; end if;
    update public.property_video_jobs set lease_token=p_lease,lease_until=now()+interval '4 minutes',updated_at=now()
      where order_id=p_order returning * into job;
  end if;
  return to_jsonb(job);
end;
$$;


create or replace function public.checkpoint_property_montage(p_order uuid,p_lease uuid,p_attempt integer,
  p_plan jsonb default null,p_next integer default null,p_url text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders; job public.property_video_jobs; shot_count integer;
begin
  if num_nonnulls(p_plan,p_next,p_url,p_error)<>1 then return false; end if;
  select * into purchase from public.property_orders where id=p_order;
  if not found or purchase.property_id is null then return false; end if;
  perform 1 from public.properties where id=purchase.property_id for update;
  select * into purchase from public.property_orders where id=p_order for update;
  select * into job from public.property_video_jobs where order_id=p_order for update;
  if not found or not public.property_order_fulfilled(purchase.id) or job.status<>'processing' or job.lease_token is distinct from p_lease
    or job.attempts<>p_attempt or job.model_config->>'engine' is distinct from 'photo-montage-v1' then return false; end if;
  if p_error is not null then
    update public.property_video_jobs set montage_failures=montage_failures+1,
      status=case when montage_failures>=2 then 'failed' else 'processing' end,
      provider_phase=case when montage_failures>=2 then 'failed' else 'rendering' end,
      last_error=left(p_error,500),next_poll_at=now()+interval '5 minutes',lease_token=null,lease_until=null,updated_at=now()
      where order_id=p_order;
    return true;
  end if;
  if p_plan is not null then
    if job.montage_plan is not null or p_plan->>'engine' is distinct from 'photo-montage-v1'
      or jsonb_typeof(p_plan->'shots') is distinct from 'array' or octet_length(p_plan::text)>128000 then return false; end if;
    shot_count:=jsonb_array_length(p_plan->'shots');
    if shot_count<1 or shot_count>23 then return false; end if;
    update public.property_video_jobs set montage_plan=p_plan where order_id=p_order returning * into job;
  end if;
  shot_count:=jsonb_array_length(job.montage_plan->'shots');
  if p_next is not null then
    if shot_count is null or p_next<>job.montage_next_shot+1 or p_next>shot_count then return false; end if;
    update public.property_video_jobs set montage_next_shot=p_next where order_id=p_order returning * into job;
  end if;
  if p_url is not null then
    if shot_count is null or job.montage_next_shot<>shot_count or p_url !~ '^https://' then return false; end if;
    update public.property_video_jobs set status='completed',provider_phase='completed',video_url=p_url,
      poster_url=montage_plan->'shots'->0->>'image' where order_id=p_order;
    update public.property_orders set video_status='delivered' where id=p_order;
  end if;
  update public.property_video_jobs set montage_failures=0,last_error=null,lease_token=null,lease_until=null,
    next_poll_at=now()+interval '10 seconds',updated_at=now() where order_id=p_order;
  return true;
end;
$$;


create or replace function public.request_property_publication(listing_id uuid,agent_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders;
declare done boolean;
begin
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then raise exception 'Property not available'; end if;
  if exists(select 1 from public.property_legacy_access where property_id=listing_id and owner_id=agent_id) then
    update public.properties set status='published' where id=listing_id;
    return jsonb_build_object('published',true,'legacy',true);
  end if;
  purchase:=public.reserve_property_order(listing_id,agent_id);
  if purchase.status in ('refunded','disputed') and not public.property_order_fulfilled(purchase.id) then raise exception 'Contact support about this payment before publishing'; end if;
  update public.property_orders set publication_requested_at=now(),publication_completed_at=null,publication_error=null where id=purchase.id returning * into purchase;
  if public.property_order_fulfilled(purchase.id) then
    done:=public.finish_property_publication(purchase.id);
    select * into purchase from public.property_orders where id=purchase.id;
    return jsonb_build_object('published',done,'paid',purchase.status='paid','complimentary',purchase.status<>'paid','publicationError',purchase.publication_error);
  end if;
  return jsonb_build_object('published',false,'order',to_jsonb(purchase));
end;
$$;


create or replace function public.get_public_property(property_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'property',to_jsonb(p)-array['owner_id','created_at','updated_at'],
    'profile',jsonb_build_object('name',a.name,'email',a.email,'phone',a.phone,'agency',a.agency,'bio',a.bio,'avatar_url',a.avatar_url),
    'film',(select jsonb_build_object('src',v.video_url,'poster',coalesce(v.poster_url,p.images[1])) from public.property_video_jobs v join public.property_orders o on o.id=v.order_id where v.property_id=p.id and v.status='completed' and v.video_url is not null and public.property_order_fulfilled(o.id))
  ) from public.properties p join public.profiles a on a.id=p.owner_id where p.slug=property_slug and p.status='published' limit 1;
$$;


create or replace function public.on_property_payment_fulfilment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='paid' and old.status='pending' and new.publication_requested_at is not null then
    perform public.finish_property_publication(new.id);
  elsif new.status in ('refunded','disputed') and old.status is distinct from new.status and not public.property_order_fulfilled(new.id) then
    update public.property_video_jobs set status='cancelled',updated_at=now() where order_id=new.id;
  end if;
  return new;
end;
$$;


create or replace function public.apply_property_payment(order_id uuid,intent_id text,new_status text,event_created bigint) returns text
language plpgsql security definer set search_path = '' as $$
declare purchase public.property_orders;
begin
  select * into purchase from public.property_orders where id=order_id;
  if not found then raise exception 'Order not found'; end if;
  -- Use the same property -> order lock order as a publication update.
  if purchase.property_id is not null then perform 1 from public.properties where id=purchase.property_id for update; end if;
  select * into purchase from public.property_orders where id=order_id for update;
  if new_status not in ('paid','refunded','disputed') or intent_id !~ '^pi_' then raise exception 'Invalid payment'; end if;
  if purchase.payment_intent_id is not null and purchase.payment_intent_id<>intent_id then raise exception 'Payment identity mismatch'; end if;
  if (event_created<purchase.last_event_created and new_status<>'refunded') or purchase.status='refunded' then return purchase.status; end if;
  if event_created=purchase.last_event_created and purchase.status='disputed' and new_status='paid' then return purchase.status; end if;
  update public.property_orders set status=new_status,payment_intent_id=intent_id,
    paid_at=case when new_status='paid' then coalesce(paid_at,now()) else paid_at end,
    last_event_created=greatest(event_created,last_event_created),
    video_status=case when new_status<>'paid' and not exists(select 1 from public.property_admin_grants g where g.order_id=purchase.id) then 'cancelled' when video_status='delivered' then 'delivered' else 'pending' end
    where id=order_id;
  if new_status<>'paid' and purchase.property_id is not null and not public.property_order_fulfilled(purchase.id) then
    update public.properties set status='draft' where id=purchase.property_id and owner_id=purchase.owner_id;
  end if;
  return new_status;
end;
$$;

-- Align checkout reservation with publication/refund lock ordering.
create or replace function public.reserve_property_order(listing_id uuid,agent_id uuid) returns public.property_orders
language plpgsql security definer set search_path = '' as $$
declare result public.property_orders;
begin
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then raise exception 'Property not available'; end if;
  perform pg_advisory_xact_lock(hashtextextended('stripe-live:' || listing_id::text,0));
  if not exists(select 1 from public.properties where id=listing_id and owner_id=agent_id) then raise exception 'Property not available'; end if;
  insert into public.property_orders(property_id,owner_id) values(listing_id,agent_id) on conflict(property_id) do nothing;
  select * into result from public.property_orders where property_id=listing_id for update;
  if result.status='pending' and result.expires_at < now() then
    update public.property_orders set attempt=attempt+1,expires_at=now()+interval '1 hour' where id=result.id returning * into result;
  end if;
  return result;
end;
$$;
notify pgrst,'reload schema';
commit;
select 'MBP_ADMIN_READY' as status;
