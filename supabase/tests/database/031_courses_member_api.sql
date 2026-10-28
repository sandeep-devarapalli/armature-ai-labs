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
set local role anon;
select throws_ok($$select public.get_my_course_catalog()$$,'42501',null,'anonymous catalog RPC denied');
select throws_ok($$select public.get_course_syllabus('78700000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous syllabus RPC denied');
select throws_ok($$select public.get_my_course_progress('78700000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous history RPC denied');
select throws_ok($$select public.get_course_membership()$$,'42501',null,'anonymous membership RPC denied');
set local role authenticated;
select set_config('request.jwt.claims','{"role":"authenticated"}',true);
select throws_ok($$select public.get_my_course_catalog()$$,'42501','Course access denied','missing session subject denied');
select set_config('request.jwt.claims','{"sub":"78500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_course_membership(),' {"verified":false}'::jsonb,'pending member is not verified');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'id' like 'member-api-%'),2,'catalog offers only latest published version per course');
select is((select c->>'versionId' from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'id'='member-api-free'),'78700000-0000-4000-8000-000000000002','draft and withdrawn newer versions do not displace latest published');
select ok((select bool_and(c->>'canLearn'='false' and c->>'enrolled'='false' and c->>'readCount'='0' and c->>'resumeLessonId' is null) from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'id' like 'member-api-%'),'pending catalog exposes no learning authorization or other history');
select is(public.get_course_syllabus('78700000-0000-4000-8000-000000000001')#>>'{modules,0,title}','Module first','syllabus preserves module source order');
select is(public.get_course_syllabus('78700000-0000-4000-8000-000000000001')#>'{modules,0,subItems}','["Lesson first","Lesson second"]'::jsonb,'syllabus preserves lesson source order');
select is(public.get_course_syllabus('78700000-0000-4000-8000-000000000001')#>'{modules,0,lessonContent}','{}'::jsonb,'syllabus never contains protected bodies');
select is(public.get_course_syllabus('78700000-0000-4000-8000-000000000001')#>>'{modules,0,lessons,0,isSample}','true','syllabus identifies reviewed samples');
select is(public.get_course_syllabus('78700000-0000-4000-8000-000000000001')#>>'{labRequirements,0,moduleId}','78800000-0000-4000-8000-000000000002','learning labs retain module scope');
select throws_ok($$select public.get_course_syllabus('78700000-0000-4000-8000-000000000003')$$,'42501','Course access denied','draft syllabus denied');
select throws_ok($$select public.get_course_syllabus('78700000-0000-4000-8000-000000000004')$$,'42501','Course access denied','withdrawn syllabus denied');
select throws_ok($$select public.get_course_syllabus('78700000-0000-4000-8000-000000000099')$$,'42501','Course access denied','missing syllabus has same denial');
select lives_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000002')$$,'pending member retains selected sample access');
select set_config('request.jwt.claims','{"sub":"78500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((select count(*)::integer from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'id' like 'member-api-%'),2,'learner catalog has no admin draft exception');
select throws_ok($$select public.get_course_syllabus('78700000-0000-4000-8000-000000000003')$$,'42501','Course access denied','learner syllabus has no admin draft exception');
select set_config('request.jwt.claims','{"sub":"78500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.get_course_membership(),' {"verified":true}'::jsonb,'existing free membership verifies learner');
select lives_ok($$select public.enroll_in_course('78700000-0000-4000-8000-000000000001')$$,'enroll in published original version');
select lives_ok($$select public.save_course_lesson_progress('78900000-0000-4000-8000-000000000001',1,true)$$,'save read state and source block resume');
select lives_ok($$select public.save_course_lesson_progress('78900000-0000-4000-8000-000000000001',0,false)$$,'resume position may change without clearing read history');
select is((select count(*)::integer from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'id' like 'member-api-%'),3,'enrolled older published version remains alongside latest');
select is((select c->>'readCount' from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'versionId'='78700000-0000-4000-8000-000000000001'),'1','read count persists after position-only save');
select is((select c->>'resumeLessonId' from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'versionId'='78700000-0000-4000-8000-000000000001'),'78900000-0000-4000-8000-000000000001','catalog resumes own most recently saved lesson');
select is((select c->>'moduleCount'||':'||(c->>'lessonCount') from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'versionId'='78700000-0000-4000-8000-000000000001'),'2:2','catalog reports version-specific content counts');
select is(public.get_my_course_progress('78700000-0000-4000-8000-000000000001')->0->>'lastBlock','0','history returns updated source block index');
select ok(public.get_my_course_progress('78700000-0000-4000-8000-000000000001')->0->>'readAt' is not null,'history returns retained read timestamp');
select is((select c->>'canLearn' from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'id'='member-api-paid'),'false','paid catalog requires entitlement');
reset role;
update public.basic_onboarding_applications set status='revoked' where user_id='78500000-0000-4000-8000-000000000002';
set local role authenticated;
select is(public.get_course_membership(),' {"verified":false}'::jsonb,'membership revocation reflected immediately');
select is((select c->>'canLearn' from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'versionId'='78700000-0000-4000-8000-000000000001'),'false','catalog authorization reflects revocation');
select is(jsonb_array_length(public.get_my_course_progress('78700000-0000-4000-8000-000000000001')),1,'own history retained after revocation');
select set_config('request.jwt.claims','{"sub":"78500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_my_course_progress('78700000-0000-4000-8000-000000000001'),'[]'::jsonb,'second learner cannot read first learner history');
select ok(not exists(select 1 from jsonb_array_elements(public.get_my_course_catalog()) c where c->>'versionId'='78700000-0000-4000-8000-000000000001'),'second learner does not inherit first learner enrollment');
reset role;
update auth.users set banned_until=now()+interval '1 day' where id='78500000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"78500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000002')$$,'42501','Course access denied','banned account cannot bypass via sample');
reset role;
update auth.users set banned_until=null,email_confirmed_at=null where id='78500000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000002')$$,'42501','Course access denied','unconfirmed account cannot read sample');
reset role;
update auth.users set email_confirmed_at=now(),deleted_at=now() where id='78500000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000002')$$,'42501','Course access denied','deleted account cannot read sample');
reset role;
update auth.users set deleted_at=null where id='78500000-0000-4000-8000-000000000001';
update public.memberships set status='suspended' where user_id='78500000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.get_course_lesson('78900000-0000-4000-8000-000000000002')$$,'42501','Course access denied','suspended account cannot bypass via sample');
reset role;
select * from finish();
rollback;
