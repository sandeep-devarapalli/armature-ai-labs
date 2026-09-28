begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at)
select ('65000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','submission-scope-'||n||'@example.test',now() from generate_series(1,6)n;
insert into public.staff_roles(user_id,role) values
('65000000-0000-4000-8000-000000000005','membership_reviewer'),
('65000000-0000-4000-8000-000000000006','admin');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Scope Test',email,'+919999999999','https://linkedin.com/in/test','1990-01-01',case right(id::text,1) when '3' then 'approved' when '4' then 'revoked' else 'pending' end
from auth.users where id::text like '65000000%' and right(id::text,1) in ('1','2','3','4');
insert into public.onboarding_documents(user_id,kind,id_type,object_path,uploaded_at)
select a.user_id,k,case when k='government_id' then 'pan' end,'scope-'||a.user_id||'-'||k,now()
from public.basic_onboarding_applications a cross join unnest(array['photo','government_id']) k where a.user_id::text like '65000000%';
insert into storage.objects(bucket_id,name) select 'onboarding-documents',object_path from public.onboarding_documents where user_id::text like '65000000%';
update public.basic_onboarding_applications set submitted_revision=revision,submitted_at=now() where user_id='65000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_basic_account_summary()->>'status','incomplete','complete uploads without final submission remain registration incomplete');
select is(public.get_basic_account_summary()->>'complete','true','document completeness remains separate from submission');
select is((select count(*)::integer from public.onboarding_documents where user_id=auth.uid()),2,'owner can inspect own unsubmitted documents');
select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_basic_account_summary()->>'status','pending','submitted complete application is pending review');
select is(public.get_basic_account_summary()->>'submitted_revision','1','summary exposes submitted revision');
select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select ok(not public.can_review_basic_application('65000000-0000-4000-8000-000000000001'),'Staff cannot review a draft');
select ok(public.can_review_basic_application('65000000-0000-4000-8000-000000000002'),'Staff can review submitted pending application');
select is((public.list_basic_members('submission-scope-')->>'total')::integer,1,'Staff queue contains only submitted application');
select is((select count(*)::integer from public.basic_onboarding_applications where user_id='65000000-0000-4000-8000-000000000001'),0,'direct application read excludes draft from Staff');
select is((select count(*)::integer from public.onboarding_documents where user_id='65000000-0000-4000-8000-000000000001'),0,'direct document read excludes draft from Staff');
select is((select count(*)::integer from public.onboarding_documents where user_id='65000000-0000-4000-8000-000000000002'),2,'Staff can read submitted documents');
reset role;
update public.basic_onboarding_applications set revision=2 where user_id='65000000-0000-4000-8000-000000000002';
set local role authenticated;
select ok(not public.can_review_basic_application('65000000-0000-4000-8000-000000000002'),'revision change immediately removes Staff access');
select is((public.list_basic_members('submission-scope-')->>'total')::integer,0,'stale submission leaves Staff queue');
select is((select count(*)::integer from public.onboarding_documents where user_id='65000000-0000-4000-8000-000000000002'),0,'stale submission closes document RLS access');
select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000006","role":"authenticated"}',true);
select is((public.list_basic_members('submission-scope-')->>'total')::integer,6,'Admin retains all accounts including drafts and incomplete registrations');
select is((select count(*)::integer from public.onboarding_documents where user_id='65000000-0000-4000-8000-000000000001'),2,'Admin keeps draft support access');
reset role;
update public.onboarding_documents set expires_at=now()-interval '1 second' where user_id::text like '65000000%';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_basic_account_summary()->>'status','approved','legacy approval survives absent submission stamp and expired documents');
select is(public.get_basic_account_summary()->>'complete','false','expired documents still reported separately');
select set_config('request.jwt.claims','{"sub":"65000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is(public.get_basic_account_summary()->>'status','revoked','revoked status is not rewritten as incomplete');
select * from finish();
rollback;
