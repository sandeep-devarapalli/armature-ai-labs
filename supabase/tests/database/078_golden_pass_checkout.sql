begin;
select no_plan();

insert into auth.users(id,aud,role,email,email_confirmed_at,banned_until)
select ('97800000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated',
 'golden-checkout-'||n||'@example.test',now(),case when n=4 then now()+interval '1 day' end
from generate_series(1,5) n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Golden Buyer',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved'
from auth.users where id::text like '97800000%' and right(id::text,1) in ('1','3','4');
insert into public.staff_roles(user_id,role) values('97800000-0000-4000-8000-000000000005','admin');

select ok(not has_function_privilege('anon','public.golden_pass_checkout(text,uuid,jsonb)','EXECUTE'),'Anonymous checkout RPC is blocked');
select ok(not has_function_privilege('authenticated','public.golden_pass_checkout(text,uuid,jsonb)','EXECUTE'),'Clients cannot write payment facts');
select ok(not has_table_privilege('authenticated','private.golden_pass_payments','SELECT'),'Payment ledger is private');
select ok(not private.has_verified_mobile('97800000-0000-4000-8000-000000000001'),'Eligible fixture has no mobile verification');
select is(public.golden_pass_checkout('status','97800000-0000-4000-8000-000000000001','{}')->>'status','eligible','Identity approval qualifies without mobile');
select is(public.golden_pass_checkout('status','97800000-0000-4000-8000-000000000002','{}')->>'status','ineligible','Confirmed email alone cannot buy');
select is(public.golden_pass_checkout('status','97800000-0000-4000-8000-000000000004','{}')->>'status','ineligible','Restricted member cannot buy');

set local role service_role;
select throws_ok($$select public.golden_pass_checkout('claim_order','97800000-0000-4000-8000-000000000001','{}')$$,'22023',null,'Order requires terms consent');
select set_config('golden.quote',(public.golden_pass_checkout('claim_order','97800000-0000-4000-8000-000000000001','{"acceptedTerms":true}')->>'id'),true);
select is((public.golden_pass_checkout('claim_order','97800000-0000-4000-8000-000000000001','{"acceptedTerms":true}')->>'claimed')::boolean,false,
 'Repeated order claim cannot create another order');
select throws_ok($$select public.golden_pass_checkout('status','97800000-0000-4000-8000-000000000003',jsonb_build_object('quoteId',current_setting('golden.quote')))$$,
 'P0002',null,'Only the buyer can view a purchase');
select is(public.golden_pass_checkout('bind_order','97800000-0000-4000-8000-000000000001',
 jsonb_build_object('quoteId',current_setting('golden.quote'),'orderId','order_GoldenOne'))->>'status','awaiting_payment','Bind a server-verified order');
select is(public.golden_pass_checkout('lookup_order',null,'{"orderId":"order_GoldenOne"}')->>'id',current_setting('golden.quote'),'Webhook can retrieve bound order');
select is(public.golden_pass_checkout('lookup_order',null,'{"orderId":"order_NotGolden"}')->>'status','ignored','Unrelated orders are ignored');
select set_config('golden.capture',jsonb_build_object('quoteId',current_setting('golden.quote'),'orderId','order_GoldenOne',
 'paymentId','pay_GoldenOne','amount',10000000,'currency','INR','refundedAmount',0,'confirmedAt',now())::text,true);
select throws_ok($$select public.golden_pass_checkout('capture',null,current_setting('golden.capture')::jsonb||'{"amount":100}'::jsonb)$$,
 '22023',null,'Incorrect capture amount cannot grant a pass');
select throws_ok($$select public.golden_pass_checkout('capture',null,current_setting('golden.capture')::jsonb-'confirmedAt')$$,
 '22023',null,'First activation requires a verified confirmation time');
select set_config('golden.active',public.golden_pass_checkout('capture',null,current_setting('golden.capture')::jsonb)::text,true);
select is(current_setting('golden.active')::jsonb->>'status','active','Verified capture grants Golden Pass');
select is((current_setting('golden.active')::jsonb->>'starts_at')::timestamptz,now(),'Pass starts on confirmed payment');
select is((current_setting('golden.active')::jsonb->>'ends_at')::timestamptz,
 ((now() at time zone 'Asia/Kolkata')+interval '12 months') at time zone 'Asia/Kolkata','Pass expires twelve months after capture in Bengaluru time');
select is(public.golden_pass_checkout('capture',null,current_setting('golden.capture')::jsonb || jsonb_build_object('confirmedAt',now()+interval '1 day'))->>'ends_at',
 current_setting('golden.active')::jsonb->>'ends_at','Capture retry cannot extend the term');
select is((public.golden_pass_checkout('claim_order','97800000-0000-4000-8000-000000000001','{"acceptedTerms":true}')->>'claimed')::boolean,false,
 'Active pass blocks another order');
select is(public.golden_pass_checkout('request_refund','97800000-0000-4000-8000-000000000001',
 jsonb_build_object('quoteId',current_setting('golden.quote')))->>'status','active','Refund request leaves access active while staff review');
reset role;
select is((select count(*)::int from private.membership_paid_terms where user_id='97800000-0000-4000-8000-000000000001'),
 0,'Golden checkout does not mutate platform membership terms');

set local role authenticated;
select set_config('request.jwt.claim.sub','97800000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.staff_list_golden_pass_refund_requests()$$,'42501',null,'Member cannot see the refund queue');
select set_config('request.jwt.claim.sub','97800000-0000-4000-8000-000000000005',true);
select is((select count(*)::int from jsonb_array_elements(public.staff_list_golden_pass_refund_requests()) r
 where r->>'id'=current_setting('golden.quote')),1,'Staff can review refund requests from direct buyers');
reset role;

select is(public.golden_pass_checkout('refund',null,current_setting('golden.capture')::jsonb||'{"refundedAmount":10000000}'::jsonb)->>'status',
 'refunded','Fully processed refund removes Golden access');
select is(public.golden_pass_checkout('capture',null,current_setting('golden.capture')::jsonb)->>'status','refunded',
 'Out-of-order capture cannot reinstate refunded access');
select set_config('golden.restricted_quote',public.golden_pass_checkout('claim_order','97800000-0000-4000-8000-000000000003','{"acceptedTerms":true}')->>'id',true);
select public.golden_pass_checkout('bind_order','97800000-0000-4000-8000-000000000003',
 jsonb_build_object('quoteId',current_setting('golden.restricted_quote'),'orderId','order_GoldenRestricted'));
update auth.users set banned_until=now()+interval '1 day' where id='97800000-0000-4000-8000-000000000003';
select set_config('golden.restricted_capture',public.golden_pass_checkout('capture',null,
 jsonb_build_object('quoteId',current_setting('golden.restricted_quote'),'orderId','order_GoldenRestricted',
 'paymentId','pay_GoldenRestricted','amount',10000000,'currency','INR','refundedAmount',0,'confirmedAt',now()))::text,true);
select is(current_setting('golden.restricted_capture')::jsonb->>'status','needs_review','Account restricted after order creation cannot gain a pass');
select is((current_setting('golden.restricted_capture')::jsonb->>'active')::boolean,false,'Restricted payment has no active entitlement');
select ok(public.golden_pass_checkout('request_refund','97800000-0000-4000-8000-000000000003',
 jsonb_build_object('quoteId',current_setting('golden.restricted_quote')))->>'refund_requested_at' is not null,
 'Restricted buyer can request review of captured payment within 30 days');
insert into private.golden_pass_payments(member_id,order_id,payment_id,captured_at,starts_at,ends_at)
 values('97800000-0000-4000-8000-000000000003','order_GoldenOld','pay_GoldenOld',now()-interval '31 days',now()-interval '31 days',now()+interval '11 months');
select throws_ok($$select public.golden_pass_checkout('request_refund','97800000-0000-4000-8000-000000000003',
 (select jsonb_build_object('quoteId',id) from private.golden_pass_payments where order_id='order_GoldenOld'))$$,
 '22023',null,'Refund request window closes after thirty days');
select * from finish();
rollback;
