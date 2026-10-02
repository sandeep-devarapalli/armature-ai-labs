-- Run against an isolated local database after migrations. Every fixture rolls back.
begin;
insert into auth.users(id) values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),('10000000-0000-4000-8000-000000000003');
insert into public.staff_roles(user_id,role) values('10000000-0000-4000-8000-000000000001','admin'),('10000000-0000-4000-8000-000000000002','membership_reviewer'),('10000000-0000-4000-8000-000000000003','super_admin');
insert into public.ecosystem_listings(slug,data,published) values('atlas-test-existing','{"slug":"atlas-test-existing","name":"Test facility","summary":"Synthetic testing facility","primaryType":"research-ecosystem","websiteUrl":"https://example.org"}',true);
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect_error(query text,code text) returns void language plpgsql as $$
begin
 begin execute query; exception when others then if sqlstate=code then return; else raise; end if; end;
 raise exception 'Expected error % from %',code,query;
end; $$;

set local role service_role;
select public.receive_ecosystem_submission('10000000-0000-4000-8000-000000000010',repeat('a',64),'new',null,null,'{"slug":"atlas-test-new","name":"New fixture","summary":"Synthetic new facility","primaryType":"supplier","websiteUrl":"https://example.org/new","publicPhones":[{"label":"Office","number":"+91 8000000000"},{"label":"Workshop","number":"+91 8000000001"}]}','Private name','private@example.org',repeat('b',64),true) as receipt \gset
select pg_temp.check_true(public.receive_ecosystem_submission('10000000-0000-4000-8000-000000000010',repeat('a',64),'new',null,null,'{}','Private name','private@example.org',repeat('b',64))=:'receipt','saved retry returns same receipt');
select pg_temp.expect_error($q$select public.receive_ecosystem_submission('10000000-0000-4000-8000-000000000010',repeat('c',64),'new',null,null,'{}',null,null,repeat('b',64))$q$,'22023');
select public.import_ecosystem_submission('github:atlas-test-update','update','atlas-test-existing',1,'{"name":"Updated fixture","summary":"Synthetic changed facility","primaryType":"research-ecosystem","websiteUrl":"https://example.org"}') as edit_receipt \gset
select pg_temp.check_true(public.import_ecosystem_submission('github:atlas-test-update','update','atlas-test-existing',1,'{"name":"Updated fixture","summary":"Synthetic changed facility","primaryType":"research-ecosystem","websiteUrl":"https://example.org"}')=:'edit_receipt','import retry idempotent');
select pg_temp.expect_error($q$select public.import_ecosystem_submission('github:atlas-test-stale','update','atlas-test-existing',1,'{"name":"Other update","summary":"Synthetic competing change","primaryType":"research-ecosystem","websiteUrl":"https://example.org"}')$q$,'P0409');
select pg_temp.expect_error($q$select public.import_ecosystem_submission('github:atlas-test-update','update','atlas-test-existing',1,'{"name":"Different payload","summary":"Synthetic conflicting import","primaryType":"supplier","websiteUrl":"https://example.org"}')$q$,'22023');
select pg_temp.expect_error($q$select public.import_ecosystem_submission('github:atlas-test-invalid','new',null,null,'{"name":"Bad credit","summary":"Synthetic invalid credit","primaryType":"supplier","websiteUrl":"https://example.org","credit":{"name":{"private":"data"}}}')$q$,'22023');
select pg_temp.expect_error($q$select public.import_ecosystem_submission('github:atlas-test-unpinned','new',null,null,'{"name":"Unknown location","summary":"Synthetic location metadata","primaryType":"supplier","websiteUrl":"https://example.org","coordinates":[77,13],"locationPrecision":"City-level"}')$q$,'22023');
select pg_temp.expect_error($q$select public.receive_ecosystem_submission('10000000-0000-4000-8000-000000000090',repeat('a',64),'new',null,null,'{"name":"No consent","summary":"Synthetic contact permission","primaryType":"supplier","publicEmail":"office@example.org"}',null,null,repeat('f',64),false)$q$,'22023');
select public.receive_ecosystem_submission(('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,repeat('a',64),'new',null,null,'{"name":"Rate fixture","summary":"Synthetic rate limit fixture","primaryType":"supplier","websiteUrl":"https://example.org"}',null,null,repeat('c',64)) from generate_series(20,24) n;
select pg_temp.expect_error($q$select public.receive_ecosystem_submission('10000000-0000-4000-8000-000000000025',repeat('a',64),'new',null,null,'{"name":"Rate fixture","summary":"Synthetic rate limit fixture","primaryType":"supplier","websiteUrl":"https://example.org"}',null,null,repeat('c',64))$q$,'P0429');
select public.import_ecosystem_submission('github:atlas-test-reject','new',null,null,'{"name":"Rejected fixture","summary":"Synthetic rejected fixture","primaryType":"supplier","websiteUrl":"https://example.org"}') as rejected_receipt \gset
reset role;
select pg_temp.check_true((select count(*)=1 from public.ecosystem_listings where slug like 'atlas-test-%' and published),'queue cannot publish');
select pg_temp.check_true((select base_data->>'name'='Test facility' from public.ecosystem_submissions where id=:'edit_receipt'),'edit captures baseline');
update private.ecosystem_notifications set retry_at=now()+interval '1 day' where submission_id<>:'receipt';
set local role service_role;
select submission_id,lease from public.claim_ecosystem_notifications() \gset delivery_
select pg_temp.check_true(:'delivery_submission_id'=:'receipt','notification claims only durable receipt');
select public.finish_ecosystem_notification(:'delivery_submission_id',:'delivery_lease',false);
reset role;
select pg_temp.check_true((select state='pending' and attempts=1 from private.ecosystem_notifications where submission_id=:'receipt'),'provider failure queues retry');
update private.ecosystem_notifications set retry_at=now()-interval '1 minute' where submission_id=:'receipt';
set local role service_role;
select submission_id,lease from public.claim_ecosystem_notifications() \gset delivery_
select public.finish_ecosystem_notification(:'delivery_submission_id',:'delivery_lease',true);
reset role;
select pg_temp.check_true((select state='sent' and attempts=2 from private.ecosystem_notifications where submission_id=:'receipt'),'successful acknowledgement closes outbox');

set local role anon;
select pg_temp.expect_error('select * from public.ecosystem_submissions','42501');
select pg_temp.expect_error('insert into public.ecosystem_listings(slug,data) values(''evil'',''{}'')','42501');
select pg_temp.expect_error('select public.import_ecosystem_submission(''github:evil'',''new'',null,null,''{}'')','42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true((select count(*)=0 from public.ecosystem_submissions),'membership reviewer cannot see drafts');
select pg_temp.expect_error(format('select public.review_ecosystem_submission(%L,''approved'')',:'receipt'),'42501');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select pg_temp.check_true((select count(*)=0 from public.ecosystem_submissions),'ordinary member cannot see drafts');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.review_ecosystem_submission(:'rejected_receipt','needs_info',null,'Evidence needed',1);
select public.review_ecosystem_submission(:'rejected_receipt','rejected',null,'Insufficient evidence',1);
select pg_temp.expect_error(format('select public.review_ecosystem_submission(%L,''approved'',null,null,1)',:'rejected_receipt'),'22023');
select pg_temp.check_true(public.review_ecosystem_submission(:'receipt','approved',null,null,1)='atlas-test-new','admin publishes new listing');
select pg_temp.check_true(public.review_ecosystem_submission(:'receipt','approved',null,null,1)='atlas-test-new','approval retry idempotent');
select public.review_ecosystem_submission(:'edit_receipt','approved',1,null,1);
reset role;
set local role service_role;
select public.import_ecosystem_submission('github:atlas-test-stale','update','atlas-test-existing',2,'{"name":"Other update","summary":"Synthetic competing change","primaryType":"research-ecosystem","websiteUrl":"https://example.org"}') as stale_receipt \gset
reset role;
-- Simulate a separately authorised catalog maintenance revision, not a second open edit.
update public.ecosystem_listings set revision=3 where slug='atlas-test-existing';
set local role authenticated;
select pg_temp.expect_error(format('select public.review_ecosystem_submission(%L,''approved'',2,null,1)',:'stale_receipt'),'40001');
select public.rebase_ecosystem_submission(:'stale_receipt',3,'{"name":"Reconciled update","summary":"Synthetic reconciled change","primaryType":"research-ecosystem","websiteUrl":"https://example.org"}',1);
select pg_temp.expect_error(format('select public.review_ecosystem_submission(%L,''approved'',3,null,1)',:'stale_receipt'),'40001');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select public.review_ecosystem_submission(:'stale_receipt','approved',3,null,2);
select pg_temp.check_true((select revision=4 and data->>'name'='Reconciled update' from public.ecosystem_listings where slug='atlas-test-existing'),'super admin approves rebased edit');
select pg_temp.check_true((select count(*)=2 from jsonb_array_elements((select data->'publicPhones' from public.ecosystem_listings where slug='atlas-test-new'))),'multiple phones retained');
select pg_temp.check_true((select data->'needs'='[]'::jsonb and data->'alsoListedAs'='[]'::jsonb and data->'sectors'='[]'::jsonb from public.ecosystem_listings where slug='atlas-test-new'),'minimal payload defaults are safe for rendering');
reset role;
select pg_temp.check_true((select count(*)=4 from public.ecosystem_review_history where submission_id in (:'receipt',:'edit_receipt',:'stale_receipt')),'before/after review audit retained');
update public.ecosystem_submissions set closed_at=now()-interval '91 days' where id=:'receipt';
insert into private.ecosystem_rate_limits values(repeat('e',64),now()-interval '25 hours',1);
set local role service_role;
select public.cleanup_ecosystem_private_data();
reset role;
select pg_temp.check_true((select submitter_name is null and submitter_email is null from public.ecosystem_submissions where id=:'receipt'),'private follow-up retention');
select pg_temp.check_true(not exists(select 1 from private.ecosystem_rate_limits where key_hash=repeat('e',64)),'IP hash retention');
select pg_temp.check_true(not exists(select 1 from public.ecosystem_review_history where before_data::text like '%private@example.org%' or after_data::text like '%private@example.org%'),'history excludes private contact');
rollback;
