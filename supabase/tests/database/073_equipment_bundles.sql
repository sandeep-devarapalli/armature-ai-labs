begin;
select no_plan();

insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('97300000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','rental-bundle-'||n||'@example.test',now(),'1202555073'||n,now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Bundle Renter',email,'+'||phone,'https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '97300000%';
insert into private.member_phone_verifications select id,'+'||phone,now() from auth.users where id::text like '97300000%';
insert into public.staff_roles(user_id,role) values('97300000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
update public.booking_policy_settings set mock_grants_enabled=false;
update private.rental_checkout_settings set enabled=true,release_ready=true,bank_deposits_enabled=false;
insert into public.locations(id,slug,name) values('97300000-0000-4000-8000-000000000010','rental-bundle-fixture','Synthetic bundle lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days) values
('97300000-0000-4000-8000-000000000012','97300000-0000-4000-8000-000000000010','bundle-camera','Synthetic bundle camera','equipment',1,525600,366),
('97300000-0000-4000-8000-000000000013','97300000-0000-4000-8000-000000000010','bundle-arm','Synthetic bundle arm','equipment',1,525600,366),
('97300000-0000-4000-8000-000000000014','97300000-0000-4000-8000-000000000010','bundle-workspace','Synthetic bundle workspace','workspace',1,525600,366);
insert into public.resource_booking_policies(resource_id,kind) values('97300000-0000-4000-8000-000000000012','equipment'),
('97300000-0000-4000-8000-000000000013','equipment'),('97300000-0000-4000-8000-000000000014','workspace');
insert into public.components(id,slug,name,category,inventory_kind) values('97300000-0000-4000-8000-000000000020','bundle-fixture-kit','Synthetic kit','Vision','serialized_reusable');
insert into public.inventory_locations(id,lab_location_id,code,name) values('97300000-0000-4000-8000-000000000021','97300000-0000-4000-8000-000000000010','BUNDLE-FIXTURE','Synthetic inventory');
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) values
('97300000-0000-4000-8000-000000000022','97300000-0000-4000-8000-000000000020','97300000-0000-4000-8000-000000000021','ARM-TEST-973001'),
('97300000-0000-4000-8000-000000000023','97300000-0000-4000-8000-000000000020','97300000-0000-4000-8000-000000000021','ARM-TEST-973002');
insert into public.equipment_rental_units(asset_unit_id,resource_id,commissioned,commissioned_by,commissioned_at,reason) values
('97300000-0000-4000-8000-000000000022','97300000-0000-4000-8000-000000000012',true,'97300000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture'),
('97300000-0000-4000-8000-000000000023','97300000-0000-4000-8000-000000000013',true,'97300000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture');
insert into private.rental_catalogue_resources(code,resource_id) values('waveshare-ov5693','97300000-0000-4000-8000-000000000012'),('thinkrobotics-so101','97300000-0000-4000-8000-000000000013');
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at)
values('97300000-0000-4000-8000-000000000030','97300000-0000-4000-8000-000000000014','97300000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '50 days');
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
select '97300000-0000-4000-8000-000000000002',id,'97300000-0000-4000-8000-000000000014',now()+interval '1 day',now()+interval '50 days',1,1300000,'razorpay','97300000-0000-4000-8000-000000000002' from public.booking_products where code='workspace-month';
select set_config('b.start',((now() at time zone 'Asia/Kolkata')::date+5)::text,true);
select set_config('b.input',jsonb_build_object('product','thinkrobotics-so101','unit','week','start',current_setting('b.start'),'addons',jsonb_build_array('waveshare-ov5693'))::text,true);

-- Only offered add-ons, for a unit both items price.
select is((select (p->'addonCodes')::text from jsonb_array_elements(private.rental_products()) p where p->>'product'='thinkrobotics-so101'),'["waveshare-ov5693"]','The arm offers the camera as an add-on');
select throws_ok(format('select public.rental_checkout(''quote'',''%s'',''%s'')','97300000-0000-4000-8000-000000000002',jsonb_build_object('product','waveshare-ov5693','unit','week','start',current_setting('b.start'),'addons',jsonb_build_array('thinkrobotics-so101'))),'22023','Add-on is not offered with this product','The camera does not offer the arm');
select throws_ok(format('select public.rental_checkout(''quote'',''%s'',''%s'')','97300000-0000-4000-8000-000000000002',current_setting('b.input')::jsonb||'{"unit":"day"}'),'22023',null,'An arm bundle cannot be rented by the day');
select is(public.rental_checkout('availability','97300000-0000-4000-8000-000000000002',current_setting('b.input')::jsonb)->>'available','true','Arm and camera are both free');

-- Rent is summed; the deposit is the arm's only.
select set_config('b.q',public.rental_checkout('quote','97300000-0000-4000-8000-000000000002',current_setting('b.input')::jsonb)::text,true);
select is((current_setting('b.q')::jsonb->>'rent_paise')::bigint,180000::bigint,'Bundle week rent is arm plus camera');
select is((current_setting('b.q')::jsonb->>'deposit_paise')::bigint,2500000::bigint,'Bundle deposit is the arm''s only');
select is(current_setting('b.q')::jsonb->'addons'->0->>'code','waveshare-ov5693','Quote lists the camera add-on');
select is(current_setting('b.q')::jsonb->>'agreement_hash',(select private.rental_quote_hash(q) from private.rental_quotes q where id=(current_setting('b.q')::jsonb->>'id')::uuid),'Agreement hash covers the add-on');
select is(public.rental_checkout('availability','97300000-0000-4000-8000-000000000002',jsonb_build_object('product','waveshare-ov5693','unit','week','start',current_setting('b.start')))->>'available','true','An unpaid quote does not hold the camera');

-- Signed and approved: payment holds both units.
select set_config('b.staff',jsonb_build_object('quoteId',current_setting('b.q')::jsonb->>'id','reviewerId','97300000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select set_config('b.q',public.rental_checkout('prepare','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','stampRequired',false,'stampDecisionReason','Equipment rentals use the approved no-stamping exception')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',(current_setting('b.q')::jsonb->>'id')||'/'||repeat('b',64)||'.pdf';
select is(public.rental_checkout('approve_manual','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('b.q')::jsonb->>'agreement_hash','documentId','synthetic-bundle-doc','evidenceSha256',repeat('b',64),'evidencePath',(current_setting('b.q')::jsonb->>'id')||'/'||repeat('b',64)||'.pdf','confirmedBothSigners',true))->>'status','approved','Signed bundle agreement opens payment');
select is(public.rental_checkout('claim_order','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb)->>'claimed','true','Bundle order is claimed');
select is((select count(*)::int from private.checkout_inventory_holds where released_at is null and resource_id in('97300000-0000-4000-8000-000000000012','97300000-0000-4000-8000-000000000013')),2,'Payment holds the arm and the camera');
select is(public.rental_checkout('claim_order','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb)->>'claimed','false','A repeat claim keeps the same holds');
select is(public.rental_checkout('availability','97300000-0000-4000-8000-000000000002',jsonb_build_object('product','waveshare-ov5693','unit','week','start',current_setting('b.start')))->>'available','false','A held camera is not offered to others');

-- Capture books both units once.
select public.rental_checkout('bind_order','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||'{"orderId":"order_bundlefixture"}');
select set_config('b.pay',jsonb_build_object('quoteId',current_setting('b.q')::jsonb->>'id','orderId','order_bundlefixture','paymentId','pay_bundlefixture','amount',2680000,'currency','INR','refundedAmount',0)::text,true);
select is(public.rental_checkout('capture',null,current_setting('b.pay')::jsonb)->>'status','confirmed','Captured bundle is confirmed');
select public.rental_checkout('capture',null,current_setting('b.pay')::jsonb);
select is((select count(*)::int from public.bookings where idempotency_key like 'rental:'||(current_setting('b.q')::jsonb->>'id')||'%' and status='confirmed'),2,'Arm and camera each get one booking');
select is((select count(*)::int from public.resource_reservations r join public.bookings b on b.id=r.booking_id where b.idempotency_key like 'rental:'||(current_setting('b.q')::jsonb->>'id')||'%' and r.released_at is null),2,'Arm and camera are each reserved');
select is((select count(*)::int from private.checkout_inventory_holds where released_at is null and resource_id in('97300000-0000-4000-8000-000000000012','97300000-0000-4000-8000-000000000013')),0,'Capture turns both holds into reservations');
select is((select count(*)::int from private.billing_operations where source_id=(current_setting('b.q')::jsonb->>'id')::uuid and payload::text like '%+ %'),1,'The invoice names the camera');

-- A full refund before the start releases both.
select is(public.rental_checkout('refund',null,current_setting('b.pay')::jsonb||'{"refundedAmount":2680000}')->>'status','refunded','Full refund ends the bundle');
select is((select count(*)::int from public.resource_reservations r join public.bookings b on b.id=r.booking_id where b.idempotency_key like 'rental:'||(current_setting('b.q')::jsonb->>'id')||'%' and r.released_at is null),0,'Refund releases the arm and the camera');
select is((select count(*)::int from public.bookings where idempotency_key like 'rental:'||(current_setting('b.q')::jsonb->>'id')||'%' and status='cancelled'),2,'Refund cancels both bookings');
select is(public.rental_checkout('availability','97300000-0000-4000-8000-000000000002',jsonb_build_object('product','waveshare-ov5693','unit','week','start',current_setting('b.start')))->>'available','true','The camera is free again');

-- Returning the arm returns the camera too.
select set_config('b.q',public.rental_checkout('quote','97300000-0000-4000-8000-000000000002',current_setting('b.input')::jsonb)::text,true);
select set_config('b.staff',jsonb_build_object('quoteId',current_setting('b.q')::jsonb->>'id','reviewerId','97300000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select set_config('b.q',public.rental_checkout('prepare','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','stampRequired',false,'stampDecisionReason','Equipment rentals use the approved no-stamping exception')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',(current_setting('b.q')::jsonb->>'id')||'/'||repeat('c',64)||'.pdf';
select public.rental_checkout('approve_manual','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('b.q')::jsonb->>'agreement_hash','documentId','synthetic-bundle-doc2','evidenceSha256',repeat('c',64),'evidencePath',(current_setting('b.q')::jsonb->>'id')||'/'||repeat('c',64)||'.pdf','confirmedBothSigners',true));
select public.rental_checkout('claim_order','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb);
select public.rental_checkout('bind_order','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||'{"orderId":"order_bundlereturn"}');
select is(public.rental_checkout('capture',null,jsonb_build_object('quoteId',current_setting('b.q')::jsonb->>'id','orderId','order_bundlereturn','paymentId','pay_bundlereturn','amount',2680000,'currency','INR','refundedAmount',0))->>'status','confirmed','A second bundle is confirmed');
select public.rental_checkout('handover','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||'{"evidence":"Synthetic arm and camera condition checked at handover"}');
select is(public.rental_checkout('return','97300000-0000-4000-8000-000000000002',current_setting('b.staff')::jsonb||'{"evidence":"Synthetic arm and camera returned in the same condition"}')->>'status','returned','Bundle is returned');
select is((select count(*)::int from public.bookings where idempotency_key like 'rental:'||(current_setting('b.q')::jsonb->>'id')||'%' and status='completed'),2,'Return completes both bookings');
select is((select count(*)::int from public.resource_reservations r join public.bookings b on b.id=r.booking_id where b.idempotency_key like 'rental:'||(current_setting('b.q')::jsonb->>'id')||'%' and r.released_at is null),0,'Return releases the arm and the camera');
select * from finish();
rollback;
