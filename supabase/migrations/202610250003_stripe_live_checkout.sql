-- Add live billing alongside the separate sandbox ledger. No charges are made.
create table if not exists public.property_billing_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  activated_at timestamptz
);
insert into public.property_billing_settings(singleton) values (true) on conflict do nothing;
create table if not exists public.property_orders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid unique references public.properties(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  amount integer not null default 9700 check (amount = 9700),
  currency text not null default 'usd' check (currency = 'usd'),
  status text not null default 'pending' check (status in ('pending','paid','refunded','disputed')),
  attempt integer not null default 1,
  expires_at timestamptz not null default now() + interval '1 hour',
  checkout_session_id text unique,
  payment_intent_id text unique,
  paid_at timestamptz,
  last_event_created bigint not null default 0,
  video_status text not null default 'not_ordered' check (video_status in ('not_ordered','pending','delivered','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists public.property_legacy_access (
  property_id uuid primary key references public.properties(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.property_billing_settings enable row level security;
alter table public.property_orders enable row level security;
alter table public.property_legacy_access enable row level security;
revoke all on public.property_billing_settings, public.property_orders, public.property_legacy_access from public, anon, authenticated;
grant select on public.property_billing_settings, public.property_legacy_access to service_role;
grant select, insert, update on public.property_orders to service_role;

-- Called only by the live server configuration. The switch persists in the DB:
-- switching Vercel back to test/off cannot silently remove the publication gate.
create or replace function public.activate_property_billing() returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.property_billing_settings where singleton for update;
  if (select enabled from public.property_billing_settings where singleton) then return true; end if;
  lock table public.properties in share row exclusive mode;
  insert into public.property_legacy_access(property_id,owner_id)
    select id,owner_id from public.properties where status='published' on conflict do nothing;
  update public.property_billing_settings set enabled=true,activated_at=now() where singleton;
  return true;
end;
$$;
revoke all on function public.activate_property_billing() from public, anon, authenticated;
grant execute on function public.activate_property_billing() to service_role;

create or replace function public.property_has_live_access(listing_id uuid,agent_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.property_legacy_access where property_id=listing_id and owner_id=agent_id)
    or exists(select 1 from public.property_orders where property_id=listing_id and owner_id=agent_id and status='paid');
$$;
revoke all on function public.property_has_live_access(uuid,uuid) from public, anon, authenticated;
grant execute on function public.property_has_live_access(uuid,uuid) to service_role;

create or replace function public.require_property_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='published' and coalesce((select enabled from public.property_billing_settings where singleton),false) then
    if exists(select 1 from public.property_legacy_access where property_id=new.id and owner_id=new.owner_id) then return new; end if;
    -- Serialize publication against concurrent refunds. A plain MVCC read can
    -- observe the old paid state while another transaction revokes the order.
    perform 1 from public.property_orders where property_id=new.id and owner_id=new.owner_id and status='paid' for share;
    if not found then
      raise exception 'PAYMENT_REQUIRED: Complete the $97 property purchase before publishing' using errcode='P0402';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.require_property_payment() from public, anon, authenticated;
drop trigger if exists before_property_payment on public.properties;
create trigger before_property_payment before insert or update on public.properties for each row execute function public.require_property_payment();

create or replace function public.reserve_property_order(listing_id uuid,agent_id uuid) returns public.property_orders
language plpgsql security definer set search_path = '' as $$
declare result public.property_orders;
begin
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
revoke all on function public.reserve_property_order(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_property_order(uuid,uuid) to service_role;

-- Atomic, idempotent fulfilment/revocation. Event order prevents an old paid
-- notification from restoring access after a refund/dispute. Full refunds are
-- terminal. A won dispute restores purchase access, but never republishes a page.
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
    video_status=case when new_status<>'paid' then 'cancelled' when video_status='delivered' then 'delivered' else 'pending' end
    where id=order_id;
  if new_status<>'paid' and purchase.property_id is not null then
    update public.properties set status='draft' where id=purchase.property_id and owner_id=purchase.owner_id;
  end if;
  return new_status;
end;
$$;
revoke all on function public.apply_property_payment(uuid,text,text,bigint) from public, anon, authenticated;
grant execute on function public.apply_property_payment(uuid,text,text,bigint) to service_role;
notify pgrst, 'reload schema';
