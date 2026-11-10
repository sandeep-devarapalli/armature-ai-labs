-- Arm + camera bundles: one quote, one agreement, one payment; each unit gets its own hold, booking and reservation.
-- Rent is the sum of both items for the same unit and period; the deposit stays the main item's.
-- The single-item flow moves unchanged to private.rental_checkout_base; public.rental_checkout wraps it with the add-on steps.
-- Later changes to the single-item flow must replace private.rental_checkout_base, not public.rental_checkout.
alter table private.rental_catalogue add column addon_codes text[] not null default '{}';
update private.rental_catalogue set addon_codes=array['waveshare-ov5693'] where code='thinkrobotics-so101';

-- An add-on's id doubles as its inventory hold id, so it never collides with the quote's own hold.
create table private.rental_quote_addons(
 id uuid primary key default extensions.gen_random_uuid(),
 quote_id uuid not null references private.rental_quotes(id) on delete cascade,
 code text not null references private.rental_catalogue(code),
 resource_id uuid not null references public.resources(id),
 rent_paise bigint not null check(rent_paise>=0),
 booking_id uuid unique references public.bookings(id),
 unique(quote_id,code));
alter table private.rental_quote_addons enable row level security;
revoke all on private.rental_quote_addons from public,anon,authenticated;

-- Quotes without add-ons hash exactly as before.
create or replace function private.rental_quote_hash(q private.rental_quotes) returns text language sql stable set search_path='' as $$
 select encode(extensions.digest(convert_to((jsonb_build_array(q.id,q.member_id,q.product,q.party_type,q.resource_id,
 q.parent_quote_id,q.unit,q.starts_on,q.ends_on,q.rent_paise,q.deposit_paise,'INR',q.policy_version,q.particulars)
 ||case when q.deposit_method='bank_transfer' then jsonb_build_array('bank_transfer','razorpay_rent_only',q.test_fixture) else '[]'::jsonb end
 ||coalesce((select jsonb_agg(jsonb_build_array('addon',a.code,a.resource_id,a.rent_paise) order by a.code) from private.rental_quote_addons a where a.quote_id=q.id),'[]'::jsonb))::text,'UTF8'),'sha256'),'hex');
$$;

create function private.rental_addons_json(p_quote uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('code',a.code,'name',c.name,'maker',c.maker,'rentPaise',a.rent_paise) order by a.code),'[]'::jsonb)
 from private.rental_quote_addons a join private.rental_catalogue c on c.code=a.code where a.quote_id=p_quote;
$$;
revoke all on function private.rental_addons_json(uuid) from public,anon,authenticated;

alter function public.rental_checkout(text,uuid,jsonb) rename to rental_checkout_base;
alter function public.rental_checkout_base(text,uuid,jsonb) set schema private;
revoke all on function private.rental_checkout_base(text,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.rental_checkout(p_action text,p_member uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 result jsonb; q private.rental_quotes; a private.rental_quote_addons; item private.rental_catalogue; addon private.rental_catalogue;
 codes text[]; starts date; ends date; period tstzrange; start_at timestamptz; end_at timestamptz; resource uuid; rent bigint; booking uuid;
begin
 if jsonb_typeof(p_input->'addons')='array' then codes:=array(select jsonb_array_elements_text(p_input->'addons')); end if;
 if p_action in ('availability','quote') and cardinality(codes)>0 and (p_action='quote' or p_input ? 'start') then
  select * into item from private.rental_catalogue where code=p_input->>'product';
  if cardinality(codes)<>1 or not found or not codes<@item.addon_codes then
   raise exception using errcode='22023',message='Add-on is not offered with this product'; end if;
  select * into strict addon from private.rental_catalogue where code=codes[1];
  if addon.kind<>'equipment' or not private.rental_item_quotable(addon) or (case p_input->>'unit' when 'day' then addon.day_rent_paise
   when 'week' then addon.week_rent_paise when 'month' then addon.month_rent_paise end) is null then
   raise exception using errcode='22023',message='Add-on cannot be rented for this period'; end if;
 end if;
 -- Payment windows cover every unit, so check the add-on is still free before the main item is prepared.
 if p_action='prepare' then
  select * into q from private.rental_quotes where id=(p_input->>'quoteId')::uuid;
  for a in select * from private.rental_quote_addons where quote_id=q.id loop
   if not private.rental_range_available(a.resource_id,private.rental_period('equipment',q.starts_on,q.ends_on)) then
    raise exception using errcode='23P01',message='Inventory is no longer available'; end if;
  end loop;
 end if;
 result:=private.rental_checkout_base(p_action,p_member,p_input);
 if p_action='availability' and addon.code is not null and (result->>'available')::boolean then
  starts:=(p_input->>'start')::date; ends:=private.rental_item_end(item,starts,p_input);
  if private.rental_resource(addon.code,private.rental_period('equipment',starts,ends)) is null then
   return result||jsonb_build_object('available',false,'reason','inventory_unavailable'); end if;
  return result;
 end if;
 if p_action in ('list_own','staff_queue') then
  return jsonb_build_object('quotes',coalesce((select jsonb_agg(x||jsonb_build_object('addons',private.rental_addons_json((x->>'id')::uuid)) order by n)
   from jsonb_array_elements(result->'quotes') with ordinality e(x,n)),'[]'::jsonb));
 end if;
 if not result ? 'id' then return result; end if;
 select * into strict q from private.rental_quotes where id=(result->>'id')::uuid;
 start_at:=(q.starts_on+time '09:00') at time zone 'Asia/Kolkata'; end_at:=(q.ends_on+time '17:00') at time zone 'Asia/Kolkata';
 if p_action='quote' and addon.code is not null then
  period:=private.rental_period('equipment',q.starts_on,q.ends_on);
  resource:=private.rental_resource(addon.code,period);
  if resource is null then raise exception using errcode='23P01',message='Inventory is no longer available'; end if;
  perform private.rental_workspace_coverage(q.member_id,q.starts_on,q.ends_on,resource);
  rent:=case when q.test_fixture then 0 when q.unit='day' then addon.day_rent_paise when q.unit='week' then addon.week_rent_paise else addon.month_rent_paise end;
  insert into private.rental_quote_addons(quote_id,code,resource_id,rent_paise) values(q.id,addon.code,resource,rent);
  update private.rental_quotes set rent_paise=rent_paise+rent where id=q.id returning * into q;
  update private.rental_quotes set agreement_hash=private.rental_quote_hash(q) where id=q.id;
  result:=private.rental_checkout_base('status',p_member,jsonb_build_object('quoteId',q.id));
 elsif p_action='claim_order' then
  for a in select * from private.rental_quote_addons where quote_id=q.id loop
   perform public.hold_signed_booking_inventory(a.id,a.resource_id,q.member_id,start_at,end_at,greatest(q.approved_at,q.deposit_verified_at));
  end loop;
 elsif p_action in ('capture','refund') then
  -- The main unit is fulfilled first; a failed add-on leaves the paid quote for staff review rather than a half-silent rental.
  if q.booking_id is not null and q.review_reason is null and q.refunded_amount<q.payment_amount_paise then
   for a in select * from private.rental_quote_addons where quote_id=q.id and booking_id is null for update loop
    begin
     perform pg_advisory_xact_lock(hashtextextended(a.resource_id::text,14));
     if not exists(select 1 from private.checkout_inventory_holds h where h.quote_id=a.id and h.released_at is null and h.expires_at>clock_timestamp())
      or not exists(select 1 from public.equipment_rental_units u join public.asset_units au on au.id=u.asset_unit_id
       where u.resource_id=a.resource_id and u.commissioned and au.status='available') then
      raise exception using errcode='22023',message='Add-on hold unavailable'; end if;
     perform public.release_signed_booking_inventory(a.id);
     insert into private.equipment_rental_writes(transaction_id,resource_id) values(txid_current(),a.resource_id) on conflict do nothing;
     insert into private.rental_fulfillment_writes values(txid_current(),a.resource_id,q.id);
     insert into public.bookings(resource_id,member_id,starts_at,ends_at,idempotency_key,notes)
     values(a.resource_id,q.member_id,start_at,end_at,'rental:'||q.id||':'||a.code,'Paid rental add-on; access follows the main rental') returning id into booking;
     insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at) values(a.resource_id,'booking',booking,start_at,end_at);
     delete from private.equipment_rental_writes where transaction_id=txid_current() and resource_id=a.resource_id;
     delete from private.rental_fulfillment_writes where transaction_id=txid_current() and resource_id=a.resource_id;
     update private.rental_quote_addons set booking_id=booking where id=a.id;
    exception when exclusion_violation or insufficient_privilege or invalid_parameter_value then
     update private.rental_quotes set review_reason='fulfillment_requires_review' where id=q.id;
    end;
   end loop;
  end if;
  -- A full refund releases the add-on the same way the main unit was released.
  if q.refunded_amount=q.payment_amount_paise then
   update public.bookings b set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=q.member_id,cancellation_reason='Full rental payment refund'
   from private.rental_quote_addons x where x.quote_id=q.id and b.id=x.booking_id and b.status='confirmed'
   and exists(select 1 from public.bookings m where m.id=q.booking_id and m.status='cancelled');
   update public.resource_reservations r set released_at=clock_timestamp() from private.rental_quote_addons x join public.bookings b on b.id=x.booking_id
   where x.quote_id=q.id and r.booking_id=x.booking_id and r.released_at is null and b.status='cancelled';
   perform public.release_signed_booking_inventory(a2.id) from private.rental_quote_addons a2 where a2.quote_id=q.id;
  end if;
  result:=private.rental_checkout_base('status',null,jsonb_build_object('quoteId',q.id));
 elsif p_action='return' then
  update public.bookings b set status='completed' from private.rental_quote_addons x where x.quote_id=q.id and b.id=x.booking_id and b.status='confirmed';
  update public.resource_reservations r set released_at=clock_timestamp() from private.rental_quote_addons x
  where x.quote_id=q.id and r.booking_id=x.booking_id and r.released_at is null;
 end if;
 return result||jsonb_build_object('addons',private.rental_addons_json(q.id));
end $$;
revoke all on function public.rental_checkout(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.rental_checkout(text,uuid,jsonb) to service_role;

-- Check-in on the add-on's booking uses the main rental's paid access.
create or replace function private.require_booking_policy_access(p_user uuid,p_resource uuid,p_start timestamptz,p_end timestamptz,p_source text,p_org uuid,p_guests integer)
returns void language plpgsql security definer set search_path='' as $$
declare q private.rental_quotes; local_now timestamp:=clock_timestamp() at time zone 'Asia/Kolkata'; begin
 select x.* into q from private.rental_quotes x join public.bookings b on b.id=x.booking_id
 where x.member_id=p_user and (x.resource_id=p_resource or exists(select 1 from private.rental_quote_addons a where a.quote_id=x.id and a.resource_id=p_resource and a.booking_id is not null))
 and b.starts_at=p_start and b.ends_at=p_end and b.status='confirmed'
 order by exists(select 1 from public.paid_access_entitlements e where e.id=x.entitlement_id and e.revoked_at is null and e.starts_at<=clock_timestamp() and e.ends_at>clock_timestamp()) desc,x.created_at desc limit 1;
 if not found then
 perform private.require_booking_policy_access_before_rentals(p_user,p_resource,p_start,p_end,p_source,p_org,p_guests); return;
 end if;
 if p_source<>'personal' or p_org is not null or p_guests<>0 or not private.has_verified_membership(p_user)
 or not exists(select 1 from public.resources where id=p_resource and active)
 or not exists(select 1 from public.paid_access_entitlements where id=q.entitlement_id and revoked_at is null
 and starts_at<=clock_timestamp() and ends_at>clock_timestamp()) then
 raise exception using errcode='42501',message='Current paid rental access required'; end if;
 if exists(select 1 from private.rental_catalogue c where c.code=q.product and c.kind='cabin') then
 if local_now::time<(q.particulars->>'accessStart')::time or local_now::time>=(q.particulars->>'accessEnd')::time then
 raise exception using errcode='42501',message='Outside signed cabin access hours'; end if;
 else
 if local_now::time<time '09:00' or local_now::time>=time '17:00' then raise exception using errcode='42501',message='Outside rental workspace hours'; end if;
 perform private.rental_workspace_coverage(p_user,local_now::date,local_now::date,q.resource_id);
 end if;
end $$;

-- The invoice names every rented item.
create or replace function private.billing_rental_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.captured_at is null and new.captured_at is not null and new.payment_id is not null then
  perform private.billing_enqueue('rental_quote',new.id,new.member_id,new.starts_on,new.ends_on,
   (select case c.kind when 'cabin' then c.name||' workspace licence fee' else c.name
    ||coalesce((select string_agg(' + '||ac.name,'' order by a.code) from private.rental_quote_addons a join private.rental_catalogue ac on ac.code=a.code where a.quote_id=new.id),'')
    ||' rental' end from private.rental_catalogue c where c.code=new.product),
   new.rent_paise,new.payment_id,new.captured_at,new.particulars->>'customerLegalName',new.particulars->>'customerGstState',new.test_fixture);
 end if;
 if new.rent_refunded>coalesce(old.rent_refunded,0) then
  perform private.billing_refund_review('rental_quote',new.id,new.rent_refunded,new.test_fixture);
 end if;
 return null;
end $$;

-- Rental listings say which add-ons each item offers.
create or replace function private.rental_products() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select jsonb_agg(jsonb_build_object('product',c.code,'kind',c.kind,'name',c.name,'floor',c.floor,'room',c.room,
 'billableSeats',c.billable_seats,'extraSeats',c.extra_seats,'monthlyRentPaise',c.monthly_rent_paise,'weekRentPaise',c.week_rent_paise,
 'monthRentPaise',c.month_rent_paise,'dayRentPaise',c.day_rent_paise,'depositPaise',c.deposit_paise,'salePaise',c.sale_paise,
 'availableFrom',c.available_from,'status',case when c.occupied then 'occupied' when private.rental_item_quotable(c) then 'available' else 'coming_soon' end,
 'quantity',(select count(*) from private.rental_catalogue_resources r where r.code=c.code),'freeUnits',private.rental_free_units(c.code),
 'workspaceRequired',c.kind='equipment','staffConfirmationRequired',true,'configured',private.rental_resource(c.code,null) is not null,
 'category',c.category,'maker',c.maker,'version',c.version,'summary',c.summary,'images',c.images,'highlights',c.highlights,
 'specs',c.specs,'parts',c.parts,'partsNote',c.parts_note,'sourceLabel',c.source_label,'sourceUrl',c.source_url,'stockNote',c.stock_note,
 'addonCodes',to_jsonb(c.addon_codes))
 order by c.sort_order,c.code) from private.rental_catalogue c),'[]'::jsonb);
$$;
