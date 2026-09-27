begin;
select no_plan();
select ok(not has_table_privilege('authenticated','public.member_notifications','SELECT'),'authenticated has no queue privilege');
select ok(not has_table_privilege('anon','public.member_notifications','INSERT'),'anonymous cannot inject notifications');
select is((select enabled from public.member_notification_settings),false,'delivery starts disabled');
select is((select cardinality(pilot_recipients) from public.member_notification_settings),0,'pilot starts empty');
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('60000000-0000-4000-8000-000000000001','authenticated','authenticated','notify@example.test',now()),
 ('60000000-0000-4000-8000-000000000002','authenticated','authenticated','hello@armatureailabs.com',now()),
 ('60000000-0000-4000-8000-000000000003','authenticated','authenticated','sandeep@armatureailabs.com',now());
insert into public.staff_roles(user_id,role) values
 ('60000000-0000-4000-8000-000000000002','admin'),('60000000-0000-4000-8000-000000000003','super_admin');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth)
 values('60000000-0000-4000-8000-000000000001','Synthetic Member','notify@example.test','+919999999999','https://linkedin.com/in/test','1990-01-01');
select is((select count(*)::integer from public.member_notifications),0,'pending profile alone sends nothing');
savepoint rolled_back_notice;
insert into public.onboarding_notice_acceptances(user_id,revision,notice_version)
 values('60000000-0000-4000-8000-000000000001',1,'2026-09-26-release-1');
rollback to rolled_back_notice;
select is((select count(*)::integer from public.member_notifications),0,'transaction rollback removes event');
insert into public.onboarding_notice_acceptances(user_id,revision,notice_version)
 values('60000000-0000-4000-8000-000000000001',1,'2026-09-26-release-1');
select is((select state from public.member_notifications),'held','registration saved while disabled is held');
update public.member_notification_settings set enabled=true,pilot_recipients=array['notify@example.test','hello@armatureailabs.com','sandeep@armatureailabs.com'];
select is((select count(*)::integer from public.claim_member_notifications()),0,'enabling pilot never drains held history');
insert into public.onboarding_documents(id,user_id,kind,object_path) values
 ('60000000-0000-4000-8000-000000000011','60000000-0000-4000-8000-000000000001','photo','notification-photo');
insert into public.onboarding_documents(id,user_id,kind,id_type,object_path) values
 ('60000000-0000-4000-8000-000000000012','60000000-0000-4000-8000-000000000001','government_id','pan','notification-id');
insert into storage.objects(bucket_id,name) values('onboarding-documents','notification-photo'),('onboarding-documents','notification-id');
update public.onboarding_documents set uploaded_at=now() where id='60000000-0000-4000-8000-000000000011';
select is((select count(*)::integer from public.member_notifications),1,'one scanned document is not ready');
update public.onboarding_documents set uploaded_at=now() where id='60000000-0000-4000-8000-000000000012';
select is((select count(*)::integer from public.member_notifications where kind='ready' and state='pending'),1,'both uploaded storage-backed documents queue ready');
select is((select count(*)::integer from public.member_notifications where kind='admin_ready'),1,'only hello receives admin readiness, not alias super admin');
update public.onboarding_documents set uploaded_at=now() where user_id='60000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.member_notifications),3,'repeat finalization deduplicates readiness');
update public.basic_onboarding_applications set linkedin_url='invalid' where user_id='60000000-0000-4000-8000-000000000001';
select ok(not private.member_notification_ready('60000000-0000-4000-8000-000000000001'),'invalid profile cannot be ready');
update public.basic_onboarding_applications set linkedin_url='https://linkedin.com/in/test' where user_id='60000000-0000-4000-8000-000000000001';
update public.onboarding_documents set expires_at=now()-interval '1 second' where kind='photo' and user_id='60000000-0000-4000-8000-000000000001';
select ok(not private.member_notification_ready('60000000-0000-4000-8000-000000000001'),'expired document cannot be ready');
update public.onboarding_documents set expires_at=now()+interval '30 days' where kind='photo' and user_id='60000000-0000-4000-8000-000000000001';
update public.onboarding_notice_acceptances set notice_version='2026-09-26' where user_id='60000000-0000-4000-8000-000000000001';
select ok(not private.member_notification_ready('60000000-0000-4000-8000-000000000001'),'historical notice cannot be ready');
update public.onboarding_notice_acceptances set notice_version='2026-09-26-release-1' where user_id='60000000-0000-4000-8000-000000000001';
select ok(not private.member_notification_eligible(n),'registration-saved becomes obsolete when ready') from public.member_notifications n where kind='registration_saved';
create temp table notify_claim as select * from public.claim_member_notifications(10);
select is((select count(*)::integer from notify_claim),2,'worker claims ready and admin alert');
select is((select count(*)::integer from public.claim_member_notifications(10)),0,'second worker cannot claim leased rows');
select ok(not public.finish_member_notification(id,lease_token,'failed'),'leased rows cannot be acknowledged before prepare') from notify_claim where kind='ready';
select ok(not public.prepare_member_notification((select id from notify_claim limit 1),extensions.gen_random_uuid()),'wrong lease token rejected');
select ok(public.prepare_member_notification(id,lease_token),'prepare checks current eligibility') from notify_claim where kind='ready';
select ok(not public.prepare_member_notification(id,lease_token),'duplicate prepare cannot resend') from notify_claim where kind='ready';
select ok(public.finish_member_notification(id,lease_token,'retry'),'ambiguous transient failure is retriable with stable event id') from notify_claim where kind='ready';
select is((select count(*)::integer from public.claim_member_notifications()),0,'retry backoff prevents immediate reclaim');
update public.member_notifications set available_at=now()-interval '1 second' where kind='ready';
create temp table notify_retry as select * from public.claim_member_notifications();
select is((select id from notify_retry),(select id from notify_claim where kind='ready'),'retries retain idempotency identity');
select isnt((select lease_token from notify_retry),(select lease_token from notify_claim where kind='ready'),'retry rotates lease token');
select ok(not public.finish_member_notification(id,lease_token,'accepted','stale-provider-id'),'old worker cannot acknowledge new lease') from notify_claim where kind='ready';
select ok(public.prepare_member_notification(id,lease_token),'retry can prepare') from notify_retry;
select throws_ok($$select public.finish_member_notification(id,lease_token,'accepted',null) from notify_retry$$,'22023','Invalid delivery outcome','accepted requires provider evidence');
select ok(public.finish_member_notification(id,lease_token,'accepted','provider-test-id'),'accepted provider response recorded') from notify_retry;
select is((select state from public.member_notifications where kind='ready'),'accepted','accepted is not claimed as delivered');
delete from public.staff_roles where user_id='60000000-0000-4000-8000-000000000002';
select ok(not public.prepare_member_notification(id,lease_token),'removed admin cannot receive pending alert') from notify_claim where kind='admin_ready';
select is((select state from public.member_notifications where kind='admin_ready'),'suppressed','removed role suppresses admin alert');
-- Every decision is a separate review event, without copying private reasons or guardian evidence.
insert into public.onboarding_reviews(id,user_id,reviewer_id,decision,reason,application_revision) values
 ('60000000-0000-4000-8000-000000000021','60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','approved','SECRET PRIVATE REVIEW',1);
update public.basic_onboarding_applications set status='approved' where user_id='60000000-0000-4000-8000-000000000001';
select ok(not exists(select 1 from public.member_notifications n where row_to_json(n)::text like '%SECRET PRIVATE REVIEW%'),'queue never copies private decision detail');
create temp table notify_approval as select * from public.claim_member_notifications();
update auth.users set email='changed@example.test' where id='60000000-0000-4000-8000-000000000001';
select ok(not public.prepare_member_notification(id,lease_token),'email change suppresses old recipient') from notify_approval;
update auth.users set email='notify@example.test' where id='60000000-0000-4000-8000-000000000001';
insert into public.onboarding_reviews(user_id,reviewer_id,decision,reason,application_revision) values
 ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','revoked','Synthetic revocation',1);
update public.basic_onboarding_applications set status='revoked',revision=2 where user_id='60000000-0000-4000-8000-000000000001';
create temp table notify_revocation as select * from public.claim_member_notifications();
select is((select kind from notify_revocation),'revoked','revocation accounts for incremented revision');
select ok(public.prepare_member_notification(id,lease_token),'revocation is eligible despite removed member privileges') from notify_revocation;
update public.member_notifications set first_attempt_at=now()-interval '23 hours',lease_until=now()-interval '1 second' where kind='revoked';
select is((select count(*)::integer from public.claim_member_notifications()),0,'expired provider idempotency horizon never resends');
select is((select state from public.member_notifications where kind='revoked'),'unknown','ambiguous abandoned send requires reconciliation');
insert into public.onboarding_reviews(user_id,reviewer_id,decision,reason,application_revision) values
 ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','reinstated','Synthetic reinstatement',2);
update public.basic_onboarding_applications set status='approved',revision=3 where user_id='60000000-0000-4000-8000-000000000001';
create temp table notify_reinstated as select * from public.claim_member_notifications();
select is((select kind from notify_reinstated),'reinstated','reinstatement expects approved status and incremented revision');
update public.member_notification_settings set pilot_recipients='{}';
select ok(not public.prepare_member_notification(id,lease_token),'removing recipient from pilot blocks prepared delivery') from notify_reinstated;
-- Superseded decisions are suppressed; an exhausted retry cannot be sent again.
update public.member_notification_settings set pilot_recipients=array['notify@example.test'];
insert into public.onboarding_reviews(user_id,reviewer_id,decision,reason,application_revision) values
 ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','corrections_requested','Synthetic corrections',3);
select is((select count(*)::integer from public.claim_member_notifications()),0,'mismatched current status suppresses obsolete decision');
select is((select state from public.member_notifications where kind='corrections_requested'),'suppressed','stale event becomes terminal');
insert into public.onboarding_reviews(user_id,reviewer_id,decision,reason,application_revision) values
 ('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','approved','Synthetic retry bound',3);
update public.member_notifications set attempts=8,first_attempt_at=now() where kind='approved' and state='pending';
select is((select count(*)::integer from public.claim_member_notifications()),0,'maximum attempts prevents retry');
select is((select count(*)::integer from public.member_notifications where kind='approved' and state='unknown'),1,'exhausted ambiguous send remains unknown');
set local role authenticated;
select throws_ok($$select * from public.member_notifications$$,'42501',null,'authenticated cannot read queue');
select throws_ok($$update public.member_notification_settings set enabled=true$$,'42501',null,'authenticated cannot enable sender');
select throws_ok($$select public.claim_member_notifications()$$,'42501',null,'authenticated cannot claim');
select throws_ok($$select public.prepare_member_notification(extensions.gen_random_uuid(),extensions.gen_random_uuid())$$,'42501',null,'authenticated cannot prepare');
select throws_ok($$select public.finish_member_notification(extensions.gen_random_uuid(),extensions.gen_random_uuid(),'accepted')$$,'42501',null,'authenticated cannot finish');
reset role;
set local role anon;
select throws_ok($$select * from public.member_notifications$$,'42501',null,'anonymous cannot read queue');
select throws_ok($$select public.claim_member_notifications()$$,'42501',null,'anonymous cannot claim');
reset role;
-- Exercise the real correction/resubmission APIs, including fresh document reservations.
update public.onboarding_settings set enabled=true;
update public.basic_onboarding_applications set status='pending' where user_id='60000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.request_onboarding_corrections('60000000-0000-4000-8000-000000000001','Please replace the synthetic uploads.',3);
select set_config('request.jwt.claims','{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.resubmit_basic_onboarding('Synthetic Member','+919999999999','https://linkedin.com/in/test','1990-01-01','2026-09-26-release-1');
select public.reserve_onboarding_document('photo');
select public.reserve_onboarding_document('government_id','pan');
reset role;
select is((select count(*)::integer from public.member_notifications where kind='resubmission_ready'),0,'resubmission profile is not ready until replacement uploads finish');
insert into storage.objects(bucket_id,name) select 'onboarding-documents',object_path from public.onboarding_documents
 where user_id='60000000-0000-4000-8000-000000000001' and uploaded_at is null;
select public.finalize_onboarding_document(id) from public.onboarding_documents
 where user_id='60000000-0000-4000-8000-000000000001' and uploaded_at is null;
select is((select count(*)::integer from public.member_notifications where kind='resubmission_ready' and application_revision=4),1,'replacement completion queues exactly one current resubmission');
select is((select count(*)::integer from public.claim_member_notifications()),1,'stale correction is suppressed while new readiness is claimed');
select ok(not exists(select 1 from public.member_notifications where kind='corrections_requested' and state='pending'),'prior revision decision does not notify after resubmission');
select throws_ok($$select public.claim_member_notifications(11)$$,'22023','Limit must be 1 to 10','claims are bounded');
select * from finish();
rollback;
