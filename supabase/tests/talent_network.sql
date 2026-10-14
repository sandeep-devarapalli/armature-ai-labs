begin;
insert into auth.users(id,email_confirmed_at) values
 ('71000000-0000-4000-8000-000000000001',now()),
 ('71000000-0000-4000-8000-000000000002',now()),
 ('71000000-0000-4000-8000-000000000003',now()),
 ('71000000-0000-4000-8000-000000000004',now()),
 ('71000000-0000-4000-8000-000000000005',null);
insert into public.staff_roles(user_id,role) values('71000000-0000-4000-8000-000000000003','admin'),('71000000-0000-4000-8000-000000000004','membership_reviewer');
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect_error(query text,code text) returns void language plpgsql as $$ begin begin execute query; exception when others then if sqlstate=code then return; else raise; end if; end; raise exception 'Expected error %',code; end $$;
set local role service_role;
select pg_temp.check_true(public.talent_import_profiles('[{"id":"talent-test-1","name":"Synthetic Engineer","linkedinUrl":"https://www.linkedin.com/in/talent-test-1","checkedAt":"2026-10-13","title":"Firmware engineer","skills":[],"yearsExperience":null}]')->>'inserted'='1','source imported');
select pg_temp.check_true(public.talent_import_profiles('[{"id":"talent-test-1","name":"Overwritten","linkedinUrl":"https://www.linkedin.com/in/talent-test-1","checkedAt":"2026-10-13"}]')->>'skipped'='1','import does not overwrite');
select pg_temp.check_true(public.talent_import_profiles('[{"id":"test-unicode-✨️-®","name":"Unicode identity","linkedinUrl":"https://www.linkedin.com/in/test-unicode-✨️-®","checkedAt":"2026-10-13"}]')->>'inserted'='1','safe Unicode stable identities preserved');
select pg_temp.expect_error($q$select public.talent_import_profiles('[{"id":"bad","name":"Bad","linkedinUrl":"javascript:bad","checkedAt":"2026-10-13"}]')$q$,'22023');
reset role;
set local role anon;
select pg_temp.check_true((select count(*)=1 from public.talent_profiles where id='talent-test-1'),'anonymous public listing');
select pg_temp.expect_error('select * from private.talent_owners','42501');
select pg_temp.expect_error('select * from private.talent_requests','42501');
select pg_temp.expect_error($q$update public.talent_profiles set published=false$q$,'42501');
select pg_temp.expect_error($q$select public.talent_submit_request('talent-test-1','claim','This is my synthetic profile',1,'Synthetic Engineer','2026-10-13-v1',true)$q$,'42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000005',true);
select pg_temp.expect_error($q$select public.talent_submit_request('talent-test-1','claim','This is my synthetic profile',1,'Synthetic Engineer','2026-10-13-v1',true)$q$,'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select public.talent_submit_request('talent-test-1','claim','Ownership evidence confirmed via controlled source',1,'Synthetic Engineer','2026-10-13-v1',true) as claim_id \gset
select pg_temp.check_true((public.talent_my_status('talent-test-1')->>'owner')::boolean=false,'request does not grant ownership');
select pg_temp.expect_error($q$select public.talent_submit_request('talent-test-1','claim','Repeated ownership evidence supplied',1,'Synthetic Engineer','2026-10-13-v1',true)$q$,'P0409');
select pg_temp.expect_error($q$select public.talent_update_profile('talent-test-1',1,'{"title":"Changed"}')$q$,'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select pg_temp.check_true(jsonb_array_length(public.talent_my_status('talent-test-1')->'requests')=0,'other account cannot see private requests');
select pg_temp.expect_error($q$select public.talent_review_queue()$q$,'42501');
select pg_temp.expect_error($q$select public.talent_import_profiles('[]')$q$,'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true);
select pg_temp.expect_error($q$select public.talent_review_queue()$q$,'42501');
select pg_temp.expect_error(format('select public.talent_review_request(%L,''approved'',''Evidence checked manually'')',:'claim_id'),'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select pg_temp.check_true(jsonb_array_length(public.talent_review_queue())>=1,'admin can review');
select public.talent_review_request(:'claim_id','approved','Evidence checked manually against ownership');
select pg_temp.expect_error(format('select public.talent_review_request(%L,''approved'',''Evidence checked manually'')',:'claim_id'),'P0409');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select pg_temp.check_true((public.talent_my_status('talent-test-1')->>'owner')::boolean,'claim approved');
select pg_temp.check_true((public.talent_update_profile('talent-test-1',2,'{"title":"Embedded engineer","skills":["C++"]}')->>'revision')::int=3,'owner edit increases revision');
select pg_temp.expect_error($q$select public.talent_update_profile('talent-test-1',2,'{"title":"Stale edit"}')$q$,'P0409');
select pg_temp.expect_error($q$select public.talent_update_profile('talent-test-1',3,'{"claimed":false}')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_update_profile('talent-test-1',3,'{"linkedinUrl":"https://www.linkedin.com/in/other"}')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_update_profile('talent-test-1',3,'{"skills":[1]}')$q$,'22023');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.talent_update_profile('talent-test-1',3,'{"title":"Unrelated account"}')$q$,'42501');
select pg_temp.expect_error($q$select public.talent_unlist_profile('talent-test-1')$q$,'42501');
select public.talent_submit_request('talent-test-1','correction','The title appears incorrect; supporting evidence attached in text',3) as correction_id \gset
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select public.talent_review_request(:'correction_id','approved','Source reviewed and corrected','{"title":"Robotics firmware engineer"}');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true);
select public.talent_unlist_profile('talent-test-1');
select pg_temp.check_true((select count(*)=0 from public.talent_profiles where id='talent-test-1'),'unlisted profile hidden from owner public read');
reset role;
set local role service_role;
select pg_temp.check_true(public.talent_import_profiles('[{"id":"talent-test-1","name":"Resurrection","linkedinUrl":"https://www.linkedin.com/in/talent-test-1","checkedAt":"2026-10-13"}]')->>'skipped'='1','removed identity suppressed');
select pg_temp.check_true(public.talent_import_profiles('[{"id":"talent-test-new-id","name":"Resurrection","linkedinUrl":"https://www.linkedin.com/in/talent-test-1","checkedAt":"2026-10-13"}]')->>'skipped'='1','removed identity suppressed under another ID');
reset role;
select pg_temp.check_true((select count(*)=1 from private.talent_owners where profile_id='talent-test-1'),'one immutable ownership record');
select pg_temp.check_true((select data->>'title'='Robotics firmware engineer' from public.talent_profiles where id='talent-test-1'),'import cannot overwrite owner/correction changes');
set local role service_role;
select pg_temp.check_true(public.talent_import_profiles('[{"id":"talent-test-new-slash","name":"Resurrection","linkedinUrl":"https://www.linkedin.com/in/talent-test-1/","checkedAt":"2026-10-13"}]')->>'skipped'='1','removed identity suppressed with trailing slash');
select public.talent_import_profiles('[{"id":"talent-test-2","name":"Removal example","linkedinUrl":"https://www.linkedin.com/in/talent-test-2/","checkedAt":"2026-10-13"}]');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select public.talent_submit_request('talent-test-2','removal','Please remove my profile; ownership supporting evidence provided',1) as removal_id \gset
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select public.talent_review_request(:'removal_id','approved','Removal evidence reviewed and verified');
select pg_temp.check_true((select count(*)=0 from public.talent_profiles where id='talent-test-2'),'approved removal request hides profile');
reset role;
set local role service_role;
select public.talent_import_profiles('[{"id":"talent-test-3","name":"Request example","linkedinUrl":"https://www.linkedin.com/in/talent-test-3","checkedAt":"2026-10-13"}]');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select public.talent_submit_request('talent-test-3','claim','Administrator supplied personal ownership evidence',1,'Synthetic Engineer','2026-10-13-v1',true) as self_id \gset
select pg_temp.expect_error(format('select public.talent_review_request(%L,''approved'',''Evidence checked manually'')',:'self_id'),'42501');
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select public.talent_submit_request('talent-test-3','correction','Dated title correction evidence supplied',1) as stale_id \gset
reset role;
update public.talent_profiles set revision=revision+1 where id='talent-test-3';
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error(format('select public.talent_review_request(%L,''approved'',''Evidence checked manually'',''{"title":"Changed"}'')',:'stale_id'),'P0409');
select public.talent_review_request(:'stale_id','rejected','Profile changed; fresh evidence required');
reset role;
insert into private.talent_requests(profile_id,requester_id,kind,evidence,base_revision,status)
select 'talent-test-3','71000000-0000-4000-8000-000000000002','claim','Historical test request evidence',2,'rejected' from generate_series(1,10);
set local role authenticated;
select set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.talent_submit_request('talent-test-3','removal','Enough text for removal evidence',2)$q$,'P0429');
reset role;
rollback;
