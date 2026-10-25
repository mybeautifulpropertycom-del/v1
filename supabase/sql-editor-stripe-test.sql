-- Existing installations: run this ENTIRE file in Supabase SQL Editor.
-- Adds isolated Stripe test orders only. No live payments or publication changes.
begin;
-- Stripe sandbox only. These orders NEVER grant publication or video access.
create table if not exists public.stripe_test_orders (
  id uuid primary key default gen_random_uuid(),
  property_id uuid unique references public.properties(id) on delete set null,
  owner_id uuid references public.profiles(id) on delete set null,
  amount integer not null default 9700 check (amount = 9700),
  currency text not null default 'usd' check (currency = 'usd'),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  attempt integer not null default 1,
  expires_at timestamptz not null default now() + interval '1 hour',
  stripe_session_id text unique,
  checkout_session_id text unique,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.stripe_test_orders enable row level security;
revoke all on public.stripe_test_orders from public, anon, authenticated;
grant select, insert, update on public.stripe_test_orders to service_role;

-- A stable order/attempt gives Stripe the same idempotency key across tabs,
-- network retries and server restarts. An unpaid expired attempt can be retried.
create or replace function public.reserve_stripe_test_order(listing_id uuid, agent_id uuid)
returns public.stripe_test_orders
language plpgsql security definer set search_path = '' as $$
declare result public.stripe_test_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended('stripe-test:' || listing_id::text, 0));
  if not exists (select 1 from public.properties where id = listing_id and owner_id = agent_id) then
    raise exception 'Property not available';
  end if;
  insert into public.stripe_test_orders(property_id, owner_id) values (listing_id, agent_id)
  on conflict (property_id) do nothing;
  select * into result from public.stripe_test_orders where property_id = listing_id for update;
  if result.status = 'pending' and result.expires_at < now() then
    update public.stripe_test_orders set attempt = attempt + 1, expires_at = now() + interval '1 hour'
    where id = result.id returning * into result;
  end if;
  return result;
end;
$$;
revoke all on function public.reserve_stripe_test_order(uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_stripe_test_order(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
select 'MBP_STRIPE_TEST_OK' as status;
