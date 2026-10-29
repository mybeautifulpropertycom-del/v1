-- Durable deletion/retention jobs. Storage bytes are removed through Storage API,
-- never by deleting storage.objects rows. Existing drafts receive 14 days' grace.
alter table public.profiles add column if not exists profile_completed_at timestamptz;
update public.profiles set profile_completed_at=now() where profile_completed_at is null
  and length(btrim(name))>=2 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  and length(regexp_replace(phone,'[^0-9]','','g'))>=8;
alter table public.properties add column if not exists first_published_at timestamptz;
alter table public.properties add column if not exists draft_expires_at timestamptz default (now()+interval '14 days');
update public.properties p set first_published_at=coalesce(p.first_published_at,now()),draft_expires_at=null
where p.status='published' or exists(select 1 from public.property_orders o where o.property_id=p.id and o.publication_completed_at is not null)
  or exists(select 1 from public.property_legacy_access a where a.property_id=p.id);

create table if not exists public.account_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('property','account')),
  target_id uuid not null,
  owner_id uuid not null,
  paths jsonb not null,
  status text not null default 'pending' check(status in ('pending','completed')),
  next_attempt_at timestamptz not null default (now()+interval '10 minutes'),
  lease_token uuid, lease_until timestamptz,
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(kind,target_id)
);
create table if not exists public.account_lifecycle_audit (
  id bigint generated always as identity primary key,
  actor_id uuid, target_id uuid not null, action text not null,
  created_at timestamptz not null default now()
);
alter table public.account_cleanup_jobs enable row level security;
alter table public.account_lifecycle_audit enable row level security;
revoke all on public.account_cleanup_jobs,public.account_lifecycle_audit from public,anon,authenticated,service_role;
grant select on public.account_cleanup_jobs,public.account_lifecycle_audit to service_role;

create or replace function public.account_accepts_uploads() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=auth.uid()) and not exists(
   select 1 from public.account_cleanup_jobs where kind='account' and owner_id=auth.uid());
$$;
revoke all on function public.account_accepts_uploads() from public,anon;
grant execute on function public.account_accepts_uploads() to authenticated;
drop policy if exists "Deleted accounts cannot upload" on storage.objects;
create policy "Deleted accounts cannot upload" on storage.objects as restrictive for insert to authenticated
with check (public.account_accepts_uploads());
drop policy if exists "Deleted accounts cannot update storage" on storage.objects;
create policy "Deleted accounts cannot update storage" on storage.objects as restrictive for update to authenticated
using (public.account_accepts_uploads()) with check(public.account_accepts_uploads());

create or replace function public.track_profile_completion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 new.profile_completed_at:=case when tg_op='UPDATE' then old.profile_completed_at else null end;
 if new.profile_completed_at is null and length(btrim(new.name))>=2
   and new.email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
   and length(regexp_replace(new.phone,'[^0-9]','','g'))>=8 then new.profile_completed_at:=now(); end if;
 return new;
end; $$;
drop trigger if exists track_profile_completion on public.profiles;
create trigger track_profile_completion before insert or update on public.profiles for each row execute function public.track_profile_completion();

create or replace function public.guard_property_lifecycle() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 -- Lock the owner row to serialize account deletion against listing creation.
 perform 1 from public.profiles where id=new.owner_id for update;
 if exists(select 1 from public.account_cleanup_jobs where kind='account' and owner_id=new.owner_id) then
   raise exception 'This account is being deleted';
 end if;
 if tg_op='INSERT' then
   if exists(select 1 from public.account_cleanup_jobs where kind='property' and target_id=new.id) then raise exception 'This property has been deleted'; end if;
   new.first_published_at:=null; new.draft_expires_at:=now()+interval '14 days';
 else
   new.first_published_at:=old.first_published_at; new.draft_expires_at:=old.draft_expires_at;
 end if;
 if new.status='published' then new.first_published_at:=coalesce(new.first_published_at,now()); new.draft_expires_at:=null; end if;
 return new;
end; $$;
drop trigger if exists guard_property_lifecycle on public.properties;
create trigger guard_property_lifecycle before insert or update on public.properties for each row execute function public.guard_property_lifecycle();

create or replace function public.queue_deleted_property_storage() returns trigger
language plpgsql security definer set search_path='' as $$
declare paths jsonb; purchase record;
begin
 paths:=jsonb_build_array(jsonb_build_object('bucket','property-images','prefix',old.owner_id::text||'/'||old.id::text));
 for purchase in select id from public.property_orders where property_id=old.id loop
   paths:=paths || jsonb_build_array(
     jsonb_build_object('bucket','property-videos','prefix',old.owner_id::text||'/'||purchase.id::text),
     jsonb_build_object('bucket','property-video-work','prefix',old.owner_id::text||'/'||purchase.id::text));
   delete from public.property_film_scenes where order_id=purchase.id;
 end loop;
 insert into public.account_cleanup_jobs(kind,target_id,owner_id,paths) values('property',old.id,old.owner_id,paths) on conflict(kind,target_id) do nothing;
 return old;
end; $$;
drop trigger if exists queue_deleted_property_storage on public.properties;
create trigger queue_deleted_property_storage before delete on public.properties for each row execute function public.queue_deleted_property_storage();

create or replace function public.admin_delete_property(p_target uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.platform_admins where user_id=p_actor) then raise exception 'Administrator access required'; end if;
 perform 1 from public.properties where id=p_target for update;
 if exists(select 1 from public.property_orders where property_id=p_target and status='pending' and expires_at>now() and not public.property_order_fulfilled(id)) then
   raise exception using errcode='P0409',message='A checkout is still active. Try again after it expires or the payment is confirmed.';
 end if;
 delete from public.properties where id=p_target;
 if not found then return false; end if;
 insert into public.account_lifecycle_audit(actor_id,target_id,action) values(p_actor,p_target,'delete_property');
 return true;
end; $$;
create or replace function public.admin_delete_account(p_target uuid,p_actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.platform_admins where user_id=p_actor) then raise exception 'Administrator access required'; end if;
 if p_target=p_actor or exists(select 1 from public.platform_admins where user_id=p_target) then raise exception 'Administrator accounts cannot be deleted here'; end if;
 perform 1 from public.profiles where id=p_target for update;
 if not found then return false; end if;
 perform 1 from public.properties where owner_id=p_target order by id for update;
 if exists(select 1 from public.property_orders where owner_id=p_target and property_id is not null and status='pending' and expires_at>now() and not public.property_order_fulfilled(id)) then
   raise exception using errcode='P0409',message='A checkout is still active. Try again after it expires or the payment is confirmed.';
 end if;
 insert into public.account_cleanup_jobs(kind,target_id,owner_id,paths) values('account',p_target,p_target,
   jsonb_build_array(
     jsonb_build_object('bucket','property-images','prefix',p_target::text),
     jsonb_build_object('bucket','property-videos','prefix',p_target::text),
     jsonb_build_object('bucket','property-video-work','prefix',p_target::text),
     jsonb_build_object('bucket','agent-avatars','prefix',p_target::text))) on conflict(kind,target_id) do nothing;
 delete from public.properties where owner_id=p_target;
 insert into public.account_lifecycle_audit(actor_id,target_id,action) values(p_actor,p_target,'delete_account_requested');
 return true;
end; $$;

create or replace function public.expire_unpublished_properties() returns integer
language plpgsql security definer set search_path='' as $$
declare listing record; removed integer:=0;
begin
 for listing in select p.id from public.properties p where p.status='draft' and p.first_published_at is null
   and p.draft_expires_at<=now() and not public.property_has_live_access(p.id,p.owner_id)
   and not exists(select 1 from public.property_orders o where o.property_id=p.id and
     (o.paid_at is not null or o.status<>'pending' or o.expires_at>now()))
   order by p.draft_expires_at limit 100 for update of p skip locked loop
   -- Recheck payment state after locking the property, with a fresh snapshot.
   if exists(select 1 from public.properties p where p.id=listing.id and public.property_has_live_access(p.id,p.owner_id))
     or exists(select 1 from public.property_orders o where o.property_id=listing.id and (o.paid_at is not null or o.status<>'pending' or o.expires_at>now())) then continue; end if;
   delete from public.properties where id=listing.id;
   insert into public.account_lifecycle_audit(target_id,action) values(listing.id,'expire_unpublished_draft');
   removed:=removed+1;
 end loop;
 return removed;
end; $$;

create or replace function public.claim_account_cleanup(p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job public.account_cleanup_jobs;
begin
 select * into job from public.account_cleanup_jobs where status='pending' and next_attempt_at<=now()
   and (lease_until is null or lease_until<now()) order by next_attempt_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.account_cleanup_jobs set lease_token=p_lease,lease_until=now()+interval '3 minutes',attempts=attempts+1
   where id=job.id returning * into job;
 return to_jsonb(job);
end; $$;
create or replace function public.finish_account_cleanup(p_id uuid,p_lease uuid,p_done boolean,p_failed boolean default false) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.account_cleanup_jobs set status=case when p_done then 'completed' else 'pending' end,
   completed_at=case when p_done then now() else null end,
   next_attempt_at=now()+case when p_failed then interval '15 minutes' else interval '1 minute' end,
   last_error=case when p_failed then 'Storage or authentication cleanup needs retry.' else null end,
   lease_until=null,lease_token=null where id=p_id and lease_token=p_lease and status='pending';
 return found;
end; $$;

revoke all on function public.track_profile_completion(),public.guard_property_lifecycle(),public.queue_deleted_property_storage(),
 public.admin_delete_property(uuid,uuid),public.admin_delete_account(uuid,uuid),public.expire_unpublished_properties(),
 public.claim_account_cleanup(uuid),public.finish_account_cleanup(uuid,uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.admin_delete_property(uuid,uuid),public.admin_delete_account(uuid,uuid),public.expire_unpublished_properties(),
 public.claim_account_cleanup(uuid),public.finish_account_cleanup(uuid,uuid,boolean,boolean) to service_role;
notify pgrst,'reload schema';
