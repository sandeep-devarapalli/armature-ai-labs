begin;
select no_plan();
select ok(not has_function_privilege('authenticated','public.equipment_sale(text,uuid,jsonb)','execute'),'Browser cannot write the sale ledger');
select ok(not has_table_privilege('authenticated','private.equipment_sales','SELECT'),'Browser cannot read sales');
select ok((select not enabled and not release_ready from private.equipment_sale_settings),'Equipment sales default closed');

-- Buyers 1 and 2, admin 3, and two linked cameras.
insert into auth.users(id,aud,role,email,email_confirmed_at,phone,phone_confirmed_at)
select ('97000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','equipment-sale-'||n||'@example.test',now(),'1202555097'||n,now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Buyer',email,'+'||phone,'https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '97000000%';
insert into private.member_phone_verifications select id,'+'||phone,now() from auth.users where id::text like '97000000%';
insert into public.staff_roles(user_id,role) values('97000000-0000-4000-8000-000000000003','admin');
update private.membership_level_settings set enabled=true;
update public.booking_policy_settings set mock_grants_enabled=false;
insert into public.locations(id,slug,name) values('97000000-0000-4000-8000-000000000010','equipment-sale-fixture','Synthetic sale lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days) values
('97000000-0000-4000-8000-000000000012','97000000-0000-4000-8000-000000000010','sale-camera-1','Synthetic camera 1','equipment',1,525600,366),
('97000000-0000-4000-8000-000000000013','97000000-0000-4000-8000-000000000010','sale-camera-2','Synthetic camera 2','equipment',1,525600,366);
insert into public.resource_booking_policies(resource_id,kind) values('97000000-0000-4000-8000-000000000012','equipment'),('97000000-0000-4000-8000-000000000013','equipment');
insert into public.components(id,slug,name,category,inventory_kind) values('97000000-0000-4000-8000-000000000020','sale-fixture-camera','Synthetic camera','Vision','serialized_reusable');
insert into public.inventory_locations(id,lab_location_id,code,name) values('97000000-0000-4000-8000-000000000021','97000000-0000-4000-8000-000000000010','SALE-FIXTURE','Synthetic inventory');
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) values
('97000000-0000-4000-8000-000000000022','97000000-0000-4000-8000-000000000020','97000000-0000-4000-8000-000000000021','ARM-TEST-970001'),
('97000000-0000-4000-8000-000000000023','97000000-0000-4000-8000-000000000020','97000000-0000-4000-8000-000000000021','ARM-TEST-970002');
insert into public.equipment_rental_units(asset_unit_id,resource_id,commissioned,commissioned_by,commissioned_at,reason) values
('97000000-0000-4000-8000-000000000022','97000000-0000-4000-8000-000000000012',true,'97000000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture'),
('97000000-0000-4000-8000-000000000023','97000000-0000-4000-8000-000000000013',true,'97000000-0000-4000-8000-000000000003',now(),'Synthetic rollback fixture');
insert into private.rental_catalogue_resources(code,resource_id,sort_order) values('waveshare-ov5693','97000000-0000-4000-8000-000000000012',1),('waveshare-ov5693','97000000-0000-4000-8000-000000000013',2);

select throws_ok($$select public.equipment_sale('request','97000000-0000-4000-8000-000000000001','{"items":["waveshare-ov5693"]}')$$,'42501','Equipment sales unavailable','Closed release denies requests');
update private.equipment_sale_settings set enabled=true,release_ready=true;
select throws_ok($$select public.equipment_sale('request','97000000-0000-4000-8000-000000000001','{"items":["cabin101"]}')$$,'22023',null,'Cabins are not for sale');
select throws_ok($$select public.equipment_sale('request','97000000-0000-4000-8000-000000000001','{"items":["hiwonder"]}')$$,'23P01','Item is out of stock','An item with no free unit cannot be requested');

-- Request, in-lab check, payment, collection.
select set_config('sale.s',public.equipment_sale('request','97000000-0000-4000-8000-000000000001','{"items":["waveshare-ov5693"]}')::text,true);
select is(current_setting('sale.s')::jsonb->>'status','awaiting_check','New request waits for the in-lab check');
select is((current_setting('sale.s')::jsonb->>'amount_paise')::bigint,400000::bigint,'Camera sells for INR 4,000');
select throws_ok($$select public.equipment_sale('request','97000000-0000-4000-8000-000000000001','{"items":["waveshare-ov5693"]}')$$,'23505',null,'One open request per item per buyer');
select throws_ok(format('select public.equipment_sale(''claim_order'',''%s'',''%s'')','97000000-0000-4000-8000-000000000001',jsonb_build_object('saleId',current_setting('sale.s')::jsonb->>'id')),'22023','Fresh in-lab check required','Cannot pay before the in-lab check');
select throws_ok(format('select public.equipment_sale(''status'',''%s'',''%s'')','97000000-0000-4000-8000-000000000002',jsonb_build_object('saleId',current_setting('sale.s')::jsonb->>'id')),'42501','Equipment sale unavailable','Members cannot read other sales');

select set_config('sale.staff',jsonb_build_object('saleId',current_setting('sale.s')::jsonb->>'id','reviewerId','97000000-0000-4000-8000-000000000003','reviewerAal','aal2')::text,true);
select throws_ok(format('select public.equipment_sale(''mark_checked'',null,''%s'')',current_setting('sale.staff')::jsonb||'{"itemChecked":true,"reviewerAal":"aal1"}'),'42501',null,'AAL1 staff cannot mark the check');
select throws_ok(format('select public.equipment_sale(''mark_checked'',null,''%s'')',current_setting('sale.staff')::jsonb||'{"itemChecked":true,"reviewerId":"97000000-0000-4000-8000-000000000001"}'),'42501',null,'The buyer cannot mark their own check');
select throws_ok(format('select public.equipment_sale(''mark_checked'',null,''%s'')',current_setting('sale.staff')),'22023',null,'The check must be confirmed');
select set_config('sale.s',public.equipment_sale('mark_checked',null,current_setting('sale.staff')::jsonb||'{"itemChecked":true}')::text,true);
select is(current_setting('sale.s')::jsonb->>'status','ready_to_pay','Check done opens payment');
select ok((current_setting('sale.s')::jsonb->>'paymentExpiresAt')::timestamptz between now()+interval '29 minutes' and now()+interval '31 minutes','Payment window is 30 minutes');
select is(private.rental_free_units('waveshare-ov5693'),1,'The checked camera leaves rental stock');
select ok(not private.rental_range_available('97000000-0000-4000-8000-000000000012',tstzrange(now()+interval '400 days',now()+interval '401 days')),'The checked camera is held with no end date');

select throws_ok(format('select public.equipment_sale(''claim_order'',''%s'',''%s'')','97000000-0000-4000-8000-000000000002',jsonb_build_object('saleId',current_setting('sale.s')::jsonb->>'id')),'42501','Equipment sale unavailable','Someone other than the buyer cannot pay');
select is(public.equipment_sale('claim_order','97000000-0000-4000-8000-000000000001',current_setting('sale.staff')::jsonb)->>'claimed','true','Buyer claims the order');
select is(public.equipment_sale('claim_order','97000000-0000-4000-8000-000000000001',current_setting('sale.staff')::jsonb)->>'claimed','false','A second claim cannot issue another order');
select public.equipment_sale('bind_order','97000000-0000-4000-8000-000000000001',current_setting('sale.staff')::jsonb||'{"orderId":"order_salefixture"}');
select is(public.equipment_sale('lookup_order',null,'{"orderId":"order_unknown"}')->>'status','ignored','Unknown orders are ignored');
select set_config('sale.pay',(current_setting('sale.staff')::jsonb||'{"orderId":"order_salefixture","paymentId":"pay_salefixture","amount":400000,"currency":"INR","refundedAmount":0}')::text,true);
select throws_ok(format('select public.equipment_sale(''capture'',null,''%s'')',current_setting('sale.pay')::jsonb||'{"amount":300000}'),'22023','Captured payment must match the sale order','Wrong amount is rejected');
select set_config('sale.s',public.equipment_sale('capture',null,current_setting('sale.pay')::jsonb)::text,true);
select is(current_setting('sale.s')::jsonb->>'status','paid','Captured sale is paid');
select is((select status::text from public.asset_units where id='97000000-0000-4000-8000-000000000022'),'retired','Capture retires the sold unit');
select ok(not exists(select 1 from private.rental_catalogue_resources where resource_id='97000000-0000-4000-8000-000000000012'),'Capture unlinks the sold unit from the catalogue');
select is((select count(*)::int from private.billing_operations where source='equipment_sale' and kind='invoice_create' and invoice_number like 'ARM-S-%'),1,'Captured sale queues one invoice with prefix S');
select public.equipment_sale('capture',null,current_setting('sale.pay')::jsonb);
select is((select count(*)::int from private.billing_operations where source='equipment_sale' and kind='invoice_create'),1,'Duplicate capture does not double-invoice');

-- Refund before collection restores the unit; after collection it is refused.
select set_config('sale.s',public.equipment_sale('approve_refund',null,current_setting('sale.staff')::jsonb||'{"reason":"Synthetic buyer changed mind"}')::text,true);
select is(current_setting('sale.s')::jsonb->>'status','refund_pending','Refund approved before collection');
select is((select status::text from public.asset_units where id='97000000-0000-4000-8000-000000000022'),'available','Refund before collection restores the unit');
select is(private.rental_free_units('waveshare-ov5693'),2,'Restored camera is back in rental stock');
select set_config('sale.s',public.equipment_sale('refund',null,current_setting('sale.pay')::jsonb||'{"refundedAmount":400000}')::text,true);
select is(current_setting('sale.s')::jsonb->>'status','refunded','Refund webhook completes the refund');
select throws_ok(format('select public.equipment_sale(''mark_collected'',null,''%s'')',current_setting('sale.staff')),'22023',null,'A refunded sale cannot be collected');

select set_config('sale.c',public.equipment_sale('request','97000000-0000-4000-8000-000000000002','{"items":["waveshare-ov5693"]}')::text,true);
select set_config('sale.cstaff',(current_setting('sale.staff')::jsonb||jsonb_build_object('saleId',current_setting('sale.c')::jsonb->>'id'))::text,true);
select public.equipment_sale('mark_checked',null,current_setting('sale.cstaff')::jsonb||'{"itemChecked":true}');
select public.equipment_sale('claim_order','97000000-0000-4000-8000-000000000002',current_setting('sale.cstaff')::jsonb);
select public.equipment_sale('bind_order','97000000-0000-4000-8000-000000000002',current_setting('sale.cstaff')::jsonb||'{"orderId":"order_salecollect"}');
select public.equipment_sale('capture',null,current_setting('sale.cstaff')::jsonb||'{"orderId":"order_salecollect","paymentId":"pay_salecollect","amount":400000,"currency":"INR","refundedAmount":0}');
select is(public.equipment_sale('mark_collected',null,current_setting('sale.cstaff')::jsonb)->>'status','collected','Staff mark the sale collected');
select throws_ok(format('select public.equipment_sale(''approve_refund'',null,''%s'')',current_setting('sale.cstaff')::jsonb||'{"reason":"Synthetic late refund ask"}'),'22023',null,'No refund after collection');
select is(public.equipment_sale('refund',null,current_setting('sale.cstaff')::jsonb||'{"orderId":"order_salecollect","paymentId":"pay_salecollect","amount":400000,"currency":"INR","refundedAmount":400000}')->>'review_reason','refund_without_approval_requires_review','An unapproved refund is flagged for staff');

-- Decline and cancel put checked units back.
select set_config('sale.d',public.equipment_sale('request','97000000-0000-4000-8000-000000000001','{"items":["waveshare-ov5693"]}')::text,true);
select set_config('sale.dstaff',(current_setting('sale.staff')::jsonb||jsonb_build_object('saleId',current_setting('sale.d')::jsonb->>'id'))::text,true);
select public.equipment_sale('mark_checked',null,current_setting('sale.dstaff')::jsonb||'{"itemChecked":true}');
select is(private.rental_free_units('waveshare-ov5693'),0,'Checked camera is held');
select is(public.equipment_sale('decline',null,current_setting('sale.dstaff')::jsonb||'{"reason":"Synthetic unit failed the check"}')->>'status','declined','Staff can decline with a reason');
select is(private.rental_free_units('waveshare-ov5693'),1,'Decline releases the held camera');

select set_config('sale.x',public.equipment_sale('request','97000000-0000-4000-8000-000000000001','{"items":["waveshare-ov5693"]}')::text,true);
select throws_ok(format('select public.equipment_sale(''cancel'',''%s'',''%s'')','97000000-0000-4000-8000-000000000001',jsonb_build_object('saleId',current_setting('sale.x')::jsonb->>'id','reason','Synthetic change of plans')),'22023',null,'Cancellation needs confirmation');
select is(public.equipment_sale('cancel','97000000-0000-4000-8000-000000000001',jsonb_build_object('saleId',current_setting('sale.x')::jsonb->>'id','reason','Synthetic change of plans','confirmed',true))->>'status','cancelled','Buyer can cancel before paying');

select is(jsonb_array_length(public.equipment_sale('staff_queue',null,current_setting('sale.staff')::jsonb)->'sales'),4,'Staff queue lists every sale');
select is(jsonb_array_length(public.equipment_sale('list_own','97000000-0000-4000-8000-000000000002','{}')->'sales'),1,'Members list only their own sales');
select * from finish();
rollback;
