begin;
create function pg_temp.expect_error(command text, expected text) returns void language plpgsql as $$
begin
 begin
  execute command;
 exception when others then
  if sqlstate=expected then return; end if;
  raise;
 end;
 raise exception 'Expected SQLSTATE % for %',expected,command;
end; $$;
create function pg_temp.check_test(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'FAIL: %',message; end if; end; $$;

insert into auth.users(id,email,email_confirmed_at,aud,role) values
 ('a4050000-0000-4000-8000-000000000001','razorpay-test-admin@example.test',now(),'authenticated','authenticated'),
 ('a4050000-0000-4000-8000-000000000002','razorpay-test-other-admin@example.test',now(),'authenticated','authenticated'),
 ('a4050000-0000-4000-8000-000000000003','razorpay-test-reviewer@example.test',now(),'authenticated','authenticated'),
 ('a4050000-0000-4000-8000-000000000004','razorpay-test-super@example.test',now(),'authenticated','authenticated');
insert into public.staff_roles(user_id,role) values
 ('a4050000-0000-4000-8000-000000000001','admin'),
 ('a4050000-0000-4000-8000-000000000002','admin'),
 ('a4050000-0000-4000-8000-000000000003','membership_reviewer'),
 ('a4050000-0000-4000-8000-000000000004','super_admin');

do $$
declare actor uuid:='a4050000-0000-4000-8000-000000000001'; super_actor uuid:='a4050000-0000-4000-8000-000000000004';
 q jsonb; q2 jsonb; input jsonb; result jsonb; o jsonb; refund jsonb; payment jsonb; refund_data jsonb;
 early_order jsonb; early_payment jsonb; early_refund jsonb;
 bookings bigint; access_terms bigint; membership_terms bigint; service_periods bigint;
begin
 select count(*) into bookings from public.bookings;
 select count(*) into access_terms from public.paid_access_entitlements;
 select count(*) into membership_terms from private.membership_paid_terms;
 select count(*) into service_periods from private.identity_service_periods;
 perform pg_temp.check_test((select not enabled from private.razorpay_test_settings),'test mode defaults off');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L)',actor,'create_fixture_quote'),'42501');
 perform pg_temp.expect_error(format('select public.razorpay_test_webhook(%L,%L,%L)', 'off-event',repeat('a',64),'payment.captured'),'42501');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'configure','{"enabled":true}'),'42501');
 perform public.razorpay_test_operation(super_actor,'configure','{"enabled":true}');
 perform pg_temp.expect_error('select public.razorpay_test_operation(''a4050000-0000-4000-8000-000000000003'',''create_fixture_quote'')','42501');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'create_fixture_quote','{"amountPaise":1}'),'22023');
 q:=public.razorpay_test_operation(actor,'create_fixture_quote')->'quote';
 perform pg_temp.check_test(q->>'amountPaise'='100' and q->>'currency'='INR' and q->>'taxBasis'='synthetic_test_fixture','server-only INR fixture and explicit synthetic tax basis');
 input:=jsonb_build_object('quoteId',q->>'id','idempotencyKey','test-order-0001','policyVersion',q->>'policyVersion',
 'acceptedPolicies','{"terms":true,"privacy":true,"refund":true,"shipping":true,"paymentDataSharing":true}'::jsonb);
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_order',input-'acceptedPolicies'),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_order',jsonb_set(input,'{acceptedPolicies,unexpected}','"synthetic"')),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)','a4050000-0000-4000-8000-000000000002','reserve_order',input),'22023');
 result:=public.razorpay_test_operation(actor,'reserve_order',input); o:=result->'order';
 perform pg_temp.check_test((result->>'shouldCreate')::boolean and length(o->>'receipt')<=40,'first caller alone creates provider order');
 perform pg_temp.check_test((o->>'createdAt')::timestamptz=(select created_at from private.razorpay_test_orders where id=(o->>'id')::uuid),'internal creation timestamp bounds provider reconciliation search');
 result:=public.razorpay_test_operation(actor,'reserve_order',input);
 perform pg_temp.check_test(not(result->>'shouldCreate')::boolean and result->'order'->>'id'=o->>'id','replay retains order without another provider call');
 q2:=public.razorpay_test_operation(actor,'create_fixture_quote')->'quote';
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_order',input||jsonb_build_object('quoteId',q2->>'id')),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_order',input||'{"idempotencyKey":"different-key-0001"}'),'22023');
 update private.razorpay_test_quotes set expires_at=now()-interval '1 second' where id=(q2->>'id')::uuid;
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_order',input||jsonb_build_object('quoteId',q2->>'id','idempotencyKey','expired-quote-0001')),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)','a4050000-0000-4000-8000-000000000002','status',jsonb_build_object('orderId',o->>'id')),'42501');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'attach_order',jsonb_build_object('orderId',o->>'id','razorpayOrderId','order_SyntheticOne','amountPaise',1,'currency','INR')),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'attach_order',jsonb_build_object('orderId',o->>'id','razorpayOrderId','order_SyntheticOne','amountPaise',100,'currency','USD')),'22023');
 perform public.razorpay_test_operation(actor,'attach_order',jsonb_build_object('orderId',o->>'id','razorpayOrderId','order_SyntheticOne','amountPaise',100,'currency','INR'));
 payment:=jsonb_build_object('orderId',o->>'id','razorpayOrderId','order_SyntheticOne','paymentId','pay_SyntheticOne','amountPaise',100,'currency','INR','status','authorized');
 result:=public.razorpay_test_operation(actor,'record_payment',payment);
 perform pg_temp.check_test(result->'order'->>'state'='authorized' and result->'order'->'paymentId'='null'::jsonb,'authorization grants no capture');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_refund',jsonb_build_object('orderId',o->>'id','amountPaise',10,'idempotencyKey','before-capture-0001')),'22023');
 result:=public.razorpay_test_operation(actor,'record_payment',payment||'{"status":"failed"}');
 perform pg_temp.check_test(result->'order'->>'state'='authorized','failed attempt is not terminal order failure');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'record_payment',payment||'{"amountPaise":99,"status":"captured"}'),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'record_payment',payment||'{"razorpayOrderId":"order_Other","status":"captured"}'),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'record_payment',payment||'{"currency":"USD","status":"captured"}'),'22023');
 result:=public.razorpay_test_operation(actor,'record_payment',payment||'{"status":"captured"}');
 perform pg_temp.check_test(result->'order'->>'state'='captured','matching provider capture recorded');
 update private.razorpay_test_quotes set expires_at=now()-interval '1 second' where id=(q->>'id')::uuid;
 result:=public.razorpay_test_operation(actor,'record_payment',payment||'{"status":"captured"}');
 perform pg_temp.check_test(result->'order'->>'state'='captured','replay of timely capture stays captured after quote expiry');
 result:=public.razorpay_test_operation(actor,'record_payment',payment);
 perform pg_temp.check_test(result->'order'->>'state'='captured','late authorization cannot regress capture');
 result:=public.razorpay_test_operation(actor,'needs_review',jsonb_build_object('orderId',o->>'id'));
 perform pg_temp.check_test(result->'order'->>'state'='needs_review' and result->'order'->>'paymentId'='pay_SyntheticOne'
 and exists(select 1 from private.razorpay_test_orders where id=(o->>'id')::uuid and captured_at is not null),'captured discrepancy stays visible without losing capture evidence');
 result:=public.razorpay_test_operation(actor,'record_payment',payment||'{"status":"captured"}');
 perform pg_temp.check_test(result->'order'->>'state'='needs_review','capture replay cannot silently clear explicit review');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'record_payment',payment||'{"paymentId":"pay_AnotherCapture","status":"captured"}'),'22023');
 q2:=public.razorpay_test_operation(actor,'create_fixture_quote')->'quote';
 result:=public.razorpay_test_operation(actor,'reserve_order',input||jsonb_build_object('quoteId',q2->>'id','idempotencyKey','test-order-0002'));
 perform public.razorpay_test_operation(actor,'attach_order',jsonb_build_object('orderId',result->'order'->>'id','razorpayOrderId','order_SyntheticTwo','amountPaise',100,'currency','INR'));
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'record_payment',payment||jsonb_build_object('orderId',result->'order'->>'id','razorpayOrderId','order_SyntheticTwo','status','captured')),'22023');
 update private.razorpay_test_quotes set expires_at=now()-interval '1 second' where id=(q2->>'id')::uuid;
 result:=public.razorpay_test_operation(actor,'record_payment',payment||jsonb_build_object('orderId',result->'order'->>'id','razorpayOrderId','order_SyntheticTwo','paymentId','pay_LateCapture','status','captured'));
 perform pg_temp.check_test(result->'order'->>'state'='needs_review' and result->'order'->>'paymentId'='pay_LateCapture','late first capture retains payment evidence for review');
 result:=public.razorpay_test_operation(actor,'record_payment',payment||jsonb_build_object('orderId',result->'order'->>'id','razorpayOrderId','order_SyntheticTwo','paymentId','pay_LateCapture','status','captured'));
 perform pg_temp.check_test(result->'order'->>'state'='needs_review','late capture replay cannot clear review');
 result:=public.razorpay_test_operation(actor,'reserve_refund',jsonb_build_object('orderId',result->'order'->>'id','amountPaise',100,'idempotencyKey','late-refund-0001'));
 perform pg_temp.check_test((result->>'shouldRefund')::boolean,'late capture can still be refunded');
 input:=jsonb_build_object('orderId',o->>'id','amountPaise',60,'idempotencyKey','refund-test-0001');
 result:=public.razorpay_test_operation(actor,'reserve_refund',input); refund:=result->'refund';
 perform pg_temp.check_test((result->>'shouldRefund')::boolean,'first refund caller alone issues provider request');
 result:=public.razorpay_test_operation(actor,'reserve_refund',input);
 perform pg_temp.check_test(not(result->>'shouldRefund')::boolean and result->'refund'->>'id'=refund->>'id','refund retry uses durable operation');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_refund',input||'{"amountPaise":61}'),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'reserve_refund',input||'{"amountPaise":50,"idempotencyKey":"refund-test-0002"}'),'22023');
 refund_data:=jsonb_build_object('orderId',o->>'id','refundId',refund->>'id','razorpayRefundId','rfnd_SyntheticOne','paymentId','pay_SyntheticOne','amountPaise',60,'currency','INR','status','pending');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'attach_refund',refund_data||'{"paymentId":"pay_Wrong"}'),'22023');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'attach_refund',refund_data||'{"receipt":"wrong-receipt"}'),'22023');
 result:=public.razorpay_test_operation(actor,'attach_refund',refund_data);
 perform pg_temp.check_test(result->'order'->>'refundedAmountPaise'='0','pending refund not counted as processed');
 result:=public.razorpay_test_operation(actor,'attach_refund',refund_data||'{"status":"processed"}');
 perform pg_temp.check_test(result->'order'->>'refundedAmountPaise'='60' and result->'order'->>'state'='partially_refunded','partial processed refund accounted');
 result:=public.razorpay_test_operation(actor,'attach_refund',refund_data||'{"status":"failed"}');
 perform pg_temp.check_test(result->'order'->>'refundedAmountPaise'='60','late failure does not regress processed refund');
 result:=public.razorpay_test_operation(actor,'reserve_refund',input||'{"amountPaise":40,"idempotencyKey":"refund-test-0002"}'); refund:=result->'refund';
 perform public.razorpay_test_operation(actor,'needs_review',jsonb_build_object('orderId',o->>'id','refundId',refund->>'id'));
 refund_data:=jsonb_build_object('receipt',refund->>'receipt','razorpayRefundId','rfnd_SyntheticTwo','paymentId','pay_SyntheticOne','amountPaise',40,'currency','INR','status','processed');
 result:=public.razorpay_test_webhook('event-refund-processed',repeat('a',64),'refund.processed',null,refund_data);
 perform pg_temp.check_test((result->>'applied')::boolean,'refund webhook reconciles stable receipt after lost response');
 result:=public.razorpay_test_webhook('event-refund-processed',repeat('a',64),'refund.processed',null,refund_data);
 perform pg_temp.check_test((result->>'duplicate')::boolean,'duplicate webhook returns durable result');
 perform pg_temp.expect_error(format('select public.razorpay_test_webhook(%L,%L,%L,null,%L)','event-refund-processed',repeat('b',64),'refund.processed',refund_data),'22023');
 result:=public.razorpay_test_operation(actor,'status',jsonb_build_object('orderId',o->>'id'));
 perform pg_temp.check_test(result->'order'->>'refundedAmountPaise'='100' and result->'order'->>'state'='refunded','full processed refund accounted once');
 perform public.razorpay_test_webhook('event-capture-late',repeat('c',64),'payment.captured',payment||'{"status":"captured"}');
 result:=public.razorpay_test_operation(actor,'status',jsonb_build_object('orderId',o->>'id'));
 perform pg_temp.check_test(result->'order'->>'state'='refunded','late capture cannot regress full refund');
 perform pg_temp.expect_error(format('select public.razorpay_test_webhook(%L,%L,%L,%L)','event-bad-amount',repeat('d',64),'payment.captured',payment||'{"status":"captured","amountPaise":1}'),'22023');
 perform pg_temp.check_test(not exists(select 1 from private.razorpay_test_webhook_events where event_id='event-bad-amount'),'failed application does not commit webhook receipt');
 result:=public.razorpay_test_webhook('event-unknown-order',repeat('e',64),'payment.captured',payment||'{"status":"captured","razorpayOrderId":"order_Unknown"}');
 perform pg_temp.check_test(not(result->>'applied')::boolean,'unknown provider order cannot affect test ledger');
 q2:=public.razorpay_test_operation(actor,'create_fixture_quote')->'quote';
 result:=public.razorpay_test_operation(actor,'reserve_order',jsonb_build_object('quoteId',q2->>'id','idempotencyKey','early-webhook-order',
 'policyVersion','2026-11-04-razorpay-test-v1','acceptedPolicies','{"terms":true,"privacy":true,"refund":true,"shipping":true,"paymentDataSharing":true}'::jsonb));
 early_order:=result->'order';
 early_payment:=jsonb_build_object('razorpayOrderId','order_EarlyWebhook','paymentId','pay_EarlyWebhook','amountPaise',100,'currency','INR','status','captured');
 result:=public.razorpay_test_webhook('event-before-order-attach',repeat('f',64),'payment.captured',early_payment);
 perform pg_temp.check_test(not(result->>'applied')::boolean and not exists(select 1 from private.razorpay_test_payments where payment_id='pay_EarlyWebhook'),'early payment event remains durable and unapplied before provider order mapping');
 perform pg_temp.expect_error(format('select public.razorpay_test_webhook(%L,%L,%L,%L)','event-before-order-attach',repeat('0',64),'payment.captured',early_payment),'22023');
 perform public.razorpay_test_operation(actor,'attach_order',jsonb_build_object('orderId',early_order->>'id','razorpayOrderId','order_EarlyWebhook','amountPaise',100,'currency','INR'));
 result:=public.razorpay_test_webhook('event-before-order-attach',repeat('f',64),'payment.captured',early_payment);
 perform pg_temp.check_test((result->>'applied')::boolean and not(result->>'duplicate')::boolean,'same-hash early payment event applies after provider mapping');
 result:=public.razorpay_test_webhook('event-before-order-attach',repeat('f',64),'payment.captured',early_payment);
 perform pg_temp.check_test((result->>'applied')::boolean and (result->>'duplicate')::boolean
 and (select count(*) from private.razorpay_test_payments where order_id=(early_order->>'id')::uuid)=1,'applied early payment event is subsequently deduplicated');
 result:=public.razorpay_test_operation(actor,'reserve_refund',jsonb_build_object('orderId',early_order->>'id','amountPaise',60,'idempotencyKey','early-webhook-refund'));
 early_refund:=result->'refund';
 refund_data:=jsonb_build_object('razorpayRefundId','rfnd_EarlyWebhook','paymentId','pay_EarlyWebhook','amountPaise',60,'currency','INR','status','processed');
 result:=public.razorpay_test_webhook('event-before-refund-attach',repeat('1',64),'refund.processed',null,refund_data);
 perform pg_temp.check_test(not(result->>'applied')::boolean and (select refunded_amount_paise from private.razorpay_test_orders where id=(early_order->>'id')::uuid)=0,'early refund event remains unapplied before provider refund mapping');
 perform public.razorpay_test_operation(actor,'attach_refund',refund_data||jsonb_build_object('orderId',early_order->>'id','refundId',early_refund->>'id','status','pending'));
 result:=public.razorpay_test_webhook('event-before-refund-attach',repeat('1',64),'refund.processed',null,refund_data);
 perform pg_temp.check_test((result->>'applied')::boolean and not(result->>'duplicate')::boolean,'same-hash early refund event applies after provider mapping');
 result:=public.razorpay_test_webhook('event-before-refund-attach',repeat('1',64),'refund.processed',null,refund_data);
 perform pg_temp.check_test((result->>'duplicate')::boolean and (select refunded_amount_paise from private.razorpay_test_orders where id=(early_order->>'id')::uuid)=60,'early refund replay cannot double-count processed amount');
 perform public.razorpay_test_operation(super_actor,'configure','{"enabled":false}');
 perform pg_temp.expect_error(format('select public.razorpay_test_operation(%L,%L,%L)',actor,'status',jsonb_build_object('orderId',o->>'id')),'42501');
 perform pg_temp.check_test((select count(*) from public.bookings)=bookings and (select count(*) from public.paid_access_entitlements)=access_terms
 and (select count(*) from private.membership_paid_terms)=membership_terms and (select count(*) from private.identity_service_periods)=service_periods,'no real booking, access, Premium or ID-service writes');
 raise notice 'PASS Razorpay TEST SQL: server pricing, actor ownership, policies, idempotency, capture, refunds, webhook atomicity and access isolation';
end; $$;

set local role authenticated;
select pg_temp.expect_error('select public.razorpay_test_operation(''a4050000-0000-4000-8000-000000000001'',''create_fixture_quote'')','42501');
select pg_temp.expect_error('select * from private.razorpay_test_orders','42501');
reset role;
set local role anon;
select pg_temp.expect_error('select public.razorpay_test_webhook(''anon'',repeat(''a'',64),''payment.captured'')','42501');
reset role;
set local role service_role;
select public.razorpay_test_operation('a4050000-0000-4000-8000-000000000004','configure','{"enabled":true}');
select pg_temp.expect_error('select * from private.razorpay_test_orders','42501');
select pg_temp.expect_error('select public.razorpay_test_operation(''a4050000-0000-4000-8000-000000000003'',''create_fixture_quote'')','42501');
select public.razorpay_test_operation('a4050000-0000-4000-8000-000000000001','create_fixture_quote');
rollback;
