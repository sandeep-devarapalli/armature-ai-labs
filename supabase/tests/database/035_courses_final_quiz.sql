begin;
select no_plan();
-- Users: 1 admin, 2 and 3 approved members, 4 pending member.
insert into auth.users(id,aud,role,email,email_confirmed_at)
 select ('79500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','course-final-quiz-'||n||'@example.test',now() from generate_series(1,4)n;
insert into public.staff_roles(user_id,role) values('79500000-0000-4000-8000-000000000001','admin');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
 select id,'Final Quiz Test',email,'+919999999999','https://linkedin.com/in/test','1990-01-01',case when right(id::text,1) in ('2','3') then 'approved' else 'pending' end
 from auth.users where id::text like '79500000%' and right(id::text,1) <> '1';
insert into public.courses(id,slug) values('79600000-0000-4000-8000-000000000001','final-quiz-test');
insert into public.course_versions(id,course_id,version,title,source_reference,source_sha256)
 values('79700000-0000-4000-8000-000000000001','79600000-0000-4000-8000-000000000001',1,'Quiz course','synthetic',repeat('d',64));
insert into public.course_modules(id,course_version_id,source_id,title,position) values('79800000-0000-4000-8000-000000000001','79700000-0000-4000-8000-000000000001','m1','Module 1',0);
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position)
 values('79900000-0000-4000-8000-000000000001','79700000-0000-4000-8000-000000000001','79800000-0000-4000-8000-000000000001','l1','Lesson 1',0);
insert into private.course_lesson_content values('79900000-0000-4000-8000-000000000001','[{"id":"t","type":"text","content":{"html":"<p>Body</p>"}}]');
insert into private.course_assessment_material values('79700000-0000-4000-8000-000000000001','{"legacyFinalExam":"not a question list","questionBank":[
 {"id":"q1","question":"One?","options":[{"id":"A","text":"yes"},{"id":"B","text":"no"}],"correctAnswerId":"A","explanation":"SECRET-EXPLANATION-1"},
 {"id":"q2","question":"Two?","options":[{"id":"A","text":"yes"},{"id":"B","text":"no"}],"correctAnswerId":"B","explanation":"SECRET-EXPLANATION-2"},
 {"id":"q3","question":"Three?","options":[{"id":"A","text":"yes"},{"id":"B","text":"no"}],"correctAnswerId":"A","explanation":"SECRET-EXPLANATION-3"}]}');

-- Administration
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.admin_update_course_version('79700000-0000-4000-8000-000000000001',1,'Quiz course','Synthetic','free','online_quiz','none','assessment only')$$,'route set to online quiz with no labs');
select throws_ok($$select public.admin_set_course_final_quiz('79700000-0000-4000-8000-000000000001',2,'bogus',70,30,24,'bad source')$$,'22023',null,'unknown quiz source rejected');
select throws_ok($$select public.admin_set_course_final_quiz('79700000-0000-4000-8000-000000000001',2,'legacyFinalExam',70,30,24,'malformed source')$$,'22023',null,'malformed question set rejected');
select throws_ok($$select public.admin_set_course_final_quiz('79700000-0000-4000-8000-000000000001',2,'questionBank',0,30,24,'bad pass mark')$$,'22023',null,'invalid settings rejected');
select lives_ok($$select public.admin_review_course_version('79700000-0000-4000-8000-000000000001',2,'review without quiz')$$,'review recorded');
select throws_ok($$select public.admin_publish_course_version('79700000-0000-4000-8000-000000000001',2,'publish')$$,'22023','Configure the online final quiz before publication','online quiz route cannot publish without a quiz');
select lives_ok($$select public.admin_set_course_final_quiz('79700000-0000-4000-8000-000000000001',2,'questionBank',70,30,24,'attach question bank')$$,'question bank attached to draft');
select is((public.admin_get_course_version('79700000-0000-4000-8000-000000000001')->'finalQuiz'->>'questionCount')::int,3,'admin summary counts questions');
select is(public.admin_get_course_version('79700000-0000-4000-8000-000000000001')::text like '%SECRET-EXPLANATION%',false,'admin summary omits questions and answers');
select is(public.admin_get_course_version('79700000-0000-4000-8000-000000000001')->'course'->>'reviewedRevision' is null,true,'attaching a quiz invalidates review');
select lives_ok($$select public.admin_review_course_version('79700000-0000-4000-8000-000000000001',3,'review with quiz')$$,'review with quiz');
select lives_ok($$select public.admin_publish_course_version('79700000-0000-4000-8000-000000000001',3,'publish with quiz')$$,'publishes with quiz attached');
select throws_ok($$select public.admin_set_course_final_quiz('79700000-0000-4000-8000-000000000001',4,'questionBank',50,30,24,'edit published')$$,'22023','Only draft versions can be edited; create a new draft','published quiz settings are immutable');

-- Pending member
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000004","role":"authenticated"}',true);
select is((public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'eligible')::boolean,false,'unverified member is not eligible');
select throws_ok($$select public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')$$,'42501',null,'unverified member cannot start');

-- Member 2: not enrolled, then enrolled
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'available')::boolean,true,'quiz is available on the course');
select is((public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'eligible')::boolean,false,'not eligible before enrollment');
select throws_ok($$select public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')$$,'42501',null,'cannot start before enrollment');
select lives_ok($$select public.enroll_in_course('79700000-0000-4000-8000-000000000001')$$,'member enrolls');
select is((public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'eligible')::boolean,true,'eligible after enrollment');
select set_config('test.a2',public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'attemptId',true);
select is(jsonb_array_length(public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')->'questions'),3,'all questions served');
select is(public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'attemptId',current_setting('test.a2'),'starting again resumes the open attempt');
select is(public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')::text ~ '(correctAnswerId|SECRET-EXPLANATION)',false,'served questions carry no answers or explanations');
select throws_ok($$select * from private.course_final_quiz_attempts$$,'42501',null,'attempt table not directly readable');
select throws_ok($$select * from private.course_final_quizzes$$,'42501',null,'quiz table not directly readable');
select throws_ok($$select public.submit_course_final_quiz(current_setting('test.a2')::uuid,'["A"]'::jsonb)$$,'22023',null,'answers must be an object');
select is(public.submit_course_final_quiz(current_setting('test.a2')::uuid,'{"q1":"A","q2":"B","q3":"B","zz":"A","q9":7}'::jsonb)->>'percent','66.67','two of three scored');
select is((public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'passed')::boolean,false,'66.67 percent fails a 70 percent mark');
select throws_ok($$select public.submit_course_final_quiz(current_setting('test.a2')::uuid,'{"q1":"A","q2":"B","q3":"A"}'::jsonb)$$,'22023','This attempt has already been submitted','no resubmission');
select throws_ok($$select public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')$$,'22023',null,'retake waits for the configured interval');
select is(public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'nextAttemptAt' is not null,true,'status reports the next attempt time');
select is((public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'attempts')::int,1,'one attempt recorded');

-- Member 3: cannot touch member 2's attempt; passes
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select lives_ok($$select public.enroll_in_course('79700000-0000-4000-8000-000000000001')$$,'second member enrolls');
select throws_ok($$select public.submit_course_final_quiz(current_setting('test.a2')::uuid,'{"q1":"A","q2":"B","q3":"A"}'::jsonb)$$,'42501',null,'cannot submit another member''s attempt');
select set_config('test.a3',public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'attemptId',true);
select is((public.submit_course_final_quiz(current_setting('test.a3')::uuid,'{"q1":"A","q2":"B","q3":"A"}'::jsonb)->>'passed')::boolean,true,'all correct passes');
select throws_ok($$select public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')$$,'22023','Final quiz already passed','no attempts after passing');
select is(public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'nextAttemptAt' is null,true,'no next attempt after passing');

-- Member 2: after the wait, an attempt that runs out of time scores zero
reset role;
update private.course_final_quiz_attempts set submitted_at=now()-interval '25 hours' where id=current_setting('test.a2')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('test.a2b',public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'attemptId',true);
select isnt(current_setting('test.a2b'),current_setting('test.a2'),'new attempt after the wait');
reset role;
update private.course_final_quiz_attempts set expires_at=now()-interval '10 minutes' where id=current_setting('test.a2b')::uuid;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is(public.submit_course_final_quiz(current_setting('test.a2b')::uuid,'{"q1":"A","q2":"B","q3":"A"}'::jsonb)->>'outcome','expired','late submission is not graded');
select is((public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')->>'bestPercent')::numeric,66.67,'expired attempt scores zero and best result is kept');

-- Losing membership blocks new attempts
reset role;
update private.course_final_quiz_attempts set submitted_at=now()-interval '25 hours' where user_id='79500000-0000-4000-8000-000000000002';
update public.basic_onboarding_applications set status='pending' where user_id='79500000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')$$,'42501',null,'member without access cannot start');

-- Clone carries the quiz
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('test.clone',public.admin_clone_course_version('79700000-0000-4000-8000-000000000001',(public.admin_get_course_version('79700000-0000-4000-8000-000000000001')->'course'->>'revision')::bigint,'next draft')::text,true);
select is((public.admin_get_course_version(current_setting('test.clone')::uuid)->'finalQuiz'->>'questionCount')::int,3,'clone copies the final quiz');

-- Anonymous
set local role anon;
select throws_ok($$select public.get_my_course_final_quiz('79700000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous status denied');
select throws_ok($$select public.start_course_final_quiz('79700000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous start denied');
select * from finish();
rollback;
