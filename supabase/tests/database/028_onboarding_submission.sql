begin;
select no_plan();
update public.onboarding_settings set enabled=true;
update public.member_notification_settings set enabled=true,all_members_enabled=true;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('60000000-0000-4000-8000-000000000001','authenticated','authenticated','notify@example.test',now()),
 ('60000000-0000-4000-8000-000000000002','authenticated','authenticated','hello@armatureailabs.com',now()),
 ('60000000-0000-4000-8000-000000000003','authenticated','authenticated','sandeep@armatureailabs.com',now());
insert into public.staff_roles(user_id,role) values
 ('60000000-0000-4000-8000-000000000002','admin'),('60000000-0000-4000-8000-000000000003','super_admin');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth)
 values('60000000-0000-4000-8000-000000000001','Synthetic Member','notify@example.test','+919999999999','https://linkedin.com/in/test','1990-01-01');
select set_config('request.jwt.claim.sub','60000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.submit_basic_application_for_review(1)$$,'22023','Complete profile, current privacy acceptance and scanned photo and ID required','incomplete application cannot submit');
insert into public.onboarding_notice_acceptances(user_id,revision,notice_version)
 values('60000000-0000-4000-8000-000000000001',1,'2026-09-26-release-1');
insert into public.onboarding_documents(id,user_id,kind,object_path) values
 ('60000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000001','photo','notification-photo');
insert into public.onboarding_documents(id,user_id,kind,id_type,object_path) values
 ('60000000-0000-4000-8000-000000000012','60000000-0000-4000-8000-000000000001','government_id','pan','notification-id');
insert into storage.objects(bucket_id,name) values('onboarding-documents','notification-photo'),('onboarding-documents','notification-id');
update public.onboarding_documents set uploaded_at=now() where id='60000000-0000-4000-8000-000000000011';
update public.onboarding_documents set uploaded_at=now() where id='60000000-0000-4000-8000-000000000012';
update public.onboarding_documents set uploaded_at=now() where user_id='60000000-0000-4000-8000-000000000001';
select ok(private.member_application_complete(auth.uid()),'uploaded draft is complete');
select ok(not private.member_notification_ready(auth.uid()),'complete draft is not submitted');
select is((select count(*)::integer from public.member_notifications where kind in ('ready','admin_ready','resubmission_ready')),0,'upload does not send review-ready notifications');
select throws_ok($$select public.submit_basic_application_for_review(2)$$,'40001','Application changed; reload before submitting','stale submission rejected');
select throws_ok($$insert into public.onboarding_reviews(user_id,reviewer_id,decision,application_revision,previous_status,reviewer_role) values(auth.uid(),'60000000-0000-4000-8000-000000000002','approved',1,'pending','admin')$$,'22023','Member must submit the application for review first','review cannot approve an unsubmitted draft');
set local role authenticated;
select lives_ok($$select public.submit_basic_application_for_review(1)$$,'member can explicitly submit own complete draft');
reset role;
select is((select submitted_revision from public.basic_onboarding_applications where user_id=auth.uid()),1,'submission stamps current revision');
select ok(private.member_notification_ready(auth.uid()),'submission makes application ready');
select is((select count(*)::integer from public.member_notifications where kind in ('ready','admin_ready')),2,'submit queues member and admin once');
select lives_ok($$select public.submit_basic_application_for_review(1)$$,'duplicate submit is idempotent');
select is((select count(*)::integer from public.member_notifications where kind in ('ready','admin_ready')),2,'duplicate submit cannot duplicate notifications');
select lives_ok($$insert into public.onboarding_reviews(user_id,reviewer_id,decision,application_revision,previous_status,reviewer_role) values(auth.uid(),'60000000-0000-4000-8000-000000000002','approved',1,'pending','admin')$$,'submitted application may be approved');
update public.basic_onboarding_applications set revision=2 where user_id=auth.uid();
select ok(not private.member_notification_ready(auth.uid()),'new revision requires new submission');
select throws_ok($$select public.submit_basic_application_for_review(2)$$,'22023','Complete profile, current privacy acceptance and scanned photo and ID required','new revision needs current privacy acceptance');
select ok(not has_function_privilege('anon','public.submit_basic_application_for_review(integer)','EXECUTE'),'anonymous cannot submit');
select is((select template_version from public.member_notifications where kind='admin_ready'),2,'new admin readiness uses checklist template v2');
select ok(not exists(select 1 from public.member_notifications where kind<>'admin_ready' and template_version<>1),'member templates remain v1');
insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,template_version)
values(auth.uid(),'60000000-0000-4000-8000-000000000002','hello@armatureailabs.com','old-admin-event','admin_ready','pending',1,'held',1);
select private.enqueue_member_notification(auth.uid(),'60000000-0000-4000-8000-000000000002','old-admin-event','admin_ready','pending',1);
select is((select count(*)::integer from public.member_notifications where event_key='old-admin-event'),1,'existing v1 event cannot be replayed as v2');
select is((select template_version from public.member_notifications where event_key='old-admin-event'),1,'existing v1 payload stays immutable');
insert into public.member_notification_tombstones(event_key,user_id,recipient_id,kind,template_version,recipient_hash)
values('old-admin-tombstone',auth.uid(),'60000000-0000-4000-8000-000000000002','admin_ready',1,'synthetic');
select private.enqueue_member_notification(auth.uid(),'60000000-0000-4000-8000-000000000002','old-admin-tombstone','admin_ready','pending',1);
select is((select count(*)::integer from public.member_notifications where event_key='old-admin-tombstone'),0,'v1 tombstone prevents v2 replay');
select * from finish();
rollback;
