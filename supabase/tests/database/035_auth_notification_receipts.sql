begin;
select no_plan();
-- Synthetic fixtures are rolled back, including all delivery reports.
delete from private.ecosystem_notifications;
delete from public.member_notifications;
delete from public.member_notification_tombstones;
delete from public.member_notification_events;
delete from private.auth_notification_sources;
select set_config('request.jwt.claim.role','service_role',true);
select ok(not has_function_privilege('anon','public.record_classified_notification_event(text,text,text,timestamptz,text,text)','EXECUTE'),'anonymous cannot classify');
select ok(not has_function_privilege('authenticated','public.record_classified_notification_event(text,text,text,timestamptz,text,text)','EXECUTE'),'members cannot classify');
select ok(has_function_privilege('service_role','public.record_classified_notification_event(text,text,text,timestamptz,text,text)','EXECUTE'),'verified webhook service can record');
select ok(not has_table_privilege('service_role','private.auth_notification_sources','SELECT,INSERT,UPDATE,DELETE'),'classification evidence is private');
select ok(not has_table_privilege('authenticated','private.auth_notification_sources','SELECT,INSERT,UPDATE,DELETE'),'browser cannot alter evidence');
select ok((select relrowsecurity from pg_class where oid='private.auth_notification_sources'::regclass),'classification RLS enabled');
select ok(public.record_classified_notification_event('auth-sent','b7300000-0000-4000-8000-000000000001','email.sent','2026-01-01Z','no-reply@mail.armatureailabs.com','Your sign-in link'),'bare exact sender classified');
select ok(public.record_classified_notification_event('auth-delivered','b7300000-0000-4000-8000-000000000001','email.delivered','2026-01-02Z','"Armature AI Labs" <no-reply@mail.armatureailabs.com>','Your sign-in link'),'quoted sender callback retained');
select ok(not public.record_classified_notification_event('auth-delivered','b7300000-0000-4000-8000-000000000001','email.delivered','2026-01-02Z','"Armature AI Labs" <no-reply@mail.armatureailabs.com>','Your sign-in link'),'duplicate callback idempotent');
select public.record_classified_notification_event('auth-early-delivered','b7300000-0000-4000-8000-000000000002','email.delivered','2026-01-01Z','Armature AI Labs <no-reply@mail.armatureailabs.com>','Your sign-in link');
select public.record_classified_notification_event('auth-late-sent','b7300000-0000-4000-8000-000000000002','email.sent','2026-01-02Z',null,null);
update public.member_notification_events set received_at=now()-interval '2 hours';
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,0,'both callback orders excluded only after positive classification and delivery');
select is((select count(*)::integer from public.member_notification_events),4,'all original delivery reports preserved');
select is((select count(*)::integer from private.auth_notification_sources),2,'duplicate and missing later metadata do not erase or duplicate classification');
select is((select source_event_id from private.auth_notification_sources where provider_id='b7300000-0000-4000-8000-000000000001'),'auth-sent','first signed evidence retained');
select is((select source from private.auth_notification_sources limit 1),'signed_webhook','audit identifies verified webhook source');
select public.record_classified_notification_event('auth-awaiting-delivery','b7300000-0000-4000-8000-000000000003','email.sent','2026-01-01Z','no-reply@mail.armatureailabs.com','Your sign-in link');
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,0,'new receipt retains existing grace period');
update public.member_notification_events set received_at=now()-interval '2 hours';
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,1,'classified sent-only email still alerts');
select public.record_classified_notification_event('auth-unknown-'||n,('b7300000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,'email.delivered','2026-01-01Z',sender,subject)
from (values (4,'other@mail.armatureailabs.com','Your sign-in link'),(5,'no-reply@mail.armatureailabs.com','Different subject'),(6,null,null),(7,'Wrong Name <no-reply@mail.armatureailabs.com>','Your sign-in link'),(8,'NO-REPLY@mail.armatureailabs.com','Your sign-in link'),(9,'no-reply@mail.armatureailabs.com','Your sign-in link extra')) x(n,sender,subject);
update public.member_notification_events set received_at=now()-interval '2 hours';
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,7,'missing or non-exact metadata remains visible');
select is((select count(*)::integer from private.auth_notification_sources),3,'unknown sender or subject never classified');
-- Every negative outcome wins regardless of callback order or event timestamp.
select public.record_classified_notification_event('auth-negative-first-'||n,('b7300000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,event_type,'2026-01-01Z','no-reply@mail.armatureailabs.com','Your sign-in link')
from (values(10,'email.failed'),(11,'email.bounced'),(12,'email.complained'),(13,'email.suppressed')) x(n,event_type);
select public.record_classified_notification_event('auth-positive-last-'||n,('b7300000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,'email.delivered','2026-01-02Z','no-reply@mail.armatureailabs.com','Your sign-in link') from generate_series(10,13)n;
update public.member_notification_events set received_at=now()-interval '2 hours';
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,15,'failed/bounced/complained/suppressed are not hidden by later delivery');
select public.record_classified_notification_event('auth-positive-first-'||n,('b7300000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,'email.delivered','2026-01-02Z','no-reply@mail.armatureailabs.com','Your sign-in link') from generate_series(14,17)n;
select public.record_classified_notification_event('auth-negative-last-'||n,('b7300000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,event_type,'2026-01-01Z','no-reply@mail.armatureailabs.com','Your sign-in link')
from (values(14,'email.failed'),(15,'email.bounced'),(16,'email.complained'),(17,'email.suppressed')) x(n,event_type);
update public.member_notification_events set received_at=now()-interval '2 hours';
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,23,'late negative reports restore alerts even with older occurred timestamps');
select throws_ok($$select public.record_classified_notification_event('auth-delivered','b7300000-0000-4000-8000-000000000018','email.delivered','2026-01-02Z','no-reply@mail.armatureailabs.com','Your sign-in link')$$,'22023','Conflicting notification event','conflicting event cannot classify another provider');
select ok(not exists(select 1 from private.auth_notification_sources where provider_id='b7300000-0000-4000-8000-000000000018'),'conflicting event leaves no classification');
select ok(not exists(select 1 from public.member_notification_events where provider_id='b7300000-0000-4000-8000-000000000018'),'conflicting event leaves no receipt');
-- Existing member, Atlas and tombstone ownership takes precedence.
insert into auth.users(id,aud,role,email,email_confirmed_at) values('b7900000-0000-4000-8000-000000000001','authenticated','authenticated','auth-receipts@example.test',now());
insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,provider_id,completed_at)
values('b7900000-0000-4000-8000-000000000001','b7900000-0000-4000-8000-000000000001','auth-receipts@example.test','auth-owned-member','approved','approved',1,'accepted','b7300000-0000-4000-8000-000000000020',now());
insert into public.ecosystem_submissions(id,idempotency_key,payload_hash,kind,proposed) values('b7100000-0000-4000-8000-000000000021','auth-owned-atlas',repeat('b',64),'new','{}');
insert into private.ecosystem_notifications(submission_id,state,provider_id,sent_at,completed_at,recipient_email,recipient_hash)
values('b7100000-0000-4000-8000-000000000021','sent','b7300000-0000-4000-8000-000000000021',now(),now(),'auth-receipts@example.test',encode(extensions.digest('auth-receipts@example.test','sha256'),'hex'));
insert into public.member_notification_tombstones(event_key,user_id,recipient_id,kind,template_version,provider_id,recipient_hash)
values('auth-owned-tombstone','b7900000-0000-4000-8000-000000000001','b7900000-0000-4000-8000-000000000001','approved',1,'b7300000-0000-4000-8000-000000000022',repeat('b',64));
select public.record_classified_notification_event('auth-owned-'||n,('b7300000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,'email.delivered','2026-01-01Z','no-reply@mail.armatureailabs.com','Your sign-in link') from generate_series(20,22)n;
select is((select count(*)::integer from private.auth_notification_sources where provider_id>='b7300000-0000-4000-8000-000000000020'),0,'all owned provider IDs excluded from Auth classification');
select is((select delivery_state from public.member_notifications where event_key='auth-owned-member'),'delivered','member delivery reconciliation preserved');
select is((select delivery_state from private.ecosystem_notifications where submission_id='b7100000-0000-4000-8000-000000000021'),'delivered','Atlas delivery reconciliation preserved');
select public.record_classified_notification_event('auth-owned-atlas-failed','b7300000-0000-4000-8000-000000000021','email.failed','2026-01-02Z','no-reply@mail.armatureailabs.com','Your sign-in link');
select is((public.notification_delivery_health()->>'atlas_delivery_failed')::integer,1,'owned Atlas failures still alert');
select public.record_member_notification_event('auth-legacy-api','b7300000-0000-4000-8000-000000000030','email.delivered','2026-01-01Z');
update public.member_notification_events set received_at=now()-interval '2 hours';
select is((public.notification_delivery_health()->>'unmatched_receipts')::integer,24,'old RPC remains available and does not classify without metadata');
select is((select count(*)::integer from jsonb_object_keys(public.member_notification_health())),12,'legacy health shape unchanged');
select is((select count(*)::integer from jsonb_object_keys(public.notification_delivery_health())),18,'monitor health shape unchanged');
select ok(not (public.notification_delivery_health()->>'cleanup_enabled')::boolean,'cleanup remains disabled');
-- Auth-first collisions must not turn Auth delivery into successful outbox delivery.
insert into public.member_notifications(id,user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,lease_token,lease_until)
values('b7600000-0000-4000-8000-000000000001','b7900000-0000-4000-8000-000000000001','b7900000-0000-4000-8000-000000000001','auth-receipts@example.test','auth-first-member','approved','approved',1,'sending','b7200000-0000-4000-8000-000000000001',now()+interval '5 minutes');
select ok(public.finish_member_notification('b7600000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000001','accepted','b7300000-0000-4000-8000-000000000001'),'Auth-first member completion becomes unknown');
select ok((select state='unknown' and provider_id is null from public.member_notifications where event_key='auth-first-member'),'Auth source cannot be bound to member outbox');
insert into public.ecosystem_submissions(id,idempotency_key,payload_hash,kind,proposed)
select ('b7100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'auth-first-atlas-'||n,repeat('b',64),'new','{}' from generate_series(31,32)n;
insert into private.ecosystem_notifications(submission_id,state,lease,retry_at,sent_at,recipient_email,recipient_hash)
select id,case when right(id::text,1)='1' then 'sending' else 'sent' end,'b7200000-0000-4000-8000-000000000001',now()+interval '5 minutes',now(),'auth-receipts@example.test',encode(extensions.digest('auth-receipts@example.test','sha256'),'hex') from public.ecosystem_submissions where idempotency_key like 'auth-first-atlas-%';
select ok(public.finish_ecosystem_notification('b7100000-0000-4000-8000-000000000031','b7200000-0000-4000-8000-000000000001','accepted','b7300000-0000-4000-8000-000000000002'),'Auth-first Atlas completion becomes unknown');
select ok((select state='unknown' and provider_id is null from private.ecosystem_notifications where submission_id='b7100000-0000-4000-8000-000000000031'),'Auth source cannot be bound to Atlas outbox');
select throws_ok($$select public.reconcile_ecosystem_notification('b7100000-0000-4000-8000-000000000032','b7300000-0000-4000-8000-000000000001','auth-receipts@example.test','Receipt: b7100000-0000-4000-8000-000000000032','Synthetic exact-ID collision test must not claim Auth delivery')$$,'22023','Auth provider cannot reconcile an application notification','operator reconciliation cannot bind Auth source');
select ok((select provider_id is null from private.ecosystem_notifications where submission_id='b7100000-0000-4000-8000-000000000032'),'rejected reconciliation preserves unbound outbox');
select is((public.notification_delivery_health()->>'unknown')::integer,1,'member unknown outcome still alerts');
select is((public.notification_delivery_health()->>'atlas_unknown')::integer,2,'Atlas unknown outcomes still alert');
select ok(not has_function_privilege('service_role','private.finish_member_notification_before_auth_sources(uuid,uuid,text,text)','EXECUTE'),'service cannot bypass member collision guard');
select ok(not has_function_privilege('service_role','private.finish_ecosystem_notification_before_auth_sources(uuid,uuid,text,text)','EXECUTE'),'service cannot bypass Atlas collision guard');
select ok(not has_function_privilege('service_role','private.reconcile_ecosystem_notification_before_auth_sources(uuid,text,text,text,text)','EXECUTE'),'service cannot bypass repair collision guard');
select throws_ok($$insert into private.auth_notification_sources(provider_id,sender,subject,source,source_event_id,source_occurred_at,evidence) values('b7300000-0000-4000-8000-000000000040','no-reply@mail.armatureailabs.com','Your sign-in link','signed_webhook',null,now(),'Synthetic required event evidence')$$,'23514',null,'signed classification requires its source event ID');
select * from finish();
rollback;
