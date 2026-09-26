begin;
select plan(23);
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('30000000-0000-4000-8000-000000000001','authenticated','authenticated','notice-owner@example.test',now()),
('30000000-0000-4000-8000-000000000002','authenticated','authenticated','notice-other@example.test',now()),
('30000000-0000-4000-8000-000000000003','authenticated','authenticated','notice-staff@example.test',now());
insert into public.staff_roles(user_id,role) values('30000000-0000-4000-8000-000000000003','admin');
update public.onboarding_settings set enabled=true;
select ok(to_regprocedure('public.submit_basic_onboarding(text,text,text,date)') is null,'old submission bypass signature removed');
select ok(to_regprocedure('public.resubmit_basic_onboarding(text,text,text,date)') is null,'old resubmission bypass signature removed');
select function_privs_are('private','submit_basic_onboarding',array['text','text','text','date'],'authenticated',array[]::text[],'legacy internal submission cannot be called by member');
select function_privs_are('private','reserve_onboarding_document',array['text','text'],'authenticated',array[]::text[],'legacy reservation cannot bypass notice');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.submit_basic_onboarding('Test Person','+919999999999','https://linkedin.com/in/test','1990-01-01',null)$$,'42501','Current privacy notice acceptance required','null notice rejected');
select throws_ok($$select public.submit_basic_onboarding('Test Person','+919999999999','https://linkedin.com/in/test','1990-01-01','2026-09-25')$$,'42501','Current privacy notice acceptance required','stale notice rejected');
select lives_ok($$select public.submit_basic_onboarding('Test Person','+919999999999','https://linkedin.com/in/test','1990-01-01','2026-09-26')$$,'explicit current acceptance registers');
select is((select revision from public.onboarding_notice_acceptances where user_id=auth.uid()),1,'notice bound to first revision');
select is((select accepted_at from public.onboarding_notice_acceptances where user_id=auth.uid()),now(),'acceptance time set on server');
select throws_ok($$insert into public.onboarding_notice_acceptances(user_id,revision,notice_version) values(auth.uid(),2,'2026-09-26')$$,'42501',null,'member cannot manufacture acceptance');
select throws_ok($$update public.onboarding_notice_acceptances set accepted_at=now()$$,'42501',null,'member cannot rewrite acceptance');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.onboarding_notice_acceptances),0,'other member cannot read acceptance');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::integer from public.onboarding_notice_acceptances where user_id='30000000-0000-4000-8000-000000000001'),1,'admin can read evidence');
select throws_ok($$delete from public.onboarding_notice_acceptances$$,'42501',null,'admin cannot erase acceptance');
select public.request_onboarding_corrections('30000000-0000-4000-8000-000000000001','Please correct registration details');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.resubmit_basic_onboarding('Test Person','+919999999999','https://linkedin.com/in/test','1990-01-01',null)$$,'42501','Current privacy notice acceptance required','corrections require fresh acceptance');
select public.resubmit_basic_onboarding('Test Person','+919999999999','https://linkedin.com/in/test','1990-01-01','2026-09-26');
select is((select count(*)::integer from public.onboarding_notice_acceptances where user_id=auth.uid()),2,'corrections preserve acceptance history');
reset role;
-- Model a pre-notice application and reserved object, without manufacturing acceptance.
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth)
values('30000000-0000-4000-8000-000000000002','Older Applicant','notice-other@example.test','+919999999999','https://linkedin.com/in/older','1990-01-01');
insert into public.onboarding_documents(id,user_id,kind)
values('30000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000002','photo');
select is((select count(*)::integer from public.onboarding_notice_acceptances where user_id='30000000-0000-4000-8000-000000000002'),0,'legacy applicant is not silently accepted');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.reserve_onboarding_document('government_id','pan')$$,'42501','Current privacy notice acceptance required','legacy reservation blocked');
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.review_basic_onboarding('30000000-0000-4000-8000-000000000002','rejected')$$,'42501','Current privacy notice acceptance required','legacy review blocked');
reset role;
set local role service_role;
select throws_ok($$select public.finalize_onboarding_document('30000000-0000-4000-8000-000000000004')$$,'42501','Current privacy notice acceptance required','finalization rejects missing notice');
select throws_ok($$update public.onboarding_notice_acceptances set accepted_at=now()$$,'42501',null,'service role cannot rewrite notice history');
reset role;
update public.basic_onboarding_applications set revision=3 where user_id='30000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.reserve_onboarding_document('photo')$$,'42501','Current privacy notice acceptance required','older revision acceptance cannot cover new revision');
reset role;
select is((select count(*)::integer from public.memberships where user_id='30000000-0000-4000-8000-000000000001' and status='active'),0,'acceptance never grants paid membership');
select * from finish();
rollback;
