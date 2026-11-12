begin;
select no_plan();
select ok(not has_function_privilege('authenticated','public.event_checkout(text,uuid,jsonb)','execute'),'Browser cannot write event ledger');
select ok(not has_table_privilege('authenticated','private.event_quotes','SELECT'),'Browser cannot read event requests');
select ok((select not enabled and not release_ready from private.event_checkout_settings),'Event checkout defaults closed');
select is((select public from storage.buckets where id='event-agreements'),false,'Event agreement PDFs remain private');
select is((select price_paise from public.booking_products where code='event-hour'),250000::bigint,'Event hire is 2500 per hour');
select is(private.event_refund_due(750000,'2027-03-13 10:00+05:30','2027-03-08 10:00+05:30'),375000::bigint,'Cancelling exactly 48 hours before refunds half');
select is(private.event_refund_due(750000,'2027-03-13 10:00+05:30','2027-03-08 10:01+05:30'),0::bigint,'Cancelling under 48 hours refunds nothing');

insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','event-live-'||n||'@example.test',now(),'1202555094'||n,now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Event',email,'+'||phone,'https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '94000000%';
insert into private.member_phone_verifications select id,'+'||phone,now() from auth.users where id::text like '94000000%';
insert into public.staff_roles(user_id,role) values('94000000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
update public.booking_policy_settings set mock_grants_enabled=false;
insert into public.locations(id,slug,name) values('94000000-0000-4000-8000-000000000010','event-live-fixture','Synthetic event lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days)
values('94000000-0000-4000-8000-000000000011','94000000-0000-4000-8000-000000000010','event-fixture','Synthetic event room','room',40,900,366);
insert into public.resource_booking_policies(resource_id,kind) values('94000000-0000-4000-8000-000000000011','event');

select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"10:00","hours":3,"attendees":20,"purpose":"Synthetic robotics meetup"}')$$,'42501','Event checkout unavailable','Closed release denies quotes');
update private.event_checkout_settings set enabled=true,release_ready=true,event_resource='94000000-0000-4000-8000-000000000011';
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"10:00","hours":0,"attendees":20,"purpose":"Synthetic robotics meetup"}')$$,'22023',null,'Events need at least one hour');
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"07:00","hours":2,"attendees":20,"purpose":"Synthetic robotics meetup"}')$$,'22023',null,'Events cannot start before 08:00');
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-10","startTime":"16:00","hours":2,"attendees":20,"purpose":"Synthetic robotics meetup"}')$$,'22023',null,'Weekday events cannot start before 17:00');
select is(public.event_checkout('availability','94000000-0000-4000-8000-000000000001','{"date":"2027-03-10"}')->>'opens','17:00','Weekdays open at 17:00');
select is(public.event_checkout('availability','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13"}')->>'opens','08:00','Saturdays open at 08:00');
select is(private.event_opens('2027-03-14'),time '08:00','Sundays open at 08:00');
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"21:00","hours":3,"attendees":20,"purpose":"Synthetic robotics meetup"}')$$,'22023',null,'Events must end by 23:00');
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"10:30","hours":2,"attendees":20,"purpose":"Synthetic robotics meetup"}')$$,'22023',null,'Events start on the hour');
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"10:00","hours":2,"attendees":36,"purpose":"Synthetic robotics meetup"}')$$,'22023',null,'Events are capped at 35 attendees');
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"10:00","hours":2,"attendees":20,"purpose":"short"}')$$,'22023',null,'Events need a purpose');

select set_config('event.q',public.event_checkout('quote','94000000-0000-4000-8000-000000000001','{"date":"2027-03-13","startTime":"10:00","hours":3,"attendees":20,"purpose":"Synthetic robotics meetup"}')::text,true);
select is((current_setting('event.q')::jsonb->>'amount_paise')::bigint,750000::bigint,'Three hours cost 7500');
select is(current_setting('event.q')::jsonb->>'status','awaiting_staff','New request waits for staff');
select is((current_setting('event.q')::jsonb->>'starts_at')::timestamptz,'2027-03-13 10:00+05:30'::timestamptz,'Start is stored in lab time');
select throws_ok(format('select public.event_checkout(''claim_order'',''%s'',''%s'')','94000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('event.q')::jsonb->>'id')),'22023','Fresh approved agreement required','Unapproved request cannot pay');
select throws_ok(format('select public.event_checkout(''status'',''%s'',''%s'')','94000000-0000-4000-8000-000000000002',jsonb_build_object('quoteId',current_setting('event.q')::jsonb->>'id')),'42501','Event request unavailable','Members cannot read other requests');
select is(public.event_checkout('lookup_order',null,'{"orderId":"order_unknown"}')->>'status','ignored','Unknown order leaves desk and rental webhook routing intact');

select set_config('event.staff',jsonb_build_object('quoteId',current_setting('event.q')::jsonb->>'id','reviewerId','94000000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select set_config('event.particulars',jsonb_build_object('particulars',jsonb_build_object('availabilityConfirmed',true,'eventDetailsReviewed',true,'termsVersion','event-2026-11-09','setupNotes','Synthetic theatre seating for twenty'))::text,true);
select throws_ok(format('select public.event_checkout(''prepare'',''%s'',''%s'')','94000000-0000-4000-8000-000000000001',current_setting('event.staff')::jsonb||current_setting('event.particulars')::jsonb||'{"reviewerAal":"aal1"}'),'42501','Independent MFA Admin required','AAL1 approval rejected');
select set_config('event.q',public.event_checkout('prepare','94000000-0000-4000-8000-000000000001',current_setting('event.staff')::jsonb||current_setting('event.particulars')::jsonb)::text,true);
select is(current_setting('event.q')::jsonb->>'status','awaiting_signatures','Staff approval sends the agreement');

insert into storage.objects(bucket_id,name) select 'event-agreements',current_setting('event.q')::jsonb->>'id'||'/'||repeat('e',64)||'.pdf';
select set_config('event.q',public.event_checkout('approve_manual','94000000-0000-4000-8000-000000000001',current_setting('event.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('event.q')::jsonb->>'agreement_hash','documentId','synthetic-event-doc','evidenceSha256',repeat('e',64),'evidencePath',current_setting('event.q')::jsonb->>'id'||'/'||repeat('e',64)||'.pdf','confirmedBothSigners',true))::text,true);
select is(current_setting('event.q')::jsonb->>'status','approved','Signed agreement opens payment');
select is(public.event_checkout('claim_order','94000000-0000-4000-8000-000000000001',current_setting('event.staff')::jsonb)->>'claimed','true','First claim holds the slot');
select is(public.event_checkout('claim_order','94000000-0000-4000-8000-000000000001',current_setting('event.staff')::jsonb)->>'claimed','false','Second claim cannot issue another order');
select is((select upper(period)-lower(period) from private.checkout_inventory_holds where quote_id=(current_setting('event.q')::jsonb->>'id')::uuid),interval '3 hours 40 minutes','Hold covers the setup buffer');
select throws_ok($$select public.event_checkout('quote','94000000-0000-4000-8000-000000000002','{"date":"2027-03-13","startTime":"13:00","hours":1,"attendees":5,"purpose":"Synthetic overlapping workshop"}')$$,'23P01','Event slot is no longer available','Held slot blocks a back-to-back request inside the buffer');
select is(jsonb_array_length(public.event_checkout('availability','94000000-0000-4000-8000-000000000002','{"date":"2027-03-13"}')->'busy'),1,'Availability shows the held period');

select public.event_checkout('bind_order','94000000-0000-4000-8000-000000000001',current_setting('event.staff')::jsonb||'{"orderId":"order_eventfixture"}');
select set_config('event.payment',(current_setting('event.staff')::jsonb||'{"orderId":"order_eventfixture","paymentId":"pay_eventfixture","amount":750000,"currency":"INR","refundedAmount":0}')::text,true);
select throws_ok(format('select public.event_checkout(''capture'',null,''%s'')',current_setting('event.payment')::jsonb||'{"amount":700000}'),'22023','Captured payment must match the event order','Wrong amount is rejected');
select set_config('event.q',public.event_checkout('capture',null,current_setting('event.payment')::jsonb)::text,true);
select is(current_setting('event.q')::jsonb->>'status','confirmed','Paid event is confirmed');
select public.event_checkout('capture',null,current_setting('event.payment')::jsonb);
select is((select count(*)::int from public.bookings where idempotency_key='event:'||(current_setting('event.q')::jsonb->>'id')),1,'Duplicate capture does not double-book');
select is((select upper(period)-lower(period) from public.resource_reservations where booking_id=(current_setting('event.q')::jsonb->>'bookingId')::uuid),interval '3 hours 40 minutes','Reservation keeps the setup buffer');
select ok((select daytime_event_approved and price_paise=750000 from public.paid_access_entitlements where id=(current_setting('event.q')::jsonb->>'entitlement_id')::uuid),'Approved event entitlement allows weekday daytime check-in');
select is((select count(*)::int from private.billing_operations where source='event_quote' and kind='invoice_create' and invoice_number like 'ARM-E-202703-%'),1,'Captured event queues one invoice');
select throws_ok($$update public.bookings set ends_at=ends_at+interval '1 hour' where idempotency_key like 'event:%'$$,'42501','Signed event requires a new approved agreement','Paid event times cannot be changed');

select throws_ok(format('select public.event_checkout(''cancel'',''%s'',''%s'')','94000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('event.q')::jsonb->>'id','reason','Synthetic change of plans')),'22023',null,'Cancellation needs explicit confirmation');
select set_config('event.q',public.event_checkout('cancel','94000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('event.q')::jsonb->>'id','reason','Synthetic change of plans','confirmed',true))::text,true);
select is(current_setting('event.q')::jsonb->>'status','cancelled','Member can cancel a paid event');
select is((current_setting('event.q')::jsonb->>'refund_due_paise')::bigint,375000::bigint,'Early cancellation records a 50% refund due');
select is((select status::text from public.bookings where id=(current_setting('event.q')::jsonb->>'bookingId')::uuid),'cancelled','Cancellation cancels the booking');
select ok((select revoked_at is not null from public.paid_access_entitlements where id=(current_setting('event.q')::jsonb->>'entitlement_id')::uuid),'Cancellation revokes event access');
select is(jsonb_array_length(public.event_checkout('availability','94000000-0000-4000-8000-000000000002','{"date":"2027-03-13"}')->'busy'),0,'Cancelled slot is free again');
select public.event_checkout('refund',null,current_setting('event.payment')::jsonb||'{"refundedAmount":375000}');
select is((select review_reason from private.event_quotes where payment_id='pay_eventfixture'),null,'Policy refund needs no review');
select public.event_checkout('refund',null,current_setting('event.payment')::jsonb||'{"refundedAmount":500000}');
select is((select review_reason from private.event_quotes where payment_id='pay_eventfixture'),'refund_above_policy_requires_review','Refund above policy is flagged');

-- Late cancellation: tomorrow evening is always under 48 hours away.
select set_config('event.late',public.event_checkout('quote','94000000-0000-4000-8000-000000000002',jsonb_build_object('date',(now() at time zone 'Asia/Kolkata')::date+1,'startTime','21:00','hours',1,'attendees',10,'purpose','Synthetic late evening session'))::text,true);
select set_config('event.latestaff',(current_setting('event.staff')::jsonb||jsonb_build_object('quoteId',current_setting('event.late')::jsonb->>'id'))::text,true);
select set_config('event.late',public.event_checkout('prepare','94000000-0000-4000-8000-000000000002',current_setting('event.latestaff')::jsonb||current_setting('event.particulars')::jsonb)::text,true);
insert into storage.objects(bucket_id,name) select 'event-agreements',current_setting('event.late')::jsonb->>'id'||'/'||repeat('f',64)||'.pdf';
select public.event_checkout('approve_manual','94000000-0000-4000-8000-000000000002',current_setting('event.latestaff')::jsonb||jsonb_build_object('agreementHash',current_setting('event.late')::jsonb->>'agreement_hash','documentId','synthetic-late-doc','evidenceSha256',repeat('f',64),'evidencePath',current_setting('event.late')::jsonb->>'id'||'/'||repeat('f',64)||'.pdf','confirmedBothSigners',true));
select public.event_checkout('claim_order','94000000-0000-4000-8000-000000000002',current_setting('event.latestaff')::jsonb);
select throws_ok(format('select public.event_checkout(''cancel'',''%s'',''%s'')','94000000-0000-4000-8000-000000000002',jsonb_build_object('quoteId',current_setting('event.late')::jsonb->>'id','reason','Synthetic change of plans','confirmed',true)),'22023',null,'Cannot cancel while a payment is pending');
select public.event_checkout('bind_order','94000000-0000-4000-8000-000000000002',current_setting('event.latestaff')::jsonb||'{"orderId":"order_latefixture"}');
select is(public.event_checkout('capture',null,current_setting('event.latestaff')::jsonb||'{"orderId":"order_latefixture","paymentId":"pay_latefixture","amount":250000,"currency":"INR","refundedAmount":0}')->>'status','confirmed','One-hour event is confirmed');
select is((public.event_checkout('cancel','94000000-0000-4000-8000-000000000002',jsonb_build_object('quoteId',current_setting('event.late')::jsonb->>'id','reason','Synthetic change of plans','confirmed',true))->>'refund_due_paise')::bigint,0::bigint,'Late cancellation refunds nothing');

-- Staff can decline an unpaid request.
select set_config('event.declined',public.event_checkout('quote','94000000-0000-4000-8000-000000000002','{"date":"2027-04-14","startTime":"18:00","hours":2,"attendees":30,"purpose":"Synthetic evening demo night"}')::text,true);
select is(public.event_checkout('decline','94000000-0000-4000-8000-000000000002',current_setting('event.staff')::jsonb||jsonb_build_object('quoteId',current_setting('event.declined')::jsonb->>'id','reason','Synthetic room already promised'))->>'status','declined','Staff can decline with a reason');
select throws_ok(format('select public.event_checkout(''prepare'',''%s'',''%s'')','94000000-0000-4000-8000-000000000002',current_setting('event.staff')::jsonb||current_setting('event.particulars')::jsonb||jsonb_build_object('quoteId',current_setting('event.declined')::jsonb->>'id')),'22023','Event request is no longer open for approval','Declined request cannot be approved');
select is(jsonb_array_length(public.event_checkout('staff_queue',null,current_setting('event.staff')::jsonb)->'quotes'),3,'Staff queue lists all event requests');
select is(jsonb_array_length(public.event_checkout('list_own','94000000-0000-4000-8000-000000000001','{}')->'quotes'),1,'Members list only their own requests');
select * from finish();
rollback;
