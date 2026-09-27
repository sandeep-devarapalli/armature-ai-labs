begin;
select no_plan();
update public.onboarding_settings set enabled=true;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('31000000-0000-4000-8000-000000000001','authenticated','authenticated','member@example.test',now()),
('31000000-0000-4000-8000-000000000002','authenticated','authenticated','reviewer@example.test',now()),
('31000000-0000-4000-8000-000000000003','authenticated','authenticated','admin@example.test',now()),
('31000000-0000-4000-8000-000000000004','authenticated','authenticated','sandeep@armatureailabs.com',now()),
('31000000-0000-4000-8000-000000000005','authenticated','authenticated','incomplete@example.test',now());
insert into public.staff_roles(user_id,role) values
('31000000-0000-4000-8000-000000000002','membership_reviewer'),
('31000000-0000-4000-8000-000000000003','admin'),
('31000000-0000-4000-8000-000000000004','super_admin');
insert into private.owner_membership_exception(user_id) values('31000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_basic_account_summary()->>'status','incomplete','new account is incomplete');
select throws_ok($$select public.list_basic_members()$$,'42501','Membership reviewer required','member cannot list people');
select public.submit_basic_onboarding('Synthetic Member','+919999999999','https://linkedin.com/in/test','1990-01-01','2026-09-26-release-1');
select public.reserve_onboarding_document('photo');
select public.reserve_onboarding_document('government_id','pan');
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select public.submit_basic_onboarding('Synthetic Owner','+919999999999','https://linkedin.com/in/test','1990-01-01','2026-09-26-release-1');
select public.reserve_onboarding_document('photo');
select public.reserve_onboarding_document('government_id','pan');
select throws_ok($$select public.approve_owner_basic_membership(1,true)$$,'22023','Unexpired photo and government ID uploads required','owner still needs valid uploads');
reset role;
insert into storage.objects(bucket_id,name) select 'onboarding-documents',object_path from public.onboarding_documents where user_id in ('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000004');
select public.finalize_onboarding_document(id) from public.onboarding_documents where user_id in ('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000004');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.has_staff_role(null),false,'reviewer is not operational staff');
select is((select count(*)::integer from public.basic_onboarding_applications where user_id='31000000-0000-4000-8000-000000000001'),1,'reviewer sees pending applicant');
select is((select count(*)::integer from public.onboarding_documents where user_id='31000000-0000-4000-8000-000000000001'),2,'reviewer sees pending documents');
select ok(not exists(select 1 from jsonb_array_elements(public.list_basic_members()->'items') item where item->>'user_id'='31000000-0000-4000-8000-000000000005'),'reviewer cannot list incomplete auth-only account');
select throws_ok($$select public.review_basic_onboarding('31000000-0000-4000-8000-000000000001','rejected',p_reason=>'Insufficient application evidence')$$,'42501','Independent admin review required','reviewer cannot reject');
select throws_ok($$select public.request_onboarding_corrections('31000000-0000-4000-8000-000000000001','Please correct this information',1)$$,'42501','Independent admin review required','reviewer cannot request corrections');
select throws_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000005','admin','member')$$,'42501','Role change not permitted','reviewer cannot assign roles');
select lives_ok($$select public.review_basic_onboarding('31000000-0000-4000-8000-000000000001','approved',p_expected_revision=>1)$$,'reviewer can approve valid application');
select is((select count(*)::integer from public.basic_onboarding_applications where user_id='31000000-0000-4000-8000-000000000001'),0,'completed application leaves reviewer scope');
select is((select count(*)::integer from public.onboarding_documents where user_id='31000000-0000-4000-8000-000000000001'),0,'completed documents leave reviewer scope');
select throws_ok($$select public.change_basic_membership('31000000-0000-4000-8000-000000000001','revoke','Membership withdrawn by request',1)$$,'42501','Independent admin review required','reviewer cannot revoke');
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select ok(exists(select 1 from jsonb_array_elements(public.list_basic_members()->'items') item where item->>'user_id'='31000000-0000-4000-8000-000000000005'),'admin sees accounts without applications');
select is((public.list_basic_members('incomplete@example.test')->>'total')::int,1,'search finds incomplete account');
select is((public.list_basic_members(p_role=>'membership_reviewer')->>'total')::int,1,'role filter works');
select is(jsonb_array_length(public.list_basic_members(p_page_size=>1)->'items'),1,'page bounded');
select throws_ok($$select public.list_basic_members(p_page_size=>101)$$,'22023','Invalid pagination or search','unbounded pages rejected');
select throws_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000005','admin','member')$$,'42501','Role change not permitted','admin cannot appoint admin');
select throws_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000004','member','super_admin')$$,'42501','Role change not permitted','admin cannot demote super admin');
select throws_ok($$select public.set_membership_staff_role(auth.uid(),'member','admin')$$,'42501','Role change not permitted','self demotion blocked');
select lives_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000005','membership_reviewer','member')$$,'admin appoints reviewer');
select throws_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000005','member','member')$$,'40001','Role changed; reload before editing','stale role edit rejected');
select lives_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000005','member','membership_reviewer')$$,'admin removes reviewer');
select lives_ok($$select public.change_basic_membership('31000000-0000-4000-8000-000000000001','revoke','Membership withdrawn by request',1)$$,'admin revokes');
select throws_ok($$select public.change_basic_membership('31000000-0000-4000-8000-000000000001','reinstate','Member requested reinstatement',1)$$,'40001','Application changed; reload before reviewing','stale reinstatement rejected');
reset role;
update public.onboarding_documents set expires_at=now()-interval '1 day' where user_id='31000000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.change_basic_membership('31000000-0000-4000-8000-000000000001','reinstate','Member requested reinstatement',2)$$,'retention expiry does not block reinstatement');
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select throws_ok($$select public.review_basic_onboarding(auth.uid(),'approved',p_expected_revision=>1)$$,'42501','Independent admin review required','super admin ordinary self approval blocked');
select throws_ok($$select public.approve_owner_basic_membership(1,false)$$,'42501','Confirmed owner exception required','owner confirmation required');
select lives_ok($$select public.approve_owner_basic_membership(1,true)$$,'owner explicit exception approves');
select throws_ok($$select public.approve_owner_basic_membership(1,true)$$,'42501','Owner exception unavailable','owner exception consumed');
select lives_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000005','admin','member')$$,'super admin appoints admin');
select lives_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000003','member','admin')$$,'super admin removes admin');
select set_config('request.jwt.claims','{"sub":"31000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.list_basic_members()$$,'42501','Membership reviewer required','removed admin immediately loses listing');
select throws_ok($$select public.set_membership_staff_role('31000000-0000-4000-8000-000000000002','member','membership_reviewer')$$,'42501','Role change not permitted','removed admin immediately loses writes');
reset role;
select is((select count(*)::int from public.onboarding_reviews where user_id='31000000-0000-4000-8000-000000000001' and reviewer_role is not null),3,'all new membership decisions audited');
select is((select count(*)::int from public.membership_role_audit where actor_id is not null and user_id in ('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000005')),4,'role changes audited');
select function_privs_are('public','set_membership_staff_role',array['uuid','text','text'],'anon',array[]::text[],'anonymous cannot change roles');
select function_privs_are('private','decide_basic_onboarding',array['uuid','text','text','text','timestamp with time zone','integer','text','boolean'],'authenticated',array[]::text[],'owner bypass helper private');
select * from finish();
rollback;
