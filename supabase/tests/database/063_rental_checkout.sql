begin;
select no_plan();
select ok(not has_function_privilege('authenticated','public.rental_checkout(text,uuid,jsonb)','execute'),'Browser cannot write rental ledger');
select ok(not has_table_privilege('authenticated','private.rental_quotes','INSERT'),'Browser cannot create forged paid quotes');
select ok((select not enabled and not release_ready from private.rental_checkout_settings),'Rental collection defaults closed');
select is((select public from storage.buckets where id='rental-agreements'),false,'Agreement PDFs remain private');
insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','rental-live-'||n||'@example.test',now(),'1202555093'||n,now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Rental',email,'+'||phone,'https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '93000000%';
insert into private.member_phone_verifications select id,'+'||phone,now() from auth.users where id::text like '93000000%';
insert into public.staff_roles(user_id,role) values('93000000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
update public.booking_policy_settings set mock_grants_enabled=false;
insert into public.locations(id,slug,name) values('93000000-0000-4000-8000-000000000010','rental-live-fixture','Synthetic rental lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days)
select ('93000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'93000000-0000-4000-8000-000000000010','rental-fixture-'||n,'Synthetic rental '||n,'workspace',1,525600,366 from generate_series(11,13)n;
insert into public.resource_booking_policies(resource_id,kind) values
('93000000-0000-4000-8000-000000000011','cabin'),('93000000-0000-4000-8000-000000000012','equipment'),('93000000-0000-4000-8000-000000000013','workspace');
-- Isolated fixture mappings are rolled back; no physical inventory is fabricated in production.
delete from public.booking_inventory where code='C01';
insert into public.booking_inventory(resource_id,code,floor,room) values('93000000-0000-4000-8000-000000000011','C01','GF','GF-01');
insert into public.components(id,slug,name,category,inventory_kind) values('93000000-0000-4000-8000-000000000014','rental-fixture-kit','Synthetic kit','Robotics','serialized_reusable');
insert into public.inventory_locations(id,lab_location_id,code,name) values('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000010','RENTAL-LIVE-FIXTURE','Synthetic inventory');
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) values('93000000-0000-4000-8000-000000000016','93000000-0000-4000-8000-000000000014','93000000-0000-4000-8000-000000000015','ARM-TEST-930001');
insert into public.equipment_rental_units(asset_unit_id,resource_id,commissioned,commissioned_by,commissioned_at,reason)
values('93000000-0000-4000-8000-000000000016','93000000-0000-4000-8000-000000000012',true,'93000000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture');
update private.rental_checkout_settings set cabin_resource='93000000-0000-4000-8000-000000000011',equipment_resource='93000000-0000-4000-8000-000000000012';
select throws_ok($$select public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","start":"2027-02-01","end":"2027-04-30"}')$$,'42501','Rental checkout unavailable','Closed release denies quotes');
update private.rental_checkout_settings set enabled=true,release_ready=true;
select throws_ok($$select public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","start":"2027-01-01","end":"2027-01-31"}')$$,'22023','Cabin 101 requires whole calendar months starting on the first','Existing cabin occupancy remains blocked');
select throws_ok($$select public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","start":"2027-02-02","end":"2027-03-31"}')$$,'22023','Cabin 101 requires whole calendar months starting on the first','Mid-month cabin start rejected');
select set_config('rental.q',public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","partyType":"individual","start":"2027-02-01","end":"2027-04-30"}')::text,true);
select is((current_setting('rental.q')::jsonb->>'rent_paise')::bigint,4000000::bigint,'Cabin full first-month rent is 40000');
select is((current_setting('rental.q')::jsonb->>'deposit_paise')::bigint,8000000::bigint,'Cabin deposit is separate 80000');
select is(current_setting('rental.q')::jsonb->>'party_type','individual','Individual cabin has no invented company');
select throws_ok(format('select public.rental_checkout(''claim_order'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('rental.q')::jsonb->>'id')),'22023','Fresh approved agreement required','Unsigned rental cannot claim an order');
select is(public.rental_checkout('lookup_order',null,'{"orderId":"order_unknown"}')->>'status','ignored','Unknown rental order leaves desk webhook routing intact');
select set_config('rental.staff',jsonb_build_object('quoteId',current_setting('rental.q')::jsonb->>'id','reviewerId','93000000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select throws_ok(format('select public.rental_checkout(''prepare'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"reviewerAal":"aal1"}'),'42501','Independent MFA Admin required','AAL1 review rejected');
select set_config('rental.q',public.rental_checkout('prepare','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','capacity',1,'accessStart','09:00','accessEnd','17:00','includedFacilities','Synthetic desk and chair','permittedUsers',jsonb_build_array('Synthetic renter'),'stampRequired',true,'stampDecisionReason','Synthetic reviewed stamping decision','stampReference','TEST-STAMP-001')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',current_setting('rental.q')::jsonb->>'id'||'/'||repeat('a',64)||'.pdf';
select set_config('rental.q',public.rental_checkout('approve_manual','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('rental.q')::jsonb->>'agreement_hash','documentId','synthetic-cabin-doc','evidenceSha256',repeat('a',64),'evidencePath',current_setting('rental.q')::jsonb->>'id'||'/'||repeat('a',64)||'.pdf','confirmedBothSigners',true))::text,true);
select is(current_setting('rental.q')::jsonb->>'status','approved','Completed private agreement enables payment review');
select is(public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->>'claimed','true','First order claim acquires inventory hold');
select is(public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->>'claimed','false','Duplicate order claim cannot issue a second order');
select public.rental_checkout('bind_order','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"orderId":"order_rentalfixture"}');
select set_config('rental.payment',(current_setting('rental.staff')::jsonb||'{"orderId":"order_rentalfixture","paymentId":"pay_rentalfixture","amount":12000000,"currency":"INR","refundedAmount":0}')::text,true);
select set_config('rental.q',public.rental_checkout('capture',null,current_setting('rental.payment')::jsonb)::text,true);
select is(current_setting('rental.q')::jsonb->>'status','confirmed','Captured cabin payment reserves whole cabin');
select is((select count(*)::int from private.membership_paid_terms where payment_reference='pay_rentalfixture'),1,'Cabin customer receives one paid term');
select is((select ends_at from private.membership_paid_terms where payment_reference='pay_rentalfixture'),'2027-03-01 00:00+05:30'::timestamptz,'Cabin Premium covers paid calendar month only');
select public.rental_checkout('capture',null,current_setting('rental.payment')::jsonb);
select is((select count(*)::int from public.bookings where idempotency_key='rental:'||(current_setting('rental.q')::jsonb->>'id')),1,'Duplicate capture does not double-book');
select set_config('rental.renewal',public.rental_checkout('renewal_quote','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||jsonb_build_object('parentQuoteId',current_setting('rental.q')::jsonb->>'id','start','2027-03-01'))::text,true);
select is((current_setting('rental.renewal')::jsonb->>'deposit_paise')::bigint,0::bigint,'Subsequent monthly invoice never recollects deposit');
select is((current_setting('rental.renewal')::jsonb->>'rent_paise')::bigint,4000000::bigint,'Subsequent month charges one full calendar rent');
select throws_ok(format('select public.rental_checkout(''renewal_quote'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||jsonb_build_object('parentQuoteId',current_setting('rental.q')::jsonb->>'id','start','2027-04-01')),'22023','Invoice only the next unpaid calendar month','Monthly invoices cannot skip unpaid months');
select public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('rental.renewal')::jsonb->>'id'));
select public.rental_checkout('bind_order','93000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('rental.renewal')::jsonb->>'id','orderId','order_renewalfixture'));
select set_config('rental.renewalpayment',jsonb_build_object('quoteId',current_setting('rental.renewal')::jsonb->>'id','orderId','order_renewalfixture','paymentId','pay_renewalfixture','amount',4000000,'currency','INR','refundedAmount',0)::text,true);
select is(public.rental_checkout('capture',null,current_setting('rental.renewalpayment')::jsonb)->>'status','confirmed','Monthly rent capture extends paid period');
select is((select count(*)::int from public.bookings where idempotency_key='rental:'||(current_setting('rental.q')::jsonb->>'id')),1,'Monthly rent does not create another physical cabin reservation');
select public.rental_checkout('refund',null,current_setting('rental.renewalpayment')::jsonb||'{"refundedAmount":4000000}');
select is((select status::text from public.bookings where id=(current_setting('rental.q')::jsonb->>'bookingId')::uuid),'confirmed','Monthly rent refund does not cancel original cabin reservation');
select is((select count(*)::int from private.membership_paid_terms where payment_reference='pay_rentalfixture' and revoked_at is null),1,'Monthly invoice refund preserves original paid month');
select public.rental_checkout('refund',null,current_setting('rental.payment')::jsonb||'{"refundedAmount":8000000}');
select is((select count(*)::int from private.membership_paid_terms where payment_reference='pay_rentalfixture' and revoked_at is null),1,'Partial refund does not revoke rent entitlement');
select public.rental_checkout('refund',null,current_setting('rental.payment')::jsonb||'{"refundedAmount":12000000}');
select is(public.rental_checkout('capture',null,current_setting('rental.payment')::jsonb)->>'status','refunded','Stale capture cannot resurrect refunded booking');
select is((select count(*)::int from private.membership_paid_terms where payment_reference='pay_rentalfixture' and revoked_at is null),0,'Full refund revokes paid membership');
select throws_ok(format('select public.rental_checkout(''quote'',''%s'',''%s'')','93000000-0000-4000-8000-000000000002',jsonb_build_object('product','hiwonder','unit','week','start',(now() at time zone 'Asia/Kolkata')::date+5)),'22023','Confirmed paid workspace required for every rental day','Kit requires paid workspace, not just Verified membership');
-- Paid same-lab workspace for all kit days, with preparation gates still off.
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at)
values('93000000-0000-4000-8000-000000000020','93000000-0000-4000-8000-000000000013','93000000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '50 days');
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
select '93000000-0000-4000-8000-000000000002',id,'93000000-0000-4000-8000-000000000013',now()+interval '1 day',now()+interval '50 days',1,1300000,'razorpay','93000000-0000-4000-8000-000000000002' from public.booking_products where code='workspace-month';
select set_config('rental.kit',public.rental_checkout('quote','93000000-0000-4000-8000-000000000002',jsonb_build_object('product','hiwonder','unit','month','start',(now() at time zone 'Asia/Kolkata')::date+5))::text,true);
select is((current_setting('rental.kit')::jsonb->>'ends_on')::date-(current_setting('rental.kit')::jsonb->>'starts_on')::date,29,'Kit month is exactly 30 days');
select is((current_setting('rental.kit')::jsonb->>'amount_paise')::bigint,2890000::bigint,'Kit quote separates 3900 rent plus 25000 deposit');
select set_config('rental.kitstaff',(current_setting('rental.staff')::jsonb||jsonb_build_object('quoteId',current_setting('rental.kit')::jsonb->>'id'))::text,true);
select set_config('rental.kit',public.rental_checkout('prepare','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','stampRequired',false,'stampDecisionReason','Owner approved current kit exception')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',(current_setting('rental.kit')::jsonb->>'id')||'/'||repeat('b',64)||'.pdf';
select public.rental_checkout('approve_manual','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||jsonb_build_object('agreementHash',current_setting('rental.kit')::jsonb->>'agreement_hash','documentId','synthetic-kit-doc','evidenceSha256',repeat('b',64),'evidencePath',(current_setting('rental.kit')::jsonb->>'id')||'/'||repeat('b',64)||'.pdf','confirmedBothSigners',true));
select public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb);
select is(public.rental_checkout('availability','93000000-0000-4000-8000-000000000002',jsonb_build_object('product','hiwonder','unit','week','start',(now() at time zone 'Asia/Kolkata')::date+5))->>'available','false','Held single kit is unavailable to another quote');
select public.rental_checkout('bind_order','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"orderId":"order_kitfixture"}');
select set_config('rental.kitpayment',(current_setting('rental.kitstaff')::jsonb||'{"orderId":"order_kitfixture","paymentId":"pay_kitfixture","amount":2890000,"currency":"INR","refundedAmount":0}')::text,true);
select set_config('rental.kit',public.rental_checkout('capture',null,current_setting('rental.kitpayment')::jsonb)::text,true);
select is(current_setting('rental.kit')::jsonb->>'status','confirmed','Captured kit payment allocates the single physical kit');
select is((select count(*)::int from private.membership_paid_terms where payment_reference='pay_kitfixture'),0,'Equipment never grants Premium or workspace membership');
select throws_ok($$update public.bookings set status='cancelled',cancelled_at=now(),cancelled_by=member_id where id='93000000-0000-4000-8000-000000000020'$$,'42501','Resolve dependent paid kit rental before changing workspace','Workspace cannot be cancelled under a paid active kit rental');
select is((select mock_payments_enabled from public.equipment_rental_settings),false,'Live kit fulfillment does not enable mock payments');
select is((select count(*)::int from private.rental_fulfillment_writes),0,'Scoped fulfillment write markers are removed');
-- Existing mapped-cabin protection remains enforced without the scoped trusted write.
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at)
values('93000000-0000-4000-8000-000000000030','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000002','2027-06-01 00:00+05:30','2027-07-01 00:00+05:30');
select throws_ok($$insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at) values('93000000-0000-4000-8000-000000000011','booking','93000000-0000-4000-8000-000000000030','2027-06-01 00:00+05:30','2027-07-01 00:00+05:30')$$,'42501','Cabins require whole-cabin monthly team access','Ordinary individual insert cannot bypass old cabin entitlement guard');
select throws_ok($$update public.bookings set ends_at=ends_at+interval '1 day' where id=(select booking_id from private.rental_quotes where payment_id='pay_kitfixture')$$,'42501','Use the equipment rental transaction','Paid rental dates cannot be silently changed');
select is(public.rental_checkout('availability','93000000-0000-4000-8000-000000000002',jsonb_build_object('product','hiwonder','unit','week','start',(now() at time zone 'Asia/Kolkata')::date+5))->>'available','false','Captured kit allocation blocks competing reservations');
-- A withdrawn kit cannot fulfill even when a previously valid hold exists.
select set_config('rental.withdrawn',public.rental_checkout('quote','93000000-0000-4000-8000-000000000002',jsonb_build_object('product','hiwonder','unit','week','start',(now() at time zone 'Asia/Kolkata')::date+40))::text,true);
select set_config('rental.withdrawnstaff',(current_setting('rental.staff')::jsonb||jsonb_build_object('quoteId',current_setting('rental.withdrawn')::jsonb->>'id'))::text,true);
select set_config('rental.withdrawn',public.rental_checkout('prepare','93000000-0000-4000-8000-000000000002',current_setting('rental.withdrawnstaff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic active contract record policy','unusedDepositTerms','Synthetic manual reviewed deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','stampRequired',false,'stampDecisionReason','Owner approved current kit exception')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',(current_setting('rental.withdrawn')::jsonb->>'id')||'/'||repeat('c',64)||'.pdf';
select public.rental_checkout('approve_manual','93000000-0000-4000-8000-000000000002',current_setting('rental.withdrawnstaff')::jsonb||jsonb_build_object('agreementHash',current_setting('rental.withdrawn')::jsonb->>'agreement_hash','documentId','synthetic-withdrawn-doc','evidenceSha256',repeat('c',64),'evidencePath',(current_setting('rental.withdrawn')::jsonb->>'id')||'/'||repeat('c',64)||'.pdf','confirmedBothSigners',true));
select public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000002',current_setting('rental.withdrawnstaff')::jsonb);
select public.rental_checkout('bind_order','93000000-0000-4000-8000-000000000002',current_setting('rental.withdrawnstaff')::jsonb||'{"orderId":"order_withdrawnfixture"}');
update public.equipment_rental_units set commissioned=false where resource_id='93000000-0000-4000-8000-000000000012';
select is(public.rental_checkout('capture',null,current_setting('rental.withdrawnstaff')::jsonb||'{"orderId":"order_withdrawnfixture","paymentId":"pay_withdrawnfixture","amount":2605000,"currency":"INR","refundedAmount":0}')->>'status','needs_review','Withdrawn kit capture queues review instead of allocating unsafe equipment');
select is((select booking_id from private.rental_quotes where payment_id='pay_withdrawnfixture'),null::uuid,'Withdrawn kit has no false reservation');
select is((select count(*)::int from private.rental_quotes where product='hiwonder' and payment_id is not null and booking_id is not null),1,'Only the valid single-kit fulfillment remains');
-- A separately isolated historical fixture exercises rent collected during its month.
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at,idempotency_key)
values('93000000-0000-4000-8000-000000000040','93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000001',
(date_trunc('month',now() at time zone 'Asia/Kolkata')-interval '1 month') at time zone 'Asia/Kolkata',
(date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '2 months') at time zone 'Asia/Kolkata','rental:93000000-0000-4000-8000-000000000041');
insert into private.rental_quotes(id,member_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,policy_version,agreement_hash,particulars,prepared_by,prepared_at,reviewer_id,approved_at,document_id,evidence_sha256,evidence_path,payment_id,captured_at,booking_id)
select '93000000-0000-4000-8000-000000000041',member_id,product,party_type,resource_id,unit,
(date_trunc('month',now() at time zone 'Asia/Kolkata')-interval '1 month')::date,(date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '2 months')::date-1,
rent_paise,deposit_paise,policy_version,'synthetic-historical-hash',particulars,prepared_by,prepared_at,reviewer_id,approved_at,'synthetic-historical-doc',repeat('d',64),'synthetic-historical-private-path','pay_historicalfixture',now()-interval '1 month','93000000-0000-4000-8000-000000000040'
from private.rental_quotes where payment_id='pay_rentalfixture';
insert into private.rental_fulfillment_writes values(txid_current(),'93000000-0000-4000-8000-000000000011','93000000-0000-4000-8000-000000000041');
insert into public.resource_reservations(resource_id,kind,booking_id,starts_at,ends_at)
select resource_id,'booking',id,starts_at,ends_at from public.bookings where id='93000000-0000-4000-8000-000000000040';
delete from private.rental_fulfillment_writes where transaction_id=txid_current();
select set_config('rental.current',public.rental_checkout('renewal_quote','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||jsonb_build_object('parentQuoteId','93000000-0000-4000-8000-000000000041','start',date_trunc('month',now() at time zone 'Asia/Kolkata')::date))::text,true);
select public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('rental.current')::jsonb->>'id'));
select public.rental_checkout('bind_order','93000000-0000-4000-8000-000000000001',jsonb_build_object('quoteId',current_setting('rental.current')::jsonb->>'id','orderId','order_currentfixture'));
select is(public.rental_checkout('capture',null,jsonb_build_object('quoteId',current_setting('rental.current')::jsonb->>'id','orderId','order_currentfixture','paymentId','pay_currentfixture','amount',4000000,'currency','INR','refundedAmount',0))->>'status','confirmed','Rent can be paid during the current month through staff-issued invoice');
select ok((select starts_at>=now() from private.membership_paid_terms where payment_reference='pay_currentfixture'),'Current-month payment grants no retroactive Premium');
select is((select ends_at from private.membership_paid_terms where payment_reference='pay_currentfixture'),(date_trunc('month',now() at time zone 'Asia/Kolkata')+interval '1 month') at time zone 'Asia/Kolkata','Current-month payment ends at the agreed calendar boundary');
select public.rental_checkout('handover','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"evidence":"Synthetic complete kit condition and inventory checked"}');
select is(public.rental_checkout('return','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"evidence":"Synthetic returned kit condition record; deposit review pending"}')->>'status','returned','Staff return completes the rental without inventing a refund');
select ok((select released_at is not null from public.resource_reservations where booking_id=(select booking_id from private.rental_quotes where payment_id='pay_kitfixture')),'Return releases physical inventory for another booking');
select is((select refunded_amount from private.rental_quotes where payment_id='pay_kitfixture'),0::bigint,'Recording return does not fabricate provider refund');
select * from finish();
rollback;
