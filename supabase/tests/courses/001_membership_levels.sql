begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at)
select ('78500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','course-member-api-'||n||'@example.test',now() from generate_series(1,4)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Member API Test',email,'+919999999999','https://linkedin.com/in/test','1990-01-01',case right(id::text,1) when '2' then 'approved' when '3' then 'approved' else 'pending' end
from auth.users where id::text like '78500000%';
insert into public.staff_roles(user_id,role) values('78500000-0000-4000-8000-000000000004','admin');
insert into public.courses(id,slug) values('78600000-0000-4000-8000-000000000001','member-api-free'),('78600000-0000-4000-8000-000000000002','member-api-paid');
insert into public.course_versions(id,course_id,version,title,source_reference,source_sha256,status,access_tier)
select ('78700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('78600000-0000-4000-8000-'||lpad((case when n=5 then 2 else 1 end)::text,12,'0'))::uuid,
 n,'API fixture '||n,'synthetic',repeat('b',64),case n when 3 then 'draft' when 4 then 'withdrawn' else 'published' end,
 case when n=5 then 'paid' else 'free' end from generate_series(1,5)n;
insert into public.course_modules(id,course_version_id,source_id,title,position)
values('78800000-0000-4000-8000-000000000001','78700000-0000-4000-8000-000000000001','second','Module second',1),
 ('78800000-0000-4000-8000-000000000002','78700000-0000-4000-8000-000000000001','first','Module first',0);
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position,is_sample)
values('78900000-0000-4000-8000-000000000001','78700000-0000-4000-8000-000000000001','78800000-0000-4000-8000-000000000002','second','Lesson second',1,false),
 ('78900000-0000-4000-8000-000000000002','78700000-0000-4000-8000-000000000001','78800000-0000-4000-8000-000000000002','first','Lesson first',0,true);
insert into private.course_lesson_content select id,'[{"id":"a","type":"text","content":"Synthetic private body"},{"id":"b","type":"text","content":"Resume here"}]'::jsonb from public.course_lessons where id::text like '78900000%';
insert into public.course_lab_requirements(course_version_id,module_id,title,brief,completion_criteria,mandatory)
values('78700000-0000-4000-8000-000000000001','78800000-0000-4000-8000-000000000002','Synthetic module lab','Only a test','Authorized sign-off',true);

-- Start from a previously enrolled, identity-approved user; migration preserves history.
select set_config('request.jwt.claims','{"sub":"78500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
select lives_ok($$select public.enroll_in_course('78700000-0000-4000-8000-000000000001')$$,'legacy approved enrolment retained');
select lives_ok($$select public.save_course_lesson_progress('78900000-0000-4000-8000-000000000001',1,true)$$,'legacy progress recorded');
reset role;
update private.membership_level_settings set enabled=true;
set local role authenticated;
select is(public.get_course_membership()->>'membership_level','basic','old ID-approved user becomes Basic without phone');
select lives_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000001')$$,'Basic retains full free lesson access');
select is(jsonb_array_length(public.get_my_course_progress('78700000-0000-4000-8000-000000000001')),1,'saved progress preserved');
select set_config('request.jwt.claims','{"sub":"78500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_course_membership()->>'basic','true','confirmed email with pending ID is Basic');
select lives_ok($$select public.enroll_in_course('78700000-0000-4000-8000-000000000001')$$,'Basic enrolls without ID or mobile');
select lives_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000001')$$,'Basic reads protected free lesson');
select throws_ok($$select public.enroll_in_course('78700000-0000-4000-8000-000000000005')$$,'42501',null,'Basic does not receive paid-course access');
select is(public.has_verified_member_access(),false,'Basic course access does not grant equipment eligibility');
select throws_ok($$update private.membership_level_settings set enabled=false$$,'42501',null,'member cannot switch gate');
reset role;
update public.basic_onboarding_applications set status='revoked' where user_id='78500000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.get_course_membership()->>'basic','false','revocation removes Basic access');
select throws_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000001')$$,'42501','Course access denied','revoked user cannot read full lessons');
select throws_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000002')$$,'42501','Course access denied','revoked user cannot bypass via sample');
select throws_ok($$select private.get_course_lesson_before_levels('78900000-0000-4000-8000-000000000002')$$,'42501',null,'legacy helper cannot bypass wrapper');
reset role;
update public.basic_onboarding_applications set status='pending' where user_id='78500000-0000-4000-8000-000000000001';
update auth.users set email_confirmed_at=null where id='78500000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.enroll_in_course('78700000-0000-4000-8000-000000000001')$$,'42501',null,'unconfirmed email cannot enroll');
reset role;
select * from finish();
rollback;
