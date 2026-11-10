begin;
select no_plan();

insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('97200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','rental-day-'||n||'@example.test',now(),'1202555072'||n,now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Day Renter',email,'+'||phone,'https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '97200000%';
insert into private.member_phone_verifications select id,'+'||phone,now() from auth.users where id::text like '97200000%';
insert into public.staff_roles(user_id,role) values('97200000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
update public.booking_policy_settings set mock_grants_enabled=false;
update private.rental_checkout_settings set enabled=true,release_ready=true,bank_deposits_enabled=true;
insert into public.locations(id,slug,name) values('97200000-0000-4000-8000-000000000010','rental-day-fixture','Synthetic day lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days) values
('97200000-0000-4000-8000-000000000012','97200000-0000-4000-8000-000000000010','day-camera','Synthetic day camera','equipment',1,525600,366),
('97200000-0000-4000-8000-000000000013','97200000-0000-4000-8000-000000000010','day-arm','Synthetic day arm','equipment',1,525600,366),
('97200000-0000-4000-8000-000000000014','97200000-0000-4000-8000-000000000010','day-workspace','Synthetic day workspace','workspace',1,525600,366);
insert into public.resource_booking_policies(resource_id,kind) values('97200000-0000-4000-8000-000000000012','equipment'),
('97200000-0000-4000-8000-000000000013','equipment'),('97200000-0000-4000-8000-000000000014','workspace');
insert into public.components(id,slug,name,category,inventory_kind) values('97200000-0000-4000-8000-000000000020','day-fixture-camera','Synthetic camera','Vision','serialized_reusable');
insert into public.inventory_locations(id,lab_location_id,code,name) values('97200000-0000-4000-8000-000000000021','97200000-0000-4000-8000-000000000010','DAY-FIXTURE','Synthetic inventory');
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) values
('97200000-0000-4000-8000-000000000022','97200000-0000-4000-8000-000000000020','97200000-0000-4000-8000-000000000021','ARM-TEST-972001'),
('97200000-0000-4000-8000-000000000023','97200000-0000-4000-8000-000000000020','97200000-0000-4000-8000-000000000021','ARM-TEST-972002');
insert into public.equipment_rental_units(asset_unit_id,resource_id,commissioned,commissioned_by,commissioned_at,reason) values
('97200000-0000-4000-8000-000000000022','97200000-0000-4000-8000-000000000012',true,'97200000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture'),
('97200000-0000-4000-8000-000000000023','97200000-0000-4000-8000-000000000013',true,'97200000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture');
insert into private.rental_catalogue_resources(code,resource_id) values('waveshare-ov5693','97200000-0000-4000-8000-000000000012'),('thinkrobotics-so101','97200000-0000-4000-8000-000000000013');
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at)
values('97200000-0000-4000-8000-000000000030','97200000-0000-4000-8000-000000000014','97200000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '50 days');
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
select '97200000-0000-4000-8000-000000000002',id,'97200000-0000-4000-8000-000000000014',now()+interval '1 day',now()+interval '50 days',1,1300000,'razorpay','97200000-0000-4000-8000-000000000002' from public.booking_products where code='workspace-month';
select set_config('day.start',((now() at time zone 'Asia/Kolkata')::date+5)::text,true);

-- A camera day quote charges the day rate for one 09:00 to 17:00 day.
select is(public.rental_checkout('availability','97200000-0000-4000-8000-000000000002',jsonb_build_object('product','waveshare-ov5693','unit','day','start',current_setting('day.start')))->>'available','true','A camera is available for one day');
select set_config('day.q',public.rental_checkout('quote','97200000-0000-4000-8000-000000000002',jsonb_build_object('product','waveshare-ov5693','unit','day','start',current_setting('day.start')))::text,true);
select is(current_setting('day.q')::jsonb->>'unit','day','Quote is by the day');
select is((current_setting('day.q')::jsonb->>'rent_paise')::bigint,20000::bigint,'Camera day rent is INR 200');
select is(current_setting('day.q')::jsonb->>'ends_on',current_setting('day.start'),'A day rental ends on its start date');
select is(private.rental_period('equipment',current_setting('day.start')::date,current_setting('day.start')::date),
 tstzrange((current_setting('day.start')::date+time '09:00') at time zone 'Asia/Kolkata',(current_setting('day.start')::date+time '17:00') at time zone 'Asia/Kolkata','[)'),'A day rental runs 09:00 to 17:00 in Asia/Kolkata');

-- No day price, no day quote; cabins never rent by the day.
select throws_ok(format('select public.rental_checkout(''quote'',''%s'',''%s'')','97200000-0000-4000-8000-000000000002',jsonb_build_object('product','thinkrobotics-so101','unit','day','start',current_setting('day.start'))),'22023',null,'An arm without a day price cannot be quoted by the day');
update private.rental_catalogue set released=true,deposit_paise=1000000,available_from=date_trunc('month',now()+interval '2 months')::date where code='cabin202';
select throws_ok(format('select public.rental_checkout(''quote'',''%s'',''%s'')','97200000-0000-4000-8000-000000000002',jsonb_build_object('product','cabin202','unit','day',
 'start',date_trunc('month',now()+interval '2 months')::date,'end',(date_trunc('month',now()+interval '3 months')-interval '1 day')::date)),'22023','Cabin 202 cannot be rented by the day','A cabin cannot be quoted by the day');

-- The zero-deposit day quote skips the bank-deposit step.
select is((current_setting('day.q')::jsonb->>'deposit_paise')::bigint,0::bigint,'Camera day quote has no deposit');
select set_config('day.staff',jsonb_build_object('quoteId',current_setting('day.q')::jsonb->>'id','reviewerId','97200000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select set_config('day.q',public.rental_checkout('prepare','97200000-0000-4000-8000-000000000002',current_setting('day.staff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','stampRequired',false,'stampDecisionReason','Equipment rentals use the approved no-stamping exception')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',(current_setting('day.q')::jsonb->>'id')||'/'||repeat('d',64)||'.pdf';
select isnt(public.rental_checkout('approve_manual','97200000-0000-4000-8000-000000000002',current_setting('day.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('day.q')::jsonb->>'agreement_hash','documentId','synthetic-day-doc','evidenceSha256',repeat('d',64),'evidencePath',(current_setting('day.q')::jsonb->>'id')||'/'||repeat('d',64)||'.pdf','confirmedBothSigners',true))->>'status','awaiting_deposit','Approved day rental does not wait for a deposit');
select throws_ok(format('select public.rental_checkout(''submit_deposit_reference'',''%s'',''%s'')','97200000-0000-4000-8000-000000000002',jsonb_build_object('quoteId',current_setting('day.q')::jsonb->>'id','reference','NO-DEPOSIT-DAY')),null,null,'No deposit reference is taken for a zero-deposit day rental');
select lives_ok(format('select public.rental_checkout(''claim_order'',''%s'',''%s'')','97200000-0000-4000-8000-000000000002',current_setting('day.staff')),'Day rental payment opens without a deposit');
select * from finish();
rollback;
