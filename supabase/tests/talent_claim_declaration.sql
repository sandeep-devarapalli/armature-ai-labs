begin;
insert into auth.users(id,email_confirmed_at) values
 ('74000000-0000-4000-8000-000000000001',now()),
 ('74000000-0000-4000-8000-000000000002',now()),
 ('74000000-0000-4000-8000-000000000003',null);
insert into public.staff_roles(user_id,role) values ('74000000-0000-4000-8000-000000000002','admin');
insert into public.talent_profiles(id,data) values
 ('declaration-test','{"name":"Synthetic Engineer","linkedinUrl":"https://www.linkedin.com/in/declaration-test","claimed":false}'),
 ('declaration-legacy','{"name":"Legacy Engineer","linkedinUrl":"https://www.linkedin.com/in/declaration-legacy","claimed":false}');
insert into private.talent_requests(id,profile_id,requester_id,kind,evidence,base_revision) values ('74000000-0000-4000-8000-000000000010','declaration-legacy','74000000-0000-4000-8000-000000000001','claim','Legacy ownership evidence',1);
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect_error(query text,code text) returns void language plpgsql as $$ begin begin execute query; exception when others then if sqlstate=code then return; else raise; end if; end; raise exception 'Expected error %',code; end $$;
select pg_temp.check_true(to_regprocedure('public.talent_submit_request(text,text,text,integer)') is null,'old bypass signature removed');
set local role anon;
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,'Engineer','2026-10-13-v1',true)$q$,'42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','74000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,'Engineer','2026-10-13-v1',true)$q$,'42501');
select set_config('request.jwt.claim.sub','74000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1)$q$,'22023');
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,'Engineer','2026-10-13-v1',false)$q$,'22023');
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,'Engineer','2026-10-13-v1',null)$q$,'22023');
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,'Engineer','old-version',true)$q$,'22023');
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,' ','2026-10-13-v1',true)$q$,'22023');
select pg_temp.expect_error($q$select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,repeat('x',201),'2026-10-13-v1',true)$q$,'22023');
select public.talent_submit_request('declaration-test','claim','Ownership evidence for profile',1,'  Synthetic Engineer  ','2026-10-13-v1',true) as claim_id \gset
select pg_temp.check_true(public.talent_my_status('declaration-test')->>'owner'='false','signed claim remains pending, no ownership');
select pg_temp.expect_error($q$select public.talent_update_profile('declaration-test',1,'{"title":"Unauthorized"}')$q$,'42501');
select pg_temp.expect_error('select * from private.talent_requests','42501');
select public.talent_submit_request('declaration-test','correction','Independent correction evidence',1) as correction_id \gset
select public.talent_submit_request('declaration-test','removal','Independent removal evidence',1) as removal_id \gset
reset role;
select pg_temp.check_true((select declaration->>'signed_name'='Synthetic Engineer' and declaration->>'version'='2026-10-13-v1' and declaration->>'text'=private.talent_claim_declaration_text() and (declaration->>'accepted_at')::timestamptz>=transaction_timestamp() and declaration->>'requester_id'='74000000-0000-4000-8000-000000000001' and declaration->>'profile_id'='declaration-test' and declaration->>'profile_name'='Synthetic Engineer' and declaration->>'linkedin_url'='https://www.linkedin.com/in/declaration-test' from private.talent_requests where id=:'claim_id'),'server stores full signed evidence and snapshots');
select pg_temp.check_true((select count(*)=2 from private.talent_requests where id in (:'correction_id',:'removal_id') and declaration is null),'nonclaim requests unchanged');
select pg_temp.expect_error(format('update private.talent_requests set declaration=null where id=%L',:'claim_id'),'22023');
select pg_temp.expect_error(format('update private.talent_requests set requester_id=''74000000-0000-4000-8000-000000000002'' where id=%L',:'claim_id'),'22023');
set local role authenticated;
select set_config('request.jwt.claim.sub','74000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(exists(select 1 from jsonb_array_elements(public.talent_review_queue()) r where r->>'id'=:'claim_id' and r->'declaration'->>'signed_name'='Synthetic Engineer'),'admin review exposes signed declaration');
select pg_temp.expect_error($q$select public.talent_review_request('74000000-0000-4000-8000-000000000010','approved','Manual ownership check complete')$q$,'22023');
select public.talent_review_request('74000000-0000-4000-8000-000000000010','rejected','Please submit a fresh signed declaration');
reset role;
update auth.users set banned_until=now()+interval '1 day' where id='74000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.expect_error(format('select public.talent_review_request(%L,''approved'',''Manual ownership check complete'')',:'claim_id'),'42501');
reset role;
update auth.users set banned_until=null where id='74000000-0000-4000-8000-000000000001';
set local role authenticated;
select public.talent_review_request(:'claim_id','approved','Manual ownership check complete');
select set_config('request.jwt.claim.sub','74000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true(public.talent_my_status('declaration-test')->>'owner'='true','manual approval grants ownership');
select pg_temp.check_true((public.talent_update_profile('declaration-test',2,'{"title":"Approved owner update"}')->>'revision')::int=3,'approved owner can edit');
rollback;
