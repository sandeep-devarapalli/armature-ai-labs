begin;
select no_plan();

-- Validator: code_assignment blocks ------------------------------------------------------------------------------------
create temporary table ca_block as select jsonb_build_object('id','a1','type','code_assignment','content',jsonb_build_object(
 'title','Assignment 1: Blocks','briefHtml','<p>Write the block.</p>','python','3.14','packages',jsonb_build_array('numpy','scipy'),'timeLimitSeconds',120,
 'files',jsonb_build_array(jsonb_build_object('name','blocks.py','code','def f():\n    raise NotImplementedError\n','editable',true),
   jsonb_build_object('name','world.py','code','X = 1\n','editable',false),jsonb_build_object('name','desk_arm.urdf','code','<robot/>','editable',false)),
 'tests',jsonb_build_array(jsonb_build_object('name','test_visible.py','code','def test_a():\n    assert True\n','hidden',false),
   jsonb_build_object('name','test_hidden.py','code','def test_b():\n    assert True\n','hidden',true)),
 'support',jsonb_build_array(jsonb_build_object('name','reference_blocks.pyc','base64','AAAA')))) b;
grant select on ca_block to authenticated;
select lives_ok($$select private.course_validate_blocks(jsonb_build_array((select b from ca_block)))$$,'complete code assignment is valid');
select lives_ok($$select private.course_validate_blocks(jsonb_build_array((select b #- '{content,support}' #- '{content,packages}' #- '{content,python}' #- '{content,timeLimitSeconds}' from ca_block)))$$,'optional fields may be omitted');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select b #- '{content,tests}' from ca_block)))$$,'22023',null,'tests are required');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,files,0,name}','"../evil.py"') from ca_block)))$$,'22023',null,'file names cannot leave the folder');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,files,2,editable}','true') from ca_block)))$$,'22023',null,'only Python files are editable');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,files,0,editable}','false') from ca_block)))$$,'22023',null,'at least one file is editable');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,files,1,name}','"Blocks.py"') from ca_block)))$$,'22023',null,'file names are unique ignoring case');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,tests,0,hidden}','true') from ca_block)))$$,'22023',null,'at least one test is visible');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,tests,0,name}','"visible.py"') from ca_block)))$$,'22023',null,'test files are named test_*.py');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,packages}','["numpy","requests"]') from ca_block)))$$,'22023',null,'only NumPy and SciPy may be loaded');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,support,0,base64}','"not base64!"') from ca_block)))$$,'22023',null,'support files must be base64');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,support,0,name}','"helper.py"') from ca_block)))$$,'22023',null,'support files are compiled modules only');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,files,0,url}','"https://x"') from ca_block)))$$,'22023',null,'unknown file fields are rejected');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,timeLimitSeconds}','5000') from ca_block)))$$,'22023',null,'time limit is bounded');
select throws_ok($$select private.course_validate_blocks(jsonb_build_array((select jsonb_set(b,'{content,network}','true') from ca_block)))$$,'22023',null,'unknown content fields are rejected');
select lives_ok($$select private.course_validate_blocks('[{"id":"q","type":"text","content":{"html":"<p>still fine</p>"}}]'::jsonb)$$,'existing block types still validate');

-- Fixtures: one published online-quiz course with labs configured, one with no labs --------------------------------
insert into auth.users(id,aud,role,email,email_confirmed_at)
select ('79500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','code-assign-'||n||'@example.test',now() from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Assignment Test',email,'+919999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '79500000%';
insert into public.courses(id,slug) values('79600000-0000-4000-8000-000000000001','code-assign-labs'),('79600000-0000-4000-8000-000000000002','code-assign-nolabs');
insert into public.course_versions(id,course_id,version,title,source_reference,source_sha256,status,access_tier,final_assessment_route,lab_policy_status)
values('79700000-0000-4000-8000-000000000001','79600000-0000-4000-8000-000000000001',1,'With labs','synthetic',repeat('c',64),'published','free','online_quiz','configured'),
 ('79700000-0000-4000-8000-000000000002','79600000-0000-4000-8000-000000000002',1,'No labs','synthetic',repeat('d',64),'published','free','online_quiz','none');
insert into public.course_modules(id,course_version_id,source_id,title,position)
values('79800000-0000-4000-8000-000000000001','79700000-0000-4000-8000-000000000001','m1','Module 1',0),
 ('79800000-0000-4000-8000-000000000002','79700000-0000-4000-8000-000000000002','m1','Module 1',0);
insert into public.course_lessons(id,course_version_id,module_id,source_id,title,position,is_sample)
values('79900000-0000-4000-8000-000000000001','79700000-0000-4000-8000-000000000001','79800000-0000-4000-8000-000000000001','a1','Assignment 1',0,false),
 ('79900000-0000-4000-8000-000000000002','79700000-0000-4000-8000-000000000002','79800000-0000-4000-8000-000000000002','t1','Text only',0,false);
insert into private.course_lesson_content values('79900000-0000-4000-8000-000000000001',jsonb_build_array((select b from ca_block))),
 ('79900000-0000-4000-8000-000000000002','[{"id":"a1","type":"text","content":{"html":"<p>Not an assignment</p>"}}]');
insert into public.course_lab_requirements(course_version_id,module_id,title,brief,completion_criteria,mandatory)
values('79700000-0000-4000-8000-000000000001','79800000-0000-4000-8000-000000000001','Lab 1','Measure the arm','Assessor approval',true);
insert into private.course_lab_forms(course_version_id,module_id,fields)
values('79700000-0000-4000-8000-000000000001','79800000-0000-4000-8000-000000000001','[{"key":"reach","label":"Reach (mm)","type":"number","required":true,"min":0,"max":1000}]');
insert into public.course_enrollments(user_id,course_version_id) values('79500000-0000-4000-8000-000000000001','79700000-0000-4000-8000-000000000001'),
 ('79500000-0000-4000-8000-000000000001','79700000-0000-4000-8000-000000000002'),('79500000-0000-4000-8000-000000000003','79700000-0000-4000-8000-000000000001');

-- Anonymous and unenrolled learners ----------------------------------------------------------------------------------
set local role anon;
select throws_ok($$select public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','a1')$$,'42501',null,'anonymous read denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','a1')$$,'42501','Course access denied','unenrolled read denied');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"x"}',null,null)$$,'42501','Course access denied','unenrolled save denied');
select throws_ok($$select count(*) from private.course_assignment_work$$,'42501',null,'learners cannot read the work table directly');

-- Enrolled learner: save code and scores -----------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','a1'),null,'no work before the first save');
select throws_ok($$select public.get_my_course_assignment('79900000-0000-4000-8000-000000000002','a1')$$,'22023',null,'a text block is not an assignment');
select throws_ok($$select public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','zz')$$,'22023',null,'missing block is rejected');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"world.py":"X = 2"}',null,null)$$,'22023',null,'provided files cannot be saved');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":1}',null,null)$$,'22023',null,'code must be text');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1',jsonb_build_object('blocks.py',repeat('x',200001)),null,null)$$,'22023',null,'a file is at most 200,000 characters');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"x"}','{"kind":"all","passed":5,"total":3}',null)$$,'22023',null,'passed cannot exceed total');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"x"}','{"kind":"all","passed":-1,"total":3}',null)$$,'22023',null,'negative scores are rejected');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"x"}','{"kind":"final","passed":1,"total":3}',null)$$,'22023',null,'result kind is visible or all');
select is(public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"def f(): return 1"}',null,null)->>'revision','1','first save creates revision 1');
select throws_ok($$select public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"x"}',null,7)$$,'PT409',null,'stale revision is rejected');
select is(public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"v2"}','{"kind":"visible","passed":2,"total":4}',1)#>>'{last,passed}','2','visible run is the last result');
select is(public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','a1')->'best','null'::jsonb,'a visible run does not set the best score');
select is(public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"v3"}','{"kind":"all","passed":6,"total":10}',2)#>>'{best,passed}','6','graded run sets the best score');
select is(public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"v4"}','{"kind":"all","passed":4,"total":10}',3)#>>'{best,passed}','6','a worse run keeps the best score');
select is(public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','a1')#>>'{last,passed}','4','the last run is kept separately');
select is(public.save_my_course_assignment('79900000-0000-4000-8000-000000000001','a1','{"blocks.py":"v5"}','{"kind":"all","passed":10,"total":10}',4)#>>'{best,passed}','10','a better run replaces the best score');
select is(public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','a1')#>>'{files,blocks.py}','v5','latest code is returned');
select is(jsonb_array_length(public.get_my_course_assignments('79700000-0000-4000-8000-000000000001')),1,'overview lists the assignment');
select ok(not (public.get_my_course_assignments('79700000-0000-4000-8000-000000000001')->0 ? 'files'),'overview does not return code');

-- Another learner sees only their own work ----------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is(public.get_my_course_assignment('79900000-0000-4000-8000-000000000001','a1'),null,'work is private to each learner');
select is(public.get_my_course_assignments('79700000-0000-4000-8000-000000000001'),'[]'::jsonb,'overview is private to each learner');

-- Labs on the online-quiz route ---------------------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"79500000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select is(public.get_my_course_labs('79700000-0000-4000-8000-000000000001')->>'available','true','online-quiz course with configured labs offers labs');
select is(public.get_my_course_labs('79700000-0000-4000-8000-000000000001')#>>'{assessment,labsRequired}','1','lab summary counts required checkpoints');
select is(public.get_my_course_labs('79700000-0000-4000-8000-000000000002')->>'available','false','online-quiz course without labs offers none');
select is(public.save_my_course_lab('79700000-0000-4000-8000-000000000001','79800000-0000-4000-8000-000000000001','{"reach":420}','Measured twice',array[]::text[],false,true,null)->>'status','submitted','lab checkpoint can be submitted on the online-quiz route');
select throws_ok($$select public.save_my_course_lab('79700000-0000-4000-8000-000000000002','79800000-0000-4000-8000-000000000002','{}','',array[]::text[],false,false,null)$$,'42501',null,'no lab saving without a configured lab policy');

select * from finish();
rollback;
