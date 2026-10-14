begin;
grant usage on schema extensions to authenticated;
set local search_path=public,extensions;
select plan(16);
insert into public.onboarding_settings(singleton,enabled) values(true,true) on conflict(singleton) do update set enabled=true;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('79000000-0000-4000-8000-000000000001','authenticated','authenticated','id-retention@example.test',now()),
('79000000-0000-4000-8000-000000000002','authenticated','authenticated','other-id-retention@example.test',now());
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.submit_basic_onboarding('Synthetic Retention','+919999999999','https://linkedin.com/in/synthetic-retention','1990-01-01','2026-09-26-release-1');
reset role;
insert into public.onboarding_documents(id,user_id,kind,id_type,uploaded_at) values
('79000000-0000-4000-8000-000000000011','79000000-0000-4000-8000-000000000001','government_id','pan',now()),
('79000000-0000-4000-8000-000000000012','79000000-0000-4000-8000-000000000001','photo',null,now());
select ok((select isfinite(expires_at) from public.onboarding_documents where id='79000000-0000-4000-8000-000000000011'),'legacy ID keeps original expiry');
set local role authenticated;
select throws_ok($$select public.accept_government_id_retention('79000000-0000-4000-8000-000000000011','old')$$,'42501','Explicit current ID retention consent required','current explicit notice required');
select throws_ok($$select public.accept_government_id_retention('79000000-0000-4000-8000-000000000012','2026-10-14-equipment-id-v1')$$,'42501','Current own government ID required','photo cannot receive extended ID retention');
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.accept_government_id_retention('79000000-0000-4000-8000-000000000011','2026-10-14-equipment-id-v1')$$,'42501','Current own government ID required','another member cannot consent');
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.accept_government_id_retention('79000000-0000-4000-8000-000000000011','2026-10-14-equipment-id-v1')$$,'owner opts in');
select is((select expires_at from public.onboarding_documents where id='79000000-0000-4000-8000-000000000011'),'infinity'::timestamptz,'ID retained without automatic30day deletion');
select ok((select isfinite(expires_at) from public.onboarding_documents where id='79000000-0000-4000-8000-000000000012'),'photo remains time-limited');
reset role;
select ok(public.has_government_id_retention_consent('79000000-0000-4000-8000-000000000011'),'consent recorded for ID');
select is((select count(*) from public.list_due_onboarding_documents() where id='79000000-0000-4000-8000-000000000011'),0::bigint,'retained ID absent from cleanup');
update public.onboarding_documents set expires_at=least(expires_at,now()) where id='79000000-0000-4000-8000-000000000011';
select is((select count(*) from public.list_due_onboarding_documents() where id='79000000-0000-4000-8000-000000000011'),1::bigint,'explicit expiry still queues deletion');
set local role authenticated;
select throws_ok($$select public.accept_government_id_retention('79000000-0000-4000-8000-000000000011','2026-10-14-equipment-id-v1')$$,'42501','Current own government ID required','expired ID cannot be restored');
select function_privs_are('public','has_government_id_retention_consent',array['uuid'],'authenticated',array[]::text[],'consent probe service only');
reset role;
insert into public.onboarding_documents(id,user_id,kind,id_type) values
('79000000-0000-4000-8000-000000000013','79000000-0000-4000-8000-000000000001','government_id','pan');
set local role authenticated;
select public.accept_government_id_retention('79000000-0000-4000-8000-000000000013','2026-10-14-equipment-id-v1');
select ok((select isfinite(expires_at) from public.onboarding_documents where id='79000000-0000-4000-8000-000000000013'),'unused reservation still expires');
reset role;
insert into storage.buckets(id,name,public) values('onboarding-documents','onboarding-documents',false) on conflict(id) do nothing;
insert into storage.objects(bucket_id,name) select 'onboarding-documents',object_path from public.onboarding_documents where id='79000000-0000-4000-8000-000000000013';
select lives_ok($$select public.finalize_onboarding_document('79000000-0000-4000-8000-000000000013')$$,'consented upload finalizes');
select is((select expires_at from public.onboarding_documents where id='79000000-0000-4000-8000-000000000013'),'infinity'::timestamptz,'new consented ID retained after upload');
select is((select count(*) from private.government_id_retention_consents where document_id='79000000-0000-4000-8000-000000000013'),1::bigint,'one consent audit per ID');
select * from finish();
rollback;
