begin;
select no_plan();
select ok(not has_table_privilege('authenticated','private.rental_catalogue','SELECT'),'Browser cannot read or edit the rental catalogue');
select is((select monthly_rent_paise from private.rental_catalogue where code='cabin101'),8000000::bigint,'Cabin 101 lists 4 billable seats at 20000');
select is((select array_agg(room order by code) from private.rental_catalogue where kind='cabin'),array['GF-01','FF-06','FF-03','FF-04'],'Cabins map to the owner''s plan rooms');
select is((select billable_seats+extra_seats from private.rental_catalogue where code='cabin101'),6,'Cabin 101 seats 4 plus 2 free extra');
select is((select monthly_rent_paise from private.rental_catalogue where code='cabin201'),20000000::bigint,'Cabin 201 is 10 billable seats at 20000');
select is((select monthly_rent_paise from private.rental_catalogue where code='cabin202'),12000000::bigint,'Cabin 202 is 6 billable seats at 20000');
select is((select monthly_rent_paise from private.rental_catalogue where code='cabin203'),12000000::bigint,'Cabin 203 is 6 billable seats at 20000');
select is((select array_agg(billable_seats+extra_seats order by code) from private.rental_catalogue where code in ('cabin201','cabin202','cabin203')),array[12,8,9],'Top-floor cabins seat billable plus free extra seats');

insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','rental-catalogue-'||n||'@example.test',now(),'1202555095'||n,now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Catalogue',email,'+'||phone,'https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '95000000%';
insert into private.member_phone_verifications select id,'+'||phone,now() from auth.users where id::text like '95000000%';
insert into public.staff_roles(user_id,role) values('95000000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
update public.booking_policy_settings set mock_grants_enabled=false;
update private.rental_checkout_settings set enabled=true,release_ready=true,bank_deposits_enabled=false;
insert into public.locations(id,slug,name) values('95000000-0000-4000-8000-000000000010','rental-catalogue-fixture','Synthetic catalogue lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days) values
('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000010','catalogue-cabin-201','Synthetic Cabin 201','room',12,525600,366),
('95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000010','catalogue-unit-1','Synthetic unit 1','equipment',1,525600,366),
('95000000-0000-4000-8000-000000000013','95000000-0000-4000-8000-000000000010','catalogue-unit-2','Synthetic unit 2','equipment',1,525600,366),
('95000000-0000-4000-8000-000000000014','95000000-0000-4000-8000-000000000010','catalogue-workspace','Synthetic workspace','workspace',1,525600,366);
insert into public.resource_booking_policies(resource_id,kind) values('95000000-0000-4000-8000-000000000011','cabin'),
('95000000-0000-4000-8000-000000000012','equipment'),('95000000-0000-4000-8000-000000000013','equipment'),('95000000-0000-4000-8000-000000000014','workspace');
delete from public.booking_inventory where code='C02';
insert into public.booking_inventory(resource_id,code,floor,room) values('95000000-0000-4000-8000-000000000011','C02','FF','FF-03');
insert into private.rental_catalogue_resources(code,resource_id) values('cabin201','95000000-0000-4000-8000-000000000011');

-- Top-floor cabins list as coming soon until a deposit and start date are set.
select is((select p->>'status' from jsonb_array_elements(public.rental_checkout('availability','95000000-0000-4000-8000-000000000001','{}')->'products') p where p->>'product'='cabin201'),'coming_soon','Cabin 201 lists as coming soon');
select is((select p->>'status' from jsonb_array_elements(public.rental_checkout('availability','95000000-0000-4000-8000-000000000001','{}')->'products') p where p->>'product'='cabin101'),'occupied','Occupied Cabin 101 lists as occupied');
select throws_ok($$select public.rental_checkout('quote','95000000-0000-4000-8000-000000000001','{"product":"cabin101","start":"2027-03-01","end":"2027-03-31"}')$$,'22023','Released rental product required','Occupied cabin cannot be quoted');
select is((select (p->>'extraSeats')::int from jsonb_array_elements(public.rental_checkout('availability','95000000-0000-4000-8000-000000000001','{}')->'products') p where p->>'product'='cabin203'),3,'Listing shows free extra seats');
select ok(jsonb_array_length(public.rental_checkout('availability','95000000-0000-4000-8000-000000000099','{}')->'products')>=5,'Unverified visitors can see options and prices');
select throws_ok($$select public.rental_checkout('availability','95000000-0000-4000-8000-000000000099','{"product":"cabin101","start":"2027-03-01","end":"2027-03-31"}')$$,'42501','Rental checkout unavailable','Unverified visitors cannot check dates');
select throws_ok($$select public.rental_checkout('quote','95000000-0000-4000-8000-000000000001','{"product":"cabin201","start":"2027-03-01","end":"2027-03-31"}')$$,'22023','Released rental product required','Unpriced cabin cannot be quoted');
select throws_ok($$select public.rental_checkout('quote','95000000-0000-4000-8000-000000000001','{"product":"cabin999","start":"2027-03-01","end":"2027-03-31"}')$$,'22023','Released rental product required','Unknown product cannot be quoted');

-- Once released, Cabin 201 charges its own rent and deposit.
update private.rental_catalogue set deposit_paise=30000000,available_from='2027-03-01',released=true where code='cabin201';
select throws_ok($$select public.rental_checkout('quote','95000000-0000-4000-8000-000000000001','{"product":"cabin201","start":"2027-02-01","end":"2027-02-28"}')$$,'22023','Cabin 201 requires whole calendar months starting on the first','Cabin cannot start before its release date');
select set_config('cat.q',public.rental_checkout('quote','95000000-0000-4000-8000-000000000001','{"product":"cabin201","partyType":"company","start":"2027-03-01","end":"2027-05-31"}')::text,true);
select is((current_setting('cat.q')::jsonb->>'rent_paise')::bigint,20000000::bigint,'Cabin 201 first month rent is 200000');
select is((current_setting('cat.q')::jsonb->>'deposit_paise')::bigint,30000000::bigint,'Cabin 201 deposit comes from the catalogue');
select is(current_setting('cat.q')::jsonb->>'resource_id','95000000-0000-4000-8000-000000000011','Cabin 201 uses its own room');
select set_config('cat.staff',jsonb_build_object('quoteId',current_setting('cat.q')::jsonb->>'id','reviewerId','95000000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select set_config('cat.particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','accessStart','09:00','accessEnd','21:00','includedFacilities','Synthetic desks and chairs','permittedUsers',jsonb_build_array('Synthetic renter'),'stampRequired',false,'stampDecisionReason','Synthetic reviewed stamping decision')::text,true);
select throws_ok(format('select public.rental_checkout(''prepare'',''%s'',''%s'')','95000000-0000-4000-8000-000000000001',current_setting('cat.staff')::jsonb||jsonb_build_object('particulars',current_setting('cat.particulars')::jsonb||'{"capacity":13}')),'22023','Cabin particulars and stamping evidence required','Occupancy cannot exceed billable plus extra seats');
select set_config('cat.q',public.rental_checkout('prepare','95000000-0000-4000-8000-000000000001',current_setting('cat.staff')::jsonb||jsonb_build_object('particulars',current_setting('cat.particulars')::jsonb||'{"capacity":12}'))::text,true);
select is(current_setting('cat.q')::jsonb->>'status','awaiting_signatures','Twelve occupants fit Cabin 201');
insert into storage.objects(bucket_id,name) select 'rental-agreements',current_setting('cat.q')::jsonb->>'id'||'/'||repeat('a',64)||'.pdf';
select public.rental_checkout('approve_manual','95000000-0000-4000-8000-000000000001',current_setting('cat.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('cat.q')::jsonb->>'agreement_hash','documentId','synthetic-cabin201-doc','evidenceSha256',repeat('a',64),'evidencePath',current_setting('cat.q')::jsonb->>'id'||'/'||repeat('a',64)||'.pdf','confirmedBothSigners',true));
select public.rental_checkout('claim_order','95000000-0000-4000-8000-000000000001',current_setting('cat.staff')::jsonb);
select public.rental_checkout('bind_order','95000000-0000-4000-8000-000000000001',current_setting('cat.staff')::jsonb||'{"orderId":"order_cabin201fixture"}');
select is(public.rental_checkout('capture',null,current_setting('cat.staff')::jsonb||'{"orderId":"order_cabin201fixture","paymentId":"pay_cabin201fixture","amount":50000000,"currency":"INR","refundedAmount":0}')->>'status','confirmed','Paid Cabin 201 is confirmed');
select is((select payload->'items'->0->>'name' from private.billing_operations where source='rental_quote' and source_id=(current_setting('cat.q')::jsonb->>'id')::uuid and kind='invoice_create') like 'Cabin 201 workspace licence fee%',true,'Invoice names Cabin 201');
select is((public.rental_checkout('renewal_quote','95000000-0000-4000-8000-000000000001',current_setting('cat.staff')::jsonb||jsonb_build_object('parentQuoteId',current_setting('cat.q')::jsonb->>'id','start','2027-04-01'))->>'rent_paise')::bigint,20000000::bigint,'Cabin 201 monthly invoice uses its own rent');

-- An equipment type with two units books both, then runs out.
insert into private.rental_catalogue(code,kind,name,week_rent_paise,deposit_paise,released) values('test-jetson','equipment','Synthetic Jetson',70000,1000000,true);
insert into public.components(id,slug,name,category,inventory_kind) values('95000000-0000-4000-8000-000000000020','catalogue-fixture-jetson','Synthetic Jetson','Compute','serialized_reusable');
insert into public.inventory_locations(id,lab_location_id,code,name) values('95000000-0000-4000-8000-000000000021','95000000-0000-4000-8000-000000000010','CATALOGUE-FIXTURE','Synthetic inventory');
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) values
('95000000-0000-4000-8000-000000000022','95000000-0000-4000-8000-000000000020','95000000-0000-4000-8000-000000000021','ARM-TEST-950001'),
('95000000-0000-4000-8000-000000000023','95000000-0000-4000-8000-000000000020','95000000-0000-4000-8000-000000000021','ARM-TEST-950002');
insert into public.equipment_rental_units(asset_unit_id,resource_id,commissioned,commissioned_by,commissioned_at,reason) values
('95000000-0000-4000-8000-000000000022','95000000-0000-4000-8000-000000000012',true,'95000000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture'),
('95000000-0000-4000-8000-000000000023','95000000-0000-4000-8000-000000000013',true,'95000000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture');
insert into private.rental_catalogue_resources(code,resource_id,sort_order) values('test-jetson','95000000-0000-4000-8000-000000000012',1),('test-jetson','95000000-0000-4000-8000-000000000013',2);
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at)
values('95000000-0000-4000-8000-000000000030','95000000-0000-4000-8000-000000000014','95000000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '50 days');
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
select '95000000-0000-4000-8000-000000000002',id,'95000000-0000-4000-8000-000000000014',now()+interval '1 day',now()+interval '50 days',1,1300000,'razorpay','95000000-0000-4000-8000-000000000002' from public.booking_products where code='workspace-month';
select set_config('cat.start',((now() at time zone 'Asia/Kolkata')::date+5)::text,true);
select is((select (p->>'quantity')::int from jsonb_array_elements(public.rental_checkout('availability','95000000-0000-4000-8000-000000000002','{}')->'products') p where p->>'product'='test-jetson'),2,'Listing counts both units');
select throws_ok(format('select public.rental_checkout(''quote'',''%s'',''%s'')','95000000-0000-4000-8000-000000000002',jsonb_build_object('product','test-jetson','unit','month','start',current_setting('cat.start'))),'22023','Released rental product required','Missing monthly price cannot be quoted');
select is(public.rental_checkout('quote','95000000-0000-4000-8000-000000000002',jsonb_build_object('product','test-jetson','unit','week','start',current_setting('cat.start')))->>'resource_id','95000000-0000-4000-8000-000000000012','First free unit is offered first');
insert into private.checkout_inventory_holds(quote_id,resource_id,member_id,period,expires_at) values('95000000-0000-4000-8000-000000000040','95000000-0000-4000-8000-000000000012','95000000-0000-4000-8000-000000000001',tstzrange(now(),now()+interval '60 days'),now()+interval '30 minutes');
select is(public.rental_checkout('quote','95000000-0000-4000-8000-000000000002',jsonb_build_object('product','test-jetson','unit','week','start',current_setting('cat.start')))->>'resource_id','95000000-0000-4000-8000-000000000013','Second unit is offered when the first is taken');
select is((public.rental_checkout('quote','95000000-0000-4000-8000-000000000002',jsonb_build_object('product','test-jetson','unit','week','start',current_setting('cat.start')))->>'rent_paise')::bigint,70000::bigint,'Equipment rent comes from the catalogue');
insert into private.checkout_inventory_holds(quote_id,resource_id,member_id,period,expires_at) values('95000000-0000-4000-8000-000000000041','95000000-0000-4000-8000-000000000013','95000000-0000-4000-8000-000000000001',tstzrange(now(),now()+interval '60 days'),now()+interval '30 minutes');
select is(public.rental_checkout('availability','95000000-0000-4000-8000-000000000002',jsonb_build_object('product','test-jetson','unit','week','start',current_setting('cat.start')))->>'available','false','No free unit means unavailable');
select throws_ok(format('select public.rental_checkout(''quote'',''%s'',''%s'')','95000000-0000-4000-8000-000000000002',jsonb_build_object('product','test-jetson','unit','week','start',current_setting('cat.start'))),'23P01','Inventory is no longer available','Third booking is refused');
select * from finish();
rollback;
