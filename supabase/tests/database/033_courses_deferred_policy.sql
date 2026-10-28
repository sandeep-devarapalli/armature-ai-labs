begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at)
 select ('89500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','course-admin-test-'||n||'@example.test',now() from generate_series(1,8)n;
insert into public.staff_roles(user_id,role) values
 ('89500000-0000-4000-8000-000000000001','admin'),('89500000-0000-4000-8000-000000000002','super_admin'),
 ('89500000-0000-4000-8000-000000000003','membership_reviewer'),('89500000-0000-4000-8000-000000000005','admin'),
 ('89500000-0000-4000-8000-000000000006','admin'),('89500000-0000-4000-8000-000000000007','admin'),('89500000-0000-4000-8000-000000000008','admin');
update auth.users set banned_until=now()+interval '1 day' where id='89500000-0000-4000-8000-000000000005';
update auth.users set deleted_at=now() where id='89500000-0000-4000-8000-000000000006';
update auth.users set email_confirmed_at=null where id='89500000-0000-4000-8000-000000000007';
update public.memberships set status='suspended' where user_id='89500000-0000-4000-8000-000000000008';
insert into public.courses(id,slug) values('89600000-0000-4000-8000-000000000001','course-admin-test');
insert into public.course_versions(id,course_id,version,title,source_reference,source_sha256)
 values('89700000-0000-4000-8000-000000000001','89600000-0000-4000-8000-000000000001',1,'Original course','synthetic',repeat('c',64));
insert into public.course_modules(id,course_version_id,source_id,title,position)
 values('89800000-0000-4000-8000-000000000001','89700000-0000-4000-8000-000000000001','m1','Module 1',0);
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position)
 values('89900000-0000-4000-8000-000000000001','89700000-0000-4000-8000-000000000001','89800000-0000-4000-8000-000000000001','l1','Lesson 1',0);
insert into private.course_lesson_content values('89900000-0000-4000-8000-000000000001','[{"id":"t","type":"text","content":{"html":"<p>Original</p>"}}]');
insert into private.course_assessment_material values('89700000-0000-4000-8000-000000000001','{"secretFinal":"retained"}');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"89500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.admin_update_course_version('89700000-0000-4000-8000-000000000001',1,'Deferred course','Synthetic','free','unassigned','unassigned','owner defers assessment and labs')$$,'learning access assigned independently');
select throws_ok($$select public.admin_publish_course_version('89700000-0000-4000-8000-000000000001',2,'publish')$$,'22023','Review the current revision before publication','deferred policy does not bypass content review');
select lives_ok($$select public.admin_review_course_version('89700000-0000-4000-8000-000000000001',2,'content reviewed; policies deferred')$$,'content review with deferred policies');
select lives_ok($$select public.admin_publish_course_version('89700000-0000-4000-8000-000000000001',2,'local synthetic publication')$$,'reviewed learning publishes with both policies deferred');
select is(public.admin_get_course_version('89700000-0000-4000-8000-000000000001')->'course'->>'finalAssessmentRoute','unassigned','publication does not assign assessment');
select is(public.admin_get_course_version('89700000-0000-4000-8000-000000000001')->'course'->>'labPolicyStatus','unassigned','publication does not silently mean no labs');
select throws_ok($$select public.admin_update_course_version('89700000-0000-4000-8000-000000000001',3,'Deferred course','Synthetic','free','online_quiz','none','change after enrollment')$$,'22023','Only draft versions can be edited; create a new draft','later policy requires separate reviewed version');
select set_config('test.clone_id',public.admin_clone_course_version('89700000-0000-4000-8000-000000000001',3,'future policy draft')::text,true);
select lives_ok(format('select public.admin_replace_course_labs(%L,1,%L,%L)',current_setting('test.clone_id'),'[{"moduleId":null,"title":"Synthetic lab","brief":"Practice","completionCriteria":"Check","mandatory":true}]','configure later'),'future draft can add labs');
select lives_ok(format('select public.admin_review_course_version(%L,2,%L)',current_setting('test.clone_id'),'review'),'review future draft');
select throws_ok(format('select public.admin_publish_course_version(%L,2,%L)',current_setting('test.clone_id'),'publish'),'22023','Lab policy and requirements disagree','deferred policy cannot conceal assigned labs');
select lives_ok(format('select public.admin_update_course_version(%L,2,%L,%L,%L,%L,%L,%L)',current_setting('test.clone_id'),'Future course','Synthetic','free','unassigned','configured','owner supplies independent labs'),'learning labs independent of final assessment');
select lives_ok(format('select public.admin_review_course_version(%L,3,%L)',current_setting('test.clone_id'),'review configured labs'),'review independent labs');
select lives_ok(format('select public.admin_publish_course_version(%L,3,%L)',current_setting('test.clone_id'),'publish local synthetic'),'configured labs publish while final assessment deferred');
select is(public.admin_get_course_version('89700000-0000-4000-8000-000000000001')->'course'->>'labPolicyStatus','unassigned','original published policy unchanged');
select * from finish();
rollback;
