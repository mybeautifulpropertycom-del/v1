-- Existing installations only: inspect the current schema first. Safe to rerun.
-- Does not charge payments or modify paid receipts or active checkout sessions.
begin;
-- Romania package: new orders use 249 RON; historical USD receipts remain valid.
-- Never rewrite a paid order or an active Stripe session.
alter table public.property_orders drop constraint if exists property_orders_amount_check;
alter table public.property_orders drop constraint if exists property_orders_currency_check;
alter table public.property_orders drop constraint if exists property_orders_package_check;
alter table public.property_orders add constraint property_orders_package_check
  check ((amount = 24900 and currency = 'ron') or (amount = 9700 and currency = 'usd'));
alter table public.property_orders alter column amount set default 24900;
alter table public.property_orders alter column currency set default 'ron';
alter table public.stripe_test_orders drop constraint if exists stripe_test_orders_amount_check;
alter table public.stripe_test_orders drop constraint if exists stripe_test_orders_currency_check;
alter table public.stripe_test_orders drop constraint if exists stripe_test_orders_package_check;
alter table public.stripe_test_orders add constraint stripe_test_orders_package_check
  check ((amount = 24900 and currency = 'ron') or (amount = 9700 and currency = 'usd'));
alter table public.stripe_test_orders alter column amount set default 24900;
alter table public.stripe_test_orders alter column currency set default 'ron';
update public.property_orders set amount = 24900, currency = 'ron'
  where status = 'pending' and checkout_session_id is null and payment_intent_id is null and amount = 9700 and currency = 'usd';
update public.stripe_test_orders set amount = 24900, currency = 'ron'
  where status = 'pending' and checkout_session_id is null and stripe_session_id is null and amount = 9700 and currency = 'usd';
notify pgrst, 'reload schema';
-- Defaults affect only new rows; existing listing values remain unchanged.
alter table public.properties alter column currency set default 'EUR';
alter table public.properties alter column area_unit set default 'sqm';
commit;
select 'MBP_ROMANIA_READY' as status;
