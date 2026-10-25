-- Publication intent, automatic paid publication, and one durable video job per purchase.
alter table public.property_orders add column if not exists publication_requested_at timestamptz;
alter table public.property_orders add column if not exists publication_completed_at timestamptz;
alter table public.property_orders add column if not exists publication_error text;
create table if not exists public.property_video_jobs (
  order_id uuid primary key references public.property_orders(id) on delete cascade,
  property_id uuid unique not null references public.properties(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'queued' check(status in ('queued','processing','completed','failed','cancelled')),
  source jsonb not null,
  video_url text check(video_url is null or video_url ~ '^https://'),
  poster_url text check(poster_url is null or poster_url ~ '^https://'),
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.property_video_jobs enable row level security;
revoke all on public.property_video_jobs from public,anon,authenticated;
grant select,insert,update,delete on public.property_video_jobs to service_role;

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
  if purchase.status<>'paid' or purchase.publication_requested_at is null then return false; end if;
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
      status=case when public.property_video_jobs.status='cancelled' then case when public.property_video_jobs.video_url is null then 'queued' else 'completed' end else public.property_video_jobs.status end,
      updated_at=now();
  update public.property_orders set publication_completed_at=now(),publication_error=null where id=purchase_id;
  return true;
end;
$$;
revoke all on function public.finish_property_publication(uuid) from public,anon,authenticated;
grant execute on function public.finish_property_publication(uuid) to service_role;

create or replace function public.on_property_payment_fulfilment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='paid' and old.status='pending' and new.publication_requested_at is not null then
    perform public.finish_property_publication(new.id);
  elsif new.status in ('refunded','disputed') and old.status is distinct from new.status then
    update public.property_video_jobs set status='cancelled',updated_at=now() where order_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function public.on_property_payment_fulfilment() from public,anon,authenticated;
drop trigger if exists after_property_payment_fulfilment on public.property_orders;
create trigger after_property_payment_fulfilment after update of status on public.property_orders for each row execute function public.on_property_payment_fulfilment();

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
  if purchase.status in ('refunded','disputed') then raise exception 'Contact support about this payment before publishing'; end if;
  update public.property_orders set publication_requested_at=now(),publication_completed_at=null,publication_error=null where id=purchase.id returning * into purchase;
  if purchase.status='paid' then
    done:=public.finish_property_publication(purchase.id);
    select * into purchase from public.property_orders where id=purchase.id;
    return jsonb_build_object('published',done,'paid',true,'publicationError',purchase.publication_error);
  end if;
  return jsonb_build_object('published',false,'order',to_jsonb(purchase));
end;
$$;
revoke all on function public.request_property_publication(uuid,uuid) from public,anon,authenticated;
grant execute on function public.request_property_publication(uuid,uuid) to service_role;

-- A retry requeues the existing failed job; it never creates another purchase.
create or replace function public.retry_property_video(listing_id uuid,agent_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare purchase public.property_orders;
begin
  perform 1 from public.properties where id=listing_id and owner_id=agent_id for update;
  if not found then return false; end if;
  select * into purchase from public.property_orders where property_id=listing_id and owner_id=agent_id for update;
  if not found or purchase.status<>'paid' then return false; end if;
  update public.property_video_jobs set status='queued',updated_at=now()
    where order_id=purchase.id and owner_id=agent_id and status='failed';
  return found;
end;
$$;
revoke all on function public.retry_property_video(uuid,uuid) from public,anon,authenticated;
grant execute on function public.retry_property_video(uuid,uuid) to service_role;

-- Only completed video for an active paid purchase is included in public output.
create or replace function public.get_public_property(property_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'property',to_jsonb(p)-array['owner_id','created_at','updated_at'],
    'profile',jsonb_build_object('name',a.name,'email',a.email,'phone',a.phone,'agency',a.agency,'bio',a.bio,'avatar_url',a.avatar_url),
    'film',(select jsonb_build_object('src',v.video_url,'poster',coalesce(v.poster_url,p.images[1])) from public.property_video_jobs v join public.property_orders o on o.id=v.order_id where v.property_id=p.id and v.status='completed' and v.video_url is not null and o.status='paid')
  ) from public.properties p join public.profiles a on a.id=p.owner_id where p.slug=property_slug and p.status='published' limit 1;
$$;
revoke all on function public.get_public_property(text) from public;
grant execute on function public.get_public_property(text) to anon,authenticated;
notify pgrst,'reload schema';
