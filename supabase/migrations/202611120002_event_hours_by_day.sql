-- Desks use GF-10 Monday to Friday 09:00-17:00, so the event space opens at 17:00 on weekdays
-- and 08:00 on Saturday and Sunday. Closing stays 23:00. Only the opening checks change.
create function private.event_opens(p_day date) returns time language sql immutable set search_path='' as $$
 select case when extract(isodow from p_day)>=6 then time '08:00' else time '17:00' end
$$;
revoke all on function private.event_opens(date) from public,anon,authenticated;

create or replace function public.event_checkout(p_action text,p_member uuid,p_input jsonb)
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
 return jsonb_build_object('date',event_day,'ratePaise',250000,'opens',to_char(private.event_opens(event_day),'HH24:MI'),'closes','23:00','bufferMinutes',20,
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
 or start_t is null or start_t<private.event_opens(event_day) or extract(minute from start_t)<>0 or extract(second from start_t)<>0
 or hrs is null or hrs<1 or extract(hour from start_t)+hrs>23
 or people is null or people<1 or people>least(resource.capacity,35)
 or length(btrim(coalesce(p_input->>'purpose','')))not between 10 and 1000 then
 raise exception using errcode='22023',message='Events require at least one hour and at most 35 attendees from 17:00 on weekdays or 08:00 at weekends, ending by 23:00'; end if;
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
