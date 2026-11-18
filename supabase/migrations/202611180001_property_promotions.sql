-- Separate promotion ledger: never grants publication or starts a video/Google job.
create table if not exists public.promotion_orders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  package text not null check(package in ('start','plus','extended')),
  amount integer not null,
  currency text not null default 'ron' check(currency='ron'),
  livemode boolean not null,
  payment_status text not null default 'pending' check(payment_status in ('pending','paid','refunded','disputed','cancelled')),
  campaign_status text not null default 'queued' check(campaign_status in ('queued','preparing','active','completed','stopped')),
  target_area text not null check(length(target_area) between 2 and 160),
  notes text not null default '' check(length(notes)<=1000),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=16000),
  checkout_session_id text unique,
  payment_intent_id text unique,
  expires_at timestamptz not null default now()+interval '1 hour',
  paid_at timestamptz,
  refunded_amount integer not null default 0 check(refunded_amount between 0 and amount),
  last_event_created bigint not null default 0,
  stop_required boolean not null default false,
  stop_reason text not null default '' check(stop_reason in ('','payment','withdrawn','deleted','sold','rented','requested')),
  spent_amount integer not null default 0 check(spent_amount between 0 and amount),
  impressions integer not null default 0 check(impressions>=0),
  clicks integer not null default 0 check(clicks>=0),
  report text not null default '' check(length(report)<=2000),
  campaign_id text not null default '' check(length(campaign_id)<=128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotion_package_amount check((package='start' and amount=30000) or (package='plus' and amount=50000) or (package='extended' and amount=100000))
);
alter table public.promotion_orders add column if not exists stop_reason text not null default '' check(stop_reason in ('','payment','withdrawn','deleted','sold','rented','requested'));
create unique index if not exists promotion_one_pending on public.promotion_orders(property_id,livemode) where payment_status='pending';
create index if not exists promotion_owner_created on public.promotion_orders(owner_id,created_at desc);
create index if not exists promotion_property on public.promotion_orders(property_id);
alter table public.promotion_orders enable row level security;
revoke all on public.promotion_orders from public,anon,authenticated;
grant select on public.promotion_orders to authenticated;
grant select,insert,update on public.promotion_orders to service_role;
drop policy if exists "Agents read own promotions" on public.promotion_orders;
create policy "Agents read own promotions" on public.promotion_orders for select to authenticated using(owner_id=(select auth.uid()));

create or replace function public.reserve_promotion_order(listing_id uuid,agent_id uuid,offer text,is_live boolean,area text,brief text,listing_snapshot jsonb)
returns public.promotion_orders language plpgsql security definer set search_path='' as $$
declare result public.promotion_orders; price integer;
begin
  price:=case offer when 'start' then 30000 when 'plus' then 50000 when 'extended' then 100000 else null end;
  if price is null then raise exception 'Invalid promotion package'; end if;
  perform pg_advisory_xact_lock(hashtextextended('promotion:'||listing_id::text||':'||is_live::text,0));
  perform 1 from public.properties where id=listing_id and owner_id=agent_id and status='published' for share;
  if not found then raise exception 'Published property not available'; end if;
  select * into result from public.promotion_orders where property_id=listing_id and livemode=is_live and payment_status='pending' for update;
  if found then return result; end if;
  insert into public.promotion_orders(property_id,owner_id,package,amount,livemode,target_area,notes,snapshot)
    values(listing_id,agent_id,offer,price,is_live,area,brief,listing_snapshot) returning * into result;
  return result;
end; $$;
revoke all on function public.reserve_promotion_order(uuid,uuid,text,boolean,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_promotion_order(uuid,uuid,text,boolean,text,text,jsonb) to service_role;

create or replace function public.apply_promotion_payment(order_id uuid,intent_id text,new_status text,refund_amount integer,event_created bigint)
returns void language plpgsql security definer set search_path='' as $$
declare item public.promotion_orders;
begin
  select * into item from public.promotion_orders where id=order_id for update;
  if not found then raise exception 'Promotion order unavailable'; end if;
  if new_status not in ('paid','refunded','disputed') or refund_amount<0 or refund_amount>item.amount then raise exception 'Invalid payment state'; end if;
  if item.payment_intent_id is not null and item.payment_intent_id<>intent_id then raise exception 'Payment intent mismatch'; end if;
  if event_created<item.last_event_created then return; end if;
  -- A late completion cannot undo a refund; dispute wins require a fresh event.
  if item.payment_status='refunded' and new_status='paid' then return; end if;
  update public.promotion_orders set payment_status=new_status,payment_intent_id=intent_id,
    refunded_amount=greatest(refund_amount,item.refunded_amount),
    stop_required=item.stop_required or (new_status<>'paid' and item.campaign_status='active'),
    stop_reason=case when new_status<>'paid' and item.campaign_status='active' and item.stop_reason='' then 'payment' else item.stop_reason end,
    paid_at=coalesce(item.paid_at,now()),last_event_created=event_created,updated_at=now() where id=order_id;
end; $$;
revoke all on function public.apply_promotion_payment(uuid,text,text,integer,bigint) from public,anon,authenticated;
grant execute on function public.apply_promotion_payment(uuid,text,text,integer,bigint) to service_role;

create or replace function public.update_promotion_campaign(order_id uuid,new_status text,spent integer,views integer,visits integer,summary text,google_campaign text)
returns public.promotion_orders language plpgsql security definer set search_path='' as $$
declare item public.promotion_orders; listing uuid; agent uuid;
begin
  -- Lock the property before its order, matching withdrawal/deletion, so an
  -- activation cannot race a vanished page and the lock order stays consistent.
  if new_status in ('preparing','active') then
    select property_id,owner_id into listing,agent from public.promotion_orders where id=order_id;
    perform 1 from public.properties where id=listing and owner_id=agent and status='published' for share;
    if not found then raise exception 'The property must remain published'; end if;
  end if;
  select * into item from public.promotion_orders where id=order_id for update;
  if not found then raise exception 'Promotion order unavailable'; end if;
  if not item.livemode or not(item.payment_status='paid' or (item.payment_status in ('refunded','disputed') and new_status='stopped')) then raise exception 'A real confirmed payment is required'; end if;
  if item.stop_required and new_status<>'stopped' then raise exception 'Confirm the campaign was stopped in Google Ads first'; end if;
  if new_status in ('preparing','active') and item.stop_reason in ('sold','rented','requested','deleted') then raise exception 'The agent requested stopping this promotion'; end if;
  if new_status='active' and length(trim(google_campaign))=0 then raise exception 'Add the Google campaign ID before marking active'; end if;
  if new_status='completed' and length(trim(summary))=0 then raise exception 'Add the campaign report before completion'; end if;
  update public.promotion_orders set campaign_status=new_status,spent_amount=spent,impressions=views,clicks=visits,
    report=summary,campaign_id=google_campaign,stop_required=false,
    stop_reason=case when new_status in ('preparing','active') and stop_reason in ('payment','withdrawn') then '' else stop_reason end,
    updated_at=now() where id=order_id returning * into item;
  return item;
end; $$;
revoke all on function public.update_promotion_campaign(uuid,text,integer,integer,integer,text,text) from public,anon,authenticated;
grant execute on function public.update_promotion_campaign(uuid,text,integer,integer,integer,text,text) to service_role;

create or replace function public.flag_property_promotion_stop() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' then
    update public.promotion_orders set stop_required=true,stop_reason='deleted',updated_at=now()
      where property_id=old.id and livemode and payment_status in ('paid','refunded','disputed') and campaign_status in ('queued','preparing','active');
    return old;
  end if;
  if new.status<>'published' or new.owner_id is distinct from old.owner_id then
    update public.promotion_orders set stop_required=true,stop_reason=case when stop_reason in ('sold','rented','requested') then stop_reason else 'withdrawn' end,updated_at=now()
      where property_id=old.id and livemode and payment_status in ('paid','refunded','disputed') and campaign_status in ('queued','preparing','active');
  end if;
  return new;
end; $$;
revoke all on function public.flag_property_promotion_stop() from public,anon,authenticated;
drop trigger if exists property_promotion_stop on public.properties;
create trigger property_promotion_stop before update of status,owner_id or delete on public.properties for each row execute function public.flag_property_promotion_stop();

create or replace function public.request_promotion_stop(order_id uuid,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare item public.promotion_orders;
begin
  if reason not in ('sold','rented','requested') then raise exception 'Choose a stop reason'; end if;
  select * into item from public.promotion_orders where id=order_id and owner_id=(select auth.uid()) for update;
  if not found or not item.livemode or item.payment_status not in ('paid','refunded','disputed') or item.campaign_status not in ('queued','preparing','active') then raise exception 'Promotion request unavailable'; end if;
  update public.promotion_orders set stop_required=true,stop_reason=reason,updated_at=now() where id=order_id;
end; $$;
revoke all on function public.request_promotion_stop(uuid,text) from public,anon,authenticated;
grant execute on function public.request_promotion_stop(uuid,text) to authenticated;
