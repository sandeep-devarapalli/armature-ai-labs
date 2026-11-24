begin;
select no_plan();

insert into auth.users(id,email,email_confirmed_at)
select ('98200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'venture-pass-'||n||'@example.test', case when n<>8 then now() end from generate_series(1,8) n;
insert into public.staff_roles(user_id,role) values
 ('98200000-0000-4000-8000-000000000007','admin');

select ok(not has_function_privilege('anon','public.submit_venture_pass_application(text,text,text,text,text)','EXECUTE'),
 'Anonymous users cannot apply');
select ok(not has_function_privilege('authenticated','public.venture_pass_payment(text,uuid,jsonb)','EXECUTE'),
 'A client cannot submit payment provider facts');
select ok(not has_table_privilege('authenticated','private.venture_pass_applications','SELECT'),
 'The application ledger is private');

set local role authenticated;
select set_config('request.jwt.claim.sub','98200000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.submit_venture_pass_application('Test Ventures','independent_vc',null,'Test Person','Test portfolio')$$,
 '42501','Venture Partner Pass applications are closed','New applications are closed by default');
reset role;
update public.venture_pass_settings set enabled=true where singleton;

set local role authenticated;
select set_config('request.jwt.claim.sub','98200000-0000-4000-8000-000000000008',true);
select throws_ok($$select public.submit_venture_pass_application('Test Ventures','independent_vc',null,'Test Person','Test portfolio')$$,
 '42501',null,'Applicant email must be confirmed');
select set_config('request.jwt.claim.sub','98200000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.submit_venture_pass_application('Test Ventures','independent_vc',
 'https://venture.example.org@other.example.org','Test Person','Test portfolio')$$,
 '22023',null,'Application site URL cannot contain credentials');
select set_config('venture.test.first',public.submit_venture_pass_application('Test Ventures','independent_vc',
 'https://venture.example.org/team','Test Person','Test portfolio')::text,true);
select is(current_setting('venture.test.first')::jsonb->>'status','pending','An application starts pending');
select is(public.submit_venture_pass_application('Test Retry','corporate_venture',null,'Test Person','Retry portfolio'),
 current_setting('venture.test.first')::jsonb,'Retry preserves the original application');
select throws_ok($$select public.staff_list_venture_pass_applications()$$,'42501',null,'Applicants cannot view the staff queue');
select set_config('request.jwt.claim.sub','98200000-0000-4000-8000-000000000002',true);
select ok(public.get_my_venture_pass_application() is null,'Another account cannot read the application');
reset role;

insert into private.venture_pass_applications(user_id,firm_name,firm_type,contact_name,details)
select id,'Company '||right(id::text,1),'corporate_venture','Test Contact','Test portfolio'
from auth.users where id::text like '98200000%' and right(id::text,1) in ('2','3','4','5','6','7');

set local role authenticated;
select set_config('request.jwt.claim.sub','98200000-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claims','{"aal":"aal1","role":"authenticated"}',true);
select throws_ok($$select public.staff_list_venture_pass_applications()$$,'42501',null,'Admin queue requires MFA');
select set_config('request.jwt.claims','{"aal":"aal2","role":"authenticated"}',true);
select is(jsonb_array_length(public.staff_list_venture_pass_applications()),7,'MFA administrator can read applications');
select throws_ok($$select public.staff_review_venture_pass_application(
 (select (v->>'id')::uuid from jsonb_array_elements(public.staff_list_venture_pass_applications()) v where v->>'email'='venture-pass-7@example.test'),
 'approve')$$,'42501',null,'An administrator cannot approve their own application');

select set_config('venture.test.approved',public.staff_review_venture_pass_application(
 (current_setting('venture.test.first')::jsonb->>'id')::uuid,'approve')::text,true);
select is((current_setting('venture.test.approved')::jsonb->>'payment_expires_at')::timestamptz
 - (current_setting('venture.test.approved')::jsonb->>'reviewed_at')::timestamptz,
 interval '1 hour','Approval reserves exactly one hour');
select set_config('venture.test.second',(select v->>'id' from jsonb_array_elements(public.staff_list_venture_pass_applications()) v
 where v->>'email'='venture-pass-2@example.test'),true);
select set_config('venture.test.third',(select v->>'id' from jsonb_array_elements(public.staff_list_venture_pass_applications()) v
 where v->>'email'='venture-pass-3@example.test'),true);
select set_config('venture.test.fourth',(select v->>'id' from jsonb_array_elements(public.staff_list_venture_pass_applications()) v
 where v->>'email'='venture-pass-4@example.test'),true);
select set_config('venture.test.fifth',(select v->>'id' from jsonb_array_elements(public.staff_list_venture_pass_applications()) v
 where v->>'email'='venture-pass-5@example.test'),true);
select public.staff_review_venture_pass_application((v->>'id')::uuid,'approve') from
 jsonb_array_elements(public.staff_list_venture_pass_applications()) v where v->>'email' in
 ('venture-pass-2@example.test','venture-pass-3@example.test','venture-pass-4@example.test');
select throws_ok($$select public.staff_review_venture_pass_application(current_setting('venture.test.fifth')::uuid,'approve')$$,
 '22023','All four Venture Partner Pass places are held or confirmed','A fifth concurrent approval is refused');
reset role;
update public.venture_pass_settings set enabled=false where singleton;

set local role service_role;
select throws_ok($$select public.venture_pass_payment('claim','98200000-0000-4000-8000-000000000001','{}')$$,
 '22023',null,'An approved payment requires explicit terms acceptance');
select is(public.venture_pass_payment('claim','98200000-0000-4000-8000-000000000001','{"acceptedTerms":true}')->>'claimed',
 'true','Existing applicant can claim checkout after application closure');
select is(public.venture_pass_payment('claim','98200000-0000-4000-8000-000000000001','{"acceptedTerms":true}')->>'claimed',
 'false','A retry cannot start a second provider create');
select is(public.venture_pass_payment('attach','98200000-0000-4000-8000-000000000001',jsonb_build_object(
 'id',current_setting('venture.test.first')::jsonb->>'id','linkId','plink_VentureFirst','paymentUrl','https://rzp.io/rzp/TestVenture1'))->>'payment_link_id',
 'plink_VentureFirst','The exact payment link is bound to the application');
select set_config('venture.test.payment',jsonb_build_object('id',current_setting('venture.test.first')::jsonb->>'id',
 'linkId','plink_VentureFirst','paymentId','pay_VentureFirst','currency','INR','amount',50000000,
 'paidAt',current_setting('venture.test.approved')::jsonb->>'reviewed_at')::text,true);
select throws_ok($$select public.venture_pass_payment('confirm',null,current_setting('venture.test.payment')::jsonb||'{"amount":500000}')$$,
 '22023',null,'A payment of the wrong amount cannot grant a pass');
select throws_ok($$select public.venture_pass_payment('confirm',null,current_setting('venture.test.payment')::jsonb||
 jsonb_build_object('paidAt',current_setting('venture.test.approved')::jsonb->>'payment_expires_at'))$$,
 '22023',null,'A payment at the deadline cannot grant a pass');
select set_config('venture.test.confirmed',public.venture_pass_payment('confirm',null,current_setting('venture.test.payment')::jsonb)::text,true);
select is(current_setting('venture.test.confirmed')::jsonb->>'status','confirmed','An in-window verified capture confirms membership');
select is(public.venture_pass_payment('confirm',null,current_setting('venture.test.payment')::jsonb)->>'ends_at',
 current_setting('venture.test.confirmed')::jsonb->>'ends_at','Provider retries cannot extend the confirmed term');
select public.venture_pass_payment('claim','98200000-0000-4000-8000-000000000002','{"acceptedTerms":true}');
select public.venture_pass_payment('attach',null,jsonb_build_object('id',current_setting('venture.test.second'),
 'linkId','plink_VentureSecond','paymentUrl','https://rzp.io/l/TestVenture2'));
select public.venture_pass_payment('claim','98200000-0000-4000-8000-000000000004','{"acceptedTerms":true}');
reset role;

update private.venture_pass_applications set reviewed_at=statement_timestamp()-interval '2 hours',
 payment_expires_at=statement_timestamp()-interval '1 hour',
 payment_claimed_at=case when payment_claimed_at is not null then statement_timestamp()-interval '90 minutes' end
where id in (current_setting('venture.test.second')::uuid,current_setting('venture.test.third')::uuid,
 current_setting('venture.test.fourth')::uuid);

set local role service_role;
select is(public.venture_pass_payment('lookup','98200000-0000-4000-8000-000000000003','{}')->>'status','expired',
 'A passed deadline with no provider claim is reported expired');
select is(public.venture_pass_payment('lookup','98200000-0000-4000-8000-000000000002','{}')->>'status','approved',
 'An elapsed window with a possibly paid link is held for reconciliation');
select throws_ok($$select public.venture_pass_payment('claim','98200000-0000-4000-8000-000000000002','{"acceptedTerms":true}')$$,
 '22023',null,'An elapsed approval cannot start or re-open payment');
select is(public.venture_pass_payment('expire',null,jsonb_build_object('id',current_setting('venture.test.second'),
 'linkId','plink_VentureSecond'))->>'status','expired','Provider-verified expiry releases the held slot');
select throws_ok($$select public.venture_pass_payment('release_unattempted','98200000-0000-4000-8000-000000000004',
 jsonb_build_object('id',current_setting('venture.test.fourth'),'claimedAt',now()))$$,
 '22023',null,'Only the exact unattempted claim can release a slot after expiry');
select is(public.venture_pass_payment('release_unattempted','98200000-0000-4000-8000-000000000004',jsonb_build_object(
 'id',current_setting('venture.test.fourth'),'claimedAt',
 public.venture_pass_payment('lookup','98200000-0000-4000-8000-000000000004','{}')->>'payment_claimed_at'))->>'status',
 'expired','An untouched provider claim can be explicitly released when the window expires');
reset role;

update public.venture_pass_settings set enabled=true where singleton;
set local role authenticated;
select set_config('request.jwt.claim.sub','98200000-0000-4000-8000-000000000007',true);
select is(public.staff_review_venture_pass_application(current_setting('venture.test.fifth')::uuid,'approve')->>'status',
 'approved','Reconciled expiry leaves capacity for another application');
reset role;

select * from finish();
rollback;
