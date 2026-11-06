-- Execute only against an isolated local database after the prepared migration.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end; $$;
insert into public.onboarding_settings(singleton,enabled) values(true,true) on conflict(singleton) do update set enabled=true;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('99000000-0000-4000-8000-000000000001','authenticated','authenticated','retention-member@example.test',now()),
 ('99000000-0000-4000-8000-000000000002','authenticated','authenticated','retention-admin@example.test',now()),
 ('99000000-0000-4000-8000-000000000003','authenticated','authenticated','retention-outsider@example.test',now());
insert into public.staff_roles(user_id,role,granted_by) values('99000000-0000-4000-8000-000000000002','super_admin','99000000-0000-4000-8000-000000000002');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth) values
 ('99000000-0000-4000-8000-000000000001','Synthetic Member','retention-member@example.test','+919999999999','https://linkedin.com/in/synthetic-retention','1990-01-01');
insert into public.onboarding_documents(id,user_id,kind,id_type,uploaded_at,expires_at) values
 ('99000000-0000-4000-8000-000000000011','99000000-0000-4000-8000-000000000001','government_id','pan',now(),'infinity'),
 ('99000000-0000-4000-8000-000000000012','99000000-0000-4000-8000-000000000001','photo',null,now(),now()+interval '30 days');
insert into private.government_id_retention_consents(document_id,user_id,notice_version) values('99000000-0000-4000-8000-000000000011','99000000-0000-4000-8000-000000000001','2026-10-14-equipment-id-v1');
select pg_temp.assert_true(not (select enabled from private.active_service_id_retention_settings),'migration defaults off');
select pg_temp.assert_true((select initial_review_hours=168 from private.active_service_id_retention_settings),'owner-approved initial review defaults to seven days');
select pg_temp.assert_true((select expires_at='infinity' from public.onboarding_documents where id='99000000-0000-4000-8000-000000000011'),'preparation does not mutate existing records');
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$begin
 perform public.configure_active_service_id_retention(true,169);
 raise exception 'Initial review beyond seven days unexpectedly accepted';
exception when invalid_parameter_value then null; end; $$;
select public.configure_active_service_id_retention(true,168);
select pg_temp.assert_true((select expires_at<=now() and isfinite(expires_at) from public.onboarding_documents where id='99000000-0000-4000-8000-000000000011'),'legacy convenience consent is bounded after explicit activation');
select pg_temp.assert_true((select count(*)=1 from private.government_id_retention_consents where document_id='99000000-0000-4000-8000-000000000011'),'old consent audit preserved');
select pg_temp.assert_true((select expires_at=now()+interval '30 days' from public.onboarding_documents where id='99000000-0000-4000-8000-000000000012'),'photo expiry unchanged');
insert into public.onboarding_documents(id,user_id,kind,id_type,uploaded_at,expires_at) values
 ('99000000-0000-4000-8000-000000000013','99000000-0000-4000-8000-000000000001','government_id','pan',now(),now()+interval '30 days');
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$begin
 perform public.accept_government_id_retention('99000000-0000-4000-8000-000000000013','2026-11-04-active-service-id-v1');
 raise exception 'Other member consent unexpectedly accepted';
exception when insufficient_privilege then null; end; $$;
do $$begin
 perform public.get_onboarding_document_retention('99000000-0000-4000-8000-000000000013');
 raise exception 'Other member document unexpectedly available';
exception when insufficient_privilege then null; end; $$;
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$begin
 perform public.accept_government_id_retention('99000000-0000-4000-8000-000000000013','2026-10-14-equipment-id-v1');
 raise exception 'Old notice unexpectedly accepted after activation';
exception when insufficient_privilege then null; end; $$;
select public.accept_government_id_retention('99000000-0000-4000-8000-000000000013','2026-11-04-active-service-id-v1');
select pg_temp.assert_true((select expires_at=now()+interval '7 days' from public.onboarding_documents where id='99000000-0000-4000-8000-000000000013'),'explicit fixture review window is seven days, not infinite account eligibility');
select pg_temp.assert_true(private.identity_service_retention_end('99000000-0000-4000-8000-000000000001') is null,'account and consent alone create no active service');
select pg_temp.assert_true(not public.service_government_id_ready('99000000-0000-4000-8000-000000000001'),'unreviewed copy does not satisfy service identity');
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('test.period1',public.record_identity_service_period('99000000-0000-4000-8000-000000000001','equipment',now()-interval '2 days',now()+interval '10 days','synthetic offline contract 1')::text,true);
select set_config('test.period2',public.record_identity_service_period('99000000-0000-4000-8000-000000000001','cabin',now()-interval '2 days',now()+interval '20 days','synthetic offline contract 2')::text,true);
select pg_temp.assert_true((select expires_at=now()+interval '20 days' from public.onboarding_documents where id='99000000-0000-4000-8000-000000000013'),'latest overlapping active service sets bounded purpose end without a24hour access grace');
select public.end_identity_service_period(current_setting('test.period1')::uuid,'Synthetic equipment return');
select pg_temp.assert_true((select expires_at=now()+interval '20 days' from public.onboarding_documents where id='99000000-0000-4000-8000-000000000013'),'ending one service preserves other active service');
update public.basic_onboarding_applications set status='approved',reviewed_at=now() where user_id='99000000-0000-4000-8000-000000000001';
select public.end_identity_service_period(current_setting('test.period2')::uuid,'Synthetic cabin contract ended');
select pg_temp.assert_true((select expires_at=now() from public.onboarding_documents where id='99000000-0000-4000-8000-000000000013'),'last service end stops access immediately and queues deletion');
update private.active_service_id_consents set review_completed_at=now()-interval '25 hours' where document_id='99000000-0000-4000-8000-000000000013';
update private.identity_service_periods set revoked_at=now()-interval '25 hours' where user_id='99000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select (public.get_onboarding_document_retention('99000000-0000-4000-8000-000000000013')).expires_at<=now()),'access uses effective deadline even before worker updates material expiry');
select pg_temp.assert_true(exists(select 1 from public.list_due_onboarding_documents(100) where id='99000000-0000-4000-8000-000000000013'),'ended ID is leased for deletion');
insert into storage.buckets(id,name,public) values('onboarding-documents','onboarding-documents',false) on conflict(id) do nothing;
insert into storage.objects(bucket_id,name) select 'onboarding-documents',object_path from public.onboarding_documents where id='99000000-0000-4000-8000-000000000013';
do $$begin
 perform public.mark_onboarding_document_deleted('99000000-0000-4000-8000-000000000013');
 raise exception 'Copy marked deleted while storage object exists';
exception when invalid_parameter_value then null; end; $$;
-- Simulate completed Storage API removal for this transaction's synthetic object.
set local storage.allow_delete_query='true';
delete from storage.objects where name=(select object_path from public.onboarding_documents where id='99000000-0000-4000-8000-000000000013') and bucket_id='onboarding-documents';
set local storage.allow_delete_query='false';
select public.mark_onboarding_document_deleted('99000000-0000-4000-8000-000000000013');
select pg_temp.assert_true((select deleted_at is not null and id_type is null from public.onboarding_documents where id='99000000-0000-4000-8000-000000000013'),'verified storage deletion removes unnecessary government ID type too');
select pg_temp.assert_true((select status='approved' from public.basic_onboarding_applications where user_id='99000000-0000-4000-8000-000000000001'),'existing identity approval is not revoked by deletion');
select pg_temp.assert_true(not public.service_government_id_ready('99000000-0000-4000-8000-000000000001'),'deleted ID requires fresh copy for later service');
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$begin
 perform public.accept_government_id_retention('99000000-0000-4000-8000-000000000013','2026-11-04-active-service-id-v1');
 raise exception 'Deleted ID unexpectedly restored';
exception when insufficient_privilege then null; end; $$;
select set_config('test.fresh_id',(public.reserve_onboarding_document('government_id','passport')).id::text,true);
select public.accept_government_id_retention(current_setting('test.fresh_id')::uuid,'2026-11-04-active-service-id-v1');
select pg_temp.assert_true(public.onboarding_service_id_upload_allowed(current_setting('test.fresh_id')::uuid),'approved member can resubmit governmentID without reopening original application');
insert into storage.objects(bucket_id,name) select 'onboarding-documents',object_path from public.onboarding_documents where id=current_setting('test.fresh_id')::uuid;
select public.finalize_onboarding_document(current_setting('test.fresh_id')::uuid);
select pg_temp.assert_true(not public.service_government_id_ready('99000000-0000-4000-8000-000000000001'),'fresh uploaded ID still needs independent current-copy review');
select set_config('request.jwt.claims','{"sub":"99000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.record_identity_service_period('99000000-0000-4000-8000-000000000001','equipment',now(),now()+interval '2 days','Synthetic confirmed future service');
select public.review_service_government_id(current_setting('test.fresh_id')::uuid);
select pg_temp.assert_true(public.service_government_id_ready('99000000-0000-4000-8000-000000000001'),'fresh independent review plus confirmed service permits current service checks');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.service_government_id_ready(uuid)','EXECUTE'),'cross-member service readiness probe is service-only');
select pg_temp.assert_true((select expires_at=now()+interval '30 days' from public.onboarding_documents where id='99000000-0000-4000-8000-000000000012'),'all ID lifecycle operations leave photo30days unchanged');
insert into public.onboarding_documents(id,user_id,kind,id_type,uploaded_at,expires_at) values
 ('99000000-0000-4000-8000-000000000015','99000000-0000-4000-8000-000000000001','government_id','pan',now()-interval '26 hours',now()-interval '25 hours');
insert into public.onboarding_documents(user_id,kind,uploaded_at,expires_at)
 select '99000000-0000-4000-8000-000000000001','photo',now()-interval '100 days',now()-interval '70 days' from generate_series(1,101);
select pg_temp.assert_true((public.onboarding_id_retention_sla()->>'overdue')::integer=1,'over24hour governmentID physical-deletion backlog is measurable');
select pg_temp.assert_true((select id='99000000-0000-4000-8000-000000000015'::uuid from public.list_due_onboarding_documents(1)),'governmentID cleanup precedes older photo backlog to avoid shared-batch starvation');
select public.mark_onboarding_document_deleted('99000000-0000-4000-8000-000000000015');
select pg_temp.assert_true((public.onboarding_id_retention_sla()->>'overdue')::integer=0,'verified deletion clears physical-deletion SLA backlog');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.onboarding_id_retention_sla()','EXECUTE'),'SLA backlog exposes no cross-member counts to ordinary accounts');
rollback;
