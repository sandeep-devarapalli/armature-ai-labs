begin;
select no_plan();
select ok(not has_function_privilege('authenticated','public.billing_dispatch(text,jsonb)','execute'),'Browser cannot drive billing');
select ok(not has_table_privilege('authenticated','private.billing_operations','SELECT'),'Browser cannot read billing ledger');
select ok((select not invoicing_enabled and not gst_enabled from private.billing_settings),'Invoicing and GST default off');
select throws_ok($$update private.billing_settings set gst_enabled=true$$,'23514',null,'GST cannot be enabled without registration and approval');
select throws_ok($$select public.billing_dispatch('claim','{}')$$,'42501','Invoicing disabled','Claims refused while invoicing is disabled');

insert into auth.users(id,aud,role,email) values
('95000000-0000-4000-8000-000000000001','authenticated','authenticated','billing-renter@example.test'),
('95000000-0000-4000-8000-000000000002','authenticated','authenticated','billing-staff@example.test');
update public.profiles set display_name='Synthetic Renter' where id='95000000-0000-4000-8000-000000000001';
insert into public.locations(id,slug,name) values('95000000-0000-4000-8000-000000000010','billing-fixture','Synthetic billing lab');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_duration_minutes,booking_horizon_days)
values('95000000-0000-4000-8000-000000000011','95000000-0000-4000-8000-000000000010','billing-fixture-cabin','Synthetic cabin','workspace',1,525600,366);
insert into private.rental_quotes(id,member_id,product,party_type,resource_id,unit,starts_on,ends_on,rent_paise,deposit_paise,policy_version,agreement_hash,deposit_method,test_fixture)
values('95000000-0000-4000-8000-000000000020','95000000-0000-4000-8000-000000000001','cabin101','individual','95000000-0000-4000-8000-000000000011',
 'month','2027-02-01','2027-02-28',5000,10000,'synthetic','synthetic-hash','bank_transfer',true);

update private.rental_quotes set payment_id='pay_billingfixture',captured_at='2026-11-08T05:00:00Z' where id='95000000-0000-4000-8000-000000000020';
select is((select count(*)::int from private.billing_operations where source_id='95000000-0000-4000-8000-000000000020'),2,'Capture enqueues one invoice and one payment');
select is((select amount_paise from private.billing_operations where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'),5000::bigint,'Invoice is rent only, never the bank deposit');
select is((select payload->>'invoiceType' from private.billing_operations where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'),'BOS','No-tax bill of supply while unregistered');
select ok((select not (payload ? 'billedBy') and not (payload->'billedTo' ? 'gstin') and not (payload ? 'email')
 from private.billing_operations where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'),'No GSTIN, no seller GST block and no email delivery');
select is((select (payload->'items'->0->>'rate')::numeric from private.billing_operations where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'),50.00,'Item rate is INR 50');
select is((select payload->'billedTo'->>'name' from private.billing_operations where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'),'Synthetic Renter','Billed to the member name');
select ok((select test_fixture from private.billing_operations where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'),'Staging fixture invoices are labelled');

-- Replayed callbacks and webhooks cannot enqueue twice.
update private.rental_quotes set captured_at=null where id='95000000-0000-4000-8000-000000000020';
update private.rental_quotes set captured_at='2026-11-08T05:01:00Z' where id='95000000-0000-4000-8000-000000000020';
select is((select count(*)::int from private.billing_operations where source_id='95000000-0000-4000-8000-000000000020'),2,'Duplicate capture events do not duplicate invoices');
select throws_ok($$update private.billing_operations set payload='{}' where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'$$,'42501','Billing operation payload is immutable','Payload cannot be rewritten');

-- Payment waits for its invoice; claims are exclusive.
update private.billing_settings set invoicing_enabled=true;
select is(jsonb_array_length(public.billing_dispatch('claim','{"testFixture":false}')->'operations'),0,'Live worker never claims staging fixtures');
select set_config('billing.claim',(public.billing_dispatch('claim','{"testFixture":true}')->'operations')::text,true);
select is(jsonb_array_length(current_setting('billing.claim')::jsonb),1,'Only the invoice is claimable before it succeeds');
select is(current_setting('billing.claim')::jsonb->0->>'kind','invoice_create','Invoice is claimed first');
select is(jsonb_array_length(public.billing_dispatch('claim','{"testFixture":true}')->'operations'),0,'A held claim cannot be claimed again');
select throws_ok(format($$select public.billing_dispatch('complete','{"id":"%s","claimToken":"%s","outcome":"succeeded"}')$$,
 current_setting('billing.claim')::jsonb->0->>'id',extensions.gen_random_uuid()),'P0002','Claim no longer held','Stale claim token rejected');
select throws_ok(format($$select public.billing_dispatch('complete','{"id":"%s","claimToken":"%s","outcome":"succeeded"}')$$,
 current_setting('billing.claim')::jsonb->0->>'id',current_setting('billing.claim')::jsonb->0->>'claimToken'),'22023','Provider invoice id required','Success needs the provider invoice id');
select public.billing_dispatch('complete',jsonb_build_object('id',current_setting('billing.claim')::jsonb->0->>'id','claimToken',
 current_setting('billing.claim')::jsonb->0->>'claimToken','outcome','succeeded','providerInvoiceId','synthetic-invoice-1'));
select set_config('billing.claim',(public.billing_dispatch('claim','{"testFixture":true}')->'operations')::text,true);
select is(current_setting('billing.claim')::jsonb->0->>'kind','payment_apply','Payment is claimable after invoice success');
select is(current_setting('billing.claim')::jsonb->0->>'providerInvoiceId','synthetic-invoice-1','Payment carries the provider invoice id');
select is(current_setting('billing.claim')::jsonb->0->'payload'->>'refId','pay_billingfixture','Payment references the Razorpay payment');
select public.billing_dispatch('complete',jsonb_build_object('id',current_setting('billing.claim')::jsonb->0->>'id','claimToken',
 current_setting('billing.claim')::jsonb->0->>'claimToken','outcome','ambiguous','error','timeout'));
select is((select state from private.billing_operations where kind='payment_apply' and source_id='95000000-0000-4000-8000-000000000020'),'ambiguous','Timeouts are ambiguous, not failed');
select ok((public.billing_dispatch('claim','{"testFixture":true}')->'operations'->0->>'reconcileFirst')::boolean,'Ambiguous retries must reconcile first');
select throws_ok($$update private.billing_operations set state='pending' where kind='invoice_create' and source_id='95000000-0000-4000-8000-000000000020'$$,'42501','Settled billing operation cannot change','Settled invoices stay settled');

-- Rent refunds go to staff, never an automatic provider call.
update private.rental_quotes set refunded_amount=2000,rent_refunded=2000 where id='95000000-0000-4000-8000-000000000020';
select is((select state from private.billing_operations where kind='refund_review' and source_id='95000000-0000-4000-8000-000000000020'),'needs_staff','Rent refund routes to staff review');

-- Future GST: only after approval and from the effective date, with place of supply.
update private.billing_settings set gst_enabled=true,gstin='29ABCDE1234F1Z5',gst_state_code='29',gst_effective_from='2027-04-01',sac_code='997212',gst_rate=18,
 gst_treatment_note='Synthetic accountant-approved treatment',gst_approved_by='95000000-0000-4000-8000-000000000002',gst_approved_at=now();
select is(private.billing_document('X-1','2027-03-31','A',null,'Rent',100000,'29')->>'invoiceType','BOS','Before the effective date stays BOS');
select is(private.billing_document('X-2','2027-04-01','A',null,'Rent',100000,'29')->>'invoiceType','INVOICE','From the effective date is a tax invoice');
select is(private.billing_document('X-3','2027-04-01','A',null,'Rent',100000,'29')->'billedBy'->>'gstin','29ABCDE1234F1Z5','Tax invoice carries the approved GSTIN');
select is((private.billing_document('X-4','2027-04-01','A',null,'Rent',100000,'29')->'items'->0->>'gstRate')::numeric,18::numeric,'Tax invoice carries the approved rate');
select throws_ok($$update private.billing_settings set gst_state_code='27'$$,'23514',null,'GST state must match the GSTIN');

select * from finish();
rollback;
