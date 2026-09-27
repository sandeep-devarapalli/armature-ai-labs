-- Local preparation only: no payment provider or production worker is enabled.
create table public.booking_products (
 id uuid primary key default extensions.gen_random_uuid(), code text not null unique,
 name text not null, kind text not null check(kind in ('workspace','cabin','equipment','event','overnight')),
 unit text not null check(unit in ('day','week','month','hour')),
 price_paise bigint check(price_paise>=0), enabled boolean not null default false,
 check ((kind not in ('workspace','cabin','overnight') or unit<>'hour') and (kind<>'event' or unit='hour'))
);
insert into public.booking_products(code,name,kind,unit) values
 ('workspace-day','Coworking day pass','workspace','day'),('workspace-week','Coworking week pass','workspace','week'),
 ('workspace-month','Coworking calendar-month pass','workspace','month'),('cabin-month','Cabin calendar-month pass','cabin','month'),
 ('overnight-day','Overnight pass','overnight','day'),('equipment-day','Equipment day access','equipment','day'),
 ('equipment-hour','Equipment hourly access','equipment','hour'),('event-hour','Event space hourly access','event','hour');
create table public.resource_booking_policies (
 resource_id uuid primary key references public.resources(id),
 kind text not null check(kind in ('workspace','cabin','equipment','event'))
);
create table public.booking_closures (
 id uuid primary key default extensions.gen_random_uuid(), location_id uuid not null references public.locations(id),
 closed_on date not null, reason text not null check(length(trim(reason)) between 2 and 300), unique(location_id,closed_on)
);
create table public.booking_policy_settings (
 singleton boolean primary key default true check(singleton), mock_grants_enabled boolean not null default false
);
insert into public.booking_policy_settings default values;
create table public.paid_access_entitlements (
 id uuid primary key default extensions.gen_random_uuid(), user_id uuid references auth.users(id),
 organization_id uuid references public.organizations(id), product_id uuid not null references public.booking_products(id),
 resource_id uuid references public.resources(id), starts_at timestamptz not null, ends_at timestamptz not null,
 seats integer not null check(seats>0), price_paise bigint not null check(price_paise>=0),
 discount_percent integer not null default 0 check(discount_percent between 0 and 100),
 source text not null default 'local_mock' check(source='local_mock'),
 daytime_event_approved boolean not null default false, revoked_at timestamptz,
 granted_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(ends_at>starts_at), check((user_id is null)<>(organization_id is null))
);
create index paid_access_member_period on public.paid_access_entitlements(user_id,starts_at,ends_at) where revoked_at is null;
create index paid_access_team_period on public.paid_access_entitlements(organization_id,starts_at,ends_at) where revoked_at is null;
create function private.require_paid_admin() returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Website Admin required' using errcode='42501'; end if;
end; $$;
create function public.configure_booking_product(p_id uuid,p_price_paise bigint,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_paid_admin();
 if p_enabled and p_price_paise is null then raise exception 'Set a price before enabling' using errcode='22023'; end if;
 update public.booking_products set price_paise=p_price_paise,enabled=p_enabled where id=p_id;
 if not found then raise exception 'Unknown product' using errcode='22023'; end if;
end; $$;
create function public.configure_resource_booking_policy(p_resource_id uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_paid_admin();
 insert into public.resource_booking_policies values(p_resource_id,p_kind) on conflict(resource_id) do update set kind=excluded.kind;
end; $$;
create function public.set_booking_closure(p_location_id uuid,p_closed_on date,p_reason text,p_closed boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_paid_admin();
 perform pg_advisory_xact_lock(hashtextextended(p_location_id::text,13));
 if p_closed then insert into public.booking_closures(location_id,closed_on,reason) values(p_location_id,p_closed_on,trim(p_reason))
 on conflict(location_id,closed_on) do update set reason=excluded.reason;
 else delete from public.booking_closures where location_id=p_location_id and closed_on=p_closed_on; end if;
end; $$;
create function private.pass_dates(p_unit text,p_dates date[]) returns date[] language plpgsql immutable set search_path='' as $$
declare v_start date; v_end date; result date[];
begin
 if cardinality(p_dates) is null or cardinality(p_dates) not between 1 and 31 or array_position(p_dates,null) is not null then raise exception 'Select 1 to 31 dates' using errcode='22023'; end if;
 select min(d),max(d),array_agg(distinct d order by d) into v_start,v_end,result from unnest(p_dates) d;
 if p_unit in ('week','month') then
  if cardinality(p_dates)<>1 then raise exception 'Select one pass start date' using errcode='22023'; end if;
  if p_unit='month' and extract(day from v_start)<>1 then raise exception 'Month pass starts on the first day' using errcode='22023'; end if;
  v_end:=case p_unit when 'week' then v_start+6 else (v_start+interval '1 month'-interval '1 day')::date end;
  select array_agg(d::date) into result from generate_series(v_start::timestamp,v_end::timestamp,interval '1 day') d;
 elsif date_trunc('month',v_start)<>date_trunc('month',v_end) then raise exception 'Selected day passes must be within one month' using errcode='22023'; end if;
 return result;
end; $$;
create function public.quote_access_pass(p_product_id uuid,p_dates date[],p_discount_percent integer default 0,p_resource_id uuid default null,p_seats integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.booking_products; ds date[]; v_closures jsonb; v_units integer; v_seats integer:=p_seats;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_seats is null or p_seats<1 or p_seats>10000 then raise exception 'Invalid seat quantity' using errcode='22023'; end if;
 if p_discount_percent is null or p_discount_percent not between 0 and 100 then raise exception 'Invalid discount' using errcode='22023'; end if;
 if p_discount_percent<>0 then perform private.require_paid_admin(); end if;
 select * into p from public.booking_products where id=p_product_id;
 if not found or p.unit='hour' then raise exception 'Select a day, week or month product' using errcode='22023'; end if;
 ds:=private.pass_dates(p.unit,p_dates);
 if p_resource_id is not null and not exists(select 1 from public.resource_booking_policies where resource_id=p_resource_id and (kind=p.kind or (p.kind='overnight' and kind in ('workspace','cabin')))) then raise exception 'Product does not match resource' using errcode='22023'; end if;
 if p.kind='cabin' and p_resource_id is null then raise exception 'Select a cabin resource' using errcode='22023'; end if;
 if exists(select 1 from public.resource_booking_policies where resource_id=p_resource_id and kind='cabin') then select capacity into v_seats from public.resources where id=p_resource_id;
 if v_seats is null then raise exception 'Select a cabin resource' using errcode='22023'; end if; end if;
 v_units:=case when p.unit in ('week','month') then 1 else cardinality(ds) end;
 select coalesce(jsonb_agg(jsonb_build_object('date',c.closed_on,'reason',c.reason)),'[]'::jsonb) into v_closures
 from public.booking_closures c join public.resources r on r.location_id=c.location_id
 where r.id=p_resource_id and c.closed_on=any(ds);
 return jsonb_build_object('product_id',p.id,'kind',p.kind,'unit',p.unit,'dates',ds,'starts_on',ds[1],'ends_on',ds[cardinality(ds)],
 'price_paise',p.price_paise,'total_paise',round(p.price_paise::numeric*v_units*v_seats*(100-p_discount_percent)/100),
 'configured',p.enabled and p.price_paise is not null,'seats',v_seats,'closed_dates',v_closures);
end; $$;
create function private.require_mock_grant(p_user_id uuid,p_organization_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_paid_admin();
 if not exists(select 1 from public.booking_policy_settings where mock_grants_enabled) then raise exception 'Mock grants are disabled' using errcode='42501'; end if;
 if (p_user_id is null)=(p_organization_id is null) then raise exception 'Select a person or a team' using errcode='22023'; end if;
 if p_user_id is not null and not private.has_approved_basic_membership(p_user_id) then raise exception 'Approved basic membership required' using errcode='42501'; end if;
 if p_organization_id is not null and not exists(select 1 from public.organization_memberships where organization_id=p_organization_id and status='active') then raise exception 'Active team required' using errcode='42501'; end if;
end; $$;
create function public.grant_mock_access(p_user_id uuid,p_product_id uuid,p_resource_id uuid,p_dates date[],p_seats integer default 1,p_discount_percent integer default 0,p_organization_id uuid default null)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare p public.booking_products; ds date[]; d date; ids uuid[]:='{}'; v_id uuid; v_kind text; v_capacity integer; v_price bigint; v_quote jsonb; v_index integer:=0; v_total bigint;
begin
 perform private.require_mock_grant(p_user_id,p_organization_id);
 select * into p from public.booking_products where id=p_product_id and enabled and price_paise is not null for share;
 if not found or p.unit='hour' then raise exception 'Configured pass required' using errcode='22023'; end if;
 select bp.kind,r.capacity into v_kind,v_capacity from public.resource_booking_policies bp join public.resources r on r.id=bp.resource_id where r.id=p_resource_id;
 if v_kind is null or (p.kind<>'overnight' and p.kind<>v_kind) or (p.kind='overnight' and v_kind not in ('workspace','cabin')) then raise exception 'Product does not match resource' using errcode='22023'; end if;
 if p_seats is null or p_seats<1 or (v_kind='cabin' and p_seats<>v_capacity) or (p_organization_id is null and v_kind<>'cabin' and p_seats<>1) then raise exception 'Pay for the full cabin seat count' using errcode='22023'; end if;
 if p_organization_id is not null and v_kind='workspace' and p_seats<(select seat_allowance from public.organization_memberships where organization_id=p_organization_id) then raise exception 'Paid workspace seats must cover the team seat allowance' using errcode='22023'; end if;
 v_quote:=public.quote_access_pass(p_product_id,p_dates,p_discount_percent,p_resource_id,p_seats);
 v_total:=(v_quote->>'total_paise')::bigint;
 ds:=private.pass_dates(p.unit,p_dates);
 if p.kind='overnight' and p_user_id is not null and not exists(select 1 from public.basic_onboarding_applications where user_id=p_user_id and date_of_birth<=(ds[1]-interval '18 years')::date) then raise exception 'Overnight access is adults only' using errcode='42501'; end if;
 foreach d in array ds loop
  v_index:=v_index+1;
  insert into public.paid_access_entitlements(user_id,organization_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,discount_percent,granted_by)
  values(p_user_id,p_organization_id,p.id,p_resource_id,(d+case when p.kind='overnight' then time '23:00' else time '09:00' end) at time zone 'Asia/Kolkata',
  (d+case when p.kind='overnight' then 1 else 0 end+case when p.kind='overnight' then time '08:00' else time '17:00' end) at time zone 'Asia/Kolkata',p_seats,
  v_total/cardinality(ds)+case when v_index<=mod(v_total,cardinality(ds)) then 1 else 0 end,p_discount_percent,auth.uid()) returning id into v_id;
  ids:=array_append(ids,v_id);
 end loop;
 return ids;
end; $$;
create function public.grant_mock_resource_access(p_user_id uuid,p_product_id uuid,p_resource_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_organization_id uuid default null,p_discount_percent integer default 0,p_daytime_event_approved boolean default false)
returns uuid language plpgsql security definer set search_path='' as $$
declare p public.booking_products; v_kind text; v_id uuid;
begin
 perform private.require_mock_grant(p_user_id,p_organization_id);
 select * into p from public.booking_products where id=p_product_id and enabled and price_paise is not null and unit='hour' for share;
 select kind into v_kind from public.resource_booking_policies where resource_id=p_resource_id;
 if p.id is null or p.kind is distinct from v_kind or p_starts_at is null or p_ends_at is null or p_ends_at<=p_starts_at or p_discount_percent is null or p_discount_percent not between 0 and 100 then raise exception 'Configured hourly product and valid interval required' using errcode='22023'; end if;
 insert into public.paid_access_entitlements(user_id,organization_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,discount_percent,daytime_event_approved,granted_by)
 values(p_user_id,p_organization_id,p.id,p_resource_id,p_starts_at,p_ends_at,1,
 round(p.price_paise::numeric*extract(epoch from p_ends_at-p_starts_at)/3600*(100-p_discount_percent)/100),p_discount_percent,p_daytime_event_approved,auth.uid()) returning id into v_id;
 return v_id;
end; $$;
create function public.revoke_paid_access(p_entitlement_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_paid_admin();
 update public.paid_access_entitlements set revoked_at=now() where id=p_entitlement_id;
end; $$;

create function private.has_dated_access(p_user uuid,p_org uuid,p_start timestamptz,p_end timestamptz,p_kinds text[],p_resource uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.booking_policy_settings where mock_grants_enabled) and private.has_approved_basic_membership(p_user) and exists(
 select 1 from public.paid_access_entitlements e join public.booking_products p on p.id=e.product_id
 where e.revoked_at is null and e.starts_at<=p_start and e.ends_at>=p_end and p.kind=any(p_kinds)
 and (p_org is null or not (p.kind='workspace' or (p.kind='overnight' and exists(select 1 from public.resource_booking_policies rp where rp.resource_id=e.resource_id and rp.kind='workspace'))) or e.seats>=(select seat_allowance from public.organization_memberships where organization_id=p_org))
 and (p_resource is null or e.resource_id=p_resource) and
 ((p_org is null and e.user_id=p_user and e.organization_id is null) or
 (p_org is not null and e.organization_id=p_org and private.has_active_team_membership(p_user,p_org,p_start,p_end))));
$$;
create or replace function private.has_booking_access(p_user_id uuid,p_access_source text,p_organization_id uuid,p_starts_at timestamptz,p_ends_at timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select ((p_access_source='personal' and p_organization_id is null) or (p_access_source='team' and p_organization_id is not null))
 and private.has_dated_access(p_user_id,p_organization_id,p_starts_at,p_ends_at,array['workspace','cabin','overnight','event']);
$$;
create or replace function private.has_active_membership(p_user_id uuid default auth.uid(),p_at timestamptz default now())
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_booking_access(p_user_id,'personal',null,p_at,p_at+interval '1 microsecond') or exists(
 select 1 from public.organization_members m where m.user_id=p_user_id and
 private.has_booking_access(p_user_id,'team',m.organization_id,p_at,p_at+interval '1 microsecond'));
$$;
create function private.require_booking_policy_access(p_user uuid,p_resource uuid,p_start timestamptz,p_end timestamptz,p_source text,p_org uuid,p_guests integer)
returns void language plpgsql security definer set search_path='' as $$
declare r public.resources; k text; s timestamp:=p_start at time zone 'Asia/Kolkata'; e timestamp:=p_end at time zone 'Asia/Kolkata'; v_overnight boolean;
begin
 perform 1 from public.basic_onboarding_applications where user_id=p_user for share;
 select * into r from public.resources where id=p_resource for share;
 select kind into k from public.resource_booking_policies where resource_id=p_resource;
 perform 1 from public.booking_policy_settings for share;
 perform 1 from public.organization_memberships where organization_id=p_org for share;
 perform 1 from public.paid_access_entitlements where (user_id=p_user or organization_id=p_org) and revoked_at is null for share;
 if r.id is null or not r.active or not r.reservable or k is null then raise exception 'Resource booking policy is not configured' using errcode='22023'; end if;
 if p_start is null or p_end is null or p_end<=p_start or p_guests is null or p_guests<0 then raise exception 'Invalid booking interval or guests' using errcode='22023'; end if;
 if private.has_booking_access(p_user,p_source,p_org,p_start,p_end) is not true then raise exception 'Approved basic membership and dated paid access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.location_id::text,13));
 if exists(select 1 from public.booking_closures c where c.location_id=r.location_id and c.closed_on between s::date and (e-interval '1 microsecond')::date) then raise exception 'Lab is closed on a selected date' using errcode='22023'; end if;
 if k='event' then
  if p_end-p_start<interval '1 hour' or s::date<>e::date or s::time<time '08:00' or e::time>time '23:00' or p_guests+1>least(r.capacity,35) then raise exception 'Events require at least one hour and at most 35 attendees within 08:00 to 23:00' using errcode='22023'; end if;
  if not private.has_dated_access(p_user,p_org,p_start,p_end,array['event'],p_resource) then raise exception 'Event entitlement required' using errcode='42501'; end if;
  if extract(isodow from s)<6 and (s::time<time '17:00' or e::time>time '21:00') and not exists(
   select 1 from public.paid_access_entitlements x join public.booking_products bp on bp.id=x.product_id
   where x.resource_id=p_resource and bp.kind='event' and x.revoked_at is null and x.starts_at<=p_start and x.ends_at>=p_end
   and x.daytime_event_approved and ((p_org is null and x.user_id=p_user) or x.organization_id=p_org)) then raise exception 'Weekday daytime events require Admin approval' using errcode='42501'; end if;
 else
  v_overnight:=(s::time>=time '23:00' and e::date=s::date+1 and e::time<=time '08:00') or (s::time<time '08:00' and e::date=s::date and e::time<=time '08:00');
  if v_overnight then
   if not exists(select 1 from public.basic_onboarding_applications where user_id=p_user and date_of_birth<=(s::date-interval '18 years')::date)
    or not private.has_dated_access(p_user,p_org,p_start,p_end,array['overnight']) then raise exception 'Adults-only overnight entitlement required' using errcode='42501'; end if;
  elsif s::date<>e::date or s::time<time '09:00' or e::time>time '17:00' then raise exception 'Standard paid access is 09:00 to 17:00' using errcode='22023'; end if;
  if k='equipment' then
   if not private.has_dated_access(p_user,p_org,p_start,p_end,array['workspace','cabin','overnight']) or not private.has_dated_access(p_user,p_org,p_start,p_end,array['equipment'],p_resource) then raise exception 'Equipment is an in-lab add-on to workspace or cabin access' using errcode='42501'; end if;
   if not exists(select 1 from public.paid_access_entitlements x join public.booking_products bp on bp.id=x.product_id join public.resources wr on wr.id=x.resource_id where bp.kind in ('workspace','cabin','overnight') and wr.location_id=r.location_id and x.revoked_at is null and x.starts_at<=p_start and x.ends_at>=p_end and ((p_org is null and x.user_id=p_user) or x.organization_id=p_org)) then raise exception 'Workspace access must be at the same lab as equipment' using errcode='42501'; end if;
   if p_guests<>0 then raise exception 'Equipment access does not include guests' using errcode='22023'; end if;
  elsif k='cabin' then
   if not exists(select 1 from public.paid_access_entitlements x join public.booking_products bp on bp.id=x.product_id
    where x.resource_id=p_resource and bp.kind in ('cabin','overnight') and x.seats=r.capacity and x.revoked_at is null
    and x.starts_at<=p_start and x.ends_at>=p_end and ((p_org is null and x.user_id=p_user) or x.organization_id=p_org)) then raise exception 'Full cabin seat entitlement required' using errcode='42501'; end if;
   if p_guests>floor(r.capacity/2.0) then raise exception 'Cabin guests are limited to half the seats' using errcode='22023'; end if;
  elsif not private.has_dated_access(p_user,p_org,p_start,p_end,array['workspace','cabin','overnight'],p_resource) then raise exception 'Workspace entitlement required' using errcode='42501'; end if;
 end if;
 if k='workspace' and (p_guests>r.max_guests or p_guests+1>r.capacity or (p_guests>0 and not r.guests_allowed)) then raise exception 'Guest count exceeds resource policy' using errcode='22023'; end if;
 if s::date=e::date then
  if not private.within_resource_hours(p_resource,p_start,p_end) then raise exception 'Booking falls outside configured resource hours' using errcode='22023'; end if;
 else
  if not private.within_resource_hours(p_resource,p_start,(s::date+time '23:59:59.999999') at time zone 'Asia/Kolkata') or not private.within_resource_hours(p_resource,e::date::timestamp at time zone 'Asia/Kolkata',p_end) then raise exception 'Booking falls outside configured resource hours' using errcode='22023'; end if;
 end if;
 if exists(select 1 from public.resource_reservations rr where rr.resource_id=p_resource and rr.kind='block' and rr.released_at is null and rr.period && tstzrange(p_start,p_end,'[)')) then raise exception 'Resource is unavailable for maintenance' using errcode='22023'; end if;
 if not private.has_valid_resource_certifications(p_user,p_resource,p_start,p_end) then raise exception 'Required certification is missing or expired' using errcode='42501'; end if;
end; $$;
create or replace function private.validate_booking_request_with_access(p_user_id uuid,p_resource_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_guest_count integer,p_access_source text,p_organization_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.resources; mins numeric;
begin
 perform private.require_booking_policy_access(p_user_id,p_resource_id,p_starts_at,p_ends_at,p_access_source,p_organization_id,p_guest_count);
 select * into r from public.resources where id=p_resource_id;
 mins:=extract(epoch from p_ends_at-p_starts_at)/60;
 if p_starts_at<=now() or p_starts_at>now()+make_interval(days=>r.booking_horizon_days) then raise exception 'Booking is outside the future booking horizon' using errcode='22023'; end if;
 if mins>r.max_duration_minutes or mod(mins,r.increment_minutes)<>0 or mod(extract(epoch from p_starts_at)/60,r.increment_minutes)<>0 then raise exception 'Booking violates configured duration or increments' using errcode='22023'; end if;
end; $$;
create or replace function private.validate_booking_request(p_user_id uuid,p_resource_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_guest_count integer)
returns void language sql security definer set search_path='' as $$
 select private.validate_booking_request_with_access(p_user_id,p_resource_id,p_starts_at,p_ends_at,p_guest_count,'personal',null);
$$;
create function private.event_reservation_buffer() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
 if new.booking_id is not null and exists(select 1 from public.resource_booking_policies where resource_id=new.resource_id and kind='event') then
  select * into b from public.bookings where id=new.booking_id;
  new.starts_at:=b.starts_at-interval '20 minutes'; new.ends_at:=b.ends_at+interval '20 minutes';
 end if;
 return new;
end; $$;
create trigger event_reservation_buffer before insert or update of starts_at,ends_at on public.resource_reservations for each row execute function private.event_reservation_buffer();
-- Both intent creation and intent redemption reach these tables; safe checkout is not gated.
create function private.check_booking_policy_on_entry() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
 if tg_table_name='checkin_intents' then
  if new.action<>'check_in' then return new; end if;
 end if;
 select * into b from public.bookings where id=new.booking_id;
 if b.id is null then raise exception 'Booking required' using errcode='42501'; end if;
 perform private.require_booking_policy_access(b.member_id,b.resource_id,b.starts_at,b.ends_at,b.access_source,b.organization_id,
 (select count(*)::integer from public.booking_guests where booking_id=b.id));
 return new;
end; $$;
create trigger check_intent_policy before insert on public.checkin_intents for each row execute function private.check_booking_policy_on_entry();
create trigger check_attendance_policy before insert on public.attendance_sessions for each row execute function private.check_booking_policy_on_entry();

alter table public.booking_products enable row level security;
alter table public.resource_booking_policies enable row level security;
alter table public.booking_closures enable row level security;
alter table public.booking_policy_settings enable row level security;
alter table public.paid_access_entitlements enable row level security;
create policy products_read on public.booking_products for select to authenticated using(true);
create policy resource_policy_read on public.resource_booking_policies for select to authenticated using(true);
create policy closure_read on public.booking_closures for select to authenticated using(true);
create policy entitlement_read on public.paid_access_entitlements for select to authenticated using(user_id=auth.uid() or private.is_staff(array['admin','super_admin']::public.staff_role[]) or private.is_team_admin(organization_id));
revoke all on public.booking_products,public.resource_booking_policies,public.booking_closures,public.booking_policy_settings,public.paid_access_entitlements from public,anon,authenticated;
grant select on public.booking_products,public.resource_booking_policies,public.booking_closures,public.paid_access_entitlements to authenticated;
grant all on public.booking_products,public.resource_booking_policies,public.booking_closures,public.booking_policy_settings,public.paid_access_entitlements to service_role;
revoke all on function private.require_paid_admin(),private.pass_dates(text,date[]),private.require_mock_grant(uuid,uuid),private.has_dated_access(uuid,uuid,timestamptz,timestamptz,text[],uuid),private.require_booking_policy_access(uuid,uuid,timestamptz,timestamptz,text,uuid,integer),private.event_reservation_buffer(),private.check_booking_policy_on_entry() from public,anon,authenticated;
revoke all on function public.configure_booking_product(uuid,bigint,boolean),public.configure_resource_booking_policy(uuid,text),public.set_booking_closure(uuid,date,text,boolean),public.quote_access_pass(uuid,date[],integer,uuid,integer),public.grant_mock_access(uuid,uuid,uuid,date[],integer,integer,uuid),public.grant_mock_resource_access(uuid,uuid,uuid,timestamptz,timestamptz,uuid,integer,boolean),public.revoke_paid_access(uuid) from public,anon;
grant execute on function public.configure_booking_product(uuid,bigint,boolean),public.configure_resource_booking_policy(uuid,text),public.set_booking_closure(uuid,date,text,boolean),public.quote_access_pass(uuid,date[],integer,uuid,integer),public.grant_mock_access(uuid,uuid,uuid,date[],integer,integer,uuid),public.grant_mock_resource_access(uuid,uuid,uuid,timestamptz,timestamptz,uuid,integer,boolean),public.revoke_paid_access(uuid) to authenticated;

create function private.require_paid_activation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='active' and not exists(select 1 from public.booking_policy_settings where mock_grants_enabled) then
 raise exception 'Paid activation remains on hold' using errcode='42501'; end if;
 return new;
end; $$;
create trigger team_paid_activation before insert or update on public.organization_memberships for each row execute function private.require_paid_activation();
create trigger personal_paid_activation before insert or update on public.memberships for each row execute function private.require_paid_activation();
alter table public.booking_guests add column visit_starts_at timestamptz, add column visit_ends_at timestamptz;
create function private.cabin_guest_window() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings; cap integer;
begin
 select * into b from public.bookings where id=new.booking_id for update;
 if exists(select 1 from public.resource_booking_policies where resource_id=b.resource_id and kind='cabin') then
  select capacity into cap from public.resources where id=b.resource_id;
  if (select count(*) from public.booking_guests where booking_id=b.id and id<>new.id)>=floor(cap/2.0) then raise exception 'Cabin guest limit exceeded' using errcode='22023'; end if;
  new.visit_starts_at:=coalesce(new.visit_starts_at,b.starts_at);
  new.visit_ends_at:=coalesce(new.visit_ends_at,least(b.ends_at,new.visit_starts_at+interval '3 hours'));
  if new.visit_starts_at<b.starts_at or new.visit_ends_at>b.ends_at or new.visit_ends_at<=new.visit_starts_at or new.visit_ends_at-new.visit_starts_at>interval '3 hours' then raise exception 'Guest visit must fit cabin booking and last at most three hours' using errcode='22023'; end if;
 end if;
 return new;
end; $$;
create trigger cabin_guest_window before insert or update on public.booking_guests for each row execute function private.cabin_guest_window();
revoke all on function private.require_paid_activation(),private.cabin_guest_window() from public,anon,authenticated;

create table public.access_renewal_preferences (
 user_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.booking_products(id), resource_id uuid not null references public.resources(id),
 enabled boolean not null default false, updated_at timestamptz not null default now(), primary key(user_id,product_id,resource_id)
);
alter table public.access_renewal_preferences enable row level security;
create policy renewal_preference_owner on public.access_renewal_preferences for select to authenticated using(user_id=auth.uid());
revoke all on public.access_renewal_preferences from public,anon,authenticated;
grant select on public.access_renewal_preferences to authenticated;
create function public.set_access_renewal(p_entitlement_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare e public.paid_access_entitlements;
begin
 select x.* into e from public.paid_access_entitlements x join public.booking_products p on p.id=x.product_id
 where x.id=p_entitlement_id and x.user_id=auth.uid() and p.unit in ('week','month') and x.revoked_at is null;
 if e.id is null or p_enabled is null or (p_enabled and not private.has_approved_basic_membership(auth.uid())) then raise exception 'Own week or month pass required' using errcode='42501'; end if;
 insert into public.access_renewal_preferences(user_id,product_id,resource_id,enabled) values(auth.uid(),e.product_id,e.resource_id,p_enabled)
 on conflict(user_id,product_id,resource_id) do update set enabled=excluded.enabled,updated_at=now();
end; $$;
revoke all on function public.set_access_renewal(uuid,boolean) from public,anon;
grant execute on function public.set_access_renewal(uuid,boolean) to authenticated;

-- Booking mutations go through the validated, audited security-definer RPCs.
revoke insert,update,delete on public.bookings,public.booking_guests,public.resource_reservations from authenticated,anon;
create function private.reschedule_cabin_guests() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.resource_booking_policies where resource_id=new.resource_id and kind='cabin') then
  update public.booking_guests set visit_starts_at=new.starts_at,visit_ends_at=least(new.ends_at,new.starts_at+interval '3 hours') where booking_id=new.id;
 end if;
 return new;
end; $$;
create trigger reschedule_cabin_guests after update of starts_at,ends_at on public.bookings for each row execute function private.reschedule_cabin_guests();
revoke all on function private.reschedule_cabin_guests() from public,anon,authenticated;
