begin;
select no_plan();
update private.rental_checkout_settings set enabled=true,release_ready=true;

-- Listing details for the card and item pages.
create function pg_temp.product(p_code text) returns jsonb language sql as $$
 select p from jsonb_array_elements(public.rental_checkout('availability','96000000-0000-4000-8000-000000000099','{}')->'products') p where p->>'product'=p_code;
$$;
select is(pg_temp.product('hiwonder')->>'name','LeRobot SO-101 Advanced Kit','Hiwonder kit is listed as the Advanced Kit');
select is(pg_temp.product('hiwonder')->>'maker','Hiwonder','Listing names the maker');
select is((pg_temp.product('hiwonder')->>'salePaise')::bigint,5500000::bigint,'Hiwonder kit sells for INR 55,000');
select is((pg_temp.product('hiwonder')->>'weekRentPaise')::bigint,105000::bigint,'Hiwonder rent is unchanged');
select is(jsonb_array_length(pg_temp.product('hiwonder')->'images'),3,'Listing carries its images');
select is(jsonb_array_length(pg_temp.product('hiwonder')->'parts'),10,'Listing carries its parts list');
select is((pg_temp.product('thinkrobotics-so101')->>'depositPaise')::bigint,2500000::bigint,'ThinkRobotics arm deposit is INR 25,000');
select is((pg_temp.product('thinkrobotics-so101')->>'monthRentPaise')::bigint,250000::bigint,'ThinkRobotics arm rents for INR 2,500 a month');
select is((pg_temp.product('thinkrobotics-so101')->>'salePaise')::bigint,3100000::bigint,'ThinkRobotics arm sells for INR 31,000');
select is((pg_temp.product('waveshare-ov5693')->>'depositPaise')::bigint,0::bigint,'Camera needs no deposit');
select is((pg_temp.product('waveshare-ov5693')->>'dayRentPaise')::bigint,20000::bigint,'Camera day rate is INR 200');
select is(pg_temp.product('waveshare-ov5693')->>'stockNote','2 on order','Camera shows its stock note');
select is((pg_temp.product('waveshare-ov5693')->>'freeUnits')::int,0,'Camera with no units is out of stock');

-- Only equipment may have a zero deposit or a sale price.
select throws_ok($$update private.rental_catalogue set deposit_paise=0 where code='cabin101'$$,'23514',null,'A cabin cannot have a zero deposit');
select throws_ok($$update private.rental_catalogue set sale_paise=100000 where code='cabin101'$$,'23514',null,'A cabin cannot have a sale price');

-- Free units count only linked, usable units that are not held or reserved now.
insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('96000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','equipment-listing-'||n||'@example.test',now(),'1202555096'||n,now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Listing',email,'+'||phone,'https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '96000000%';
insert into private.member_phone_verifications select id,'+'||phone,now() from auth.users where id::text like '96000000%';
insert into public.staff_roles(user_id,role) values('96000000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
update public.booking_policy_settings set mock_grants_enabled=false;
update private.rental_checkout_settings set enabled=true,release_ready=true,bank_deposits_enabled=true;
insert into public.locations(id,slug,name) values('96000000-0000-4000-8000-000000000010','equipment-listing-fixture','Synthetic listing lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days) values
('96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000010','listing-camera-1','Synthetic camera 1','equipment',1,525600,366),
('96000000-0000-4000-8000-000000000013','96000000-0000-4000-8000-000000000010','listing-camera-2','Synthetic camera 2','equipment',1,525600,366),
('96000000-0000-4000-8000-000000000014','96000000-0000-4000-8000-000000000010','listing-workspace','Synthetic workspace','workspace',1,525600,366);
insert into public.resource_booking_policies(resource_id,kind) values('96000000-0000-4000-8000-000000000012','equipment'),
('96000000-0000-4000-8000-000000000013','equipment'),('96000000-0000-4000-8000-000000000014','workspace');
insert into public.components(id,slug,name,category,inventory_kind) values('96000000-0000-4000-8000-000000000020','listing-fixture-camera','Synthetic camera','Vision','serialized_reusable');
insert into public.inventory_locations(id,lab_location_id,code,name) values('96000000-0000-4000-8000-000000000021','96000000-0000-4000-8000-000000000010','LISTING-FIXTURE','Synthetic inventory');
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) values
('96000000-0000-4000-8000-000000000022','96000000-0000-4000-8000-000000000020','96000000-0000-4000-8000-000000000021','ARM-TEST-960001'),
('96000000-0000-4000-8000-000000000023','96000000-0000-4000-8000-000000000020','96000000-0000-4000-8000-000000000021','ARM-TEST-960002');
insert into public.equipment_rental_units(asset_unit_id,resource_id,commissioned,commissioned_by,commissioned_at,reason) values
('96000000-0000-4000-8000-000000000022','96000000-0000-4000-8000-000000000012',true,'96000000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture'),
('96000000-0000-4000-8000-000000000023','96000000-0000-4000-8000-000000000013',true,'96000000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture');
insert into private.rental_catalogue_resources(code,resource_id,sort_order) values('waveshare-ov5693','96000000-0000-4000-8000-000000000012',1),('waveshare-ov5693','96000000-0000-4000-8000-000000000013',2);
select is((pg_temp.product('waveshare-ov5693')->>'freeUnits')::int,2,'Two linked cameras are both free');
insert into private.checkout_inventory_holds(quote_id,resource_id,member_id,period,expires_at) values('96000000-0000-4000-8000-000000000040','96000000-0000-4000-8000-000000000012','96000000-0000-4000-8000-000000000001',tstzrange(now()-interval '1 hour',now()+interval '7 days'),now()+interval '30 minutes');
select is((pg_temp.product('waveshare-ov5693')->>'freeUnits')::int,1,'A held camera is not free');
update public.asset_units set status='maintenance' where id='96000000-0000-4000-8000-000000000023';
select is((pg_temp.product('waveshare-ov5693')->>'freeUnits')::int,0,'A camera set aside by staff is not free');
select is((pg_temp.product('waveshare-ov5693')->>'quantity')::int,2,'Quantity still counts every linked unit');
delete from private.checkout_inventory_holds where quote_id='96000000-0000-4000-8000-000000000040';
update public.asset_units set status='available' where id='96000000-0000-4000-8000-000000000023';

-- A zero-deposit rental skips the bank-deposit step even when bank deposits are on.
insert into public.bookings(id,resource_id,member_id,starts_at,ends_at)
values('96000000-0000-4000-8000-000000000030','96000000-0000-4000-8000-000000000014','96000000-0000-4000-8000-000000000002',now()+interval '1 day',now()+interval '50 days');
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,source,granted_by)
select '96000000-0000-4000-8000-000000000002',id,'96000000-0000-4000-8000-000000000014',now()+interval '1 day',now()+interval '50 days',1,1300000,'razorpay','96000000-0000-4000-8000-000000000002' from public.booking_products where code='workspace-month';
select set_config('eq.q',public.rental_checkout('quote','96000000-0000-4000-8000-000000000002',jsonb_build_object('product','waveshare-ov5693','unit','week','start',(now() at time zone 'Asia/Kolkata')::date+5))::text,true);
select is((current_setting('eq.q')::jsonb->>'deposit_paise')::bigint,0::bigint,'Camera quote has no deposit');
select is((current_setting('eq.q')::jsonb->>'rent_paise')::bigint,100000::bigint,'Camera week rent is INR 1,000');
select set_config('eq.staff',jsonb_build_object('quoteId',current_setting('eq.q')::jsonb->>'id','reviewerId','96000000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select set_config('eq.q',public.rental_checkout('prepare','96000000-0000-4000-8000-000000000002',current_setting('eq.staff')::jsonb||jsonb_build_object('particulars',jsonb_build_object('recordsPolicyReference','Synthetic contract-only record policy reference','unusedDepositTerms','Synthetic manually approved unused deposit treatment','availabilityConfirmed',true,'termsVersion','rental-2026-11-08','stampRequired',false,'stampDecisionReason','Equipment rentals use the approved no-stamping exception')))::text,true);
insert into storage.objects(bucket_id,name) select 'rental-agreements',(current_setting('eq.q')::jsonb->>'id')||'/'||repeat('c',64)||'.pdf';
select is(public.rental_checkout('approve_manual','96000000-0000-4000-8000-000000000002',current_setting('eq.staff')::jsonb||jsonb_build_object('agreementHash',current_setting('eq.q')::jsonb->>'agreement_hash','documentId','synthetic-camera-doc','evidenceSha256',repeat('c',64),'evidencePath',(current_setting('eq.q')::jsonb->>'id')||'/'||repeat('c',64)||'.pdf','confirmedBothSigners',true))->>'status' <> 'awaiting_deposit',true,'Approved camera rental does not wait for a deposit');
select throws_ok(format('select public.rental_checkout(''submit_deposit_reference'',''%s'',''%s'')','96000000-0000-4000-8000-000000000002',jsonb_build_object('quoteId',current_setting('eq.q')::jsonb->>'id','reference','NO-DEPOSIT-1')),null,null,'No deposit reference is taken for a zero deposit');
select lives_ok(format('select public.rental_checkout(''claim_order'',''%s'',''%s'')','96000000-0000-4000-8000-000000000002',current_setting('eq.staff')),'Payment opens without a deposit');
select * from finish();
rollback;
