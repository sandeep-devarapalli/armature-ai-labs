-- Event space hire: request, staff approval, signed agreement, Razorpay payment. Default closed.
-- Owner terms 2026-11-09: INR 2,500 per hour, no GST while unregistered, staff approve every request,
-- no deposit, 48 hours or more before the start refunds 50%, later cancellation refunds nothing.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('event-agreements','event-agreements',false,20971520,array['application/pdf']) on conflict(id) do nothing;
update public.booking_products set price_paise=250000 where code='event-hour';

create table private.event_checkout_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 release_ready boolean not null default false, policy_version text not null default 'event-2026-11-09',
 event_resource uuid references public.resources(id)
);
insert into private.event_checkout_settings default values;

create table private.event_quotes (
 id uuid primary key default extensions.gen_random_uuid(), member_id uuid not null references auth.users(id),
 resource_id uuid not null references public.resources(id),
 event_date date not null, start_time time not null, hours integer not null check(hours between 1 and 15),
 attendees integer not null check(attendees between 1 and 35),
 purpose text not null check(length(btrim(purpose)) between 10 and 1000),
 starts_at timestamptz not null, ends_at timestamptz not null check(ends_at>starts_at),
 rent_paise bigint not null check(rent_paise=hours*250000), amount_paise bigint generated always as (rent_paise) stored,
 policy_version text not null, agreement_hash text not null, particulars jsonb,
 prepared_by uuid references auth.users(id), prepared_at timestamptz,
 declined_by uuid references auth.users(id), declined_at timestamptz, decline_reason text check(length(decline_reason) between 10 and 1000),
 reviewer_id uuid references auth.users(id), approved_at timestamptz, payment_window_at timestamptz,
 document_id text, evidence_sha256 text, evidence_path text,
 order_claimed_at timestamptz, order_id text unique, payment_id text unique, captured_at timestamptz,
 refunded_amount bigint not null default 0 check(refunded_amount between 0 and rent_paise),
 cancelled_at timestamptz, cancelled_by uuid references auth.users(id), cancellation_reason text check(length(cancellation_reason) between 10 and 1000),
 refund_due_paise bigint check(refund_due_paise between 0 and rent_paise),
 booking_id uuid references public.bookings(id), entitlement_id uuid references public.paid_access_entitlements(id),
 review_reason text, created_at timestamptz not null default now(),
 check(start_time>=time '08:00' and extract(minute from start_time)=0 and extract(second from start_time)=0),
 check(start_time+make_interval(hours=>hours)<=time '23:00' and extract(hour from start_time)+hours<=23)
);
create unique index event_quote_document on private.event_quotes(document_id);
create unique index event_quote_evidence on private.event_quotes(evidence_sha256);
create index event_quotes_member on private.event_quotes(member_id,created_at desc);
create index event_quotes_open on private.event_quotes(created_at desc) where captured_at is null and declined_at is null and cancelled_at is null;
alter table private.event_checkout_settings enable row level security;
alter table private.event_quotes enable row level security;
revoke all on private.event_checkout_settings,private.event_quotes from public,anon,authenticated;
grant all on private.event_checkout_settings,private.event_quotes to service_role;

-- Event reservations are stored with a 20-minute setup buffer each side (private.event_reservation_buffer).
create function private.event_buffered(p_start timestamptz,p_end timestamptz) returns tstzrange
language sql immutable set search_path='' as $$ select tstzrange(p_start-interval '20 minutes',p_end+interval '20 minutes','[)') $$;

create function private.event_quote_hash(q private.event_quotes) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(jsonb_build_array(q.id,q.member_id,q.resource_id,q.event_date,q.start_time,q.hours,
 q.attendees,q.purpose,q.rent_paise,'INR',q.policy_version,q.particulars)::text,'UTF8'),'sha256'),'hex');
$$;

create function private.event_slot_available(p_resource uuid,p_start timestamptz,p_end timestamptz,p_ignore_quote uuid default null) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.resources where id=p_resource and active and reservable)
 and not exists(select 1 from public.booking_closures c join public.resources r on r.location_id=c.location_id
  where r.id=p_resource and c.closed_on=(p_start at time zone 'Asia/Kolkata')::date)
 and not exists(select 1 from public.resource_reservations where resource_id=p_resource and released_at is null
  and period&&private.event_buffered(p_start,p_end))
 and not exists(select 1 from private.checkout_inventory_holds where resource_id=p_resource and released_at is null
  and expires_at>clock_timestamp() and period&&private.event_buffered(p_start,p_end) and quote_id is distinct from p_ignore_quote);
$$;

-- Refund owed on cancellation of a paid event: 50% at 48 hours or more before the start, otherwise nothing.
create function private.event_refund_due(p_amount bigint,p_starts timestamptz,p_cancelled timestamptz) returns bigint
language sql immutable set search_path='' as $$
 select case when p_starts-p_cancelled>=interval '48 hours' then p_amount/2 else 0 end;
$$;

create function private.event_status(q private.event_quotes) returns text language sql stable security definer set search_path='' as $$
 select case when q.declined_at is not null then 'declined'
  when q.cancelled_at is not null then 'cancelled'
  when q.refunded_amount=q.amount_paise and q.payment_id is not null then 'refunded'
  when q.review_reason is not null then 'needs_review'
  when q.booking_id is not null then case when q.ends_at<=clock_timestamp() then 'completed' else 'confirmed' end
  when q.order_id is not null then 'awaiting_payment'
  when q.approved_at is not null then 'approved'
  when q.prepared_at is not null then 'awaiting_signatures'
  else 'awaiting_staff' end;
$$;

create function public.event_checkout(p_action text,p_member uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 q private.event_quotes; cfg private.event_checkout_settings; resource public.resources; reviewer uuid;
 event_day date; start_t time; hrs integer; people integer; refund bigint; booking uuid; entitlement uuid;
 product_id uuid; hold private.checkout_inventory_holds; details jsonb; busy jsonb;
begin
 if p_action is null or p_action not in ('availability','quote','status','list_own','staff_queue','prepare','decline','manual_review',
 'approve_manual','reopen_payment','claim_order','bind_order','lookup_order','capture','refund','cancel') then
 raise exception using errcode='22023',message='Unknown event checkout action'; end if;
 select * into strict cfg from private.event_checkout_settings where singleton for share;
 if p_action in ('availability','quote','prepare','approve_manual','reopen_payment','claim_order') then
 if not cfg.enabled or not cfg.release_ready or cfg.event_resource is null or not private.has_verified_membership(p_member)
 or exists(select 1 from public.booking_policy_settings where mock_grants_enabled) then
 raise exception using errcode='42501',message='Event checkout unavailable'; end if;
 end if;

 if p_action='availability' then
 event_day:=(p_input->>'date')::date;
 if event_day is null or not isfinite(event_day) or event_day<=(now() at time zone 'Asia/Kolkata')::date or event_day>(now() at time zone 'Asia/Kolkata')::date+366 then
 raise exception using errcode='22023',message='Future event date required'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('start',to_char(greatest(lower(p),(event_day+time '00:00') at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata','HH24:MI'),
  'end',to_char(least(upper(p),(event_day+1+time '00:00') at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata','HH24:MI')) order by lower(p)),'[]'::jsonb) into busy
 from (select period p from public.resource_reservations where resource_id=cfg.event_resource and released_at is null
   union all select period from private.checkout_inventory_holds where resource_id=cfg.event_resource and released_at is null and expires_at>clock_timestamp()) x
 where p&&tstzrange((event_day+time '00:00') at time zone 'Asia/Kolkata',(event_day+1+time '00:00') at time zone 'Asia/Kolkata','[)');
 return jsonb_build_object('date',event_day,'ratePaise',250000,'opens','08:00','closes','23:00','bufferMinutes',20,
  'maxAttendees',(select least(capacity,35) from public.resources where id=cfg.event_resource),
  'closed',exists(select 1 from public.booking_closures c join public.resources r on r.location_id=c.location_id where r.id=cfg.event_resource and c.closed_on=event_day),
  'busy',busy);
 end if;

 if p_action in ('list_own','staff_queue') then
 if p_action='staff_queue' then reviewer:=private.rental_staff(null,p_input); end if;
 return jsonb_build_object('quotes',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('status',private.event_status(x))) from (
 select * from private.event_quotes where p_action='staff_queue' or member_id=p_member
 order by created_at desc limit 50 offset least(greatest(coalesce((p_input->>'offset')::int,0),0),10000)) x),'[]'::jsonb));
 end if;

 if p_action='quote' then
 event_day:=(p_input->>'date')::date; start_t:=(p_input->>'startTime')::time;
 hrs:=(p_input->>'hours')::int; people:=(p_input->>'attendees')::int;
 select * into resource from public.resources where id=cfg.event_resource and active and reservable;
 if not found or not exists(select 1 from public.resource_booking_policies where resource_id=resource.id and kind='event') then
 raise exception using errcode='22023',message='Event space is not configured'; end if;
 if event_day is null or not isfinite(event_day) or event_day<=(now() at time zone 'Asia/Kolkata')::date or event_day>(now() at time zone 'Asia/Kolkata')::date+366
 or start_t is null or start_t<time '08:00' or extract(minute from start_t)<>0 or extract(second from start_t)<>0
 or hrs is null or hrs<1 or extract(hour from start_t)+hrs>23
 or people is null or people<1 or people>least(resource.capacity,35)
 or length(btrim(coalesce(p_input->>'purpose','')))not between 10 and 1000 then
 raise exception using errcode='22023',message='Events require at least one hour and at most 35 attendees within 08:00 to 23:00'; end if;
 q.id:=extensions.gen_random_uuid(); q.member_id:=p_member; q.resource_id:=resource.id; q.event_date:=event_day; q.start_time:=start_t;
 q.hours:=hrs; q.attendees:=people; q.purpose:=btrim(p_input->>'purpose'); q.rent_paise:=hrs*250000; q.policy_version:=cfg.policy_version;
 q.starts_at:=(event_day+start_t) at time zone 'Asia/Kolkata'; q.ends_at:=q.starts_at+make_interval(hours=>hrs);
 if not private.event_slot_available(q.resource_id,q.starts_at,q.ends_at) then
 raise exception using errcode='23P01',message='Event slot is no longer available'; end if;
 q.agreement_hash:=private.event_quote_hash(q);
 insert into private.event_quotes(id,member_id,resource_id,event_date,start_time,hours,attendees,purpose,starts_at,ends_at,rent_paise,policy_version,agreement_hash)
 values(q.id,q.member_id,q.resource_id,q.event_date,q.start_time,q.hours,q.attendees,q.purpose,q.starts_at,q.ends_at,q.rent_paise,q.policy_version,q.agreement_hash)
 returning * into q;
 else
 if p_action='lookup_order' then
 select * into q from private.event_quotes where order_id=p_input->>'orderId' for update;
 if not found then return jsonb_build_object('status','ignored'); end if;
 else select * into q from private.event_quotes where id=(p_input->>'quoteId')::uuid for update; end if;
 if not found or (p_member is not null and q.member_id<>p_member) then
 raise exception using errcode='42501',message='Event request unavailable'; end if;
 end if;

 if p_action='prepare' then
 reviewer:=private.rental_staff(q.member_id,p_input); details:=p_input->'particulars';
 if q.prepared_at is not null or q.declined_at is not null or q.cancelled_at is not null or q.policy_version<>cfg.policy_version then
 raise exception using errcode='22023',message='Event request is no longer open for approval'; end if;
 if not private.event_slot_available(q.resource_id,q.starts_at,q.ends_at) then raise exception using errcode='23P01',message='Event slot is no longer available'; end if;
 if jsonb_typeof(details) is distinct from 'object' or details->>'availabilityConfirmed' is distinct from 'true'
 or details->>'eventDetailsReviewed' is distinct from 'true' or details->>'termsVersion' is distinct from cfg.policy_version
 or length(coalesce(details->>'setupNotes','')) not between 10 and 1000 then
 raise exception using errcode='22023',message='Slot, event details and setup review required'; end if;
 q.particulars:=details; q.agreement_hash:=private.event_quote_hash(q);
 update private.event_quotes set particulars=details,prepared_by=reviewer,prepared_at=clock_timestamp(),agreement_hash=q.agreement_hash
 where id=q.id returning * into q;
 elsif p_action='decline' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if q.order_claimed_at is not null or q.declined_at is not null or q.cancelled_at is not null
 or length(btrim(coalesce(p_input->>'reason',''))) not between 10 and 1000 then
 raise exception using errcode='22023',message='Only an unpaid open request can be declined with a reason'; end if;
 update private.event_quotes set declined_by=reviewer,declined_at=clock_timestamp(),decline_reason=btrim(p_input->>'reason') where id=q.id returning * into q;
 elsif p_action='manual_review' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 elsif p_action='approve_manual' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if q.prepared_at is null or q.approved_at is not null or q.order_claimed_at is not null or q.declined_at is not null or q.cancelled_at is not null
 or q.policy_version<>cfg.policy_version or q.agreement_hash is distinct from p_input->>'agreementHash' or p_input->>'confirmedBothSigners' is distinct from 'true'
 or coalesce(p_input->>'documentId','') !~ '^[A-Za-z0-9_-]{8,80}$' or coalesce(p_input->>'evidenceSha256','') !~ '^[0-9a-f]{64}$'
 or p_input->>'evidencePath' is distinct from q.id::text||'/'||(p_input->>'evidenceSha256')||'.pdf'
 or not exists(select 1 from storage.objects where bucket_id='event-agreements' and name=p_input->>'evidencePath') then
 raise exception using errcode='22023',message='Exact completed agreement and both signatures required'; end if;
 update private.event_quotes set approved_at=clock_timestamp(),payment_window_at=clock_timestamp(),reviewer_id=reviewer,document_id=p_input->>'documentId',
 evidence_sha256=p_input->>'evidenceSha256',evidence_path=p_input->>'evidencePath' where id=q.id returning * into q;
 elsif p_action='reopen_payment' then
 reviewer:=private.rental_staff(q.member_id,p_input);
 if q.approved_at is null or q.order_claimed_at is not null or q.payment_id is not null or q.cancelled_at is not null
 or q.payment_window_at+interval '30 minutes'>clock_timestamp() or q.starts_at<=clock_timestamp()
 or not private.event_slot_available(q.resource_id,q.starts_at,q.ends_at,q.id) then
 raise exception using errcode='22023',message='Only an expired, unordered payment window for a free slot can reopen'; end if;
 update private.event_quotes set payment_window_at=clock_timestamp() where id=q.id returning * into q;
 elsif p_action='claim_order' then
 if q.approved_at is null or q.payment_window_at+interval '30 minutes'<=clock_timestamp() or q.policy_version<>cfg.policy_version
 or q.cancelled_at is not null or q.declined_at is not null or q.payment_id is not null then
 raise exception using errcode='22023',message='Fresh approved agreement required'; end if;
 perform public.hold_signed_booking_inventory(q.id,q.resource_id,q.member_id,
  lower(private.event_buffered(q.starts_at,q.ends_at)),upper(private.event_buffered(q.starts_at,q.ends_at)),q.payment_window_at);
 if q.order_claimed_at is not null then return to_jsonb(q)||jsonb_build_object('claimed',false,'status',private.event_status(q)); end if;
 update private.event_quotes set order_claimed_at=clock_timestamp() where id=q.id returning * into q;
 return to_jsonb(q)||jsonb_build_object('claimed',true,'status',private.event_status(q));
 elsif p_action='bind_order' then
 if q.order_claimed_at is null or coalesce(p_input->>'orderId','') !~ '^order_[A-Za-z0-9]+$'
 or (q.order_id is not null and q.order_id<>p_input->>'orderId') then raise exception using errcode='22023',message='Claimed matching order required'; end if;
 update private.event_quotes set order_id=p_input->>'orderId' where id=q.id returning * into q;
 elsif p_action in ('capture','refund') then
 if q.order_id is null or q.order_id is distinct from p_input->>'orderId' or (p_input->>'amount')::bigint is distinct from q.amount_paise
 or p_input->>'currency' is distinct from 'INR' or coalesce(p_input->>'paymentId','') !~ '^pay_[A-Za-z0-9]+$'
 or (q.payment_id is not null and q.payment_id<>p_input->>'paymentId') then
 raise exception using errcode='22023',message='Captured payment must match the event order'; end if;
 refund:=coalesce((p_input->>'refundedAmount')::bigint,0);
 if refund<0 or refund>q.amount_paise then raise exception using errcode='22023',message='Invalid refund amount'; end if;
 refund:=greatest(refund,q.refunded_amount);
 if q.payment_id is null and refund>0 and refund<q.amount_paise then q.review_reason:='captured_with_partial_refund_requires_review'; end if;
 if q.payment_id is null and refund=0 then
 perform pg_advisory_xact_lock(hashtextextended(q.resource_id::text,14));
 select * into hold from private.checkout_inventory_holds where quote_id=q.id for update;
 if q.cancelled_at is not null or hold.quote_id is null or hold.released_at is not null or hold.expires_at<=clock_timestamp()
 or q.starts_at<=clock_timestamp() or not private.has_verified_membership(q.member_id)
 or not exists(select 1 from public.resources where id=q.resource_id and active and reservable) then
 q.review_reason:='hold_or_membership_unavailable';
 else
 begin
 perform public.release_signed_booking_inventory(q.id);
 insert into public.bookings(resource_id,member_id,starts_at,ends_at,idempotency_key,notes)
 values(q.resource_id,q.member_id,q.starts_at,q.ends_at,'event:'||q.id,'Paid event hire; '||q.attendees||' attendees') returning id into booking;
 insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at) values(q.resource_id,'booking',booking,q.starts_at,q.ends_at);
 select id into strict product_id from public.booking_products where code='event-hour';
 -- Staff approved this exact slot, so weekday daytime use is approved too.
 insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by,daytime_event_approved)
 values(q.member_id,product_id,q.resource_id,q.starts_at,q.ends_at,1,q.rent_paise,'razorpay',q.member_id,true) returning id into entitlement;
 q.booking_id:=booking; q.entitlement_id:=entitlement;
 exception when exclusion_violation or insufficient_privilege or invalid_parameter_value then q.review_reason:='fulfillment_requires_review';
 end;
 end if;
 end if;
 if refund>0 and q.payment_id is not null and q.cancelled_at is null and refund<q.amount_paise and q.review_reason is null then
 q.review_reason:='refund_without_cancellation_requires_review'; end if;
 if refund>coalesce(q.refund_due_paise,0) and q.cancelled_at is not null and refund<q.amount_paise and q.review_reason is null then
 q.review_reason:='refund_above_policy_requires_review'; end if;
 if refund=q.amount_paise then
 update public.bookings set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=q.member_id,cancellation_reason='Full event payment refund'
 where id=q.booking_id and status='confirmed' and starts_at>clock_timestamp();
 update public.resource_reservations set released_at=clock_timestamp() where booking_id=q.booking_id and released_at is null and starts_at>clock_timestamp();
 update public.paid_access_entitlements set revoked_at=clock_timestamp() where id=q.entitlement_id and revoked_at is null;
 perform public.release_signed_booking_inventory(q.id);
 end if;
 update private.event_quotes set payment_id=p_input->>'paymentId',captured_at=coalesce(captured_at,clock_timestamp()),
 refunded_amount=refund,booking_id=q.booking_id,entitlement_id=q.entitlement_id,review_reason=q.review_reason where id=q.id returning * into q;
 elsif p_action='cancel' then
 -- The member or an independent MFA Admin cancels. Paid cancellations record the policy refund for staff to issue.
 if p_input ? 'reviewerId' then reviewer:=private.rental_staff(q.member_id,p_input); end if;
 if p_input->>'confirmed' is distinct from 'true' or q.cancelled_at is not null or q.declined_at is not null
 or q.starts_at<=clock_timestamp() or length(btrim(coalesce(p_input->>'reason',''))) not between 10 and 1000
 or (q.order_claimed_at is not null and q.payment_id is null) then
 raise exception using errcode='22023',message='Only a future booking without a pending payment can be cancelled with a reason'; end if;
 update private.event_quotes set cancelled_at=clock_timestamp(),cancelled_by=coalesce(reviewer,q.member_id),cancellation_reason=btrim(p_input->>'reason'),
 refund_due_paise=case when payment_id is null then 0 else private.event_refund_due(amount_paise,starts_at,clock_timestamp()) end
 where id=q.id returning * into q;
 if q.booking_id is not null then
 update public.bookings set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=coalesce(reviewer,q.member_id),cancellation_reason='Event cancelled; refund per event policy'
 where id=q.booking_id and status='confirmed';
 update public.resource_reservations set released_at=clock_timestamp() where booking_id=q.booking_id and released_at is null;
 update public.paid_access_entitlements set revoked_at=clock_timestamp() where id=q.entitlement_id and revoked_at is null;
 end if;
 perform public.release_signed_booking_inventory(q.id);
 end if;
 return to_jsonb(q)||jsonb_build_object('status',private.event_status(q),'bookingId',q.booking_id,
 'membership',private.membership_level_at(q.member_id,clock_timestamp()));
end $$;
revoke all on function private.event_buffered(timestamptz,timestamptz),private.event_quote_hash(private.event_quotes),
 private.event_slot_available(uuid,timestamptz,timestamptz,uuid),private.event_refund_due(bigint,timestamptz,timestamptz),
 private.event_status(private.event_quotes) from public,anon,authenticated;
revoke all on function public.event_checkout(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.event_checkout(text,uuid,jsonb) to service_role;

-- Signed bookings may now hold the event space; it has no workspace inventory mapping.
create or replace function public.hold_signed_booking_inventory(
  p_quote_id uuid, p_resource_id uuid, p_member_id uuid,
  p_starts_at timestamptz, p_ends_at timestamptz, p_signed_at timestamptz
) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_hold private.checkout_inventory_holds;
  v_period tstzrange;
  v_expires_at timestamptz := p_signed_at + interval '30 minutes';
  v_kind text;
begin
  if p_quote_id is null or p_resource_id is null or p_member_id is null
    or p_starts_at is null or p_ends_at is null or p_signed_at is null
    or not isfinite(p_starts_at) or not isfinite(p_ends_at) or not isfinite(p_signed_at)
    or p_ends_at <= p_starts_at or p_signed_at > clock_timestamp() then
    raise exception using errcode = '22023', message = 'Valid signed quote and booking dates required';
  end if;
  if private.has_approved_basic_membership(p_member_id) is not true then
    raise exception using errcode = '42501', message = 'Verified membership required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_resource_id::text, 14));
  if v_expires_at <= clock_timestamp() or p_starts_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'Checkout window expired; issue a new quote';
  end if;
  v_period := tstzrange(p_starts_at, p_ends_at, '[)');

  select * into v_hold from private.checkout_inventory_holds where quote_id = p_quote_id;
  if found then
    if v_hold.resource_id = p_resource_id and v_hold.member_id = p_member_id
      and v_hold.period = v_period and v_hold.expires_at = v_expires_at
      and v_hold.released_at is null then
      return v_hold.expires_at;
    end if;
    raise exception using errcode = '22023', message = 'Checkout hold requires a new quote';
  end if;

  select policy.kind into v_kind
  from public.resources as resource
  join public.resource_booking_policies as policy on policy.resource_id = resource.id
  where resource.id = p_resource_id and resource.active and resource.reservable
    and policy.kind in ('workspace', 'cabin', 'equipment', 'event');
  if v_kind is null or (v_kind = 'equipment' and not exists (
    select 1 from public.equipment_rental_units as unit
    join public.asset_units as asset on asset.id = unit.asset_unit_id
    where unit.resource_id = p_resource_id and unit.commissioned and asset.status = 'available'
  )) or (v_kind in ('workspace', 'cabin') and not exists (
    select 1 from public.booking_inventory where resource_id = p_resource_id
  )) then
    raise exception using errcode = '22023', message = 'Bookable inventory required';
  end if;

  if exists (
    select 1 from private.checkout_inventory_holds
    where resource_id = p_resource_id and released_at is null
      and expires_at > clock_timestamp() and period && v_period
  ) or exists (
    select 1 from public.resource_reservations
    where resource_id = p_resource_id and released_at is null and period && v_period
  ) or exists (
    select 1 from public.workspace_pass_allocations
    where resource_id = p_resource_id and released_at is null
      and period && daterange(
        (p_starts_at at time zone 'Asia/Kolkata')::date,
        ((p_ends_at - interval '1 microsecond') at time zone 'Asia/Kolkata')::date + 1,
        '[)'
      )
  ) then
    raise exception using errcode = '23P01', message = 'Inventory is no longer available';
  end if;

  insert into private.checkout_inventory_holds (quote_id, resource_id, member_id, period, expires_at)
  values (p_quote_id, p_resource_id, p_member_id, v_period, v_expires_at);
  return v_expires_at;
end;
$$;

-- Event hire is invoiced like other paid bookings once captured; refunds wait for staff.
alter table private.billing_operations drop constraint billing_operations_source_check;
alter table private.billing_operations add constraint billing_operations_source_check check(source in ('desk_quote','rental_quote','event_quote'));
create or replace function private.billing_enqueue(p_source text,p_source_id uuid,p_member uuid,p_starts date,p_ends date,
 p_item text,p_amount_paise bigint,p_payment_id text,p_captured_at timestamptz,p_party_name text,p_customer_state text,p_fixture boolean)
returns void language plpgsql security definer set search_path='' as $$
declare inv private.billing_operations; name text; email text; invoice_date date:=(p_captured_at at time zone 'Asia/Kolkata')::date;
 number text:='ARM-'||case p_source when 'desk_quote' then 'D' when 'event_quote' then 'E' else 'R' end||'-'||to_char(p_starts,'YYYYMM')||'-'||upper(left(replace(p_source_id::text,'-',''),10));
 doc jsonb; gst boolean;
begin
 if p_amount_paise<=0 then return; end if;
 select nullif(btrim(coalesce(p_party_name,p.display_name)),''),u.email into name,email
  from auth.users u left join public.profiles p on p.id=u.id where u.id=p_member;
 select s.gst_enabled and invoice_date>=s.gst_effective_from into gst from private.billing_settings s;
 doc:=private.billing_document(number,invoice_date,coalesce(name,'Unnamed customer'),email,
  p_item||' ('||to_char(p_starts,'DD Mon YYYY')||' to '||to_char(p_ends,'DD Mon YYYY')||')',p_amount_paise,p_customer_state);
 insert into private.billing_operations(kind,source,source_id,event_ref,invoice_number,amount_paise,payload,payload_sha256,test_fixture,state,last_error)
 values('invoice_create',p_source,p_source_id,'invoice',number,p_amount_paise,doc,private.billing_digest(doc),p_fixture,
  case when name is null or (coalesce(gst,false) and p_customer_state is null) then 'needs_staff' else 'pending' end,
  case when name is null then 'billed_to_name_required' when coalesce(gst,false) and p_customer_state is null then 'place_of_supply_required' end)
 on conflict(kind,source,source_id,event_ref) do nothing returning * into inv;
 if inv.id is null then return; end if;
 doc:=jsonb_build_object('amount',round(p_amount_paise/100.0,2),'paymentDate',p_captured_at,'refId',p_payment_id,
  'notes','Razorpay payment '||p_payment_id);
 insert into private.billing_operations(kind,source,source_id,event_ref,depends_on,amount_paise,payload,payload_sha256,test_fixture)
 values('payment_apply',p_source,p_source_id,p_payment_id,inv.id,p_amount_paise,doc,private.billing_digest(doc),p_fixture)
 on conflict(kind,source,source_id,event_ref) do nothing;
end $$;
revoke all on function private.billing_enqueue(text,uuid,uuid,date,date,text,bigint,text,timestamptz,text,text,boolean) from public,anon,authenticated;

create function private.billing_event_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.captured_at is null and new.captured_at is not null and new.payment_id is not null then
  perform private.billing_enqueue('event_quote',new.id,new.member_id,new.event_date,new.event_date,
   'Event space hire, '||new.hours||' hour'||case when new.hours>1 then 's' else '' end,new.rent_paise,new.payment_id,new.captured_at,null,null,false);
 end if;
 if new.refunded_amount>coalesce(old.refunded_amount,0) then
  perform private.billing_refund_review('event_quote',new.id,new.refunded_amount,false);
 end if;
 return null;
end $$;
revoke all on function private.billing_event_capture() from public,anon,authenticated;
create trigger billing_event_capture after update of captured_at,refunded_amount on private.event_quotes
 for each row execute function private.billing_event_capture();

-- A paid event booking keeps its exact signed slot.
create function private.guard_event_booking() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.resource_id,new.member_id,new.starts_at,new.ends_at,new.organization_id,new.access_source) is distinct from
 (old.resource_id,old.member_id,old.starts_at,old.ends_at,old.organization_id,old.access_source)
 and exists(select 1 from private.event_quotes where booking_id=old.id) then
 raise exception using errcode='42501',message='Signed event requires a new approved agreement'; end if;
 return new;
end $$;
revoke all on function private.guard_event_booking() from public,anon,authenticated;
create trigger guard_event_booking before update on public.bookings for each row execute function private.guard_event_booking();
