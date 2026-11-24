-- Browser-graded code assignments (24 November 2026), first used by Robotic Manipulation.
-- 1. A new lesson block type, code_assignment: a brief, starter and provided files, visible and hidden pytest files, and
--    optional compiled support modules that some hidden tests compare against. The learner's browser runs the tests with
--    Pyodide (NumPy and SciPy), so the hidden tests travel with the lesson and scores are self-reported. Scores are progress
--    only: they never count towards a pass or a certificate.
-- 2. private.course_assignment_work keeps each learner's code and their last and best scores, with two learner RPCs.
-- 3. Lab checkpoints also work on courses whose final assessment is the online quiz, when their lab policy is configured
--    (Robotic Manipulation: online quiz plus five SO-101 lab checkpoints). Nothing else about labs changes.
-- The validator and both lab functions are rebuilt from their current definitions; the guard below stops the migration
-- if any of them changed since 13 November 2026, so a newer scene registration or lab change is never overwritten.
begin;

do $guard$
declare h text;
begin
 select md5(prosrc) into h from pg_proc where oid='private.course_validate_blocks(jsonb)'::regprocedure;
 if h is distinct from 'd3ba424db4379f4511647f346b8a090f' then raise exception 'course_validate_blocks changed since 202611130101 (md5 %); rebuild this migration from the live definition', h; end if;
 select md5(prosrc) into h from pg_proc where oid='public.get_my_course_labs(uuid)'::regprocedure;
 if h is distinct from 'a45033e8f5cf12f25f2b0e0c74f533a6' then raise exception 'get_my_course_labs changed since 202610202002 (md5 %)', h; end if;
 select md5(prosrc) into h from pg_proc where oid='public.save_my_course_lab(uuid,uuid,jsonb,text,text[],boolean,boolean,integer)'::regprocedure;
 if h is distinct from '31d6d2e8129731086259a2a8f911b9b9' then raise exception 'save_my_course_lab changed since 202610202002 (md5 %)', h; end if;
end $guard$;

CREATE OR REPLACE FUNCTION private.course_validate_blocks(p_blocks jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare b jsonb; c jsonb; q jsonb; o jsonb; t text; k text; allowed text[]; low numeric; high numeric; increment numeric; v numeric; names text[];
begin
 if p_blocks is null or jsonb_typeof(p_blocks)<>'array' or octet_length(p_blocks::text)>1048576 then raise exception 'Lesson blocks must be an array under 1 MiB' using errcode='22023'; end if;
 if jsonb_array_length(p_blocks) not between 1 and 500 then raise exception 'A lesson requires 1 to 500 blocks' using errcode='22023'; end if;
 if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_blocks)x) then raise exception 'Block identifiers must be unique' using errcode='22023'; end if;
 for b in select value from jsonb_array_elements(p_blocks) loop
  c:=b->'content'; t:=b->>'type';
  if jsonb_typeof(b)<>'object' or jsonb_typeof(b->'id') is distinct from 'string' or length(b->>'id') not between 1 and 200 or jsonb_typeof(c) is distinct from 'object'
   then raise exception 'Each block needs an id and content object' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(b)x where x not in ('id','type','content')) then raise exception 'Unsupported block field' using errcode='22023'; end if;
  allowed:=case t
   when 'heading' then array['text','html','level'] when 'text' then array['html']
   when 'module_intro' then array['courseTitle','moduleObjective'] when 'definition' then array['term','definitionHtml']
   when 'callout' then array['title','bodyHtml','variant'] when 'list' then array['items','style']
   when 'table' then array['headers','rows'] when 'code' then array['code','filename','language','isConceptual']
   when 'math' then array['latex','caption'] when 'blockquote' then array['html','text']
   when 'illustration' then array['name','svgCode','caption'] when 'micro_exercise' then array['title','promptHtml','placeholder']
   when 'interactive_diagram' then array['sceneId','parameters','caption','svgCode','description']
   when 'quiz' then array['questions']
   when 'code_assignment' then array['title','briefHtml','files','tests','support','packages','timeLimitSeconds','python'] else null end;
  if allowed is null then raise exception 'Unsupported lesson block type' using errcode='22023'; end if;
  for k in select jsonb_object_keys(c) loop
   if not k=any(allowed) then raise exception 'Unsupported content field: %',k using errcode='22023'; end if;
   if k not in ('level','items','headers','rows','questions','isConceptual','parameters','files','tests','support','packages','timeLimitSeconds') and jsonb_typeof(c->k)<>'string' then raise exception 'Content % must be a string',k using errcode='22023'; end if;
  end loop;
  if (t='heading' and not (c ? 'text' or c ? 'html')) or (t='heading' and c ? 'level' and (jsonb_typeof(c->'level')<>'number' or c->>'level' !~ '^[1-6]$'))
   or (t='text' and not c ? 'html') or (t='module_intro' and not c ? 'moduleObjective')
   or (t='definition' and not c ?& array['term','definitionHtml']) or (t='callout' and not c ?& array['title','bodyHtml'])
   or (t='code' and not c ? 'code') or (t='math' and not c ? 'latex') or (t='blockquote' and not (c ? 'html' or c ? 'text'))
   or (t='illustration' and (not c ? 'svgCode' or length(btrim(c->>'svgCode'))=0))
   or (t='micro_exercise' and not c ? 'promptHtml') or (c ? 'isConceptual' and jsonb_typeof(c->'isConceptual')<>'boolean')
   then raise exception 'Missing or invalid lesson content for %',t using errcode='22023'; end if;
  if t='interactive_diagram' then
   if not c ?& array['sceneId','parameters','caption','svgCode','description']
    or jsonb_typeof(c->'parameters') is distinct from 'object'
    or length(btrim(c->>'caption'))=0 or length(btrim(c->>'svgCode'))=0 or length(btrim(c->>'description'))=0
    then raise exception 'Interactive diagram requires parameters and accessible fallback' using errcode='22023'; end if;
   if exists(select 1 from jsonb_object_keys(c->'parameters') x where x<>'value')
    or jsonb_typeof(c->'parameters'->'value') is distinct from 'number'
    then raise exception 'Invalid interactive parameters' using errcode='22023'; end if;
   case c->>'sceneId'
    when 'lathe-motion' then low:=0; high:=10; increment:=0.25;
    when 'tool-geometry' then low:=0; high:=25; increment:=1;
    when 'lathe-taper' then low:=0; high:=10; increment:=0.5;
    when 'lathe-thread' then low:=1; high:=5; increment:=0.25;
    when 'milling-motion' then low:=0; high:=360; increment:=15;
    when 'milling-index' then low:=3; high:=24; increment:=1;
    when 'milling-workholding' then low:=0.2; high:=0.8; increment:=0.1;
    when 'pic-timing' then low:=1; high:=32; increment:=1;
    when 'pic-register' then low:=0; high:=255; increment:=1;
    when 'srm-exploded' then low:=0; high:=40; increment:=5;
    when 'srm-rotation' then low:=0; high:=60; increment:=1;
    when 'srm-gap' then low:=0.1; high:=0.3; increment:=0.01;
    when 'axial-exploded' then low:=0; high:=40; increment:=5;
    when 'bldc-rotating-field' then low:=0; high:=360; increment:=5;
    when 'bevel-hypoid' then low:=0; high:=20; increment:=2;
    when 'worm-backdrive' then low:=0.02; high:=0.12; increment:=0.01;
    when 'differential-turn' then low:=1; high:=10; increment:=0.5;
    when 'rv-two-stage' then low:=0; high:=1080; increment:=15;
    else raise exception 'Unregistered interactive scene' using errcode='22023';
   end case;
   v:=(c->'parameters'->>'value')::numeric;
   if v<low or v>high or abs((v-low)/increment-round((v-low)/increment))>=0.00000001 then raise exception 'Interactive value outside scene range' using errcode='22023'; end if;
  end if;
  if t in ('list','table') then
   k:=case t when 'list' then 'items' else 'headers' end;
   if jsonb_typeof(c->k) is distinct from 'array' then raise exception 'Lesson list/header must be an array' using errcode='22023'; end if;
   if exists(select 1 from jsonb_array_elements(c->k)x where jsonb_typeof(x)<>'string') then raise exception 'List/header values must be strings' using errcode='22023'; end if;
   if t='table' then
    if jsonb_typeof(c->'rows') is distinct from 'array' then raise exception 'Table rows must be an array' using errcode='22023'; end if;
    for q in select value from jsonb_array_elements(c->'rows') loop
     if jsonb_typeof(q)<>'array' then raise exception 'Each table row must be an array' using errcode='22023'; end if;
     if exists(select 1 from jsonb_array_elements(q)x where jsonb_typeof(x)<>'string') then raise exception 'Table cells must be strings' using errcode='22023'; end if;
    end loop;
   end if;
  end if;
  if t='quiz' then
   if jsonb_typeof(c->'questions') is distinct from 'array' then raise exception 'Practice questions must be an array' using errcode='22023'; end if;
   for q in select value from jsonb_array_elements(c->'questions') loop
    if jsonb_typeof(q)<>'object' or not q ?& array['id','question','options','explanation'] then raise exception 'Invalid practice question' using errcode='22023'; end if;
    if exists(select 1 from jsonb_object_keys(q)x where x not in ('id','question','options','explanation','points')) or jsonb_typeof(q->'id')<>'string' or jsonb_typeof(q->'question')<>'string' or jsonb_typeof(q->'explanation')<>'string' or jsonb_typeof(q->'options')<>'array' or (q ? 'points' and jsonb_typeof(q->'points')<>'number') then raise exception 'Invalid practice question fields' using errcode='22023'; end if;
    for o in select value from jsonb_array_elements(q->'options') loop
     if jsonb_typeof(o)<>'object' or not o ?& array['id','text','isCorrect'] then raise exception 'Invalid practice answer' using errcode='22023'; end if;
     if exists(select 1 from jsonb_object_keys(o)x where x not in ('id','text','isCorrect')) or jsonb_typeof(o->'id')<>'string' or jsonb_typeof(o->'text')<>'string' or jsonb_typeof(o->'isCorrect')<>'boolean' then raise exception 'Invalid practice answer fields' using errcode='22023'; end if;
    end loop;
   end loop;
  end if;
   if t='code_assignment' then
   -- Browser-graded Python assignment (24 November 2026). Files are written to a scratch folder in the learner's
   -- browser and run with pytest under Pyodide; the server stores only the learner's code and self-reported scores.
   if not c ?& array['title','briefHtml','files','tests'] or length(btrim(c->>'title'))=0
    or jsonb_typeof(c->'files') is distinct from 'array' or jsonb_array_length(c->'files') not between 1 and 30
    or jsonb_typeof(c->'tests') is distinct from 'array' or jsonb_array_length(c->'tests') not between 1 and 10
    or (c ? 'support' and (jsonb_typeof(c->'support') is distinct from 'array' or jsonb_array_length(c->'support')>10))
    or (c ? 'packages' and (jsonb_typeof(c->'packages') is distinct from 'array'
     or exists(select 1 from jsonb_array_elements(c->'packages')x where x not in ('"numpy"'::jsonb,'"scipy"'::jsonb))))
    or (c ? 'timeLimitSeconds' and (jsonb_typeof(c->'timeLimitSeconds')<>'number' or (c->>'timeLimitSeconds')::numeric not between 10 and 900))
    or (c ? 'python' and c->>'python' !~ '^3\.[0-9]{1,2}$')
    then raise exception 'Code assignment requires a title, brief, files and tests' using errcode='22023'; end if;
   for q in select value from jsonb_array_elements(c->'files') loop
    if jsonb_typeof(q)<>'object' or not q ?& array['name','code','editable'] or exists(select 1 from jsonb_object_keys(q)x where x not in ('name','code','editable'))
     or jsonb_typeof(q->'name')<>'string' or q->>'name' !~ '^[A-Za-z_][A-Za-z0-9_]{0,60}\.(py|urdf|json|csv|txt)$'
     or jsonb_typeof(q->'code')<>'string' or jsonb_typeof(q->'editable')<>'boolean' or ((q->>'editable')::boolean and q->>'name' !~ '\.py$')
     then raise exception 'Invalid code assignment file' using errcode='22023'; end if;
   end loop;
   for q in select value from jsonb_array_elements(c->'tests') loop
    if jsonb_typeof(q)<>'object' or not q ?& array['name','code','hidden'] or exists(select 1 from jsonb_object_keys(q)x where x not in ('name','code','hidden'))
     or jsonb_typeof(q->'name')<>'string' or q->>'name' !~ '^test_[A-Za-z0-9_]{1,60}\.py$'
     or jsonb_typeof(q->'code')<>'string' or jsonb_typeof(q->'hidden')<>'boolean'
     then raise exception 'Invalid code assignment test' using errcode='22023'; end if;
   end loop;
   for q in select value from jsonb_array_elements(coalesce(c->'support','[]'::jsonb)) loop
    if jsonb_typeof(q)<>'object' or not q ?& array['name','base64'] or exists(select 1 from jsonb_object_keys(q)x where x not in ('name','base64'))
     or jsonb_typeof(q->'name')<>'string' or q->>'name' !~ '^[A-Za-z_][A-Za-z0-9_]{0,60}\.pyc$'
     or jsonb_typeof(q->'base64')<>'string' or q->>'base64' !~ '^[A-Za-z0-9+/]+={0,2}$'
     then raise exception 'Invalid code assignment support file' using errcode='22023'; end if;
   end loop;
   select array_agg(x->>'name') into names from (select value x from jsonb_array_elements(c->'files') union all select value from jsonb_array_elements(c->'tests')
    union all select value from jsonb_array_elements(coalesce(c->'support','[]'::jsonb))) n;
   if cardinality(names)<>(select count(distinct lower(x)) from unnest(names)x)
    or not exists(select 1 from jsonb_array_elements(c->'files')x where (x->>'editable')::boolean)
    or not exists(select 1 from jsonb_array_elements(c->'tests')x where not (x->>'hidden')::boolean)
    then raise exception 'Code assignment needs unique file names, an editable file and a visible test' using errcode='22023'; end if;
  end if;
 end loop;
end;
$function$;


-- Labs on the online-quiz route ------------------------------------------------------------------------------------
create or replace function public.get_my_course_labs(p_version_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published'
  and (v.final_assessment_route='lab_written_and_practical' or v.lab_policy_status='configured'))
  or not exists(select 1 from private.course_lab_forms where course_version_id=p_version_id) then return jsonb_build_object('available',false); end if;
 if not private.course_can_learn(p_version_id) then raise exception 'Course access denied' using errcode='42501'; end if;
 return jsonb_build_object('available',true,
  'enrolled',exists(select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=p_version_id))
  || private.course_lab_summary(auth.uid(), p_version_id);
end;
$$;

create or replace function public.save_my_course_lab(p_version_id uuid, p_module_id uuid, p_values jsonb, p_notes text, p_photos text[], p_consent boolean, p_submit boolean, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f private.course_lab_forms; s private.course_lab_submissions; prefix text; p text;
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published'
  and (v.final_assessment_route='lab_written_and_practical' or v.lab_policy_status='configured'))
  or not private.course_can_learn(p_version_id)
  or not exists(select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=p_version_id) then
  raise exception 'Course access denied' using errcode='42501'; end if;
 select * into f from private.course_lab_forms where course_version_id=p_version_id and module_id=p_module_id;
 if not found then raise exception 'This module has no lab checkpoint' using errcode='22023'; end if;
 if p_notes is null or length(p_notes) > 10000 then raise exception 'Notes must be under 10,000 characters' using errcode='22023'; end if;
 prefix := auth.uid()::text || '/' || p_version_id::text || '/' || p_module_id::text || '/';
 if p_photos is null or cardinality(p_photos) > 10 then raise exception 'At most 10 photos per checkpoint' using errcode='22023'; end if;
 foreach p in array p_photos loop
  if left(p, length(prefix)) <> prefix or p ~ '\.\.' or length(p) > 300 then raise exception 'Invalid photo path' using errcode='22023'; end if;
 end loop;
 perform private.course_lab_validate(f.fields, p_values, coalesce(p_submit,false));
 select * into s from private.course_lab_submissions where user_id=auth.uid() and course_version_id=p_version_id and module_id=p_module_id for update;
 if found then
  if s.status in ('submitted','approved') then raise exception 'This checkpoint is with the assessor or already approved, so it cannot be edited' using errcode='22023'; end if;
  if p_expected_revision is distinct from s.revision then raise exception 'This checkpoint changed in another window; reload before saving' using errcode='PT409'; end if;
  update private.course_lab_submissions set field_values=p_values, notes=p_notes, photos=p_photos, share_consent=coalesce(p_consent,false),
   status=case when p_submit then 'submitted' else status end, submitted_at=case when p_submit then now() else submitted_at end,
   revision=revision+1, updated_at=now() where id=s.id returning * into s;
 else
  insert into private.course_lab_submissions(user_id,course_version_id,module_id,status,field_values,notes,photos,share_consent,submitted_at)
  values (auth.uid(),p_version_id,p_module_id,case when p_submit then 'submitted' else 'draft' end,p_values,p_notes,p_photos,coalesce(p_consent,false),case when p_submit then now() end)
  returning * into s;
 end if;
 insert into private.course_lab_events(submission_id,actor,action,snapshot) values (s.id,auth.uid(),case when p_submit then 'submit' else 'save' end,
  case when p_submit then jsonb_build_object('values',s.field_values,'notes',s.notes,'photos',to_jsonb(s.photos)) end);
 return private.course_lab_submission_json(s);
end;
$$;

-- Assignment work ---------------------------------------------------------------------------------------------------
create table private.course_assignment_work (
 user_id uuid not null references auth.users(id) on delete cascade,
 course_version_id uuid not null,
 lesson_id uuid not null,
 block_id text not null check (length(block_id) between 1 and 200),
 files jsonb not null default '{}'::jsonb check (jsonb_typeof(files)='object' and octet_length(files::text) <= 409600),
 last_kind text check (last_kind in ('visible','all')),
 last_passed integer check (last_passed >= 0),
 last_total integer check (last_total between 0 and 500),
 last_run_at timestamptz,
 best_passed integer check (best_passed >= 0),
 best_total integer check (best_total between 0 and 500),
 best_at timestamptz,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key (user_id, lesson_id, block_id),
 foreign key (lesson_id, course_version_id) references public.course_lessons(id, course_version_id) on delete cascade,
 check (last_passed is null or last_passed <= last_total), check (best_passed is null or best_passed <= best_total)
);
create index course_assignment_work_version on private.course_assignment_work(user_id, course_version_id);
alter table private.course_assignment_work enable row level security;
revoke all on private.course_assignment_work from public, anon, authenticated;
grant all on private.course_assignment_work to service_role;

create function private.course_assignment_json(w private.course_assignment_work) returns jsonb
language sql stable set search_path='' as $$
 select case when w is null then null else jsonb_build_object('lessonId',w.lesson_id,'blockId',w.block_id,'files',w.files,
  'last',case when w.last_run_at is null then null else jsonb_build_object('kind',w.last_kind,'passed',w.last_passed,'total',w.last_total,'at',w.last_run_at) end,
  'best',case when w.best_at is null then null else jsonb_build_object('passed',w.best_passed,'total',w.best_total,'at',w.best_at) end,
  'revision',w.revision,'updatedAt',w.updated_at) end;
$$;

-- The learner may read and save work only for a code_assignment block in a published version they are enrolled in.
create function private.course_assignment_block(p_lesson_id uuid, p_block_id text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.course_lessons; b jsonb;
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 select * into l from public.course_lessons where id=p_lesson_id;
 if not found or not private.course_can_learn(l.course_version_id)
  or not exists(select 1 from public.course_versions v where v.id=l.course_version_id and v.status='published')
  or not exists(select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=l.course_version_id)
  then raise exception 'Course access denied' using errcode='42501'; end if;
 select x into b from private.course_lesson_content c, jsonb_array_elements(c.blocks) x
  where c.lesson_id=p_lesson_id and x->>'id'=p_block_id and x->>'type'='code_assignment';
 if b is null then raise exception 'This lesson has no such assignment' using errcode='22023'; end if;
 return jsonb_build_object('versionId',l.course_version_id,'block',b);
end;
$$;

create function public.get_my_course_assignment(p_lesson_id uuid, p_block_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w private.course_assignment_work;
begin
 perform private.course_assignment_block(p_lesson_id, p_block_id);
 select * into w from private.course_assignment_work where user_id=auth.uid() and lesson_id=p_lesson_id and block_id=p_block_id;
 return private.course_assignment_json(w);
end;
$$;

-- p_files: {file name: code} for the block's editable files only (any subset). p_result: null, or
-- {"kind": "visible" | "all", "passed": n, "total": m} from a run in the browser. Best keeps the highest "all" score.
create function public.save_my_course_assignment(p_lesson_id uuid, p_block_id text, p_files jsonb, p_result jsonb, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare ctx jsonb; editable text[]; w private.course_assignment_work; k text; v jsonb;
 r_kind text; r_passed integer; r_total integer;
begin
 ctx := private.course_assignment_block(p_lesson_id, p_block_id);
 select coalesce(array_agg(f->>'name'),'{}') into editable from jsonb_array_elements(ctx#>'{block,content,files}') f where (f->>'editable')::boolean;
 if p_files is null or jsonb_typeof(p_files)<>'object' or octet_length(p_files::text) > 409600 then raise exception 'Assignment code must be under 400 KB' using errcode='22023'; end if;
 for k, v in select * from jsonb_each(p_files) loop
  if not k = any(editable) or jsonb_typeof(v)<>'string' or length(v#>>'{}') > 200000 then raise exception 'Only the assignment''s editable files can be saved' using errcode='22023'; end if;
 end loop;
 if p_result is not null then
  if jsonb_typeof(p_result)<>'object' or exists(select 1 from jsonb_object_keys(p_result)x where x not in ('kind','passed','total'))
   or p_result->>'kind' is null or p_result->>'kind' not in ('visible','all')
   or jsonb_typeof(p_result->'passed')<>'number' or jsonb_typeof(p_result->'total')<>'number'
   or p_result->>'passed' !~ '^[0-9]{1,3}$' or p_result->>'total' !~ '^[0-9]{1,3}$'
   or (p_result->>'passed')::integer > (p_result->>'total')::integer or (p_result->>'total')::integer > 500
   then raise exception 'Invalid test result' using errcode='22023'; end if;
  r_kind := p_result->>'kind'; r_passed := (p_result->>'passed')::integer; r_total := (p_result->>'total')::integer;
 end if;
 select * into w from private.course_assignment_work where user_id=auth.uid() and lesson_id=p_lesson_id and block_id=p_block_id for update;
 if found then
  if p_expected_revision is distinct from w.revision then raise exception 'This assignment changed in another window; reload before saving' using errcode='PT409'; end if;
  update private.course_assignment_work set files=p_files,
   last_kind=coalesce(r_kind,last_kind), last_passed=coalesce(r_passed,last_passed), last_total=coalesce(r_total,last_total),
   last_run_at=case when r_kind is null then last_run_at else now() end,
   best_passed=case when r_kind='all' and (best_at is null or r_passed*coalesce(best_total,1) > coalesce(best_passed,0)*r_total) then r_passed else best_passed end,
   best_total=case when r_kind='all' and (best_at is null or r_passed*coalesce(best_total,1) > coalesce(best_passed,0)*r_total) then r_total else best_total end,
   best_at=case when r_kind='all' and (best_at is null or r_passed*coalesce(best_total,1) > coalesce(best_passed,0)*r_total) then now() else best_at end,
   revision=revision+1, updated_at=now()
   where user_id=w.user_id and lesson_id=w.lesson_id and block_id=w.block_id returning * into w;
 else
  if p_expected_revision is not null then raise exception 'This assignment changed in another window; reload before saving' using errcode='PT409'; end if;
  insert into private.course_assignment_work(user_id,course_version_id,lesson_id,block_id,files,last_kind,last_passed,last_total,last_run_at,best_passed,best_total,best_at)
  values (auth.uid(),(ctx->>'versionId')::uuid,p_lesson_id,p_block_id,p_files,r_kind,r_passed,r_total,case when r_kind is not null then now() end,
   case when r_kind='all' then r_passed end,case when r_kind='all' then r_total end,case when r_kind='all' then now() end)
  returning * into w;
 end if;
 return private.course_assignment_json(w);
end;
$$;

-- Course overview: best scores per assignment for the signed-in learner (codes are not returned here).
create function public.get_my_course_assignments(p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.course_can_learn(p_version_id) then raise exception 'Course access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('lessonId',w.lesson_id,'blockId',w.block_id,
   'best',case when w.best_at is null then null else jsonb_build_object('passed',w.best_passed,'total',w.best_total,'at',w.best_at) end,
   'last',case when w.last_run_at is null then null else jsonb_build_object('kind',w.last_kind,'passed',w.last_passed,'total',w.last_total,'at',w.last_run_at) end)
   order by w.updated_at)
  from private.course_assignment_work w where w.user_id=auth.uid() and w.course_version_id=p_version_id), '[]'::jsonb);
end;
$$;

revoke all on function private.course_assignment_json(private.course_assignment_work), private.course_assignment_block(uuid,text) from public, anon, authenticated;
revoke all on function public.get_my_course_assignment(uuid,text), public.save_my_course_assignment(uuid,text,jsonb,jsonb,integer),
 public.get_my_course_assignments(uuid) from public, anon, authenticated;
grant execute on function public.get_my_course_assignment(uuid,text), public.save_my_course_assignment(uuid,text,jsonb,jsonb,integer),
 public.get_my_course_assignments(uuid) to authenticated;

commit;
