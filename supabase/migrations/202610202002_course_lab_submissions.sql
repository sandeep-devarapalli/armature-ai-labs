-- Lab checkpoint submissions (20 October 2026).
-- Learners record lab values against fixed fields, add notes and photos, and submit; lab assessors approve
-- or return them with a comment; assessors record the supervised written test and the assessed practical.
-- A course on the lab_written_and_practical route is passed when every mandatory module lab is approved
-- and both results pass. Every save, submit and review is kept in an event history.
begin;

-- Lab assessors, like membership reviewers, must not inherit general staff permissions.
create or replace function private.is_staff(p_roles public.staff_role[] default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_roles where user_id=(select auth.uid())
 and ((p_roles is null and role not in ('membership_reviewer','lab_assessor')) or role=any(p_roles)));
$$;

create table private.course_lab_forms (
 course_version_id uuid not null,
 module_id uuid not null,
 fields jsonb not null check (jsonb_typeof(fields)='array' and jsonb_array_length(fields) between 1 and 80),
 updated_at timestamptz not null default now(),
 primary key (course_version_id, module_id),
 foreign key (module_id, course_version_id) references public.course_modules(id, course_version_id)
);
create table private.course_lab_policies (
 course_version_id uuid primary key references public.course_versions(id),
 written_total integer not null check (written_total between 1 and 500),
 written_pass_percent integer not null check (written_pass_percent between 1 and 100)
);
create table private.course_lab_submissions (
 id uuid primary key default extensions.gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 course_version_id uuid not null,
 module_id uuid not null,
 status text not null default 'draft' check (status in ('draft','submitted','returned','approved')),
 field_values jsonb not null default '{}'::jsonb check (jsonb_typeof(field_values)='object'),
 notes text not null default '' check (length(notes) <= 10000),
 photos text[] not null default '{}' check (cardinality(photos) <= 10),
 share_consent boolean not null default false,
 revision integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 submitted_at timestamptz, reviewed_at timestamptz,
 reviewed_by uuid references auth.users(id),
 review_comment text check (review_comment is null or length(review_comment) <= 4000),
 unique (user_id, course_version_id, module_id),
 foreign key (course_version_id, module_id) references private.course_lab_forms(course_version_id, module_id)
);
create index course_lab_submissions_queue on private.course_lab_submissions(status, submitted_at);
create table private.course_lab_events (
 id bigint generated always as identity primary key,
 submission_id uuid not null references private.course_lab_submissions(id) on delete cascade,
 actor uuid references auth.users(id),
 action text not null check (action in ('save','submit','approve','return')),
 comment text, snapshot jsonb,
 created_at timestamptz not null default now()
);
create index course_lab_events_submission on private.course_lab_events(submission_id, created_at);
create table private.course_assessment_results (
 user_id uuid not null references auth.users(id) on delete cascade,
 course_version_id uuid not null references public.course_versions(id),
 written_score integer, written_total integer, written_passed boolean, written_at timestamptz, written_by uuid references auth.users(id),
 practical_passed boolean, practical_notes text check (practical_notes is null or length(practical_notes) <= 4000),
 practical_at timestamptz, practical_by uuid references auth.users(id),
 passed_at timestamptz,
 primary key (user_id, course_version_id)
);
alter table private.course_lab_forms enable row level security;
alter table private.course_lab_policies enable row level security;
alter table private.course_lab_submissions enable row level security;
alter table private.course_lab_events enable row level security;
alter table private.course_assessment_results enable row level security;
revoke all on private.course_lab_forms, private.course_lab_policies, private.course_lab_submissions, private.course_lab_events, private.course_assessment_results from public, anon, authenticated;
grant all on private.course_lab_forms, private.course_lab_policies, private.course_lab_submissions, private.course_lab_events, private.course_assessment_results to service_role;

create function private.course_lab_reviewer() returns boolean
language sql stable security definer set search_path='' as $$ select private.is_staff(array['lab_assessor']::public.staff_role[]); $$;
create function private.course_lab_viewer() returns boolean
language sql stable security definer set search_path='' as $$ select private.is_staff(array['lab_assessor','admin','super_admin']::public.staff_role[]); $$;

-- Field types: number, text, choice (options), yesno, table (columns of number or text; minRows when required).
create function private.course_lab_validate(p_fields jsonb, p_values jsonb, p_require boolean) returns void
language plpgsql immutable set search_path='' as $$
declare f jsonb; k text; v jsonb; t text; r jsonb; c text; col jsonb;
begin
 if p_values is null or jsonb_typeof(p_values) <> 'object' or octet_length(p_values::text) > 100000 then raise exception 'Lab values must be an object under 100 kB' using errcode='22023'; end if;
 for k in select jsonb_object_keys(p_values) loop
  if not exists(select 1 from jsonb_array_elements(p_fields) x where x->>'key'=k) then raise exception 'Unknown lab field: %', k using errcode='22023'; end if;
 end loop;
 for f in select value from jsonb_array_elements(p_fields) loop
  k := f->>'key'; t := f->>'type'; v := p_values->k;
  if v is null or jsonb_typeof(v)='null' then
   if p_require and coalesce((f->>'required')::boolean,false) then raise exception 'Please fill in: %', f->>'label' using errcode='22023'; end if;
   continue;
  end if;
  if t='number' and jsonb_typeof(v) <> 'number' then raise exception '% must be a number', f->>'label' using errcode='22023'; end if;
  if t='text' and (jsonb_typeof(v) <> 'string' or length(v#>>'{}') > 2000) then raise exception '% must be text under 2000 characters', f->>'label' using errcode='22023'; end if;
  if t='yesno' and jsonb_typeof(v) <> 'boolean' then raise exception '% must be yes or no', f->>'label' using errcode='22023'; end if;
  if t='choice' and (jsonb_typeof(v) <> 'string' or not (f->'options') ? (v#>>'{}')) then raise exception '% must be one of the listed options', f->>'label' using errcode='22023'; end if;
  if t='table' then
   if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) > 50 then raise exception '% must be a list of at most 50 rows', f->>'label' using errcode='22023'; end if;
   for r in select value from jsonb_array_elements(v) loop
    if jsonb_typeof(r) <> 'object' then raise exception '% has an invalid row', f->>'label' using errcode='22023'; end if;
    for c in select jsonb_object_keys(r) loop
     select x into col from jsonb_array_elements(f->'columns') x where x->>'key'=c;
     if col is null then raise exception '% has an unknown column', f->>'label' using errcode='22023'; end if;
     if jsonb_typeof(r->c) <> 'null' and ((col->>'type'='number' and jsonb_typeof(r->c) <> 'number') or (col->>'type'='text' and (jsonb_typeof(r->c) <> 'string' or length(r->>c) > 500))) then
      raise exception '% has an invalid value in column %', f->>'label', col->>'label' using errcode='22023'; end if;
    end loop;
   end loop;
   if p_require and coalesce((f->>'required')::boolean,false) and jsonb_array_length(v) < coalesce((f->>'minRows')::int,1) then
    raise exception '% needs at least % rows', f->>'label', coalesce((f->>'minRows')::int,1) using errcode='22023'; end if;
  end if;
 end loop;
end;
$$;

-- Owner-only: set the forms (fields per module) and written-test policy for a course version.
create function private.course_set_lab_forms(p_version_id uuid, p_forms jsonb, p_written_total integer, p_written_pass_percent integer) returns void
language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if jsonb_typeof(p_forms) <> 'array' then raise exception 'Forms must be an array' using errcode='22023'; end if;
 for r in select value from jsonb_array_elements(p_forms) loop
  perform private.course_lab_validate(r->'fields', '{}'::jsonb, false);
  insert into private.course_lab_forms(course_version_id, module_id, fields) values (p_version_id, (r->>'moduleId')::uuid, r->'fields')
  on conflict (course_version_id, module_id) do update set fields=excluded.fields, updated_at=now();
 end loop;
 insert into private.course_lab_policies values (p_version_id, p_written_total, p_written_pass_percent)
 on conflict (course_version_id) do update set written_total=excluded.written_total, written_pass_percent=excluded.written_pass_percent;
end;
$$;

create function private.course_lab_refresh_pass(p_user uuid, p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare need integer; ok integer; done boolean;
begin
 select count(*) into need from public.course_lab_requirements q where q.course_version_id=p_version and q.mandatory and q.module_id is not null;
 select count(*) into ok from public.course_lab_requirements q join private.course_lab_submissions s
  on s.course_version_id=q.course_version_id and s.module_id=q.module_id and s.user_id=p_user and s.status='approved'
  where q.course_version_id=p_version and q.mandatory and q.module_id is not null;
 select need > 0 and ok = need and coalesce(r.written_passed,false) and coalesce(r.practical_passed,false) into done
  from private.course_assessment_results r where r.user_id=p_user and r.course_version_id=p_version;
 update private.course_assessment_results set passed_at = case when done then coalesce(passed_at, now()) else null end
  where user_id=p_user and course_version_id=p_version;
end;
$$;

create function private.course_lab_submission_json(s private.course_lab_submissions) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when s.id is null then null else jsonb_build_object('id',s.id,'status',s.status,'values',s.field_values,'notes',s.notes,'photos',to_jsonb(s.photos),
  'shareConsent',s.share_consent,'revision',s.revision,'submittedAt',s.submitted_at,'reviewedAt',s.reviewed_at,'reviewComment',s.review_comment,'updatedAt',s.updated_at) end;
$$;

create function private.course_lab_summary(p_user uuid, p_version uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'labs', coalesce((select jsonb_agg(jsonb_build_object('requirementId',q.id,'moduleId',q.module_id,'title',q.title,'mandatory',q.mandatory,
     'fields',f.fields,'submission',private.course_lab_submission_json(s)) order by m.position)
   from public.course_lab_requirements q join public.course_modules m on m.id=q.module_id
   join private.course_lab_forms f on f.course_version_id=q.course_version_id and f.module_id=q.module_id
   left join private.course_lab_submissions s on s.course_version_id=q.course_version_id and s.module_id=q.module_id and s.user_id=p_user
   where q.course_version_id=p_version), '[]'::jsonb),
  'assessment', (select jsonb_build_object(
   'labsRequired',(select count(*) from public.course_lab_requirements q where q.course_version_id=p_version and q.mandatory and q.module_id is not null),
   'labsApproved',(select count(*) from public.course_lab_requirements q join private.course_lab_submissions s on s.course_version_id=q.course_version_id and s.module_id=q.module_id
      and s.user_id=p_user and s.status='approved' where q.course_version_id=p_version and q.mandatory and q.module_id is not null),
   'writtenTotal',p.written_total,'writtenPassPercent',p.written_pass_percent,
   'writtenScore',r.written_score,'writtenPassed',r.written_passed,'writtenAt',r.written_at,
   'practicalPassed',r.practical_passed,'practicalAt',r.practical_at,'passedAt',r.passed_at)
   from (select 1) one left join private.course_lab_policies p on p.course_version_id=p_version
   left join private.course_assessment_results r on r.user_id=p_user and r.course_version_id=p_version));
$$;

create function public.get_my_course_labs(p_version_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published' and v.final_assessment_route='lab_written_and_practical')
  or not exists(select 1 from private.course_lab_forms where course_version_id=p_version_id) then return jsonb_build_object('available',false); end if;
 if not private.course_can_learn(p_version_id) then raise exception 'Course access denied' using errcode='42501'; end if;
 return jsonb_build_object('available',true,
  'enrolled',exists(select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=p_version_id))
  || private.course_lab_summary(auth.uid(), p_version_id);
end;
$$;

create function public.save_my_course_lab(p_version_id uuid, p_module_id uuid, p_values jsonb, p_notes text, p_photos text[], p_consent boolean, p_submit boolean, p_expected_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f private.course_lab_forms; s private.course_lab_submissions; prefix text; p text;
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published' and v.final_assessment_route='lab_written_and_practical')
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

create function public.get_course_lab_reviewer_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('reviewer',auth.uid() is not null and private.course_lab_reviewer(),'viewer',auth.uid() is not null and private.course_lab_viewer());
$$;

create function public.get_course_lab_queue(p_status text default 'submitted') returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not private.course_lab_viewer() then raise exception 'Lab review access denied' using errcode='42501'; end if;
 if p_status not in ('submitted','returned','approved','draft') then raise exception 'Unknown status' using errcode='22023'; end if;
 return coalesce((select jsonb_agg(x order by x->>'submittedAt' nulls last) from (
  select jsonb_build_object('id',s.id,'status',s.status,'revision',s.revision,'submittedAt',s.submitted_at,'reviewedAt',s.reviewed_at,
   'learner',jsonb_build_object('id',s.user_id,'name',nullif(pr.display_name,''),'email',u.email),
   'course',jsonb_build_object('slug',c.slug,'title',v.title,'versionId',v.id),'module',m.title,'lab',q.title) x
  from private.course_lab_submissions s join public.course_versions v on v.id=s.course_version_id join public.courses c on c.id=v.course_id
  join public.course_modules m on m.id=s.module_id left join public.course_lab_requirements q on q.course_version_id=s.course_version_id and q.module_id=s.module_id
  left join public.profiles pr on pr.id=s.user_id left join auth.users u on u.id=s.user_id
  where s.status=p_status order by s.submitted_at nulls last limit 300) t), '[]'::jsonb);
end;
$$;

create function public.get_course_lab_submission(p_submission_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare s private.course_lab_submissions;
begin
 if auth.uid() is null or not private.course_lab_viewer() then raise exception 'Lab review access denied' using errcode='42501'; end if;
 select * into s from private.course_lab_submissions where id=p_submission_id;
 if not found then raise exception 'Submission not found' using errcode='22023'; end if;
 return jsonb_build_object('submission',private.course_lab_submission_json(s),'userId',s.user_id,'versionId',s.course_version_id,'moduleId',s.module_id,
  'learner',(select jsonb_build_object('name',nullif(pr.display_name,''),'email',u.email) from auth.users u left join public.profiles pr on pr.id=u.id where u.id=s.user_id),
  'course',(select jsonb_build_object('slug',c.slug,'title',v.title) from public.course_versions v join public.courses c on c.id=v.course_id where v.id=s.course_version_id),
  'module',(select title from public.course_modules where id=s.module_id),
  'requirement',(select jsonb_build_object('title',q.title,'brief',q.brief,'completionCriteria',q.completion_criteria) from public.course_lab_requirements q where q.course_version_id=s.course_version_id and q.module_id=s.module_id limit 1),
  'fields',(select fields from private.course_lab_forms where course_version_id=s.course_version_id and module_id=s.module_id),
  'events',(select coalesce(jsonb_agg(jsonb_build_object('action',e.action,'comment',e.comment,'at',e.created_at,'byLearner',e.actor=s.user_id) order by e.created_at),'[]'::jsonb) from private.course_lab_events e where e.submission_id=s.id),
  'overall',private.course_lab_summary(s.user_id, s.course_version_id),
  'canReview',private.course_lab_reviewer());
end;
$$;

create function public.review_course_lab(p_submission_id uuid, p_expected_revision integer, p_decision text, p_comment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s private.course_lab_submissions;
begin
 if auth.uid() is null or not private.course_lab_reviewer() then raise exception 'Only lab assessors can review submissions' using errcode='42501'; end if;
 if p_decision not in ('approve','return') then raise exception 'Decision must be approve or return' using errcode='22023'; end if;
 if p_decision='return' and (p_comment is null or length(btrim(p_comment)) not between 1 and 4000) then raise exception 'Say what to fix when returning a submission' using errcode='22023'; end if;
 if p_comment is not null and length(p_comment) > 4000 then raise exception 'Comment must be under 4000 characters' using errcode='22023'; end if;
 select * into s from private.course_lab_submissions where id=p_submission_id for update;
 if not found then raise exception 'Submission not found' using errcode='22023'; end if;
 if s.status <> 'submitted' then raise exception 'Only submitted checkpoints can be reviewed' using errcode='22023'; end if;
 if p_expected_revision is distinct from s.revision then raise exception 'Submission changed; reload before reviewing' using errcode='PT409'; end if;
 update private.course_lab_submissions set status=case when p_decision='approve' then 'approved' else 'returned' end, reviewed_at=now(), reviewed_by=auth.uid(),
  review_comment=nullif(btrim(coalesce(p_comment,'')),''), revision=revision+1, updated_at=now() where id=s.id returning * into s;
 insert into private.course_lab_events(submission_id,actor,action,comment) values (s.id,auth.uid(),p_decision,nullif(btrim(coalesce(p_comment,'')),''));
 insert into private.course_assessment_results(user_id,course_version_id) values (s.user_id,s.course_version_id) on conflict do nothing;
 perform private.course_lab_refresh_pass(s.user_id, s.course_version_id);
 return public.get_course_lab_submission(s.id);
end;
$$;

create function public.record_course_assessment(p_user_id uuid, p_version_id uuid, p_written_score integer, p_practical_passed boolean, p_practical_notes text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pol private.course_lab_policies;
begin
 if auth.uid() is null or not private.course_lab_reviewer() then raise exception 'Only lab assessors can record results' using errcode='42501'; end if;
 select * into pol from private.course_lab_policies where course_version_id=p_version_id;
 if not found then raise exception 'This course has no written-test policy' using errcode='22023'; end if;
 if not exists(select 1 from public.course_enrollments e where e.user_id=p_user_id and e.course_version_id=p_version_id) then raise exception 'Learner is not enrolled in this course' using errcode='22023'; end if;
 if p_written_score is not null and p_written_score not between 0 and pol.written_total then raise exception 'Written score must be between 0 and %', pol.written_total using errcode='22023'; end if;
 if p_practical_notes is not null and length(p_practical_notes) > 4000 then raise exception 'Practical notes must be under 4000 characters' using errcode='22023'; end if;
 insert into private.course_assessment_results(user_id,course_version_id) values (p_user_id,p_version_id) on conflict do nothing;
 if p_written_score is not null then
  update private.course_assessment_results set written_score=p_written_score, written_total=pol.written_total,
   written_passed = p_written_score*100 >= pol.written_pass_percent*pol.written_total, written_at=now(), written_by=auth.uid()
   where user_id=p_user_id and course_version_id=p_version_id;
 end if;
 if p_practical_passed is not null then
  update private.course_assessment_results set practical_passed=p_practical_passed, practical_notes=p_practical_notes, practical_at=now(), practical_by=auth.uid()
   where user_id=p_user_id and course_version_id=p_version_id;
 end if;
 perform private.course_lab_refresh_pass(p_user_id, p_version_id);
 return private.course_lab_summary(p_user_id, p_version_id);
end;
$$;

-- Photos: private bucket; each learner writes and reads only under their own folder (<user>/<version>/<module>/...);
-- lab assessors and admins can read all evidence.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-lab-evidence', 'course-lab-evidence', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public=false, file_size_limit=excluded.file_size_limit, allowed_mime_types=excluded.allowed_mime_types;
create policy course_lab_evidence_own_insert on storage.objects for insert to authenticated
 with check (bucket_id='course-lab-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy course_lab_evidence_own_read on storage.objects for select to authenticated
 using (bucket_id='course-lab-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy course_lab_evidence_own_delete on storage.objects for delete to authenticated
 using (bucket_id='course-lab-evidence' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy course_lab_evidence_staff_read on storage.objects for select to authenticated
 using (bucket_id='course-lab-evidence' and (select private.is_staff(array['lab_assessor','admin','super_admin']::public.staff_role[])));

revoke all on function private.course_lab_reviewer(), private.course_lab_viewer(), private.course_lab_validate(jsonb,jsonb,boolean),
 private.course_set_lab_forms(uuid,jsonb,integer,integer), private.course_lab_refresh_pass(uuid,uuid),
 private.course_lab_submission_json(private.course_lab_submissions), private.course_lab_summary(uuid,uuid) from public, anon, authenticated;
revoke all on function public.get_my_course_labs(uuid), public.save_my_course_lab(uuid,uuid,jsonb,text,text[],boolean,boolean,integer),
 public.get_course_lab_reviewer_status(), public.get_course_lab_queue(text), public.get_course_lab_submission(uuid),
 public.review_course_lab(uuid,integer,text,text), public.record_course_assessment(uuid,uuid,integer,boolean,text) from public, anon, authenticated;
grant execute on function public.get_my_course_labs(uuid), public.save_my_course_lab(uuid,uuid,jsonb,text,text[],boolean,boolean,integer),
 public.get_course_lab_reviewer_status(), public.get_course_lab_queue(text), public.get_course_lab_submission(uuid),
 public.review_course_lab(uuid,integer,text,text), public.record_course_assessment(uuid,uuid,integer,boolean,text) to authenticated;

commit;
