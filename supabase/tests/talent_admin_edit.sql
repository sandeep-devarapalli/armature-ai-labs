begin;
insert into auth.users(id,email_confirmed_at) values
 ('73000000-0000-4000-8000-000000000001',now()),
 ('73000000-0000-4000-8000-000000000002',now()),
 ('73000000-0000-4000-8000-000000000003',now()),
 ('73000000-0000-4000-8000-000000000004',now()),
 ('73000000-0000-4000-8000-000000000005',null);
insert into public.staff_roles(user_id,role) values
 ('73000000-0000-4000-8000-000000000002','membership_reviewer'),
 ('73000000-0000-4000-8000-000000000003','admin'),
 ('73000000-0000-4000-8000-000000000004','super_admin'),
 ('73000000-0000-4000-8000-000000000005','admin');
insert into public.talent_profiles(id,data) values('admin-edit-test','{"id":"admin-edit-test","name":"Synthetic engineer","title":"Before","linkedinUrl":"https://www.linkedin.com/in/admin-edit-test","claimed":false}');
create function pg_temp.check_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function pg_temp.expect_error(query text,code text) returns void language plpgsql as $$ begin begin execute query; exception when others then if sqlstate=code then return; else raise; end if; end; raise exception 'Expected error %',code; end $$;
set local role anon;
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"title":"Anonymous"}','Verified against source')$q$,'42501');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"title":"Member"}','Verified against source')$q$,'42501');
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000002',true);
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"title":"Staff"}','Verified against source')$q$,'42501');
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000005',true);
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"title":"Unconfirmed admin"}','Verified against source')$q$,'42501');
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"title":"Changed"}','short')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{}','Verified against source')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"claimed":true}','Verified against source')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"photoVersion":"forged"}','Verified against source')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"linkedinUrl":"https://www.linkedin.com/in/other"}','Verified against source')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"published":true}','Verified against source')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"skills":[123]}','Verified against source')$q$,'22023');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('missing',1,'{"title":"Changed"}','Verified against source')$q$,'P0409');
select pg_temp.check_true((public.talent_admin_update_profile('admin-edit-test',1,'{"title":"Firmware engineer"}','  Verified against source  ')->>'revision')::int=2,'admin edits unclaimed profile');
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',1,'{"title":"Stale"}','Verified against source')$q$,'P0409');
select pg_temp.expect_error('select * from private.talent_profile_edits','42501');
select pg_temp.check_true(public.talent_my_status('admin-edit-test')->>'owner'='false','admin edit does not grant ownership');
reset role;
select pg_temp.check_true((select count(*)=1 from private.talent_profile_edits where profile_id='admin-edit-test'),'exactly one audit record');
select pg_temp.check_true((select before_data->>'title'='Before' and after_data->>'title'='Firmware engineer' and before_revision=1 and after_revision=2 and editor_id='73000000-0000-4000-8000-000000000003' and note='Verified against source' from private.talent_profile_edits where profile_id='admin-edit-test'),'audit preserves actor, reason and both revisions');
insert into private.talent_owners(profile_id,user_id) values('admin-edit-test','73000000-0000-4000-8000-000000000001');
update public.talent_profiles set data=jsonb_set(data,'{claimed}','true') where id='admin-edit-test';
set local role authenticated;
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000004',true);
select pg_temp.check_true((public.talent_admin_update_profile('admin-edit-test',2,'{"company":"Example company"}','Company checked with owner')->>'revision')::int=3,'super admin edits claimed profile');
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000001',true);
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',3,'{"title":"Owner using admin RPC"}','Verified against source')$q$,'42501');
select pg_temp.expect_error($q$select public.talent_update_profile('admin-edit-test',2,'{"title":"Stale owner edit"}')$q$,'P0409');
select pg_temp.check_true((public.talent_update_profile('admin-edit-test',3,'{"title":"Owner update"}')->>'revision')::int=4,'owner edit still works with fresh revision');
select public.talent_unlist_profile('admin-edit-test');
select set_config('request.jwt.claim.sub','73000000-0000-4000-8000-000000000003',true);
select pg_temp.expect_error($q$select public.talent_admin_update_profile('admin-edit-test',5,'{"title":"Resurrection"}','Verified against source')$q$,'P0409');
reset role;
select pg_temp.check_true((select not published and data->>'claimed'='true' and data->>'linkedinUrl'='https://www.linkedin.com/in/admin-edit-test' from public.talent_profiles where id='admin-edit-test'),'identity, claim and removal preserved');
select pg_temp.check_true((select count(*)=1 from private.talent_suppressions where profile_id='admin-edit-test'),'suppression preserved');
select pg_temp.check_true((select user_id='73000000-0000-4000-8000-000000000001' from private.talent_owners where profile_id='admin-edit-test'),'ownership preserved');
select pg_temp.check_true((select count(*)=2 from private.talent_profile_edits where profile_id='admin-edit-test'),'failed and owner edits do not add admin audit records');
rollback;
