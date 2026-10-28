begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('79000000-0000-4000-8000-000000000001','authenticated','authenticated','practical-basic@example.test',now()),
('79000000-0000-4000-8000-000000000002','authenticated','authenticated','practical-verified@example.test',now());
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Synthetic Course Learner',email,'+919999999999','https://linkedin.com/in/test','1990-01-01',case right(id::text,1) when '2' then 'approved' else 'pending' end from auth.users where id::text like '79000000%';
insert into public.courses(id,slug,requires_verified_membership) values
('79100000-0000-4000-8000-000000000001','synthetic-verified-course',true),('79100000-0000-4000-8000-000000000002','synthetic-existing-free-course',false);
insert into public.course_versions(id,course_id,version,title,source_reference,source_sha256,status,access_tier)
select ('79200000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('79100000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,1,'Synthetic course','test',repeat('a',64),'published','free' from generate_series(1,2)n;
insert into public.course_modules(id,course_version_id,source_id,title,position) values('79300000-0000-4000-8000-000000000001','79200000-0000-4000-8000-000000000001','m1','Module',0);
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position,is_sample)
select ('79400000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'79200000-0000-4000-8000-000000000001','79300000-0000-4000-8000-000000000001','l'||n,'Lesson '||n,n,n<=2 from generate_series(1,3)n;
insert into private.course_lesson_content select id,'[{"id":"t","type":"text","content":{"html":"Synthetic learning content"}}]'::jsonb from public.course_lessons where id::text like '79400000%';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.get_course_lesson('79400000-0000-4000-8000-000000000001')$$,'registered introduction');
select lives_ok($$select public.get_course_lesson('79400000-0000-4000-8000-000000000002')$$,'registered first teaching lesson');
select throws_ok($$select public.get_course_lesson('79400000-0000-4000-8000-000000000003')$$,'42501',null,'registered protected lesson denied');
select throws_ok($$select public.enroll_in_course('79200000-0000-4000-8000-000000000001')$$,'42501',null,'registered enrollment denied');
select is((select (x->>'requiresVerifiedMembership')::boolean from jsonb_array_elements(public.get_my_course_catalog()) x where x->>'id'='synthetic-verified-course'),true,'catalog verification flag');
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select lives_ok($$select public.enroll_in_course('79200000-0000-4000-8000-000000000001')$$,'verified enrollment succeeds');
select lives_ok($$select public.get_course_lesson('79400000-0000-4000-8000-000000000003')$$,'verified protected lesson succeeds');
reset role;
-- Simulate an upstream policy granting Basic access, independently of the current flag rollout.
create or replace function private.course_can_learn_before_verified_pilot(p_version_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published' and v.access_tier='free'); $$;
select set_config('request.jwt.claims','{"sub":"79000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(private.course_can_learn('79200000-0000-4000-8000-000000000001'),false,'verification guard survives upstream Basic access');
select is(private.course_can_learn('79200000-0000-4000-8000-000000000002'),true,'existing free course preserves upstream Basic access');
select * from finish();
rollback;
