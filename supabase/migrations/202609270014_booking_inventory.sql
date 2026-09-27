-- Inventory remains empty until explicitly provisioned; paid activation stays default-off.
create table public.booking_inventory (
 resource_id uuid primary key references public.resources(id), code text not null unique,
 floor text not null check(floor in ('GF','FF')), room text not null,
 check ((code ~ '^S(0[1-9]|1[0-9]|2[0-5])$' and floor='GF' and room='GF-10') or
 (code='C01' and floor='GF' and room='GF-01') or (code='C02' and floor='FF' and room='FF-03') or
 (code='C03' and floor='FF' and room='FF-04') or (code='C04' and floor='FF' and room='FF-06'))
);
create table public.workspace_pass_allocations (
 id uuid primary key default extensions.gen_random_uuid(), resource_id uuid not null references public.resources(id),
 member_id uuid not null references auth.users(id), product_id uuid not null references public.booking_products(id),
 period daterange not null, booking_ids uuid[] not null check(cardinality(booking_ids)>0),
 released_at timestamptz, created_at timestamptz not null default now(),
 exclude using gist (resource_id with =,period with &&) where(released_at is null)
);
alter table public.booking_inventory enable row level security;
alter table public.workspace_pass_allocations enable row level security;
create policy inventory_read on public.booking_inventory for select to authenticated using(true);
create policy allocation_read on public.workspace_pass_allocations for select to authenticated using(member_id=auth.uid() or private.is_staff(array['admin','super_admin']::public.staff_role[]));
revoke all on public.booking_inventory,public.workspace_pass_allocations from public,anon,authenticated;
grant select on public.booking_inventory,public.workspace_pass_allocations to authenticated;
grant all on public.booking_inventory,public.workspace_pass_allocations to service_role;

create function public.set_booking_resource_enabled(p_resource_id uuid,p_enabled boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare old_active boolean;
begin
 perform private.require_paid_admin();
 if p_enabled is null or p_reason is null or length(trim(p_reason)) not between 2 and 300 then raise exception 'Enable state and reason required' using errcode='22023'; end if;
 select active into old_active from public.resources where id=p_resource_id for update;
 if not found then raise exception 'Unknown resource' using errcode='22023'; end if;
 update public.resources set active=p_enabled where id=p_resource_id;
 perform private.record_audit(auth.uid(),'staff','resource.enabled','resource',p_resource_id,jsonb_build_object('active',old_active),jsonb_build_object('active',p_enabled,'reason',trim(p_reason)));
end; $$;

create table private.workspace_booking_requests (transaction_id bigint not null, resource_id uuid not null, primary key(transaction_id,resource_id));
revoke all on private.workspace_booking_requests from public,anon,authenticated;
create function private.guard_workspace_allocation() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings; k text;
begin
 if tg_op='UPDATE' and old.booking_id is not null and (new.resource_id,new.starts_at,new.ends_at) is distinct from (old.resource_id,old.starts_at,old.ends_at) and exists(select 1 from public.booking_inventory where resource_id=old.resource_id) then raise exception 'Cancel and reserve a new workspace pass to change dates' using errcode='42501'; end if;
 if new.released_at is not null or not exists(select 1 from public.booking_inventory where resource_id=new.resource_id) then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.resource_id::text,14));
 if tg_op='INSERT' and new.booking_id is not null and (new.starts_at at time zone 'Asia/Kolkata')::time>=time '09:00' and (new.starts_at at time zone 'Asia/Kolkata')::time<time '17:00' and not exists(select 1 from private.workspace_booking_requests where transaction_id=txid_current() and resource_id=new.resource_id) then raise exception 'Use workspace pass reservation for mapped inventory' using errcode='42501'; end if;
 if exists(select 1 from public.workspace_pass_allocations a where a.resource_id=new.resource_id and a.released_at is null
 and exists(select 1 from generate_series((new.starts_at at time zone 'Asia/Kolkata')::date::timestamp,((new.ends_at-interval '1 microsecond') at time zone 'Asia/Kolkata')::date::timestamp,interval '1 day') d where tstzrange(new.starts_at,new.ends_at,'[)') && tstzrange((d::date+time '09:00') at time zone 'Asia/Kolkata',(d::date+time '17:00') at time zone 'Asia/Kolkata','[)'))
 and a.period && daterange((new.starts_at at time zone 'Asia/Kolkata')::date,((new.ends_at-interval '1 microsecond') at time zone 'Asia/Kolkata')::date+1,'[)')
 and not coalesce(new.booking_id=any(a.booking_ids),false)) then raise exception 'Resource is reserved by a workspace pass' using errcode='23P01'; end if;
 if new.booking_id is not null then
  select * into b from public.bookings where id=new.booking_id;
  select kind into k from public.resource_booking_policies where resource_id=new.resource_id;
  if k='cabin' and (b.organization_id is null or not exists(select 1 from public.paid_access_entitlements e join public.booking_products p on p.id=e.product_id
    where e.organization_id=b.organization_id and e.resource_id=new.resource_id and p.kind='cabin' and p.unit='month' and e.revoked_at is null and e.starts_at<=b.starts_at and e.ends_at>=b.ends_at)) then
   raise exception 'Cabins require whole-cabin monthly team access' using errcode='42501';
  end if;
 end if;
 return new;
end; $$;
create trigger guard_workspace_allocation before insert or update on public.resource_reservations for each row execute function private.guard_workspace_allocation();
create function private.release_workspace_allocation() returns trigger language plpgsql security definer set search_path='' as $$
declare allocation public.workspace_pass_allocations;
begin
 if new.status='cancelled' then
  for allocation in select * from public.workspace_pass_allocations a where new.id=any(a.booking_ids) and a.released_at is null order by a.id for update loop
   if not exists(select 1 from public.bookings b where b.id=any(allocation.booking_ids) and b.status<>'cancelled') then
    update public.workspace_pass_allocations set released_at=now() where id=allocation.id;
   end if;
  end loop;
 end if;
 return new;
end; $$;
create trigger release_workspace_allocation after update of status on public.bookings for each row execute function private.release_workspace_allocation();

create function public.get_workspace_availability(p_product_id uuid,p_dates date[]) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.booking_products; ds date[]; result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into p from public.booking_products where id=p_product_id and kind in ('workspace','cabin') and unit in ('day','week','month');
 if p.id is null or (p.kind='cabin' and p.unit<>'month') then raise exception 'Workspace or monthly cabin product required' using errcode='22023'; end if;
 ds:=private.pass_dates(p.unit,p_dates);
 select coalesce(jsonb_agg(jsonb_build_object('resource_id',r.id,'code',i.code,'floor',i.floor,'room',i.room,'kind',bp.kind,'capacity',r.capacity,
 'available',r.active and r.reservable and p.enabled and p.price_paise is not null and not exists(select 1 from jsonb_array_elements(issues.dates) x where x->>'reason'<>'closed') and
 (p.unit<>'day' or issues.dates='[]'::jsonb) and exists(select 1 from unnest(ds) d where not exists(select 1 from public.booking_closures c where c.location_id=r.location_id and c.closed_on=d)),
 'unavailable_dates',issues.dates) order by i.code),'[]'::jsonb) into result
 from public.booking_inventory i join public.resources r on r.id=i.resource_id join public.resource_booking_policies bp on bp.resource_id=r.id
 cross join lateral(select coalesce(jsonb_agg(jsonb_build_object('date',d,'reason',reason,'closure_reason',(select c.reason from public.booking_closures c where c.location_id=r.location_id and c.closed_on=d)) order by d) filter(where reason is not null),'[]'::jsonb) dates from (
 select d,case when not r.active or not r.reservable then 'disabled'
 when exists(select 1 from public.workspace_pass_allocations a where a.resource_id=r.id and a.released_at is null and a.period @> d) then 'reserved'
 when exists(select 1 from public.resource_reservations rr where rr.resource_id=r.id and rr.released_at is null and rr.period && tstzrange((d+time '09:00') at time zone 'Asia/Kolkata',(d+time '17:00') at time zone 'Asia/Kolkata','[)')) then 'reserved'
 when exists(select 1 from public.booking_closures c where c.location_id=r.location_id and c.closed_on=d) then 'closed'
 when not private.within_resource_hours(r.id,(d+time '09:00') at time zone 'Asia/Kolkata',(d+time '17:00') at time zone 'Asia/Kolkata') then 'outside_hours'
 else null end reason from unnest(ds) d) reasons) issues where bp.kind=p.kind;
 return result;
end; $$;

create function public.reserve_workspace_pass(p_resource_id uuid,p_product_id uuid,p_dates date[],p_organization_id uuid default null) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare p public.booking_products; r public.resources; ds date[]; d date; ids uuid[]:='{}'; bid uuid; s timestamptz; e timestamptz;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into p from public.booking_products where id=p_product_id and enabled and kind in ('workspace','cabin') and unit in ('day','week','month');
 select rr.* into r from public.resources rr join public.booking_inventory i on i.resource_id=rr.id join public.resource_booking_policies bp on bp.resource_id=rr.id where rr.id=p_resource_id and bp.kind=p.kind for share of rr;
 if p.id is null or r.id is null or (p.kind='cabin' and (p.unit<>'month' or r.capacity<>6)) or (p.kind='workspace' and r.capacity<>1) then raise exception 'Configured workspace inventory required' using errcode='22023'; end if;
 ds:=private.pass_dates(p.unit,p_dates);
 perform 1 from public.organization_memberships where organization_id=p_organization_id for share;
 if p.kind='cabin' and (p_organization_id is null or not private.is_team_admin(p_organization_id)) then raise exception 'Team admin required for whole cabin' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.location_id::text,13));
 perform pg_advisory_xact_lock(hashtextextended(r.id::text,14));
 if exists(select 1 from public.workspace_pass_allocations a where a.resource_id=r.id and a.released_at is null and exists(select 1 from unnest(ds) day where a.period @> day)) then raise exception 'Resource is reserved by a workspace pass' using errcode='23P01'; end if;
 if exists(select 1 from public.resource_reservations rr cross join unnest(ds) day where rr.resource_id=r.id and rr.released_at is null and rr.period && tstzrange((day+time '09:00') at time zone 'Asia/Kolkata',(day+time '17:00') at time zone 'Asia/Kolkata','[)')) then raise exception 'Resource is no longer available for selected dates' using errcode='23P01'; end if;
 insert into private.workspace_booking_requests values(txid_current(),r.id);
 foreach d in array ds loop
  if exists(select 1 from public.booking_closures where location_id=r.location_id and closed_on=d) then
   if p.unit='day' then raise exception 'Lab is closed on a selected date' using errcode='22023'; end if;
   continue;
  end if;
  s:=(d+time '09:00') at time zone 'Asia/Kolkata'; e:=(d+time '17:00') at time zone 'Asia/Kolkata';
  if not exists(select 1 from public.paid_access_entitlements x where x.product_id=p.id and x.resource_id=r.id and x.revoked_at is null and x.starts_at<=s and x.ends_at>=e and ((p_organization_id is null and x.user_id=auth.uid()) or x.organization_id=p_organization_id)) then raise exception 'Matching pass entitlement required' using errcode='42501'; end if;
  bid:=public.create_booking_with_access(r.id,s,e,'{}',null,null,case when p_organization_id is null then 'personal' else 'team' end,p_organization_id);
  ids:=array_append(ids,bid);
 end loop;
 delete from private.workspace_booking_requests where transaction_id=txid_current() and resource_id=r.id;
 if cardinality(ids)=0 then raise exception 'No open dates in selected pass' using errcode='22023'; end if;
 if p.unit in ('week','month') then
  insert into public.workspace_pass_allocations(resource_id,member_id,product_id,period,booking_ids) values(r.id,auth.uid(),p.id,daterange(ds[1],ds[cardinality(ds)]+1,'[)'),ids);
 end if;
 return ids;
end; $$;
revoke all on function private.guard_workspace_allocation(),private.release_workspace_allocation() from public,anon,authenticated;
revoke all on function public.set_booking_resource_enabled(uuid,boolean,text),public.get_workspace_availability(uuid,date[]),public.reserve_workspace_pass(uuid,uuid,date[],uuid) from public,anon;
grant execute on function public.set_booking_resource_enabled(uuid,boolean,text),public.get_workspace_availability(uuid,date[]),public.reserve_workspace_pass(uuid,uuid,date[],uuid) to authenticated;
