-- Versioned course administration. No course is published or assigned a policy by this migration.
alter table public.course_versions add column revision bigint not null default 1 check(revision>0),
 add column cloned_from_version_id uuid references public.course_versions(id),
 add column reviewed_revision bigint, add column reviewed_at timestamptz,
 add constraint course_review_revision check(reviewed_revision is null or reviewed_revision=revision);
create table private.course_admin_audit (
 id uuid primary key default extensions.gen_random_uuid(),
 course_version_id uuid not null references public.course_versions(id),
 actor_id uuid not null references auth.users(id),
 action text not null check(action in ('metadata','lesson','labs','review','publish','withdraw','clone')),
 revision bigint not null, note text not null check(length(btrim(note)) between 1 and 2000),
 created_at timestamptz not null default clock_timestamp()
);
create index course_admin_audit_version on private.course_admin_audit(course_version_id,created_at desc);
alter table private.course_admin_audit enable row level security;
revoke all on private.course_admin_audit from public,anon,authenticated,service_role;

create or replace function private.course_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_staff(array['admin','super_admin']::public.staff_role[]) and exists(
  select 1 from auth.users u left join public.memberships m on m.user_id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=now()) and coalesce(m.status<>'suspended',true));
$$;
create function private.course_admin_require() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce(private.course_is_admin(),false) then raise exception 'Course administration denied' using errcode='42501'; end if;
end;
$$;
create function private.course_admin_lock(p_id uuid,p_revision bigint,p_note text,p_draft boolean default true)
returns public.course_versions language plpgsql security definer set search_path='' as $$
declare v public.course_versions;
begin
 perform private.course_admin_require();
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'A review note is required (maximum 2000 characters)' using errcode='22023'; end if;
 select * into v from public.course_versions where id=p_id for update;
 if not found then raise exception 'Course version not found' using errcode='22023'; end if;
 if p_revision is distinct from v.revision then raise exception 'Course changed; reload before saving' using errcode='PT409'; end if;
 if p_draft and v.status<>'draft' then raise exception 'Only draft versions can be edited; create a new draft' using errcode='22023'; end if;
 return v;
end;
$$;
create function private.course_admin_record(p_id uuid,p_action text,p_note text,p_increment boolean default true) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_increment then update public.course_versions set revision=revision+1,reviewed_revision=null,reviewed_at=null where id=p_id; end if;
 insert into private.course_admin_audit(course_version_id,actor_id,action,revision,note)
 select id,auth.uid(),p_action,revision,btrim(p_note) from public.course_versions where id=p_id;
end;
$$;
create function private.course_admin_row(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('versionId',v.id,'courseId',v.course_id,'slug',c.slug,'version',v.version,
 'title',v.title,'description',v.description,'status',v.status,'accessTier',v.access_tier,
 'finalAssessmentRoute',v.final_assessment_route,'labPolicyStatus',v.lab_policy_status,
 'clonedFromVersionId',v.cloned_from_version_id,'revision',v.revision,'reviewedRevision',v.reviewed_revision,'reviewedAt',v.reviewed_at,
 'moduleCount',(select count(*) from public.course_modules where course_version_id=v.id),
 'lessonCount',(select count(*) from public.course_lessons where course_version_id=v.id))
 from public.course_versions v join public.courses c on c.id=v.course_id where v.id=p_id;
$$;

-- Reject unsupported structures rather than allowing a malformed draft to break the reader.
create function private.course_validate_blocks(p_blocks jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare b jsonb; c jsonb; q jsonb; o jsonb; t text; k text; allowed text[];
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
   when 'quiz' then array['questions'] else null end;
  if allowed is null then raise exception 'Unsupported lesson block type' using errcode='22023'; end if;
  for k in select jsonb_object_keys(c) loop
   if not k=any(allowed) then raise exception 'Unsupported content field: %',k using errcode='22023'; end if;
   if k not in ('level','items','headers','rows','questions','isConceptual') and jsonb_typeof(c->k)<>'string' then raise exception 'Content % must be a string',k using errcode='22023'; end if;
  end loop;
  if (t='heading' and not (c ? 'text' or c ? 'html')) or (t='heading' and c ? 'level' and (jsonb_typeof(c->'level')<>'number' or c->>'level' !~ '^[1-6]$'))
   or (t='text' and not c ? 'html') or (t='module_intro' and not c ? 'moduleObjective')
   or (t='definition' and not c ?& array['term','definitionHtml']) or (t='callout' and not c ?& array['title','bodyHtml'])
   or (t='code' and not c ? 'code') or (t='math' and not c ? 'latex') or (t='blockquote' and not (c ? 'html' or c ? 'text'))
   or (t='illustration' and (not c ? 'svgCode' or length(btrim(c->>'svgCode'))=0))
   or (t='micro_exercise' and not c ? 'promptHtml') or (c ? 'isConceptual' and jsonb_typeof(c->'isConceptual')<>'boolean')
   then raise exception 'Missing or invalid lesson content for %',t using errcode='22023'; end if;
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
 end loop;
end;
$$;
create function public.get_course_admin_access() returns jsonb
language sql stable security definer set search_path='' as $$ select jsonb_build_object('allowed',coalesce(private.course_is_admin(),false)); $$;
create function public.admin_list_course_versions() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.course_admin_require();
 return coalesce((select jsonb_agg(private.course_admin_row(id) order by course_id,version desc) from public.course_versions),'[]'::jsonb);
end;
$$;
create function public.admin_get_course_version(p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.course_admin_require();
 if not exists(select 1 from public.course_versions where id=p_version_id) then raise exception 'Course version not found' using errcode='22023'; end if;
 return jsonb_build_object('course',private.course_admin_row(p_version_id),
 'modules',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'lessons',
  coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'isSample',l.is_sample) order by l.position) from public.course_lessons l where l.module_id=m.id),'[]'::jsonb)) order by m.position)
  from public.course_modules m where m.course_version_id=p_version_id),'[]'::jsonb),
 'labRequirements',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'moduleId',r.module_id,'title',r.title,'brief',r.brief,'completionCriteria',r.completion_criteria,'mandatory',r.mandatory,'location',r.location) order by r.id) from public.course_lab_requirements r where r.course_version_id=p_version_id),'[]'::jsonb),
 'audit',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'action',a.action,'actorId',a.actor_id,'createdAt',a.created_at,'note',a.note,'revision',a.revision) order by a.created_at desc,a.id) from private.course_admin_audit a where a.course_version_id=p_version_id),'[]'::jsonb));
end;
$$;
create function public.admin_get_course_lesson(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.course_admin_require();
 if not exists(select 1 from public.course_lessons where id=p_lesson_id) then raise exception 'Course lesson not found' using errcode='22023'; end if;
 return (select blocks from private.course_lesson_content where lesson_id=p_lesson_id);
end;
$$;
create function public.admin_update_course_version(p_version_id uuid,p_expected_revision bigint,p_title text,p_description text,p_access_tier text,p_final_assessment_route text,p_lab_policy_status text,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.course_admin_lock(p_version_id,p_expected_revision,p_note);
 if p_title is null or length(btrim(p_title)) not between 1 and 500 or p_description is null or length(p_description)>20000
 or p_access_tier is null or p_access_tier not in ('unassigned','free','paid')
 or p_final_assessment_route is null or p_final_assessment_route not in ('unassigned','online_quiz','lab_written_and_practical')
 or p_lab_policy_status is null or p_lab_policy_status not in ('unassigned','none','configured') then raise exception 'Invalid course metadata' using errcode='22023'; end if;
 update public.course_versions set title=btrim(p_title),description=p_description,access_tier=p_access_tier,
 final_assessment_route=p_final_assessment_route,lab_policy_status=p_lab_policy_status where id=p_version_id;
 perform private.course_admin_record(p_version_id,'metadata',p_note);
end;
$$;
create function public.admin_update_course_lesson(p_lesson_id uuid,p_expected_revision bigint,p_title text,p_is_sample boolean,p_blocks jsonb,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 perform private.course_admin_require();
 select course_version_id into v_id from public.course_lessons where id=p_lesson_id;
 perform private.course_admin_lock(v_id,p_expected_revision,p_note);
 if p_title is null or length(btrim(p_title)) not between 1 and 500 or p_is_sample is null then raise exception 'Invalid lesson metadata' using errcode='22023'; end if;
 perform private.course_validate_blocks(p_blocks);
 if exists(select 1 from public.course_lessons l where l.module_id=(select module_id from public.course_lessons where id=p_lesson_id) and l.id<>p_lesson_id and l.title=btrim(p_title)) then raise exception 'Lesson titles must be unique within a module' using errcode='22023'; end if;
 update public.course_lessons set title=btrim(p_title),is_sample=p_is_sample where id=p_lesson_id;
 insert into private.course_lesson_content(lesson_id,blocks) values(p_lesson_id,p_blocks) on conflict(lesson_id) do update set blocks=excluded.blocks;
 perform private.course_admin_record(v_id,'lesson',p_note);
end;
$$;
create function public.admin_replace_course_labs(p_version_id uuid,p_expected_revision bigint,p_requirements jsonb,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb; m uuid;
begin
 perform private.course_admin_lock(p_version_id,p_expected_revision,p_note);
 if p_requirements is null or jsonb_typeof(p_requirements)<>'array' or octet_length(p_requirements::text)>262144 then raise exception 'Lab requirements must be an array under 256 KiB' using errcode='22023'; end if;
 if jsonb_array_length(p_requirements)>100 then raise exception 'Maximum 100 lab requirements' using errcode='22023'; end if;
 delete from public.course_lab_requirements where course_version_id=p_version_id;
 for r in select value from jsonb_array_elements(p_requirements) loop
  if jsonb_typeof(r)<>'object' or not r ?& array['title','brief','completionCriteria','mandatory'] then raise exception 'Invalid lab requirement' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(r)x where x not in ('id','moduleId','title','brief','completionCriteria','mandatory','location'))
   or jsonb_typeof(r->'title')<>'string' or length(btrim(r->>'title')) not between 1 and 500
   or jsonb_typeof(r->'brief')<>'string' or length(btrim(r->>'brief')) not between 1 and 20000
   or jsonb_typeof(r->'completionCriteria')<>'string' or length(btrim(r->>'completionCriteria')) not between 1 and 20000
   or jsonb_typeof(r->'mandatory')<>'boolean' or (r ? 'location' and jsonb_typeof(r->'location') not in ('null','string'))
   then raise exception 'Invalid lab requirement fields' using errcode='22023'; end if;
  begin m:=(r->>'moduleId')::uuid; exception when invalid_text_representation then raise exception 'Invalid lab module' using errcode='22023'; end;
  if m is not null and not exists(select 1 from public.course_modules where id=m and course_version_id=p_version_id) then raise exception 'Lab module must belong to this version' using errcode='22023'; end if;
  insert into public.course_lab_requirements(course_version_id,module_id,title,brief,completion_criteria,mandatory,location)
   values(p_version_id,m,btrim(r->>'title'),r->>'brief',r->>'completionCriteria',(r->>'mandatory')::boolean,r->>'location');
 end loop;
 perform private.course_admin_record(p_version_id,'labs',p_note);
end;
$$;
create function public.admin_review_course_version(p_version_id uuid,p_expected_revision bigint,p_note text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.course_admin_lock(p_version_id,p_expected_revision,p_note);
 update public.course_versions set reviewed_revision=revision,reviewed_at=now() where id=p_version_id;
 perform private.course_admin_record(p_version_id,'review',p_note,false);
end;
$$;
create function public.admin_publish_course_version(p_version_id uuid,p_expected_revision bigint,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.course_versions; b jsonb;
begin
 v:=private.course_admin_lock(p_version_id,p_expected_revision,p_note);
 if v.reviewed_revision is distinct from v.revision then raise exception 'Review the current revision before publication' using errcode='22023'; end if;
 if v.access_tier='unassigned' or v.final_assessment_route='unassigned' or v.lab_policy_status='unassigned' then raise exception 'Assign access, assessment and lab policies before publication' using errcode='22023'; end if;
 if (v.lab_policy_status='none' and exists(select 1 from public.course_lab_requirements where course_version_id=v.id))
 or (v.lab_policy_status='configured' and not exists(select 1 from public.course_lab_requirements where course_version_id=v.id)) then raise exception 'Lab policy and requirements disagree' using errcode='22023'; end if;
 if not exists(select 1 from public.course_modules where course_version_id=v.id)
 or exists(select 1 from public.course_modules m where m.course_version_id=v.id and not exists(select 1 from public.course_lessons where module_id=m.id))
 or exists(select 1 from public.course_lessons l left join private.course_lesson_content c on c.lesson_id=l.id where l.course_version_id=v.id and c.lesson_id is null)
 then raise exception 'Each module needs lessons and each lesson needs content' using errcode='22023'; end if;
 for b in select c.blocks from private.course_lesson_content c join public.course_lessons l on l.id=c.lesson_id where l.course_version_id=v.id loop perform private.course_validate_blocks(b); end loop;
 update public.course_versions set status='published',revision=revision+1,reviewed_revision=revision+1 where id=v.id;
 perform private.course_admin_record(v.id,'publish',p_note,false);
end;
$$;
create function public.admin_withdraw_course_version(p_version_id uuid,p_expected_revision bigint,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.course_versions;
begin
 v:=private.course_admin_lock(p_version_id,p_expected_revision,p_note,false);
 if v.status<>'published' then raise exception 'Only published versions can be withdrawn' using errcode='22023'; end if;
 update public.course_versions set status='withdrawn' where id=v.id;
 perform private.course_admin_record(v.id,'withdraw',p_note);
end;
$$;
create function public.admin_clone_course_version(p_version_id uuid,p_expected_revision bigint,p_note text) returns uuid
language plpgsql security definer set search_path='' as $$
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
 perform private.course_admin_record(n,'clone',p_note,false);
 return n;
end;
$$;
revoke all on function private.course_admin_require(),private.course_admin_lock(uuid,bigint,text,boolean),private.course_admin_record(uuid,text,text,boolean),private.course_admin_row(uuid),private.course_validate_blocks(jsonb) from public,anon,authenticated;
revoke all on function public.get_course_admin_access(),public.admin_list_course_versions(),public.admin_get_course_version(uuid),public.admin_get_course_lesson(uuid),public.admin_update_course_version(uuid,bigint,text,text,text,text,text,text),public.admin_update_course_lesson(uuid,bigint,text,boolean,jsonb,text),public.admin_replace_course_labs(uuid,bigint,jsonb,text),public.admin_review_course_version(uuid,bigint,text),public.admin_publish_course_version(uuid,bigint,text),public.admin_withdraw_course_version(uuid,bigint,text),public.admin_clone_course_version(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.get_course_admin_access(),public.admin_list_course_versions(),public.admin_get_course_version(uuid),public.admin_get_course_lesson(uuid),public.admin_update_course_version(uuid,bigint,text,text,text,text,text,text),public.admin_update_course_lesson(uuid,bigint,text,boolean,jsonb,text),public.admin_replace_course_labs(uuid,bigint,jsonb,text),public.admin_review_course_version(uuid,bigint,text),public.admin_publish_course_version(uuid,bigint,text),public.admin_withdraw_course_version(uuid,bigint,text),public.admin_clone_course_version(uuid,bigint,text) to authenticated;

-- Administrative preview uses its dedicated endpoint, never the learner path.
create or replace function public.get_course_lesson(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_lesson public.course_lessons; v_status text;
begin
 if not exists(select 1 from auth.users u left join public.memberships m on m.user_id=u.id
  where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null
  and (u.banned_until is null or u.banned_until<=now()) and coalesce(m.status<>'suspended',true))
 then raise exception 'Course access denied' using errcode='42501'; end if;
 select l.* into v_lesson from public.course_lessons l where l.id=p_lesson_id;
 if not found then raise exception 'Course access denied' using errcode='42501'; end if;
 select status into v_status from public.course_versions where id=v_lesson.course_version_id;
 if not (v_status='published' and
 (v_lesson.is_sample or (private.course_can_learn(v_lesson.course_version_id) and exists(
 select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=v_lesson.course_version_id))))
 then raise exception 'Course access denied' using errcode='42501'; end if;
 return (select blocks from private.course_lesson_content where lesson_id=p_lesson_id);
end;
$$;
