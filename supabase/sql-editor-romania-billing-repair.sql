-- Existing installations only: repair partial Romania billing configuration.
-- Changes validation/defaults only. No order, receipt, session or payment is changed.
-- Historical 97 USD receipts and pending sessions remain valid and untouched.
-- Run the ENTIRE file as the database administrator. Safe to run again.
begin;

alter table public.property_orders
  drop constraint if exists property_orders_amount_check,
  drop constraint if exists property_orders_currency_check,
  drop constraint if exists property_orders_package_check;
alter table public.property_orders
  add constraint property_orders_package_check
    check ((amount = 24900 and currency = 'ron')
        or (amount = 9700 and currency = 'usd')),
  alter column amount set default 24900,
  alter column currency set default 'ron';

alter table public.stripe_test_orders
  drop constraint if exists stripe_test_orders_amount_check,
  drop constraint if exists stripe_test_orders_currency_check,
  drop constraint if exists stripe_test_orders_package_check;
alter table public.stripe_test_orders
  add constraint stripe_test_orders_package_check
    check ((amount = 24900 and currency = 'ron')
        or (amount = 9700 and currency = 'usd')),
  alter column amount set default 24900,
  alter column currency set default 'ron';

notify pgrst, 'reload schema';
commit;

-- Report a possible older custom reservation/publication function without
-- replacing its body or exposing its source. Review it if this flag is true.
select
  'MBP_ROMANIA_BILLING_RULES_READY' as status,
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in ('reserve_property_order', 'request_property_publication')
      and pg_get_functiondef(p.oid) ~ '\m9700\M'
  ) as functie_mentionand_tariful_vechi;
