-- Online final quiz: server-graded attempts for courses whose final assessment route is online_quiz.
-- Learners receive questions without answers or explanations and see only their score and pass/fail.
-- No certificate is issued here. Lab policy is unchanged.

alter table private.course_admin_audit drop constraint course_admin_audit_action_check;
alter table private.course_admin_audit add constraint course_admin_audit_action_check
  check (action = any (array['metadata','lesson','labs','review','publish','withdraw','clone','cover','final_quiz']));

create table private.course_final_quizzes (
 course_version_id uuid primary key references public.course_versions(id),
 source_key text not null check (source_key in ('questionBank','legacyFinalExam')),
 questions jsonb not null,
 pass_percent integer not null check (pass_percent between 1 and 100),
 time_limit_minutes integer not null check (time_limit_minutes between 5 and 480),
 retake_hours integer not null check (retake_hours between 0 and 720),
 configured_at timestamptz not null default clock_timestamp()
);

create table private.course_final_quiz_attempts (
 id uuid primary key default extensions.gen_random_uuid(),
 user_id uuid not null,
 course_version_id uuid not null,
 started_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null,
 submitted_at timestamptz,
 outcome text check (outcome in ('graded','expired')),
 answers jsonb,
 question_count integer not null check (question_count > 0),
 correct_count integer,
 percent numeric(5,2),
 passed boolean,
 foreign key (user_id,course_version_id) references public.course_enrollments(user_id,course_version_id),
 check ((submitted_at is null) = (outcome is null)),
 check (outcome is null or (correct_count is not null and percent is not null and passed is not null))
);
create unique index course_final_quiz_one_open_attempt on private.course_final_quiz_attempts(user_id,course_version_id) where submitted_at is null;
create index course_final_quiz_attempt_history on private.course_final_quiz_attempts(user_id,course_version_id,started_at desc);

alter table private.course_final_quizzes enable row level security;
alter table private.course_final_quiz_attempts enable row level security;
revoke all on private.course_final_quizzes, private.course_final_quiz_attempts from public,anon,authenticated;
grant all on private.course_final_quizzes, private.course_final_quiz_attempts to service_role;

create function private.course_validate_final_quiz(p_questions jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare q jsonb; o jsonb; ids text[] := '{}'; option_ids text[];
begin
 if coalesce(jsonb_typeof(p_questions),'') <> 'array' or jsonb_array_length(p_questions) not between 1 and 200 then
  raise exception 'A final quiz needs between 1 and 200 questions' using errcode='22023'; end if;
 for q in select value from jsonb_array_elements(p_questions) loop
  if coalesce(jsonb_typeof(q),'') <> 'object'
   or coalesce(jsonb_typeof(q->'id'),'') <> 'string' or coalesce(length(btrim(q->>'id')),0) not between 1 and 100 or (q->>'id') = any(ids)
   or coalesce(jsonb_typeof(q->'question'),'') <> 'string' or coalesce(length(btrim(q->>'question')),0) not between 1 and 5000
   or coalesce(jsonb_typeof(q->'options'),'') <> 'array' or jsonb_array_length(q->'options') not between 2 and 8
   or coalesce(jsonb_typeof(q->'correctAnswerId'),'') <> 'string' then
   raise exception 'Invalid final quiz question' using errcode='22023'; end if;
  ids := ids || (q->>'id'); option_ids := '{}';
  for o in select value from jsonb_array_elements(q->'options') loop
   if coalesce(jsonb_typeof(o),'') <> 'object'
    or coalesce(jsonb_typeof(o->'id'),'') <> 'string' or coalesce(length(btrim(o->>'id')),0) not between 1 and 50 or (o->>'id') = any(option_ids)
    or coalesce(jsonb_typeof(o->'text'),'') <> 'string' or coalesce(length(btrim(o->>'text')),0) not between 1 and 2000 then
    raise exception 'Invalid final quiz option' using errcode='22023'; end if;
   option_ids := option_ids || (o->>'id');
  end loop;
  if not ((q->>'correctAnswerId') = any(option_ids)) then raise exception 'Each final quiz answer must match one of its options' using errcode='22023'; end if;
 end loop;
end;
$$;

-- Admin: attach a stored question set to a draft version (draft-only, audited, invalidates review like other edits).
create function public.admin_set_course_final_quiz(p_version_id uuid,p_expected_revision bigint,p_source text,p_pass_percent integer,p_time_limit_minutes integer,p_retake_hours integer,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.course_versions; q jsonb;
begin
 v:=private.course_admin_lock(p_version_id,p_expected_revision,p_note);
 if p_source is null or p_source not in ('questionBank','legacyFinalExam') then raise exception 'Choose questionBank or legacyFinalExam as the final quiz source' using errcode='22023'; end if;
 if p_pass_percent is null or p_pass_percent not between 1 and 100 or p_time_limit_minutes is null or p_time_limit_minutes not between 5 and 480
  or p_retake_hours is null or p_retake_hours not between 0 and 720 then raise exception 'Invalid final quiz settings' using errcode='22023'; end if;
 select a.material->p_source into q from private.course_assessment_material a where a.course_version_id=v.id;
 if q is null then raise exception 'No stored assessment questions for that source' using errcode='22023'; end if;
 perform private.course_validate_final_quiz(q);
 insert into private.course_final_quizzes(course_version_id,source_key,questions,pass_percent,time_limit_minutes,retake_hours)
 values(v.id,p_source,q,p_pass_percent,p_time_limit_minutes,p_retake_hours)
 on conflict(course_version_id) do update set source_key=excluded.source_key,questions=excluded.questions,pass_percent=excluded.pass_percent,
  time_limit_minutes=excluded.time_limit_minutes,retake_hours=excluded.retake_hours,configured_at=clock_timestamp();
 perform private.course_admin_record(v.id,'final_quiz',p_note);
end;
$$;

-- Clone: identical to the live definition plus the final quiz copy.
create or replace function public.admin_clone_course_version(p_version_id uuid, p_expected_revision bigint, p_note text)
 returns uuid language plpgsql security definer set search_path to '' as $function$
declare v public.course_versions; n uuid; m record; l record; new_m uuid; new_l uuid; next_version integer;
begin
 v:=private.course_admin_lock(p_version_id,p_expected_revision,p_note,false);
 -- Serialize clones from different source versions of one course as well.
 perform 1 from public.courses where id=v.course_id for update;
 select max(version)+1 into next_version from public.course_versions where course_id=v.course_id;
 insert into public.course_versions(course_id,version,title,description,source_reference,source_sha256,access_tier,final_assessment_route,lab_policy_status,cloned_from_version_id)
 values(v.course_id,next_version,v.title,v.description,v.source_reference,v.source_sha256,v.access_tier,v.final_assessment_route,v.lab_policy_status,v.id) returning id into n;
 for m in select * from public.course_modules where course_version_id=v.id order by position loop
  insert into public.course_modules(course_version_id,source_id,title,position) values(n,m.source_id,m.title,m.position) returning id into new_m;
  for l in select * from public.course_lessons where module_id=m.id order by position loop
   insert into public.course_lessons(course_version_id,module_id,source_id,title,position,is_sample) values(n,new_m,l.source_id,l.title,l.position,l.is_sample) returning id into new_l;
   insert into private.course_lesson_content(lesson_id,blocks) select new_l,blocks from private.course_lesson_content where lesson_id=l.id;
  end loop;
  insert into public.course_lab_requirements(course_version_id,module_id,title,brief,completion_criteria,mandatory,location)
   select n,new_m,title,brief,completion_criteria,mandatory,location from public.course_lab_requirements where course_version_id=v.id and module_id=m.id;
 end loop;
 insert into public.course_lab_requirements(course_version_id,title,brief,completion_criteria,mandatory,location)
  select n,title,brief,completion_criteria,mandatory,location from public.course_lab_requirements where course_version_id=v.id and module_id is null;
 insert into private.course_assessment_material select n,material from private.course_assessment_material where course_version_id=v.id;
 insert into private.course_final_quizzes(course_version_id,source_key,questions,pass_percent,time_limit_minutes,retake_hours)
  select n,source_key,questions,pass_percent,time_limit_minutes,retake_hours from private.course_final_quizzes where course_version_id=v.id;
 perform private.course_admin_record(n,'clone',p_note,false);
 return n;
end;
$function$;

-- Publish: identical to the live definition plus the online quiz guard.
create or replace function public.admin_publish_course_version(p_version_id uuid, p_expected_revision bigint, p_note text)
 returns void language plpgsql security definer set search_path to '' as $function$
declare v public.course_versions; b jsonb;
begin
 v:=private.course_admin_lock(p_version_id,p_expected_revision,p_note);
 if v.reviewed_revision is distinct from v.revision then raise exception 'Review the current revision before publication' using errcode='22023'; end if;
 if v.access_tier='unassigned' then raise exception 'Assign learning access before publication' using errcode='22023'; end if;
 if (v.lab_policy_status in ('none','unassigned') and exists(select 1 from public.course_lab_requirements where course_version_id=v.id))
 or (v.lab_policy_status='configured' and not exists(select 1 from public.course_lab_requirements where course_version_id=v.id)) then raise exception 'Lab policy and requirements disagree' using errcode='22023'; end if;
 if v.final_assessment_route='online_quiz' then
  if not exists(select 1 from private.course_final_quizzes where course_version_id=v.id) then raise exception 'Configure the online final quiz before publication' using errcode='22023'; end if;
  perform private.course_validate_final_quiz((select questions from private.course_final_quizzes where course_version_id=v.id));
 end if;
 if not exists(select 1 from public.course_modules where course_version_id=v.id)
 or exists(select 1 from public.course_modules m where m.course_version_id=v.id and not exists(select 1 from public.course_lessons where module_id=m.id))
 or exists(select 1 from public.course_lessons l left join private.course_lesson_content c on c.lesson_id=l.id where l.course_version_id=v.id and c.lesson_id is null)
 then raise exception 'Each module needs lessons and each lesson needs content' using errcode='22023'; end if;
 for b in select c.blocks from private.course_lesson_content c join public.course_lessons l on l.id=c.lesson_id where l.course_version_id=v.id loop perform private.course_validate_blocks(b); end loop;
 update public.course_versions set status='published',revision=revision+1,reviewed_revision=revision+1 where id=v.id;
 perform private.course_admin_record(v.id,'publish',p_note,false);
end;
$function$;

-- Admin detail: identical to the live definition plus a final quiz summary (no questions or answers).
create or replace function public.admin_get_course_version(p_version_id uuid)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
 perform private.course_admin_require();
 if not exists(select 1 from public.course_versions where id=p_version_id) then raise exception 'Course version not found' using errcode='22023'; end if;
 return jsonb_build_object('course',private.course_admin_row(p_version_id),
 'modules',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'lessons',
  coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'isSample',l.is_sample) order by l.position) from public.course_lessons l where l.module_id=m.id),'[]'::jsonb)) order by m.position)
  from public.course_modules m where m.course_version_id=p_version_id),'[]'::jsonb),
 'labRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'moduleId',r.module_id,'title',r.title,'brief',r.brief,'completionCriteria',r.completion_criteria,'mandatory',r.mandatory,'location',r.location) order by r.id) from public.course_lab_requirements r where r.course_version_id=p_version_id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actorId',a.actor_id,'createdAt',a.created_at,'note',a.note,'revision',a.revision) order by a.created_at desc,a.id) from private.course_admin_audit a where a.course_version_id=p_version_id),'[]'::jsonb),
 'finalQuiz',(select jsonb_build_object('source',f.source_key,'questionCount',jsonb_array_length(f.questions),'passPercent',f.pass_percent,'timeLimitMinutes',f.time_limit_minutes,'retakeHours',f.retake_hours,'configuredAt',f.configured_at)
  from private.course_final_quizzes f where f.course_version_id=p_version_id));
end;
$function$;

-- Close attempts whose time ran out (plus a two-minute grace for slow connections) as expired with no marks.
create function private.course_final_quiz_close_expired(p_user_id uuid,p_version_id uuid) returns void
language sql security definer set search_path='' as $$
 update private.course_final_quiz_attempts set submitted_at=expires_at,outcome='expired',answers='{}'::jsonb,correct_count=0,percent=0,passed=false
 where user_id=p_user_id and course_version_id=p_version_id and submitted_at is null and expires_at+interval '2 minutes' < clock_timestamp();
$$;

create function private.course_final_quiz_eligible(p_version_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.course_can_learn(p_version_id)
  and exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published' and v.final_assessment_route='online_quiz')
  and exists(select 1 from private.course_final_quizzes f where f.course_version_id=p_version_id)
  and exists(select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=p_version_id);
$$;

create function private.course_final_quiz_summary(p_version_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 with f as (select * from private.course_final_quizzes where course_version_id=p_version_id),
 a as (select * from private.course_final_quiz_attempts where user_id=auth.uid() and course_version_id=p_version_id),
 last_fail as (select max(submitted_at) as at from a where passed is false)
 select jsonb_build_object(
  'available',true,'eligible',private.course_final_quiz_eligible(p_version_id),
  'questionCount',jsonb_array_length(f.questions),'passPercent',f.pass_percent,'timeLimitMinutes',f.time_limit_minutes,'retakeHours',f.retake_hours,
  'attempts',(select count(*) from a where submitted_at is not null),
  'bestPercent',(select max(percent) from a where submitted_at is not null),
  'passed',coalesce((select bool_or(passed) from a),false),
  'passedAt',(select min(submitted_at) from a where passed),
  'openAttempt',(select jsonb_build_object('id',id,'expiresAt',expires_at) from a where submitted_at is null),
  'nextAttemptAt',case when coalesce((select bool_or(passed) from a),false) or (select at from last_fail) is null then null
   when (select at from last_fail)+make_interval(hours=>f.retake_hours) > clock_timestamp() then (select at from last_fail)+make_interval(hours=>f.retake_hours) end)
 from f;
$$;

create function public.get_my_course_final_quiz(p_version_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published' and v.final_assessment_route='online_quiz')
  or not exists(select 1 from private.course_final_quizzes where course_version_id=p_version_id) then return jsonb_build_object('available',false); end if;
 if exists(select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=p_version_id) then
  perform private.course_final_quiz_close_expired(auth.uid(),p_version_id); end if;
 return private.course_final_quiz_summary(p_version_id);
end;
$$;

create function public.start_course_final_quiz(p_version_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f private.course_final_quizzes; a private.course_final_quiz_attempts; next_at timestamptz;
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 perform 1 from public.course_enrollments where user_id=auth.uid() and course_version_id=p_version_id for update;
 if not found or not private.course_final_quiz_eligible(p_version_id) then raise exception 'Course access denied' using errcode='42501'; end if;
 select * into f from private.course_final_quizzes where course_version_id=p_version_id;
 perform private.course_final_quiz_close_expired(auth.uid(),p_version_id);
 if exists(select 1 from private.course_final_quiz_attempts where user_id=auth.uid() and course_version_id=p_version_id and passed) then
  raise exception 'Final quiz already passed' using errcode='22023'; end if;
 select * into a from private.course_final_quiz_attempts where user_id=auth.uid() and course_version_id=p_version_id and submitted_at is null;
 if not found then
  select max(submitted_at)+make_interval(hours=>f.retake_hours) into next_at from private.course_final_quiz_attempts
   where user_id=auth.uid() and course_version_id=p_version_id and passed is false;
  if next_at is not null and next_at > clock_timestamp() then
   raise exception 'Next attempt available at %', to_char(next_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') using errcode='22023'; end if;
  insert into private.course_final_quiz_attempts(user_id,course_version_id,expires_at,question_count)
  values(auth.uid(),p_version_id,clock_timestamp()+make_interval(mins=>f.time_limit_minutes),jsonb_array_length(f.questions)) returning * into a;
 end if;
 return jsonb_build_object('attemptId',a.id,'startedAt',a.started_at,'expiresAt',a.expires_at,'passPercent',f.pass_percent,
  'questions',(select jsonb_agg(jsonb_build_object('id',q->>'id','question',q->>'question','options',
    (select jsonb_agg(jsonb_build_object('id',o->>'id','text',o->>'text') order by oi) from jsonb_array_elements(q->'options') with ordinality x(o,oi))) order by qi)
   from jsonb_array_elements(f.questions) with ordinality y(q,qi)));
end;
$$;

create function public.submit_course_final_quiz(p_attempt_id uuid,p_answers jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.course_final_quiz_attempts; f private.course_final_quizzes; kept jsonb; n_correct integer; pct numeric(5,2); ok boolean;
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 select * into a from private.course_final_quiz_attempts where id=p_attempt_id and user_id=auth.uid() for update;
 if not found or not private.course_final_quiz_eligible(a.course_version_id) then raise exception 'Course access denied' using errcode='42501'; end if;
 if a.submitted_at is not null then raise exception 'This attempt has already been submitted' using errcode='22023'; end if;
 if p_answers is null or jsonb_typeof(p_answers) <> 'object' or (select count(*) from jsonb_object_keys(p_answers)) > 500 then
  raise exception 'Answers must be an object of question ids to option ids' using errcode='22023'; end if;
 select * into f from private.course_final_quizzes where course_version_id=a.course_version_id;
 if clock_timestamp() > a.expires_at+interval '2 minutes' then
  update private.course_final_quiz_attempts set submitted_at=expires_at,outcome='expired',answers='{}'::jsonb,correct_count=0,percent=0,passed=false where id=a.id returning * into a;
 else
  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into kept from jsonb_each(p_answers) e
   where jsonb_typeof(e.value)='string' and length(e.value#>>'{}') <= 50
   and exists(select 1 from jsonb_array_elements(f.questions) q where q->>'id'=e.key);
  select count(*) into n_correct from jsonb_array_elements(f.questions) q where kept->>(q->>'id') = q->>'correctAnswerId';
  pct := round(100.0*n_correct/a.question_count,2); ok := pct >= f.pass_percent;
  update private.course_final_quiz_attempts set submitted_at=clock_timestamp(),outcome='graded',answers=kept,correct_count=n_correct,percent=pct,passed=ok
   where id=a.id returning * into a;
 end if;
 return jsonb_build_object('attemptId',a.id,'outcome',a.outcome,'correct',a.correct_count,'total',a.question_count,'percent',a.percent,'passed',a.passed,
  'passPercent',f.pass_percent,'submittedAt',a.submitted_at,'nextAttemptAt',case when a.passed then null else a.submitted_at+make_interval(hours=>f.retake_hours) end);
end;
$$;

revoke all on function private.course_validate_final_quiz(jsonb),private.course_final_quiz_close_expired(uuid,uuid),private.course_final_quiz_eligible(uuid),private.course_final_quiz_summary(uuid) from public,anon,authenticated;
revoke all on function public.admin_set_course_final_quiz(uuid,bigint,text,integer,integer,integer,text),public.get_my_course_final_quiz(uuid),public.start_course_final_quiz(uuid),public.submit_course_final_quiz(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.admin_set_course_final_quiz(uuid,bigint,text,integer,integer,integer,text),public.get_my_course_final_quiz(uuid),public.start_course_final_quiz(uuid),public.submit_course_final_quiz(uuid,jsonb) to authenticated;
