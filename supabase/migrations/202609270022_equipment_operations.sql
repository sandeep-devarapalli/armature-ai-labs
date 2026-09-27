-- Private operational preparation; no unit, rate, payment or delivery activation.
alter table public.equipment_rental_units add column kit_contents jsonb not null default '[]'::jsonb check(jsonb_typeof(kit_contents)='array'), add column maintenance_note text;
create function public.admin_list_equipment_operations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_paid_admin();
 return jsonb_build_object(
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'resource_id',u.resource_id,'asset_unit_id',u.asset_unit_id,'name',r.name,'asset_tag',a.asset_tag,'component_slug',c.slug,'commissioned',u.commissioned,'inventory_location_id',l.id,'location_name',l.name,'lab_location_id',l.lab_location_id,'kit_contents',u.kit_contents,'maintenance_note',u.maintenance_note,'maintenance',a.status='maintenance','asset_status',a.status,'rates',coalesce((select jsonb_agg(to_jsonb(rate) order by rate.valid_from desc) from public.equipment_rental_rates rate where rate.unit_id=u.id),'[]'::jsonb))) from public.equipment_rental_units u join public.resources r on r.id=u.resource_id join public.asset_units a on a.id=u.asset_unit_id join public.components c on c.id=a.component_id join public.inventory_locations l on l.id=a.inventory_location_id),'[]'::jsonb),
 'assets',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'asset_tag',a.asset_tag,'component_slug',c.slug,'inventory_location_id',a.inventory_location_id,'lab_location_id',l.lab_location_id,'status',a.status)) from public.asset_units a join public.components c on c.id=a.component_id join public.inventory_locations l on l.id=a.inventory_location_id),'[]'::jsonb),
 'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'location_id',r.location_id)) from public.resources r join public.resource_booking_policies p on p.resource_id=r.id where p.kind='equipment' and r.capacity=1),'[]'::jsonb),
 'locations',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'lab_location_id',lab_location_id)) from public.inventory_locations where active),'[]'::jsonb));
end; $$;
create function public.admin_update_equipment_unit(p_unit_id uuid,p_inventory_location_id uuid,p_kit_contents jsonb,p_maintenance boolean,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare u public.equipment_rental_units; a public.asset_units; item jsonb; old_state jsonb;
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin();
 if p_note is null or length(trim(p_note)) not between 2 and 1000 or p_maintenance is null or p_kit_contents is null or jsonb_typeof(p_kit_contents)<>'array' or jsonb_array_length(p_kit_contents)>50 then raise exception 'Valid kit contents, maintenance state and reason required' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_kit_contents) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'name') is distinct from 'string' or length(trim(item->>'name')) not between 1 and 160 or (item->>'quantity') !~ '^[1-9][0-9]{0,3}$' or item->>'quantity' is null or item - 'name' - 'quantity'<>'{}'::jsonb then raise exception 'Each kit entry requires name and positive integer quantity only' using errcode='22023'; end if;
 end loop;
 select * into u from public.equipment_rental_units where id=p_unit_id for update;
 if not found then raise exception 'Rental unit not found' using errcode='P0002'; end if;
 select * into a from public.asset_units where id=u.asset_unit_id for update;
 if a.status not in ('available','maintenance') then raise exception 'Resolve asset custody or retirement before editing operations' using errcode='22023'; end if;
 if not exists(select 1 from public.inventory_locations l join public.resources r on r.location_id=l.lab_location_id where l.id=p_inventory_location_id and l.active and r.id=u.resource_id) then raise exception 'Choose an active inventory location at the same lab' using errcode='22023'; end if;
 old_state:=jsonb_build_object('kit_contents',u.kit_contents,'location_id',a.inventory_location_id,'asset_status',a.status,'commissioned',u.commissioned);
 update public.asset_units set inventory_location_id=p_inventory_location_id,status=case when p_maintenance then 'maintenance'::public.asset_unit_status else 'available'::public.asset_unit_status end where id=a.id;
 update public.equipment_rental_units set kit_contents=p_kit_contents,maintenance_note=trim(p_note),commissioned=case when p_maintenance or a.status='maintenance' then false else commissioned end where id=u.id;
 perform private.record_audit(auth.uid(),'staff','equipment.operations_updated','rental_unit',u.id,old_state,jsonb_build_object('kit_contents',p_kit_contents,'location_id',p_inventory_location_id,'maintenance',p_maintenance),trim(p_note));
end; $$;
create function public.admin_replace_equipment_rate(p_current_rate_id uuid,p_price_paise bigint,p_tax_bps integer,p_effective_from timestamptz,p_valid_until timestamptz,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.equipment_rental_rates; rid uuid;
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin();
 select * into r from public.equipment_rental_rates where id=p_current_rate_id for update;
 if r.id is null or p_effective_from is null or p_effective_from<now() or p_effective_from<=r.valid_from or (r.valid_until is not null and r.valid_until<=p_effective_from) or p_reason is null or length(trim(p_reason)) not between 2 and 1000 then raise exception 'Current rate version, future boundary and reason required' using errcode='22023'; end if;
 update public.equipment_rental_rates set valid_until=p_effective_from where id=r.id;
 rid:=public.approve_equipment_rental_rate(r.unit_id,r.charge_unit,p_price_paise,p_effective_from,p_valid_until,p_tax_bps);
 perform private.record_audit(auth.uid(),'staff','equipment.rate_replaced','rental_rate',r.id,to_jsonb(r),jsonb_build_object('valid_until',p_effective_from,'replacement_id',rid),trim(p_reason)); return rid;
end; $$;
revoke all on function public.admin_list_equipment_operations(),public.admin_update_equipment_unit(uuid,uuid,jsonb,boolean,text),public.admin_replace_equipment_rate(uuid,bigint,integer,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.admin_list_equipment_operations(),public.admin_update_equipment_unit(uuid,uuid,jsonb,boolean,text),public.admin_replace_equipment_rate(uuid,bigint,integer,timestamptz,timestamptz,text) to authenticated;

create table public.equipment_daily_sessions(
 id uuid primary key default extensions.gen_random_uuid(), order_id uuid not null references public.equipment_rental_orders(id),
 user_id uuid not null references auth.users(id), use_date date not null,
 checked_in_at timestamptz not null, checked_in_by_device uuid not null references public.kiosk_devices(id),
 checked_out_at timestamptz, checked_out_by_device uuid references public.kiosk_devices(id),
 check((checked_out_at is null)=(checked_out_by_device is null)), check(checked_out_at is null or checked_out_at>=checked_in_at));
create unique index equipment_daily_one_active on public.equipment_daily_sessions(order_id,user_id) where checked_out_at is null;
create index equipment_daily_history on public.equipment_daily_sessions(user_id,use_date desc);
alter table public.equipment_daily_sessions enable row level security;
revoke all on public.equipment_daily_sessions from public,anon,authenticated;
grant select on public.equipment_daily_sessions to authenticated;
grant all on public.equipment_daily_sessions to service_role;
create policy equipment_daily_read on public.equipment_daily_sessions for select to authenticated using(user_id=auth.uid() or private.is_staff(array['admin','super_admin']::public.staff_role[]));
alter table public.checkin_intents add column equipment_rental_order_id uuid references public.equipment_rental_orders(id), add column equipment_use_date date,
 add constraint equipment_intent_date check((equipment_rental_order_id is null)=(equipment_use_date is null));
create function private.validate_equipment_daily_use(p_order_id uuid,p_user_id uuid,p_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
declare o public.equipment_rental_orders; q public.equipment_rental_quotes; b public.bookings; u public.equipment_rental_units; r public.resources;
 d date:=(p_at at time zone 'Asia/Kolkata')::date; s timestamptz; e timestamptz;
begin
 perform private.require_rental_mock();
 select * into o from public.equipment_rental_orders where id=p_order_id;
 select * into q from public.equipment_rental_quotes where id=o.quote_id;
 select * into b from public.bookings where id=o.booking_id;
 if b.organization_id is not null then perform 1 from public.organization_memberships where organization_id=b.organization_id for share; end if;
 select * into b from public.bookings where id=o.booking_id for share;
 perform 1 from public.basic_onboarding_applications where user_id=p_user_id for share;
 if q.id is null or b.member_id is distinct from p_user_id or q.operator_id is distinct from p_user_id or b.status<>'confirmed' or q.payment_state<>'captured' or private.has_approved_basic_membership(p_user_id) is not true then raise exception 'Confirmed daily rental for this approved operator required' using errcode='42501'; end if;
 if not exists(select 1 from public.equipment_rental_rates where id=q.rate_id and charge_unit='day') or not d=any(q.dates) then raise exception 'This date is not included in the daily rental' using errcode='22023'; end if;
 s:=(d+time '09:00') at time zone 'Asia/Kolkata'; e:=(d+time '17:00') at time zone 'Asia/Kolkata';
 if p_at<s or p_at>=e then raise exception 'Daily equipment use is available only from 09:00 to 17:00' using errcode='22023'; end if;
 select units.* into u from public.equipment_rental_units units join public.equipment_rental_rates rate on rate.unit_id=units.id where rate.id=q.rate_id for share of units;
 select * into r from public.resources where id=b.resource_id for share;
 perform 1 from public.asset_units where id=u.asset_unit_id and status='available' for share;
 if not found or not u.commissioned or not r.active or not r.reservable then raise exception 'Equipment is not operational' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.location_id::text,13));
 if exists(select 1 from public.booking_closures where location_id=r.location_id and closed_on=d) or not private.within_resource_hours(r.id,s,e) or exists(select 1 from public.resource_reservations where resource_id=r.id and kind='block' and released_at is null and period && tstzrange(s,e,'[)')) then raise exception 'Equipment use is closed for this date' using errcode='42501'; end if;
 perform 1 from public.paid_access_entitlements where (user_id=p_user_id or organization_id=b.organization_id) and revoked_at is null for share;
 if private.has_dated_access(p_user_id,b.organization_id,s,e,array['equipment'],r.id) is not true then raise exception 'Current equipment entitlement required' using errcode='42501'; end if;
 perform 1 from public.bookings where id=any(o.workspace_booking_ids) order by id for share;
 if not exists(select 1 from public.bookings w join public.resources wr on wr.id=w.resource_id join public.resource_booking_policies wp on wp.resource_id=wr.id where w.id=any(o.workspace_booking_ids) and w.status='confirmed' and w.starts_at<=s and w.ends_at>=e and wr.location_id=r.location_id and wp.kind in ('workspace','cabin') and ((b.organization_id is null and w.member_id=p_user_id and w.organization_id is null) or (b.organization_id is not null and w.organization_id=b.organization_id and private.has_active_team_membership(p_user_id,b.organization_id,s,e))) and private.has_dated_access(p_user_id,b.organization_id,s,e,array['workspace','cabin'],w.resource_id)) then raise exception 'Current paid workspace must cover this use date' using errcode='42501'; end if;
 if not private.has_valid_resource_certifications(p_user_id,r.id,p_at,e) then raise exception 'Training must remain valid through today’s equipment use' using errcode='42501'; end if;
end; $$;
create function private.create_equipment_daily_intent(p_order_id uuid,p_action public.checkin_action,p_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.equipment_rental_orders; token text; iid uuid; d date:=(p_at at time zone 'Asia/Kolkata')::date;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select * into o from public.equipment_rental_orders where id=p_order_id;
 if p_action='check_in' then
  perform private.validate_equipment_daily_use(o.id,auth.uid(),p_at);
 else
  select use_date into d from public.equipment_daily_sessions where order_id=o.id and user_id=auth.uid() and checked_out_at is null;
  if not found then raise exception 'Active daily equipment session not found' using errcode='P0002'; end if;
 end if;
 update public.checkin_intents set status='cancelled' where user_id=auth.uid() and status='pending';
 token:=translate(encode(extensions.gen_random_bytes(32),'base64'),E'+/=\\n','-_');
 insert into public.checkin_intents(user_id,booking_id,action,token_hash,expires_at,created_at,equipment_rental_order_id,equipment_use_date)
 values(auth.uid(),o.booking_id,p_action,extensions.digest(convert_to(token,'utf8'),'sha256'),p_at+interval '60 seconds',p_at,o.id,d) returning id into iid;
 return jsonb_build_object('intent_id',iid,'token',token,'action',p_action,'expires_at',p_at+interval '60 seconds','equipment_use_date',d);
end; $$;
create function private.redeem_equipment_daily_intent(p_token_hash_hex text,p_device_id uuid,p_at timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare device public.kiosk_devices; intent public.checkin_intents; b public.bookings; sid uuid;
begin
 select * into device from public.kiosk_devices where id=p_device_id and status='active' for update;
 if not found then raise exception 'kiosk device is not active' using errcode='42501'; end if;
 select * into intent from public.checkin_intents where token_hash=decode(p_token_hash_hex,'hex') and status='pending' and expires_at>p_at and equipment_rental_order_id is not null for update;
 if not found then raise exception 'check-in token is expired, invalid, or already used' using errcode='22023'; end if;
 select * into b from public.bookings where id=intent.booking_id;
 if not exists(select 1 from public.resources where id=b.resource_id and location_id=device.location_id) then raise exception 'booking belongs to another location' using errcode='42501'; end if;
 if intent.action='check_in' then
  if intent.equipment_use_date<>(p_at at time zone 'Asia/Kolkata')::date then raise exception 'Equipment intent belongs to another use date' using errcode='22023'; end if;
  perform private.validate_equipment_daily_use(intent.equipment_rental_order_id,intent.user_id,p_at);
  insert into public.equipment_daily_sessions(order_id,user_id,use_date,checked_in_at,checked_in_by_device) values(intent.equipment_rental_order_id,intent.user_id,intent.equipment_use_date,p_at,device.id) returning id into sid;
 else
  update public.equipment_daily_sessions set checked_out_at=p_at,checked_out_by_device=device.id where order_id=intent.equipment_rental_order_id and user_id=intent.user_id and checked_out_at is null and use_date=intent.equipment_use_date returning id into sid;
  if not found then raise exception 'Active daily equipment session not found' using errcode='P0002'; end if;
 end if;
 update public.checkin_intents set status='redeemed',redeemed_at=p_at,redeemed_by_device=device.id where id=intent.id;
 update public.kiosk_devices set last_seen_at=p_at where id=device.id;
 perform private.record_audit(null,'kiosk','equipment.daily_'||intent.action::text,'equipment_daily_session',sid,null,jsonb_build_object('member_id',intent.user_id,'booking_id',b.id,'device_id',device.id,'use_date',intent.equipment_use_date));
 return jsonb_build_object('session_id',sid,'action',intent.action,'member_id',intent.user_id,'booking_id',b.id,'processed_at',p_at,'equipment_use_date',intent.equipment_use_date,'equipment_session',true);
end; $$;
-- Preserve ordinary booking/attendance behavior; route only daily rental intents.
alter function public.create_checkin_intent(uuid,public.checkin_action) set schema private;
alter function public.redeem_checkin_intent(text,uuid) set schema private;
revoke all on function private.create_checkin_intent(uuid,public.checkin_action),private.redeem_checkin_intent(text,uuid),private.validate_equipment_daily_use(uuid,uuid,timestamptz),private.create_equipment_daily_intent(uuid,public.checkin_action,timestamptz),private.redeem_equipment_daily_intent(text,uuid,timestamptz) from public,anon,authenticated,service_role;
create function public.create_checkin_intent(p_booking_id uuid default null,p_action public.checkin_action default 'check_in') returns jsonb
language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 select o.id into oid from public.equipment_rental_orders o join public.equipment_rental_quotes q on q.id=o.quote_id join public.equipment_rental_rates r on r.id=q.rate_id where o.booking_id=p_booking_id and r.charge_unit='day';
 if oid is not null then return private.create_equipment_daily_intent(oid,p_action,clock_timestamp()); end if;
 return private.create_checkin_intent(p_booking_id,p_action);
end; $$;
create function public.redeem_checkin_intent(p_token_hash_hex text,p_device_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.checkin_intents where token_hash=decode(p_token_hash_hex,'hex') and equipment_rental_order_id is not null) then return private.redeem_equipment_daily_intent(p_token_hash_hex,p_device_id,clock_timestamp()); end if;
 return private.redeem_checkin_intent(p_token_hash_hex,p_device_id);
end; $$;
revoke all on function public.create_checkin_intent(uuid,public.checkin_action),public.redeem_checkin_intent(text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_checkin_intent(uuid,public.checkin_action) to authenticated;
grant execute on function public.redeem_checkin_intent(text,uuid) to service_role;
create function public.admin_approve_equipment_rate(p_unit_id uuid,p_charge_unit text,p_price_paise bigint,p_tax_bps integer,p_valid_from timestamptz,p_valid_until timestamptz,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 perform pg_advisory_xact_lock(92726001); perform private.require_paid_admin();
 if p_reason is null or length(trim(p_reason)) not between 2 and 1000 then raise exception 'Rate approval reason required' using errcode='22023'; end if;
 rid:=public.approve_equipment_rental_rate(p_unit_id,p_charge_unit,p_price_paise,p_valid_from,p_valid_until,p_tax_bps);
 perform private.record_audit(auth.uid(),'staff','equipment.rate_approval_reason','rental_rate',rid,null,null,trim(p_reason)); return rid;
end; $$;
revoke all on function public.admin_approve_equipment_rate(uuid,text,bigint,integer,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.admin_approve_equipment_rate(uuid,text,bigint,integer,timestamptz,timestamptz,text) to authenticated;
create or replace function private.check_booking_policy_on_entry() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.bookings;
begin
 if tg_table_name='checkin_intents' then
  if new.action<>'check_in' then return new; end if;
  if new.equipment_rental_order_id is not null then
   if not exists(select 1 from public.equipment_rental_orders o join public.equipment_rental_quotes q on q.id=o.quote_id where o.id=new.equipment_rental_order_id and o.booking_id=new.booking_id and q.operator_id=new.user_id) or new.equipment_use_date is distinct from (new.created_at at time zone 'Asia/Kolkata')::date then raise exception 'Daily equipment intent must match operator, booking and date' using errcode='42501'; end if;
   perform private.validate_equipment_daily_use(new.equipment_rental_order_id,new.user_id,new.created_at);
   return new;
  end if;
 end if;
 select * into b from public.bookings where id=new.booking_id;
 if b.id is null then raise exception 'Booking required' using errcode='42501'; end if;
 perform private.require_booking_policy_access(b.member_id,b.resource_id,b.starts_at,b.ends_at,b.access_source,b.organization_id,(select count(*)::integer from public.booking_guests where booking_id=b.id));
 return new;
end; $$;
create function public.get_my_equipment_daily_use() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('order_id',o.id,'booking_id',b.id,'resource_id',b.resource_id,'name',resource.name,'dates',q.dates,'active_session',(select jsonb_build_object('id',s.id,'use_date',s.use_date,'checked_in_at',s.checked_in_at) from public.equipment_daily_sessions s where s.order_id=o.id and s.user_id=auth.uid() and s.checked_out_at is null)) order by q.starts_at),'[]'::jsonb)
 from public.equipment_rental_orders o join public.equipment_rental_quotes q on q.id=o.quote_id join public.equipment_rental_rates rate on rate.id=q.rate_id join public.bookings b on b.id=o.booking_id join public.resources resource on resource.id=b.resource_id
 where q.operator_id=auth.uid() and b.member_id=auth.uid() and rate.charge_unit='day' and
 ((b.status='confirmed' and q.ends_at>=now()) or exists(select 1 from public.equipment_daily_sessions s where s.order_id=o.id and s.user_id=auth.uid() and s.checked_out_at is null));
$$;
revoke all on function public.get_my_equipment_daily_use() from public,anon;
grant execute on function public.get_my_equipment_daily_use() to authenticated;

alter table public.booking_products add column tax_bps integer check(tax_bps between 0 and 10000);
create function public.configure_workspace_tax(p_product_id uuid,p_tax_bps integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_paid_admin();
 if p_tax_bps is null or p_tax_bps not between 0 and 10000 or p_reason is null or length(trim(p_reason)) not between 2 and 1000 then raise exception 'Explicit tax and reason required' using errcode='22023'; end if;
 update public.booking_products set tax_bps=p_tax_bps where id=p_product_id and kind in ('workspace','cabin');
 if not found then raise exception 'Workspace product required' using errcode='22023'; end if;
 perform private.record_audit(auth.uid(),'staff','workspace.tax_configured','booking_product',p_product_id,null,jsonb_build_object('tax_bps',p_tax_bps,'reason',trim(p_reason)));
end; $$;

revoke all on function public.configure_workspace_tax(uuid,integer,text) from public,anon;
grant execute on function public.configure_workspace_tax(uuid,integer,text) to authenticated;
create function private.is_mapped_rental_asset(p_asset_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.equipment_rental_units where asset_unit_id=p_asset_id);
$$;
revoke all on function private.is_mapped_rental_asset(uuid) from public,anon;
grant execute on function private.is_mapped_rental_asset(uuid) to authenticated;
create policy mapped_rental_asset_read on public.asset_units as restrictive for select to authenticated using(not private.is_mapped_rental_asset(id) or private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy mapped_rental_asset_update on public.asset_units as restrictive for update to authenticated using(not private.is_mapped_rental_asset(id)) with check(not private.is_mapped_rental_asset(id));
create policy mapped_rental_asset_delete on public.asset_units as restrictive for delete to authenticated using(not private.is_mapped_rental_asset(id));
