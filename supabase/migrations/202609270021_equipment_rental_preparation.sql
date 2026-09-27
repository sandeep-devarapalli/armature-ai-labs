-- Preparation only. No physical stock, prices or payment activation are seeded.
create table public.equipment_rental_settings(singleton boolean primary key default true check(singleton), mock_payments_enabled boolean not null default false);
insert into public.equipment_rental_settings default values;
create table public.equipment_rental_units(
 id uuid primary key default extensions.gen_random_uuid(), asset_unit_id uuid not null unique references public.asset_units(id),
 resource_id uuid not null unique references public.resources(id), commissioned boolean not null default false,
 commissioned_by uuid references auth.users(id), commissioned_at timestamptz, reason text not null);
create table public.equipment_rental_rates(
 id uuid primary key default extensions.gen_random_uuid(), unit_id uuid not null references public.equipment_rental_units(id),
 charge_unit text not null check(charge_unit in ('hour','day')), tax_bps integer check(tax_bps between 0 and 10000), price_paise bigint not null check(price_paise>0),
 valid_from timestamptz not null, valid_until timestamptz, approved_by uuid not null references auth.users(id),
 approved_at timestamptz not null default now(), check(valid_until is null or valid_until>valid_from), exclude using gist(unit_id with =,charge_unit with =,tstzrange(valid_from,valid_until,'[)') with &&));
create table public.equipment_rental_quotes(
 id uuid primary key default extensions.gen_random_uuid(), user_id uuid not null references auth.users(id),
 operator_id uuid not null references auth.users(id), organization_id uuid references public.organizations(id), rate_id uuid not null references public.equipment_rental_rates(id), starts_at timestamptz not null, ends_at timestamptz not null,
 dates date[] not null, amount_paise bigint not null check(amount_paise>0),
 tax_paise bigint not null check(tax_paise>=0), total_paise bigint not null check(total_paise>0), expires_at timestamptz not null default(now()+interval '15 minutes'), parent_order_id uuid,
 payment_state text not null default 'unpaid' check(payment_state in ('unpaid','authorized','captured')),
 authorized_by uuid references auth.users(id), captured_at timestamptz, created_at timestamptz not null default now(),check(ends_at>starts_at));
create table public.equipment_rental_orders(
 id uuid primary key default extensions.gen_random_uuid(), quote_id uuid not null unique references public.equipment_rental_quotes(id),
 booking_id uuid not null unique references public.bookings(id), entitlement_id uuid not null references public.paid_access_entitlements(id),
 workspace_booking_ids uuid[] not null check(cardinality(workspace_booking_ids)>0), parent_order_id uuid unique references public.equipment_rental_orders(id),
 created_at timestamptz not null default now());
alter table public.equipment_rental_quotes add foreign key(parent_order_id) references public.equipment_rental_orders(id);
create table public.equipment_rental_faults(
 id uuid primary key default extensions.gen_random_uuid(), order_id uuid not null references public.equipment_rental_orders(id),
 starts_at timestamptz not null, ends_at timestamptz not null, reason text not null check(length(trim(reason)) between 2 and 1000),
 refund_due_paise bigint not null check(refund_due_paise>0), processed_at timestamptz,
 recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 check(ends_at>starts_at), exclude using gist(order_id with =,tstzrange(starts_at,ends_at,'[)') with &&));
create index rental_rates_lookup on public.equipment_rental_rates(unit_id,valid_from);
create index rental_quotes_owner on public.equipment_rental_quotes(user_id,created_at desc);
create table private.equipment_rental_writes(transaction_id bigint not null, resource_id uuid not null,primary key(transaction_id,resource_id));
revoke all on private.equipment_rental_writes from public,anon,authenticated;
DO $$ declare n text; begin
 foreach n in array array['equipment_rental_settings','equipment_rental_units','equipment_rental_rates','equipment_rental_quotes','equipment_rental_orders','equipment_rental_faults'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant select on public.%I to authenticated',n);
 execute format('grant all on public.%I to service_role',n);
 end loop;
end $$;
create policy rental_settings_read on public.equipment_rental_settings for select to authenticated using(true);
create policy rental_units_read on public.equipment_rental_units for select to authenticated using(private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy rental_rates_read on public.equipment_rental_rates for select to authenticated using(private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy rental_quotes_read on public.equipment_rental_quotes for select to authenticated using(user_id=auth.uid() or private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy rental_orders_read on public.equipment_rental_orders for select to authenticated using(exists(select 1 from public.equipment_rental_quotes q where q.id=quote_id));
create policy rental_faults_read on public.equipment_rental_faults for select to authenticated using(exists(select 1 from public.equipment_rental_orders o where o.id=order_id));
create function private.require_rental_mock() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.equipment_rental_settings where mock_payments_enabled for share;
 if not found then raise exception 'Equipment rental preparation is disabled' using errcode='42501'; end if;
 perform 1 from public.booking_policy_settings where mock_grants_enabled for share;
 if not found then raise exception 'Paid access preparation is disabled' using errcode='42501'; end if;
end; $$;
create function public.configure_equipment_rental_unit(p_asset_unit_id uuid,p_resource_id uuid,p_commissioned boolean,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin();
 if p_commissioned is null or p_reason is null or length(trim(p_reason)) not between 2 and 1000 then raise exception 'Commissioning state and reason required' using errcode='22023'; end if;
 if not exists(select 1 from public.resources r join public.resource_booking_policies p on p.resource_id=r.id where r.id=p_resource_id and p.kind='equipment' and r.capacity=1) then raise exception 'Single-unit equipment resource required' using errcode='22023'; end if;
 perform 1 from public.asset_units a join public.inventory_locations l on l.id=a.inventory_location_id join public.resources r on r.id=p_resource_id where a.id=p_asset_unit_id and l.lab_location_id=r.location_id and (not p_commissioned or a.status='available') for share of a;
 if not found then raise exception 'Available physical asset required' using errcode='22023'; end if;
 insert into public.equipment_rental_units(asset_unit_id,resource_id,commissioned,commissioned_by,commissioned_at,reason)
 values(p_asset_unit_id,p_resource_id,p_commissioned,auth.uid(),now(),trim(p_reason))
 on conflict(asset_unit_id) do update set commissioned=excluded.commissioned,commissioned_by=excluded.commissioned_by,commissioned_at=excluded.commissioned_at,reason=excluded.reason
 where equipment_rental_units.resource_id=excluded.resource_id returning id into uid;
 if uid is null then raise exception 'Asset resource mapping is immutable' using errcode='22023'; end if;
 perform private.record_audit(auth.uid(),'staff','equipment_rental.commissioned','rental_unit',uid,null,jsonb_build_object('commissioned',p_commissioned),trim(p_reason)); return uid;
end; $$;
create function public.approve_equipment_rental_rate(p_unit_id uuid,p_charge_unit text,p_price_paise bigint,p_valid_from timestamptz,p_valid_until timestamptz default null,p_tax_bps integer default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin();
 insert into public.equipment_rental_rates(unit_id,charge_unit,price_paise,valid_from,valid_until,approved_by,tax_bps) values(p_unit_id,p_charge_unit,p_price_paise,p_valid_from,p_valid_until,auth.uid(),p_tax_bps) returning id into rid;
 perform private.record_audit(auth.uid(),'staff','equipment_rental.rate_approved','rental_rate',rid,null,jsonb_build_object('price_paise',p_price_paise,'charge_unit',p_charge_unit)); return rid;
end; $$;
create function public.create_equipment_rental_quote(p_rate_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_dates date[] default null,p_parent_order_id uuid default null,p_operator_id uuid default null,p_organization_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.equipment_rental_rates; u public.equipment_rental_units; ds date[]; s timestamptz:=p_starts_at; e timestamptz:=p_ends_at; amount bigint; qid uuid; v_operator_id uuid:=coalesce(p_operator_id,auth.uid());
begin
 perform private.require_rental_mock();
 perform 1 from public.basic_onboarding_applications where user_id=auth.uid() for share;
 if private.has_approved_basic_membership(auth.uid()) is not true then raise exception 'Approved basic membership required' using errcode='42501'; end if;
 if v_operator_id<>auth.uid() and (p_organization_id is null or not private.is_team_admin(p_organization_id)) then raise exception 'Team admin required to book for another operator' using errcode='42501'; end if;
 if private.has_approved_basic_membership(v_operator_id) is not true then raise exception 'Operator must have approved basic membership' using errcode='42501'; end if;
 select * into r from public.equipment_rental_rates where id=p_rate_id;
 select * into u from public.equipment_rental_units where id=r.unit_id and commissioned for share;
 if u.id is null or not exists(select 1 from public.asset_units where id=u.asset_unit_id and status='available') then raise exception 'Commissioned available unit required' using errcode='22023'; end if;
 if r.charge_unit='day' then
  if cardinality(p_dates) is null or cardinality(p_dates) not between 1 and 31 or array_position(p_dates,null) is not null then raise exception 'Select 1 to 31 consecutive rental dates' using errcode='22023'; end if;
  select array_agg(distinct d order by d) into ds from unnest(p_dates)d;
  if ds[cardinality(ds)]-ds[1]+1<>cardinality(ds) then raise exception 'Daily unit retention requires consecutive dates' using errcode='22023'; end if;
  s:=(ds[1]+time '09:00') at time zone 'Asia/Kolkata'; e:=(ds[cardinality(ds)]+time '17:00') at time zone 'Asia/Kolkata'; amount:=r.price_paise*cardinality(ds);
 else
  if s is null or e is null or e-s<interval '1 hour' or mod(extract(epoch from e-s),1800)<>0 or mod(extract(epoch from s),1800)<>0 or (s at time zone 'Asia/Kolkata')::date<>(e at time zone 'Asia/Kolkata')::date then raise exception 'Hourly rentals require at least 60 minutes in 30-minute increments' using errcode='22023'; end if;
  ds:=array[(s at time zone 'Asia/Kolkata')::date]; amount:=ceil(r.price_paise::numeric*extract(epoch from e-s)/3600);
 end if;
 if r.tax_bps is null then raise exception 'Approved tax configuration required' using errcode='22023'; end if;
 if s<=now() or r.valid_from>now() or r.valid_from>s or (r.valid_until is not null and (r.valid_until<=now() or e>r.valid_until)) then raise exception 'Rate is not valid for selected dates' using errcode='22023'; end if;
 if p_parent_order_id is not null and not exists(select 1 from public.equipment_rental_orders o join public.equipment_rental_quotes q on q.id=o.quote_id join public.equipment_rental_rates pr on pr.id=q.rate_id join public.bookings b on b.id=o.booking_id where o.id=p_parent_order_id and q.user_id=auth.uid() and q.operator_id=v_operator_id and q.organization_id is not distinct from p_organization_id and pr.unit_id=u.id and b.status ='confirmed' and ((r.charge_unit='hour' and q.ends_at=s) or (r.charge_unit='day' and pr.charge_unit='day' and (q.ends_at at time zone 'Asia/Kolkata')::date+1=ds[1]))) then raise exception 'Extension must follow your existing unit reservation' using errcode='22023'; end if;
 insert into public.equipment_rental_quotes(user_id,operator_id,organization_id,rate_id,starts_at,ends_at,dates,amount_paise,tax_paise,total_paise,parent_order_id) values(auth.uid(),v_operator_id,p_organization_id,r.id,s,e,ds,amount,round(amount::numeric*r.tax_bps/10000),amount+round(amount::numeric*r.tax_bps/10000),p_parent_order_id) returning id into qid; return qid;
end; $$;
create function public.authorize_mock_equipment_payment(p_quote_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin(); perform private.require_rental_mock();
 update public.equipment_rental_quotes set payment_state='authorized',authorized_by=auth.uid() where id=p_quote_id and payment_state='unpaid' and expires_at>now();
 if not found then raise exception 'Unpaid current quote required' using errcode='22023'; end if;
 perform private.record_audit(auth.uid(),'staff','equipment_rental.mock_authorized','rental_quote',p_quote_id,null,jsonb_build_object('provider','local_mock'));
end; $$;
create function public.reserve_equipment_rental(p_quote_id uuid,p_workspace_booking_ids uuid[] default null,p_workspace_resource_id uuid default null,p_workspace_product_id uuid default null,p_workspace_dates date[] default null,p_organization_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare q public.equipment_rental_quotes; r public.equipment_rental_rates; u public.equipment_rental_units; res public.resources; ds date; s timestamptz; e timestamptz; ws uuid[]:=p_workspace_booking_ids; used_ws uuid[]:='{}'; wid uuid; booking_start timestamptz; eid uuid; bid uuid; oid uuid; pid uuid; source text:=case when p_organization_id is null then 'personal' else 'team' end;
begin
 perform private.require_rental_mock();
 perform 1 from public.organization_memberships where organization_id=p_organization_id for share;
 select * into q from public.equipment_rental_quotes where id=p_quote_id and user_id=auth.uid() for update;
 if q.id is null then raise exception 'Own rental quote required' using errcode='42501'; end if;
 select id into oid from public.equipment_rental_orders where quote_id=q.id;
 if found then return oid; end if;
 perform 1 from public.basic_onboarding_applications where user_id in(auth.uid(),q.operator_id) order by user_id for share;
 if private.has_approved_basic_membership(auth.uid()) is not true then raise exception 'Payer must retain approved basic membership' using errcode='42501'; end if;
 if q.organization_id is distinct from p_organization_id or (q.operator_id<>auth.uid() and (p_organization_id is null or not private.is_team_admin(p_organization_id))) then raise exception 'Quote team and operator authority changed' using errcode='42501'; end if;
 if q.payment_state<>'authorized' or q.expires_at<=now() then raise exception 'Current mock payment authorization required' using errcode='42501'; end if;
 select * into r from public.equipment_rental_rates where id=q.rate_id;
 select * into u from public.equipment_rental_units where id=r.unit_id for share;
 select * into res from public.resources where id=u.resource_id for share;
 perform 1 from public.asset_units where id=u.asset_unit_id and status='available' for share;
 if not found or not u.commissioned or not res.active or not res.reservable or r.valid_from>now() or (r.valid_until is not null and (r.valid_until<=now() or q.ends_at>r.valid_until)) then raise exception 'Unit or approved rate is no longer available' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(res.location_id::text,13));
 if q.parent_order_id is not null then
  perform 1 from public.equipment_rental_orders o join public.bookings b on b.id=o.booking_id where o.id=q.parent_order_id and b.status ='confirmed' for update of o;
  if not found then raise exception 'Original reservation is no longer active' using errcode='22023'; end if;
 end if;
 if coalesce(cardinality(ws),0)=0 then
  if p_workspace_resource_id is null or p_workspace_product_id is null then raise exception 'Select paid workspace coverage or a workspace pass reservation' using errcode='22023'; end if;
  ws:=public.reserve_workspace_pass(p_workspace_resource_id,p_workspace_product_id,p_workspace_dates,p_organization_id);
 elsif p_workspace_resource_id is not null or p_workspace_product_id is not null then raise exception 'Choose existing or combined workspace, not both' using errcode='22023'; end if;
 if cardinality(ws)>31 or array_position(ws,null) is not null then raise exception 'Select at most 31 workspace reservations' using errcode='22023'; end if;
 perform 1 from public.bookings where id=any(ws) order by id for update;
 if exists(select 1 from unnest(ws) selected(id) left join public.bookings b on b.id=selected.id left join public.resources wr on wr.id=b.resource_id left join public.resource_booking_policies wp on wp.resource_id=wr.id where b.id is null or b.status<>'confirmed' or wr.location_id<>res.location_id or wp.kind not in ('workspace','cabin') or wp.kind is null or (p_organization_id is null and (b.member_id<>auth.uid() or b.organization_id is not null)) or (p_organization_id is not null and b.organization_id is distinct from p_organization_id)) then raise exception 'Workspace selections must belong to this member or team at this lab' using errcode='42501'; end if;
 select id into pid from public.booking_products where kind='equipment' and unit=r.charge_unit and enabled limit 1;
 if pid is null then raise exception 'Equipment booking product is disabled' using errcode='42501'; end if;
 insert into public.paid_access_entitlements(user_id,organization_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,granted_by)
 values(case when p_organization_id is null then q.operator_id end,p_organization_id,pid,res.id,q.starts_at,q.ends_at,1,q.total_paise,q.authorized_by) returning id into eid;
 foreach ds in array q.dates loop
  s:=case when r.charge_unit='hour' then q.starts_at else (ds+time '09:00') at time zone 'Asia/Kolkata' end;
  e:=case when r.charge_unit='hour' then q.ends_at else (ds+time '17:00') at time zone 'Asia/Kolkata' end;
  select b.id into wid from public.bookings b join public.resources wr on wr.id=b.resource_id join public.resource_booking_policies wp on wp.resource_id=wr.id
  where b.id=any(ws) and b.status ='confirmed' and b.starts_at<=s and b.ends_at>=e and wr.location_id=res.location_id and wp.kind in ('workspace','cabin')
  and ((p_organization_id is null and b.member_id=auth.uid() and b.organization_id is null) or (p_organization_id is not null and b.organization_id=p_organization_id and private.has_active_team_membership(q.operator_id,p_organization_id,s,e)))
  and private.has_dated_access(q.operator_id,p_organization_id,s,e,array['workspace','cabin'],wr.id) limit 1;
  if wid is null then raise exception 'Same-lab paid workspace reservation must cover every use date' using errcode='42501'; end if;
  used_ws:=array_append(used_ws,wid);
  perform private.validate_booking_request_with_access(q.operator_id,res.id,s,e,0,source,p_organization_id);
 end loop;
 booking_start:=q.starts_at;
 if q.parent_order_id is not null and r.charge_unit='day' then select pq.ends_at into booking_start from public.equipment_rental_orders po join public.equipment_rental_quotes pq on pq.id=po.quote_id where po.id=q.parent_order_id; end if;
 -- Physical retention occupies the full period, including overnight storage.
 insert into private.equipment_rental_writes values(txid_current(),res.id);
 insert into public.bookings(resource_id,member_id,starts_at,ends_at,access_source,organization_id) values(res.id,q.operator_id,booking_start,q.ends_at,source,p_organization_id) returning id into bid;
 insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at) values(res.id,'booking',bid,booking_start,q.ends_at);
 insert into public.equipment_rental_orders(quote_id,booking_id,entitlement_id,workspace_booking_ids,parent_order_id) values(q.id,bid,eid,used_ws,q.parent_order_id) returning id into oid;
 delete from private.equipment_rental_writes where transaction_id=txid_current() and resource_id=res.id;
 update public.equipment_rental_quotes set payment_state='captured',captured_at=now() where id=q.id;
 perform private.record_audit(auth.uid(),'member','equipment_rental.mock_captured','rental_order',oid,null,jsonb_build_object('quote_id',q.id,'booking_id',bid,'total_paise',q.total_paise,'provider','local_mock'));
 return oid;
end; $$;
create function private.guard_equipment_rental_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and exists(select 1 from public.equipment_rental_orders where booking_id=old.id) and (new.resource_id,new.member_id,new.starts_at,new.ends_at,new.organization_id,new.access_source) is distinct from (old.resource_id,old.member_id,old.starts_at,old.ends_at,old.organization_id,old.access_source) then raise exception 'Use a separately quoted equipment extension' using errcode='42501'; end if;
 if (tg_op='INSERT' or (tg_op='UPDATE' and ((new.resource_id,new.starts_at,new.ends_at,new.member_id,new.organization_id,new.access_source) is distinct from (old.resource_id,old.starts_at,old.ends_at,old.member_id,old.organization_id,old.access_source) or (old.status<>'confirmed' and new.status='confirmed')))) and exists(select 1 from public.equipment_rental_units where resource_id=new.resource_id) and not exists(select 1 from private.equipment_rental_writes where transaction_id=txid_current() and resource_id=new.resource_id) then raise exception 'Use the equipment rental transaction' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.status <>'confirmed' or (new.starts_at,new.ends_at,new.resource_id,new.member_id,new.organization_id) is distinct from (old.starts_at,old.ends_at,old.resource_id,old.member_id,old.organization_id)) and exists(select 1 from public.equipment_rental_orders o join public.bookings b on b.id=o.booking_id where old.id=any(o.workspace_booking_ids) and b.status ='confirmed') then raise exception 'Resolve dependent equipment reservations before changing workspace' using errcode='42501'; end if;
 return new;
end; $$;
create trigger guard_equipment_rental_booking before insert or update on public.bookings for each row execute function private.guard_equipment_rental_booking();
create function public.record_equipment_rental_fault(p_order_id uuid,p_starts_at timestamptz,p_ends_at timestamptz,p_refund_due_paise bigint,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.equipment_rental_orders; q public.equipment_rental_quotes; u public.equipment_rental_units; fid uuid; due bigint;
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin(); perform private.require_rental_mock();
 select * into o from public.equipment_rental_orders where id=p_order_id for update;
 select * into q from public.equipment_rental_quotes where id=o.quote_id;
 select units.* into u from public.equipment_rental_units units join public.equipment_rental_rates rates on rates.unit_id=units.id where rates.id=q.rate_id;
 select coalesce(sum(refund_due_paise),0) into due from public.equipment_rental_faults where order_id=o.id;
 if q.id is null or q.payment_state<>'captured' or p_starts_at is null or p_ends_at is null or p_starts_at<q.starts_at or p_ends_at>q.ends_at or p_refund_due_paise is null or p_refund_due_paise<=0 or due+p_refund_due_paise>q.total_paise then raise exception 'Fault refund must fit the captured reservation and amount' using errcode='22023'; end if;
 insert into public.equipment_rental_faults(order_id,starts_at,ends_at,reason,refund_due_paise,recorded_by) values(o.id,p_starts_at,p_ends_at,trim(p_reason),p_refund_due_paise,auth.uid()) returning id into fid;
 update public.equipment_rental_units set commissioned=false,reason=trim(p_reason) where id=u.id;
 perform private.record_audit(auth.uid(),'staff','equipment_rental.fault','rental_order',o.id,null,jsonb_build_object('fault_id',fid,'refund_due_paise',p_refund_due_paise),trim(p_reason)); return fid;
end; $$;
create function public.get_equipment_rental_options() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if private.has_approved_basic_membership(auth.uid()) is not true then raise exception 'Approved basic membership required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('component_slug',c.slug,'unit_id',u.id,'resource_id',u.resource_id,'name',res.name,'rate_id',r.id,'charge_unit',r.charge_unit,'price_paise',r.price_paise,'tax_bps',r.tax_bps,'valid_until',r.valid_until)) from public.equipment_rental_units u join public.resources res on res.id=u.resource_id join public.asset_units a on a.id=u.asset_unit_id join public.components c on c.id=a.component_id join public.equipment_rental_rates r on r.unit_id=u.id where u.commissioned and a.status='available' and res.active and res.reservable and r.tax_bps is not null and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())),'[]'::jsonb);
end; $$;
revoke all on function private.require_rental_mock(),private.guard_equipment_rental_booking() from public,anon,authenticated;
revoke all on function public.configure_equipment_rental_unit(uuid,uuid,boolean,text),public.approve_equipment_rental_rate(uuid,text,bigint,timestamptz,timestamptz,integer),public.create_equipment_rental_quote(uuid,timestamptz,timestamptz,date[],uuid,uuid,uuid),public.authorize_mock_equipment_payment(uuid),public.reserve_equipment_rental(uuid,uuid[],uuid,uuid,date[],uuid),public.record_equipment_rental_fault(uuid,timestamptz,timestamptz,bigint,text),public.get_equipment_rental_options() from public,anon;
grant execute on function public.configure_equipment_rental_unit(uuid,uuid,boolean,text),public.approve_equipment_rental_rate(uuid,text,bigint,timestamptz,timestamptz,integer),public.create_equipment_rental_quote(uuid,timestamptz,timestamptz,date[],uuid,uuid,uuid),public.authorize_mock_equipment_payment(uuid),public.reserve_equipment_rental(uuid,uuid[],uuid,uuid,date[],uuid),public.record_equipment_rental_fault(uuid,timestamptz,timestamptz,bigint,text),public.get_equipment_rental_options() to authenticated;
create function public.get_equipment_workspace_coverage(p_organization_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.has_approved_basic_membership(auth.uid()) is not true then raise exception 'Approved basic membership required' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'resource_id',b.resource_id,'name',r.name,'starts_at',b.starts_at,'ends_at',b.ends_at,'organization_id',b.organization_id))
 from public.bookings b join public.resources r on r.id=b.resource_id join public.resource_booking_policies p on p.resource_id=r.id
 where b.status='confirmed' and b.ends_at>now() and p.kind in ('workspace','cabin') and
 ((p_organization_id is null and b.organization_id is null and b.member_id=auth.uid()) or
 (p_organization_id is not null and b.organization_id=p_organization_id and (private.has_active_team_membership(auth.uid(),p_organization_id,b.starts_at,b.ends_at) or (private.is_team_admin(p_organization_id) and exists(select 1 from public.organization_memberships m where m.organization_id=p_organization_id and m.status='active' and m.starts_at<=b.starts_at and m.ends_at>=b.ends_at)))))),'[]'::jsonb);
end; $$;
revoke all on function public.get_equipment_workspace_coverage(uuid) from public,anon;
grant execute on function public.get_equipment_workspace_coverage(uuid) to authenticated;
create function public.get_equipment_rental_extensions(p_unit_id uuid,p_operator_id uuid default null,p_organization_id uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'ends_at',q.ends_at)),'[]'::jsonb)
 from public.equipment_rental_orders o join public.equipment_rental_quotes q on q.id=o.quote_id
 join public.equipment_rental_rates r on r.id=q.rate_id join public.bookings b on b.id=o.booking_id
 where q.user_id=auth.uid() and q.operator_id=coalesce(p_operator_id,auth.uid()) and q.organization_id is not distinct from p_organization_id
 and r.unit_id=p_unit_id and b.status='confirmed' and q.ends_at>now()
 and not exists(select 1 from public.equipment_rental_orders child where child.parent_order_id=o.id)
 and private.has_approved_basic_membership(auth.uid());
$$;
revoke all on function public.get_equipment_rental_extensions(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_equipment_rental_extensions(uuid,uuid,uuid) to authenticated;
create function private.guard_equipment_rental_reservation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (exists(select 1 from public.equipment_rental_units where resource_id=new.resource_id) or (TG_OP='UPDATE' and exists(select 1 from public.equipment_rental_units where resource_id=old.resource_id))) and new.booking_id is not null then
  if not exists(select 1 from public.bookings b where b.id=new.booking_id and b.resource_id=new.resource_id and b.starts_at=new.starts_at and b.ends_at=new.ends_at and ((b.status='confirmed' and new.released_at is null) or (b.status<>'confirmed' and new.released_at is not null))) then raise exception 'Rental inventory must match its authoritative booking' using errcode='42501'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.guard_equipment_rental_reservation() from public,anon,authenticated;
create trigger guard_equipment_rental_reservation before insert or update on public.resource_reservations for each row execute function private.guard_equipment_rental_reservation();
