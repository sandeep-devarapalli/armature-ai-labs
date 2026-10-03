begin;
select no_plan();
-- Fixtures never contain real applicants or real email addresses.
delete from private.ecosystem_notifications;
insert into public.ecosystem_submissions(id,idempotency_key,payload_hash,kind,proposed)
select ('a7100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'atlas-delivery:'||i,repeat('a',64),'new','{}' from generate_series(1,20) i;
insert into private.ecosystem_notifications(submission_id,state,attempts,lease,retry_at,recipient_email,recipient_hash)
select id,'sending',1,'a7200000-0000-4000-8000-000000000001',now()+interval '5 minutes','atlas@example.test',encode(extensions.digest('atlas@example.test','sha256'),'hex')
from public.ecosystem_submissions where idempotency_key like 'atlas-delivery:%';
select ok(not has_function_privilege('anon','public.claim_ecosystem_notifications(text)','EXECUTE'),'anonymous callers cannot claim');
select ok(not has_function_privilege('authenticated','public.finish_ecosystem_notification(uuid,uuid,text,text)','EXECUTE'),'browser callers cannot finish');
select ok(not has_function_privilege('authenticated','public.reconcile_ecosystem_notification(uuid,text,text,text,text)','EXECUTE'),'browser callers cannot reconcile');
select ok(not has_table_privilege('service_role','private.ecosystem_notification_reconciliations','SELECT'),'audit is RPC-only');
select is((select count(*)::integer from public.claim_ecosystem_notifications()),0,'legacy sender pauses safely during deployment');

select ok(public.record_member_notification_event('atlas-early-delivered','a7300000-0000-4000-8000-000000000001','email.delivered','2026-01-01Z'),'early delivered callback retained');
select ok(public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','accepted','a7300000-0000-4000-8000-000000000001'),'validated ID persists under live lease');
select is((select delivery_state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000001'),'delivered','early receipt reconciles');
select ok(not public.record_member_notification_event('atlas-early-delivered','a7300000-0000-4000-8000-000000000001','email.delivered','2026-01-01Z'),'duplicate callback does not duplicate');
select throws_ok($$select public.record_member_notification_event('atlas-early-delivered','a7300000-0000-4000-8000-000000000001','email.sent','2026-01-01Z')$$,'22023','Conflicting notification event','conflicting duplicate rejected');
select public.record_member_notification_event('atlas-late-sent','a7300000-0000-4000-8000-000000000001','email.sent','2026-02-01Z');
select is((select delivery_state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000001'),'delivered','late sent cannot downgrade delivered');
select ok(not public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000001','a7200000-0000-4000-8000-000000000001','accepted','a7300000-0000-4000-8000-000000000001'),'duplicate completion cannot update closed lease');

select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000002','a7200000-0000-4000-8000-000000000001','accepted','a7300000-0000-4000-8000-000000000002');
select public.record_member_notification_event('atlas-after-failed','a7300000-0000-4000-8000-000000000002','email.failed','2026-01-01Z');
select public.record_member_notification_event('atlas-after-delivered','a7300000-0000-4000-8000-000000000002','email.delivered','2026-02-01Z');
select is((select delivery_state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000002'),'failed','delivery failures remain visible despite conflicting delivery');
select public.record_member_notification_event('atlas-early-bounce','a7300000-0000-4000-8000-000000000003','email.bounced','2026-01-01Z');
select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000003','a7200000-0000-4000-8000-000000000001','accepted','a7300000-0000-4000-8000-000000000003');
select public.record_member_notification_event('atlas-complaint','a7300000-0000-4000-8000-000000000003','email.complained','2026-02-01Z');
select is((select reason from public.member_notification_suppressions where recipient_email='atlas@example.test'),'complained','early bounce and complaint suppress recipient across senders');

select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000004','a7200000-0000-4000-8000-000000000001','accepted',null);
select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000005','a7200000-0000-4000-8000-000000000001','accepted','not-a-provider-id');
select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000006','a7200000-0000-4000-8000-000000000001',true);
select is((select count(*)::integer from private.ecosystem_notifications where state='unknown'),3,'missing malformed and legacy outcomes never retry blindly');
select ok(not public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000007','a7200000-0000-4000-8000-000000000099','accepted','a7300000-0000-4000-8000-000000000007'),'wrong lease cannot finish');
update private.ecosystem_notifications set retry_at=now()-interval '1 minute' where submission_id='a7100000-0000-4000-8000-000000000007';
select ok(not public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000007','a7200000-0000-4000-8000-000000000001','accepted','a7300000-0000-4000-8000-000000000007'),'expired lease cannot attach provider');
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000007'),'unknown','expired lease is unresolved');
select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000008','a7200000-0000-4000-8000-000000000001','accepted','a7300000-0000-4000-8000-000000000001');
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000008'),'unknown','duplicate provider cannot bind another receipt');
select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000009','a7200000-0000-4000-8000-000000000001','retry',null);
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000009'),'pending','confirmed rejection can retry');
update private.ecosystem_notifications set retry_at=now()-interval '1 minute' where submission_id='a7100000-0000-4000-8000-000000000010';
select is((select count(*)::integer from public.claim_ecosystem_notifications('atlas@example.test')),0,'suppressed address cannot claim');
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000009'),'suppressed','pending notice blocked by complaint');
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000010'),'unknown','crashed sender not reclaimed');
select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000011','a7200000-0000-4000-8000-000000000001','failed',null);
update private.ecosystem_notifications set attempts=5 where submission_id='a7100000-0000-4000-8000-000000000012';
select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000012','a7200000-0000-4000-8000-000000000001','retry',null);
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000012'),'failed','bounded retries fail after known rejection');

-- Historical repair needs externally verified exact Receipt body and preserves evidence.
update private.ecosystem_notifications set state='sent',lease=null,sent_at=now()-interval '2 days' where submission_id='a7100000-0000-4000-8000-000000000013';
select public.record_member_notification_event('atlas-historical','a7300000-0000-4000-8000-000000000013','email.delivered','2026-01-01Z');
select throws_ok($$select public.reconcile_ecosystem_notification('a7100000-0000-4000-8000-000000000013','a7300000-0000-4000-8000-000000000013','old-atlas@example.test','Receipt: wrong','Verified exact original provider receipt in dashboard')$$,'22023','Exact provider and receipt evidence required','inexact historical reference rejected');
select ok(public.reconcile_ecosystem_notification('a7100000-0000-4000-8000-000000000013','a7300000-0000-4000-8000-000000000013','old-atlas@example.test','Receipt: a7100000-0000-4000-8000-000000000013','Verified exact original provider receipt in dashboard'),'historical exact repair accepted');
select ok(not public.reconcile_ecosystem_notification('a7100000-0000-4000-8000-000000000013','a7300000-0000-4000-8000-000000000013','old-atlas@example.test','Receipt: a7100000-0000-4000-8000-000000000013','Verified exact original provider receipt in dashboard'),'historical repair idempotent');
select is((select count(*)::integer from private.ecosystem_notification_reconciliations),1,'repair has one immutable audit');
select is((select delivery_state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000013'),'delivered','repair immediately reconciles delivery');
select is((select attempts from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000013'),1,'repair sends nothing and preserves attempt count');

select public.finish_ecosystem_notification('a7100000-0000-4000-8000-000000000014','a7200000-0000-4000-8000-000000000001','accepted','a7300000-0000-4000-8000-000000000014');
update private.ecosystem_notifications set sent_at=now()-interval '25 hours' where submission_id='a7100000-0000-4000-8000-000000000014';
update private.ecosystem_notifications set state='pending',lease=null,retry_at=now()-interval '20 minutes' where submission_id='a7100000-0000-4000-8000-000000000015';
update private.ecosystem_notifications set retry_at=now()-interval '1 minute' where submission_id='a7100000-0000-4000-8000-000000000016';
select public.record_member_notification_event('atlas-genuine-unmatched','a7300000-0000-4000-8000-000000000099','email.sent','2026-01-01Z');
update public.member_notification_events set received_at=now()-interval '2 hours' where event_id like 'atlas-%';
select set_config('request.jwt.claim.role','service_role',true);
select is((select count(*)::integer from jsonb_object_keys(public.member_notification_health())),12,'old health shape remains compatible');
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,1,'only truly unknown reports still alert');
select is((public.notification_delivery_health()->>'atlas_delivery_failed')::integer,2,'Atlas failed and complained deliveries alert');
select is((public.notification_delivery_health()->>'atlas_delivery_unconfirmed')::integer,1,'24-hour unconfirmed Atlas delivery alerts');
select is((public.notification_delivery_health()->>'atlas_queue_overdue')::integer,1,'Atlas overdue queue alerts');
select is((public.notification_delivery_health()->>'atlas_expired_leases')::integer,1,'Atlas expired lease alerts');
select is((public.notification_delivery_health()->>'atlas_unknown')::integer,6,'Atlas ambiguous outcomes alert');
select is((public.notification_delivery_health()->>'atlas_failed')::integer,3,'Atlas failure and suppression alert');
-- Cleanup stays gated, and known Atlas receipts cannot be erased by membership maintenance.
update public.member_notification_events set received_at=now()-interval '31 days' where event_id like 'atlas-%';
update public.member_notification_settings set cleanup_enabled=true;
select public.maintain_member_notifications(false);
select ok(exists(select 1 from public.member_notification_events where event_id='atlas-historical'),'recently completed Atlas reports retained');
select ok(not exists(select 1 from public.member_notification_events where event_id='atlas-genuine-unmatched'),'existing unmatched retention policy unchanged');
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$select public.notification_delivery_health()$$,'42501','Administrator access required','private aggregates remain protected');
-- Terminal Atlas messages retain only correlation markers after the agreed 30 days.
select set_config('request.jwt.claim.role','service_role',true);
update private.ecosystem_notifications set completed_at=now()-interval '31 days' where submission_id='a7100000-0000-4000-8000-000000000013';
select public.maintain_member_notifications(false);
select ok(not exists(select 1 from public.member_notification_events where event_id='atlas-historical'),'old terminal Atlas receipt is removed by gated cleanup');
select ok((select recipient_email is null and recipient_hash is not null and provider_id is not null from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000013'),'only hash and correlation marker survive address redaction');
select public.record_member_notification_event('atlas-late-private-complaint','a7300000-0000-4000-8000-000000000013','email.complained','2026-03-01Z');
select ok(exists(select 1 from public.member_notification_suppressions where recipient_email='sha256:'||encode(extensions.digest('old-atlas@example.test','sha256'),'hex')),'late complaint suppresses hashed recipient after cleanup');
select is((select count(*)::integer from public.claim_ecosystem_notifications('old-atlas@example.test')),0,'hashed Atlas suppression prevents future sends');
select ok(public.prepare_ecosystem_notification('a7100000-0000-4000-8000-000000000017','a7200000-0000-4000-8000-000000000001')=false,'already claimed batch item rechecks suppression before sending');
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000017'),'suppressed','prepare blocks newly suppressed recipient');
update private.ecosystem_notifications set recipient_email='clear@example.test',recipient_hash=encode(extensions.digest('clear@example.test','sha256'),'hex') where submission_id='a7100000-0000-4000-8000-000000000018';
select ok(public.prepare_ecosystem_notification('a7100000-0000-4000-8000-000000000018','a7200000-0000-4000-8000-000000000001'),'prepare permits eligible live lease');
update public.ecosystem_submissions set status='approved' where id='a7100000-0000-4000-8000-000000000018';
select ok(not public.prepare_ecosystem_notification('a7100000-0000-4000-8000-000000000018','a7200000-0000-4000-8000-000000000001'),'prepare rechecks already reviewed submission');
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000018'),'cancelled','ordinary completed review is cancellation, not failed delivery');
select ok(not exists(select 1 from information_schema.columns where table_schema='private' and table_name='ecosystem_notification_reconciliations' and column_name='recipient_email'),'repair audit stores recipient digest only');
select public.record_member_notification_event('atlas-unresolved-old','a7300000-0000-4000-8000-000000000014','email.sent','2026-01-01Z');
update public.member_notification_events set received_at=now()-interval '31 days' where event_id='atlas-unresolved-old';
update private.ecosystem_notifications set completed_at=now()-interval '31 days' where submission_id='a7100000-0000-4000-8000-000000000014';
select public.maintain_member_notifications(false);
select ok(exists(select 1 from public.member_notification_events where event_id='atlas-unresolved-old'),'unconfirmed Atlas receipt remains available after 30 days');
update private.ecosystem_notifications set state='pending',lease=null where submission_id='a7100000-0000-4000-8000-000000000019';
update public.ecosystem_submissions set status='approved' where id='a7100000-0000-4000-8000-000000000019';
select public.claim_ecosystem_notifications('atlas@example.test');
select is((select state from private.ecosystem_notifications where submission_id='a7100000-0000-4000-8000-000000000019'),'pending','suppression does not create failure alerts for already reviewed queued notices');
insert into auth.users(id,aud,role,email,email_confirmed_at) values('a7900000-0000-4000-8000-000000000001','authenticated','authenticated','batch@example.test',now());
insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,completed_at)
values('a7900000-0000-4000-8000-000000000001','a7900000-0000-4000-8000-000000000001','batch@example.test','atlas-batch-budget','approved','approved',1,'failed',now()-interval '31 days');
insert into public.ecosystem_submissions(id,idempotency_key,payload_hash,kind,proposed)
select ('a7100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'atlas-delivery:'||i,repeat('a',64),'new','{}' from generate_series(21,120) i;
insert into private.ecosystem_notifications(submission_id,state,completed_at,recipient_email,recipient_hash)
select id,'failed',now()-interval '31 days','batch@example.test',encode(extensions.digest('batch@example.test','sha256'),'hex')
from public.ecosystem_submissions where idempotency_key like 'atlas-delivery:%' and id::text>='a7100000-0000-4000-8000-000000000021';
select is((public.maintain_member_notifications(true,100)->>'history')::integer,100,'combined membership and Atlas cleanup retains100-item monitor contract');
select * from finish();
rollback;
