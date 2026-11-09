begin;
select no_plan();
-- These fixtures quote Cabin 101 at its pre-2026-11-09 terms; it is now listed as occupied.
update private.rental_catalogue set occupied=false,monthly_rent_paise=4000000 where code='cabin101';
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
insert into private.rental_catalogue_resources(code,resource_id) values('cabin101','93000000-0000-4000-8000-000000000011'),('hiwonder','93000000-0000-4000-8000-000000000012');
select throws_ok($$select public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","start":"2027-02-01","end":"2027-04-30"}')$$,'42501','Rental checkout unavailable','Closed release denies quotes');
-- Legacy combined-payment contracts remain supported. New bank contracts are covered in 064.
update private.rental_checkout_settings set enabled=true,release_ready=true,bank_deposits_enabled=true,fixture_member='93000000-0000-4000-8000-000000000001';
select throws_ok($$select public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","start":"2027-01-01","end":"2027-01-31"}')$$,'22023','Cabin 101 requires whole calendar months starting on the first','Existing cabin occupancy remains blocked');
select throws_ok($$select public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","start":"2027-02-02","end":"2027-03-31"}')$$,'22023','Cabin 101 requires whole calendar months starting on the first','Mid-month cabin start rejected');
select set_config('rental.q',public.rental_checkout('quote','93000000-0000-4000-8000-000000000001','{"product":"cabin101","partyType":"individual","start":"2027-02-01","end":"2027-02-28","testFixture":true}')::text,true);
select is((current_setting('rental.q')::jsonb->>'rent_paise')::bigint,5000::bigint,'Fixture rent is INR 50');
select is((current_setting('rental.q')::jsonb->>'deposit_paise')::bigint,10000::bigint,'Fixture bank deposit is INR 100');
select is((current_setting('rental.q')::jsonb->>'payment_amount_paise')::bigint,5000::bigint,'Gateway amount excludes bank deposit');
select throws_ok($$select public.rental_checkout('quote','93000000-0000-4000-8000-000000000002','{"product":"cabin101","start":"2027-03-01","end":"2027-03-31","testFixture":true}')$$,'42501','Staging fixture member required','Fixture cannot be requested by arbitrary member');
select set_config('rental.staff',jsonb_build_object('quoteId',current_setting('rental.q')::jsonb->>'id','reviewerId','93000000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select throws_ok(format('select public.rental_checkout(''prepare'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"reviewerAal":"aal1"}'),'42501','Independent MFA Admin required','AAL1 review rejected');
select set_config('rental.q',public.rental_checkout('prepare','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','capacity',1,'accessStart','09:00','accessEnd','17:00','includedFacilities','Synthetic desk and chair','permittedUsers',jsonb_build_array('Synthetic renter'),'stampRequired',true,'stampDecisionReason','Synthetic reviewed stamping decision','stampReference','TEST-STAMP-001')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',current_setting('rental.q')::jsonb->>'id'||'/'||repeat('a',64)||'.pdf';
select set_config('rental.q',public.rental_checkout('approve_manual','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('rental.q')::jsonb->>'agreement_hash','documentId','synthetic-cabin-doc','evidenceSha256',repeat('a',64),'evidencePath',current_setting('rental.q')::jsonb->>'id'||'/'||repeat('a',64)||'.pdf','confirmedBothSigners',true))::text,true);

select is(current_setting('rental.q')::jsonb->>'status','awaiting_deposit','Signatures alone do not enable rent checkout');
select throws_ok(format('select public.rental_checkout(''claim_order'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')),'22023','Fresh approved agreement required','Bank deposit required before rent order');
select public.rental_checkout('save_refund_account','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"accountName":"Synthetic Renter","bankName":"Synthetic Bank","accountNumber":"000000000001","ifsc":"TEST0000001","ownershipConfirmed":true}');
select is(public.rental_checkout('status','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'refund_account'->>'accountNumber',null::text,'Normal quote status never reveals full refund account');
select is(public.rental_checkout('status','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'refund_account'->>'last4','0001','Owner sees masked refund account');
select is(public.rental_checkout('status','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'refund_account'->>'accountName',null::text,'Status never reveals refund holder name');
select is(public.rental_checkout('status','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'refund_account'->>'ifsc',null::text,'Status never reveals refund IFSC');
select is((select count(*)::int from jsonb_array_elements(public.rental_checkout('staff_queue','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'quotes') x where x->'refund_account' ? 'ifsc' or x->'refund_account' ? 'accountName'),0,'Staff queue carries only masked refund accounts');
select is(public.rental_checkout('get_refund_account','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'refund_account'->>'ifsc','TEST0000001','Explicit MFA review still exposes IFSC');
select throws_ok(format('select public.rental_checkout(''get_refund_account'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"reviewerAal":"aal1"}'),'42501','Independent MFA Admin required','Full bank details require MFA staff');
select is(public.rental_checkout('get_refund_account','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'refund_account'->>'accountNumber','000000000001','Explicit MFA review exposes exact submitted account');
select public.rental_checkout('verify_refund_account','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"version":1,"confirmed":true,"evidence":"Synthetic account ownership reviewed"}');
select public.rental_checkout('submit_deposit_reference','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"reference":"test-bank-001"}');
select is(public.rental_checkout('status','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->>'deposit_status','submitted','Reference is pending, not verified');
select throws_ok(format('select public.rental_checkout(''verify_bank_deposit'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"reference":"TEST-BANK-001","evidence":"Synthetic bank credit checked","confirmed":true,"reviewerId":"93000000-0000-4000-8000-000000000001"}'),'42501','Independent MFA Admin required','Buyer cannot verify own deposit');
select set_config('rental.bank', (current_setting('rental.staff')::jsonb||'{"reference":"test-bank-001","evidence":"Synthetic bank credit checked","confirmed":true}')::text,true);
select set_config('rental.q',public.rental_checkout('verify_bank_deposit','93000000-0000-4000-8000-000000000001',current_setting('rental.bank')::jsonb)::text,true);
select is(current_setting('rental.q')::jsonb->>'deposit_status','verified','Independent Admin verifies bank credit');
select public.rental_checkout('verify_bank_deposit','93000000-0000-4000-8000-000000000001',current_setting('rental.bank')::jsonb||'{"reference":"TEST-BANK-001"}');
select is((select count(*)::int from private.rental_bank_transfers where quote_id=(current_setting('rental.q')::jsonb->>'id')::uuid),1,'Repeated bank verification is idempotent and case canonical');
select is((select count(*)::int from public.bookings where idempotency_key='rental:'||(current_setting('rental.q')::jsonb->>'id')),0,'Deposit alone creates no booking');
select public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb);
select public.rental_checkout('bind_order','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"orderId":"order_bankfixture"}');
select set_config('rental.payment',(current_setting('rental.staff')::jsonb||'{"orderId":"order_bankfixture","paymentId":"pay_bankfixture","amount":5000,"currency":"INR","refundedAmount":0}')::text,true);
select throws_ok(format('select public.rental_checkout(''capture'',null,''%s'')',current_setting('rental.payment')::jsonb||'{"amount":15000}'),'22023','Captured payment must match the rental order','Combined amount cannot satisfy rent-only order');
select set_config('rental.q',public.rental_checkout('capture',null,current_setting('rental.payment')::jsonb)::text,true);
select is(current_setting('rental.q')::jsonb->>'status','confirmed','Verified deposit plus captured rent confirms cabin');
select public.rental_checkout('capture',null,current_setting('rental.payment')::jsonb);
select is((select count(*)::int from public.bookings where idempotency_key='rental:'||(current_setting('rental.q')::jsonb->>'id')),1,'Repeated rent capture reserves only once');
select is((select count(*)::int from private.membership_paid_terms where payment_reference='pay_bankfixture'),1,'Exactly one paid cabin term');
select throws_ok(format('select public.rental_checkout(''record_bank_deposit_refund'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.bank')::jsonb||'{"reference":"BANK-REFUND-001","amountPaise":10000,"refundAccountVersion":1}'),'22023','Completed bank refund evidence required','Active booking requires cancellation or return before deposit refund recording');
select set_config('rental.q',public.rental_checkout('refund',null,current_setting('rental.payment')::jsonb||'{"refundedAmount":5000}')::text,true);
select is((current_setting('rental.q')::jsonb->>'deposit_refunded')::bigint,0::bigint,'Razorpay refund never marks bank deposit refunded');
select is((current_setting('rental.q')::jsonb->>'bank_deposit_refunded_paise')::bigint,0::bigint,'Bank liability remains after full rent refund');
select public.rental_checkout('save_refund_account','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"accountName":"Synthetic Renter","bankName":"Synthetic Bank","accountNumber":"000000000002","ifsc":"TEST0000001","ownershipConfirmed":true}');
select is(public.rental_checkout('status','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb)->'refund_account'->>'verifiedAt',null::text,'Account changes invalidate approval');
select throws_ok(format('select public.rental_checkout(''record_bank_deposit_refund'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.bank')::jsonb||'{"reference":"BANK-REFUND-001","amountPaise":10000,"refundAccountVersion":1}'),'22023','Current verified refund account required','Old payout account version cannot be used');
select public.rental_checkout('verify_refund_account','93000000-0000-4000-8000-000000000001',current_setting('rental.staff')::jsonb||'{"version":2,"confirmed":true,"evidence":"Synthetic revised account ownership reviewed"}');
select set_config('rental.q',public.rental_checkout('record_bank_deposit_refund','93000000-0000-4000-8000-000000000001',current_setting('rental.bank')::jsonb||'{"reference":"BANK-REFUND-001","amountPaise":10000,"refundAccountVersion":2}')::text,true);
select is(current_setting('rental.q')::jsonb->>'deposit_status','refunded','Bank repayment clears deposit liability');
select public.rental_checkout('record_bank_deposit_refund','93000000-0000-4000-8000-000000000001',current_setting('rental.bank')::jsonb||'{"reference":"bank-refund-001","amountPaise":10000,"refundAccountVersion":2}');
select is((select count(*)::int from private.rental_bank_transfers where direction='refunded' and quote_id=(current_setting('rental.q')::jsonb->>'id')::uuid),1,'Bank refund repeat cannot double-count');
select throws_ok(format('select public.rental_checkout(''record_bank_deposit_refund'',''%s'',''%s'')','93000000-0000-4000-8000-000000000001',current_setting('rental.bank')::jsonb||'{"reference":"BANK-REFUND-002","amountPaise":100,"refundAccountVersion":2}'),'22023','Bank refund exceeds held deposit','Cannot refund deposit twice');
select is((select count(*)::int from public.paid_access_entitlements where id=(current_setting('rental.q')::jsonb->>'entitlement_id')::uuid and revoked_at is null),0,'Full rent refund revokes paid access');
update private.rental_checkout_settings set fixture_member='93000000-0000-4000-8000-000000000002';
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at)
values('93000000-0000-4000-8000-000000000020','93000000-0000-4000-8000-000000000013','93000000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '50 days');
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
select '93000000-0000-4000-8000-000000000002',id,'93000000-0000-4000-8000-000000000013',now()+interval '1 day',now()+interval '50 days',1,1300000,'razorpay','93000000-0000-4000-8000-000000000002' from public.booking_products where code='workspace-month';
select set_config('rental.kit',public.rental_checkout('quote','93000000-0000-4000-8000-000000000002',jsonb_build_object('product','hiwonder','unit','month','testFixture',true,'start',(now() at time zone 'Asia/Kolkata')::date+5))::text,true);
select is((current_setting('rental.kit')::jsonb->>'ends_on')::date-(current_setting('rental.kit')::jsonb->>'starts_on')::date,29,'Kit month is exactly 30 days');
select is((current_setting('rental.kit')::jsonb->>'amount_paise')::bigint,15000::bigint,'Kit fixture separates INR 50 rent plus INR 100 bank deposit');
select set_config('rental.kitstaff',(current_setting('rental.staff')::jsonb||jsonb_build_object('quoteId',current_setting('rental.kit')::jsonb->>'id'))::text,true);
select set_config('rental.kit',public.rental_checkout('prepare','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','stampRequired',false,'stampDecisionReason','Owner approved current kit exception')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',(current_setting('rental.kit')::jsonb->>'id')||'/'||repeat('b',64)||'.pdf';
select public.rental_checkout('approve_manual','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||jsonb_build_object('agreementHash',current_setting('rental.kit')::jsonb->>'agreement_hash','documentId','synthetic-kit-doc','evidenceSha256',repeat('b',64),'evidencePath',(current_setting('rental.kit')::jsonb->>'id')||'/'||repeat('b',64)||'.pdf','confirmedBothSigners',true));
select throws_ok(format('select public.rental_checkout(''verify_bank_deposit'',''%s'',''%s'')','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"reference":"test-bank-001","evidence":"Synthetic bank credit checked","confirmed":true}'),'23505',null,'Same transfer cannot fund a second booking with changed case');
select public.rental_checkout('save_refund_account','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"accountName":"Synthetic Kit Renter","bankName":"Synthetic Bank","accountNumber":"000000000003","ifsc":"TEST0000001","ownershipConfirmed":true}');
select public.rental_checkout('verify_refund_account','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"version":1,"confirmed":true,"evidence":"Synthetic kit account ownership reviewed"}');
select public.rental_checkout('verify_bank_deposit','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"reference":"KIT-BANK-001","evidence":"Synthetic kit bank credit checked","confirmed":true}');
select public.rental_checkout('claim_order','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb);
select is(public.rental_checkout('availability','93000000-0000-4000-8000-000000000002',jsonb_build_object('product','hiwonder','unit','week','start',(now() at time zone 'Asia/Kolkata')::date+5))->>'available','false','Held single kit is unavailable to another quote');
select public.rental_checkout('bind_order','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"orderId":"order_kitfixture"}');
select set_config('rental.kitpayment',(current_setting('rental.kitstaff')::jsonb||'{"orderId":"order_kitfixture","paymentId":"pay_kitfixture","amount":5000,"currency":"INR","refundedAmount":0}')::text,true);
select set_config('rental.kit',public.rental_checkout('capture',null,current_setting('rental.kitpayment')::jsonb)::text,true);
select is(current_setting('rental.kit')::jsonb->>'status','confirmed','Captured kit payment allocates the single physical kit');
select is((select count(*)::int from private.membership_paid_terms where payment_reference='pay_kitfixture'),0,'Equipment never grants Premium or workspace membership');
select throws_ok($$update public.bookings set status='cancelled',cancelled_at=now(),cancelled_by=member_id where id='93000000-0000-4000-8000-000000000020'$$,'42501','Resolve dependent paid kit rental before changing workspace','Workspace cannot be cancelled under a paid active kit rental');
select is((select mock_payments_enabled from public.equipment_rental_settings),false,'Live kit fulfillment does not enable mock payments');
select is((select count(*)::int from private.rental_fulfillment_writes),0,'Scoped fulfillment write markers are removed');
select public.rental_checkout('handover','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"evidence":"Synthetic kit handed over with checked condition"}');
select public.rental_checkout('return','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"evidence":"Synthetic kit returned and inspected without damage"}');
select set_config('rental.kit',public.rental_checkout('record_bank_deposit_refund','93000000-0000-4000-8000-000000000002',current_setting('rental.kitstaff')::jsonb||'{"reference":"KIT-REFUND-001","evidence":"Synthetic outgoing bank transfer checked","confirmed":true,"amountPaise":10000,"refundAccountVersion":1}')::text,true);
select is((current_setting('rental.kit')::jsonb->>'bank_deposit_refunded_paise')::bigint,10000::bigint,'Equipment bank deposit fully returned after inspection');
select is((current_setting('rental.kit')::jsonb->>'refunded_amount')::bigint,0::bigint,'Bank deposit return does not fabricate Razorpay refund');

select throws_ok($$insert into private.rental_bank_transfers(quote_id,direction,reference,amount_paise,reviewer_id,evidence,refund_account_version)
 values('93000000-0000-4000-8000-000000000002','refunded','bank refund/001',100,'93000000-0000-4000-8000-000000000003','Synthetic punctuation variant',1)$$,
 '23505',null,'References differing only by punctuation or case are duplicates');
select * from finish();
rollback;
