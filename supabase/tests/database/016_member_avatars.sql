begin;
select plan(12);
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('50000000-0000-4000-8000-000000000001','authenticated','authenticated','avatar-owner@example.test',now()),
('50000000-0000-4000-8000-000000000002','authenticated','authenticated','avatar-member@example.test',now()),
('50000000-0000-4000-8000-000000000003','authenticated','authenticated','avatar-pending@example.test',now());
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) values
('50000000-0000-4000-8000-000000000001','Avatar Owner','avatar-owner@example.test','+919999999999','https://linkedin.com/in/test','1990-01-01','approved'),
('50000000-0000-4000-8000-000000000002','Avatar Member','avatar-member@example.test','+919999999999','https://linkedin.com/in/test2','1990-01-01','approved'),
('50000000-0000-4000-8000-000000000003','Avatar Pending','avatar-pending@example.test','+919999999999','https://linkedin.com/in/test3','1990-01-01','pending');
insert into public.member_avatars(user_id,object_path,content_type,consent_version) values
('50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001/old','image/png','2026-09-27-avatar-1');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is((select count(*)::integer from public.member_avatars),1,'owner sees own avatar');
select throws_ok($$delete from public.member_avatars$$,'42501',null,'member cannot bypass managed deletion');
select throws_ok($$select public.begin_member_avatar_change(auth.uid(),true)$$,'42501',null,'member cannot impersonate edge service');
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.member_avatars),1,'approved community member sees approved avatar');
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::integer from public.member_avatars),0,'pending member cannot read community avatar');
reset role;
update public.basic_onboarding_applications set status='revoked' where user_id='50000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"50000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::integer from public.member_avatars),0,'revocation removes community image access');
reset role;
create temp table avatar_test_operation(token uuid);
insert into avatar_test_operation select public.begin_member_avatar_change('50000000-0000-4000-8000-000000000001',false);
select ok(public.finish_member_avatar_change('50000000-0000-4000-8000-000000000001',(select token from avatar_test_operation),'50000000-0000-4000-8000-000000000001/new','image/png'),'scanned avatar finalizes');
select is((select count(*)::integer from public.member_avatar_cleanup),1,'replacement queues old bytes');
select public.begin_member_avatar_change('50000000-0000-4000-8000-000000000001',true);
select ok(not public.finish_member_avatar_change('50000000-0000-4000-8000-000000000001',(select token from avatar_test_operation),'50000000-0000-4000-8000-000000000001/stale','image/png'),'remove invalidates inflight upload');
select is((select count(*)::integer from public.member_avatars),0,'removed avatar immediately inaccessible');
select is((select count(*)::integer from public.member_avatar_cleanup),2,'remove durably queues current bytes');
select is((select public from storage.buckets where id='member-avatars'),false,'avatar bucket stays private');
select * from finish();
rollback;
