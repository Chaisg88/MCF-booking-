-- Run once in a new Supabase project's SQL editor. No service-role key is used by the app.
create table public.profiles (id uuid primary key references auth.users on delete cascade, full_name text not null, email text not null, approved boolean not null default false, department text not null default 'Unassigned', role text not null default 'staff' check(role in ('admin','staff')));
create function public.new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,email,full_name) values(new.id,new.email,coalesce(nullif(new.raw_user_meta_data->>'full_name',''),split_part(new.email,'@',1))); return new; end $$;
create trigger on_new_user after insert on auth.users for each row execute function public.new_user();
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and role='admin' and approved) $$;
create function public.is_active_staff() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from profiles where id=auth.uid() and approved) $$;
create table public.assets(id uuid primary key default gen_random_uuid(), tag text not null unique check(length(trim(tag))>0), name text not null check(length(trim(name))>0), category text not null, serial text not null default '', department text not null, location text not null, condition text not null check(condition in ('Excellent','Good','Fair','Faulty')), status text not null default 'Available' check(status in ('Available','On loan','Maintenance','Missing','Retired')), value numeric not null default 0 check(value>=0), custodian_id uuid references profiles, custodian_name text, verified_at timestamptz, retired_at timestamptz);
create table public.loans(id uuid primary key default gen_random_uuid(),asset_id uuid not null references assets,borrower_id uuid not null references profiles,borrower_name text not null,checked_out_at timestamptz not null default now(),due_at timestamptz not null,returned_at timestamptz);
create unique index one_active_loan on public.loans(asset_id) where returned_at is null;
create table public.campaigns(id uuid primary key default gen_random_uuid(),name text not null,started_at timestamptz not null default now(),closed_at timestamptz);
create unique index one_open_campaign on public.campaigns((true)) where closed_at is null;
create table public.checks(id uuid primary key default gen_random_uuid(),asset_id uuid not null references assets,campaign_id uuid not null references campaigns,verified_at timestamptz not null default now(),verified_by uuid not null references profiles,method text not null check(method in ('QR','NFC','Manual')),unique(asset_id,campaign_id));
create table public.audit(id uuid primary key default gen_random_uuid(),action text not null,asset_id uuid references assets,actor_name text not null,created_at timestamptz not null default now(),details text not null default '');
create function public.log_action(action_name text, asset uuid, detail text) returns void language sql security definer set search_path=public as $$ insert into audit(action,asset_id,actor_name,details) select action_name,asset,full_name,detail from profiles where id=auth.uid() $$;
revoke all on function public.log_action(text,uuid,text) from public;
alter table profiles enable row level security;
alter table assets enable row level security;
alter table loans enable row level security;
alter table campaigns enable row level security;
alter table checks enable row level security;
alter table audit enable row level security;
create policy profiles_read on profiles for select to authenticated using(id=auth.uid() or is_admin());
create policy assets_read on assets for select to authenticated using(is_active_staff());
create policy loans_read on loans for select to authenticated using((borrower_id=auth.uid() and is_active_staff()) or is_admin());
create policy campaigns_read on campaigns for select to authenticated using(is_active_staff());
create policy checks_read on checks for select to authenticated using(is_active_staff());
create policy audit_read on audit for select to authenticated using(is_admin());
-- Mutations only through these transaction functions; clients cannot grant themselves a role.
create function public.manage_asset(payload jsonb, asset_id uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare a assets; begin
if not is_admin() then raise exception 'Administrator access required'; end if;
if asset_id is null then
 insert into assets(tag,name,category,serial,department,location,condition,value) values(trim(payload->>'tag'),trim(payload->>'name'),payload->>'category',coalesce(payload->>'serial',''),payload->>'department',payload->>'location',payload->>'condition',(payload->>'value')::numeric) returning * into a;
 if a.condition='Faulty' then update assets set status='Maintenance' where id=a.id; end if;
 perform log_action('Asset added',a.id,a.tag);
else
 select * into a from assets where id=asset_id for update;
 if not found then raise exception 'Asset not found'; end if;
 if a.status='On loan' then raise exception 'Return the equipment before changing its status'; end if;
 if payload->>'status' not in ('Available','Maintenance','Missing','Retired') then raise exception 'Invalid status'; end if;
 update assets set status=payload->>'status',condition=coalesce(payload->>'condition',condition),retired_at=case when payload->>'status'='Retired' then now() else null end where id=asset_id;
 perform log_action('Asset status changed',asset_id,payload->>'status');
end if; end $$;
create function public.checkout_asset(asset_id uuid,due_date timestamptz) returns void language plpgsql security definer set search_path=public as $$
declare a assets; p profiles; begin
select * into p from profiles where id=auth.uid(); if not found or not p.approved then raise exception 'Approved staff access required'; end if;
if due_date<=now() or due_date>now()+interval '366 days' then raise exception 'Choose a due date within the next year'; end if;
select * into a from assets where id=asset_id for update;
if not found or a.status<>'Available' or a.condition='Faulty' then raise exception 'This equipment is not available'; end if;
insert into loans(asset_id,borrower_id,borrower_name,due_at) values(a.id,p.id,p.full_name,due_date);
update assets set status='On loan',custodian_id=p.id,custodian_name=p.full_name where id=a.id;
perform log_action('Booked out',a.id,'Due '||due_date::text); end $$;
create function public.return_asset(asset_id uuid,item_condition text) returns void language plpgsql security definer set search_path=public as $$
declare a assets; begin
if not is_active_staff() then raise exception 'Approved staff access required'; end if;
select * into a from assets where id=asset_id for update;
if not found or a.status<>'On loan' then raise exception 'No active loan'; end if;
if a.custodian_id<>auth.uid() and not is_admin() then raise exception 'Only the borrower or an administrator can return this item'; end if;
if item_condition not in ('Excellent','Good','Fair','Faulty') then raise exception 'Invalid condition'; end if;
update loans set returned_at=now() where loans.asset_id=a.id and returned_at is null;
update assets set status=case when item_condition='Faulty' then 'Maintenance' else 'Available' end,condition=item_condition,custodian_id=null,custodian_name=null where id=a.id;
perform log_action('Booked in',a.id,item_condition); end $$;
create function public.start_stocktake(campaign_name text) returns void language plpgsql security definer set search_path=public as $$ begin
if not is_admin() then raise exception 'Administrator access required'; end if;
if length(trim(campaign_name))=0 then raise exception 'Campaign name required'; end if;
insert into campaigns(name) values(trim(campaign_name)); perform log_action('Stocktake started',null,campaign_name); end $$;
create function public.close_stocktake(campaign_id uuid) returns void language plpgsql security definer set search_path=public as $$ begin
if not is_admin() then raise exception 'Administrator access required'; end if;
update campaigns set closed_at=now() where id=campaign_id and closed_at is null; perform log_action('Stocktake closed',null,campaign_id::text); end $$;
create function public.verify_asset(asset_id uuid,scan_method text) returns void language plpgsql security definer set search_path=public as $$
declare a assets; c campaigns; begin
if not is_active_staff() then raise exception 'Approved staff access required'; end if;
select * into c from campaigns where closed_at is null for share; if not found then raise exception 'No active stocktake'; end if;
select * into a from assets where id=asset_id for update;
if not found or a.retired_at is not null then raise exception 'Asset unavailable'; end if;
if not is_admin() and (a.custodian_id is null or a.custodian_id<>auth.uid()) then raise exception 'Only the current custodian or an administrator can account for this asset'; end if;
insert into checks(asset_id,campaign_id,verified_by,method) values(a.id,c.id,auth.uid(),scan_method) on conflict on constraint checks_asset_id_campaign_id_key do update set verified_at=now(),verified_by=auth.uid(),method=excluded.method;
update assets set verified_at=now() where id=a.id; perform log_action('Stocktake verified',a.id,scan_method); end $$;
revoke all on function public.new_user() from public;
revoke all on function public.manage_asset(jsonb,uuid), public.checkout_asset(uuid,timestamptz), public.return_asset(uuid,text), public.start_stocktake(text), public.close_stocktake(uuid), public.verify_asset(uuid,text) from public;
grant execute on function public.manage_asset(jsonb,uuid), public.checkout_asset(uuid,timestamptz), public.return_asset(uuid,text), public.start_stocktake(text), public.close_stocktake(uuid), public.verify_asset(uuid,text) to authenticated;

create function public.set_staff_access(user_id uuid, enabled boolean, staff_department text) returns void language plpgsql security definer set search_path=public as $$ begin
if not is_admin() then raise exception 'Administrator access required'; end if;
if user_id=auth.uid() then raise exception 'You cannot change your own access'; end if;
if exists(select 1 from profiles where id=user_id and role='admin') then raise exception 'Administrator access must be managed by the project owner'; end if;
update profiles set approved=enabled,department=staff_department where id=user_id;
if not found then raise exception 'Staff account not found'; end if;
perform log_action(case when enabled then 'Staff access approved' else 'Staff access suspended' end,null,user_id::text);
end $$;
revoke all on function public.set_staff_access(uuid,boolean,text) from public;
grant execute on function public.set_staff_access(uuid,boolean,text) to authenticated;
