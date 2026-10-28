-- Local foundation only: publication, assessment grading and certification are separate stages.
create table public.courses (
 id uuid primary key default extensions.gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
create table public.course_versions (
 id uuid primary key default extensions.gen_random_uuid(),
 course_id uuid not null references public.courses(id),
 version integer not null check(version > 0),
 title text not null, description text not null default '',
 source_reference text not null, source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'draft' check(status in ('draft','published','withdrawn')),
 access_tier text not null default 'unassigned' check(access_tier in ('unassigned','free','paid')),
 final_assessment_route text not null default 'unassigned' check(final_assessment_route in ('unassigned','online_quiz','lab_written_and_practical')),
 lab_policy_status text not null default 'unassigned' check(lab_policy_status in ('unassigned','none','configured')),
 created_at timestamptz not null default now(),
 unique(course_id,version), unique(id,course_id),
 check(status <> 'published' or access_tier <> 'unassigned')
);
create table public.course_modules (
 id uuid primary key default extensions.gen_random_uuid(),
 course_version_id uuid not null references public.course_versions(id),
 source_id text not null, title text not null, position integer not null check(position >= 0),
 unique(course_version_id,source_id), unique(course_version_id,position), unique(id,course_version_id)
);
create table public.course_lessons (
 id uuid primary key default extensions.gen_random_uuid(),
 course_version_id uuid not null references public.course_versions(id),
 module_id uuid not null, source_id text not null, title text not null,
 position integer not null check(position >= 0), is_sample boolean not null default false,
 foreign key(module_id,course_version_id) references public.course_modules(id,course_version_id),
 unique(module_id,source_id), unique(module_id,position), unique(id,course_version_id)
);
-- The importer must separate final question/answer material from learner-visible blocks.
create table private.course_lesson_content (
 lesson_id uuid primary key references public.course_lessons(id),
 blocks jsonb not null check(jsonb_typeof(blocks)='array')
);
create table private.course_assessment_material (
 course_version_id uuid primary key references public.course_versions(id),
 material jsonb not null check(jsonb_typeof(material)='object')
);
create table public.course_entitlements (
 id uuid primary key default extensions.gen_random_uuid(),
 user_id uuid not null references auth.users(id), course_id uuid not null references public.courses(id),
 starts_at timestamptz not null, ends_at timestamptz not null, revoked_at timestamptz,
 source_reference text not null,
 check(ends_at > starts_at)
);
create index course_entitlements_access on public.course_entitlements(user_id,course_id,ends_at) where revoked_at is null;
create table public.course_enrollments (
 user_id uuid not null references auth.users(id),
 course_version_id uuid not null references public.course_versions(id),
 enrolled_at timestamptz not null default now(),
 primary key(user_id,course_version_id)
);
create table public.course_lesson_progress (
 user_id uuid not null, course_version_id uuid not null, lesson_id uuid not null,
 last_block integer not null default 0 check(last_block >= 0),
 read_at timestamptz, updated_at timestamptz not null default now(),
 primary key(user_id,lesson_id),
 foreign key(user_id,course_version_id) references public.course_enrollments(user_id,course_version_id),
 foreign key(lesson_id,course_version_id) references public.course_lessons(id,course_version_id)
);
create index course_lesson_progress_version on public.course_lesson_progress(course_version_id);
create table public.course_lab_requirements (
 id uuid primary key default extensions.gen_random_uuid(),
 course_version_id uuid not null references public.course_versions(id), module_id uuid,
 title text not null, brief text not null, completion_criteria text not null,
 mandatory boolean not null, location text,
 foreign key(module_id,course_version_id) references public.course_modules(id,course_version_id)
);
create index course_lab_requirements_version on public.course_lab_requirements(course_version_id);
-- No requirements are seeded. A null module means course-level; neither reading nor quiz progress signs off a lab.

create function private.course_is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_staff(array['admin','super_admin']::public.staff_role[]);
$$;
create function private.course_version_visible(p_version_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.course_versions v where v.id=p_version_id
 and (v.status='published' or private.course_is_admin()));
$$;
create function private.course_can_learn(p_version_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_approved_basic_membership(auth.uid()) and exists(
 select 1 from public.course_versions v where v.id=p_version_id and v.status='published'
 and (v.access_tier='free' or (v.access_tier='paid' and exists(
 select 1 from public.course_entitlements e where e.user_id=auth.uid() and e.course_id=v.course_id
 and e.revoked_at is null and e.starts_at<=now() and e.ends_at>now()))));
$$;
revoke all on function private.course_is_admin(), private.course_version_visible(uuid), private.course_can_learn(uuid) from public,anon,authenticated;
grant execute on function private.course_is_admin(), private.course_version_visible(uuid) to authenticated;

alter table public.courses enable row level security;
alter table public.course_versions enable row level security;
alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_entitlements enable row level security;
alter table public.course_enrollments enable row level security;
alter table public.course_lesson_progress enable row level security;
alter table public.course_lab_requirements enable row level security;
alter table private.course_lesson_content enable row level security;
alter table private.course_assessment_material enable row level security;
create policy courses_read on public.courses for select to authenticated using (
 exists(select 1 from public.course_versions v where v.course_id=courses.id and private.course_version_visible(v.id)));
create policy course_versions_read on public.course_versions for select to authenticated using (private.course_version_visible(id));
create policy course_modules_read on public.course_modules for select to authenticated using (private.course_version_visible(course_version_id));
create policy course_lessons_read on public.course_lessons for select to authenticated using (private.course_version_visible(course_version_id));
create policy course_labs_read on public.course_lab_requirements for select to authenticated using (private.course_version_visible(course_version_id));
create policy course_entitlements_own on public.course_entitlements for select to authenticated using (user_id=(select auth.uid()));
create policy course_enrollments_own on public.course_enrollments for select to authenticated using (user_id=(select auth.uid()));
create policy course_progress_own on public.course_lesson_progress for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.courses,public.course_versions,public.course_modules,public.course_lessons,
 public.course_entitlements,public.course_enrollments,public.course_lesson_progress,public.course_lab_requirements from public,anon,authenticated;
grant select on public.courses,public.course_versions,public.course_modules,public.course_lessons,
 public.course_entitlements,public.course_enrollments,public.course_lesson_progress,public.course_lab_requirements to authenticated;
revoke all on private.course_lesson_content,private.course_assessment_material from public,anon,authenticated;
grant all on public.courses,public.course_versions,public.course_modules,public.course_lessons,
 public.course_entitlements,public.course_enrollments,public.course_lesson_progress,public.course_lab_requirements,
 private.course_lesson_content,private.course_assessment_material to service_role;

create function public.enroll_in_course(p_version_id uuid) returns public.course_enrollments
language plpgsql security definer set search_path='' as $$
declare v_result public.course_enrollments;
begin
 if not private.course_can_learn(p_version_id) then raise exception 'Course access denied' using errcode='42501'; end if;
 insert into public.course_enrollments(user_id,course_version_id) values(auth.uid(),p_version_id)
 on conflict(user_id,course_version_id) do nothing;
 select * into v_result from public.course_enrollments where user_id=auth.uid() and course_version_id=p_version_id;
 return v_result;
end;
$$;
create function public.get_course_lesson(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_lesson public.course_lessons; v_status text;
begin
 select l.* into v_lesson from public.course_lessons l where l.id=p_lesson_id;
 if not found or auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 select status into v_status from public.course_versions where id=v_lesson.course_version_id;
 if not ((v_status='draft' and private.course_is_admin()) or (v_status='published' and
 (v_lesson.is_sample or (private.course_can_learn(v_lesson.course_version_id) and exists(
 select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=v_lesson.course_version_id)))))
 then raise exception 'Course access denied' using errcode='42501'; end if;
 return (select blocks from private.course_lesson_content where lesson_id=p_lesson_id);
end;
$$;
create function public.save_course_lesson_progress(p_lesson_id uuid,p_last_block integer,p_read boolean default false)
returns public.course_lesson_progress language plpgsql security definer set search_path='' as $$
declare v_lesson public.course_lessons; v_count integer; v_result public.course_lesson_progress;
begin
 select l.* into v_lesson from public.course_lessons l where l.id=p_lesson_id;
 if not found or not private.course_can_learn(v_lesson.course_version_id) or not exists(
 select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=v_lesson.course_version_id)
 then raise exception 'Course access denied' using errcode='42501'; end if;
 select jsonb_array_length(blocks) into v_count from private.course_lesson_content where lesson_id=p_lesson_id;
 if p_last_block is null or p_last_block<0 or v_count is null or p_last_block>=greatest(v_count,1) or p_read is null
 then raise exception 'Invalid lesson position' using errcode='22023'; end if;
 insert into public.course_lesson_progress(user_id,course_version_id,lesson_id,last_block,read_at)
 values(auth.uid(),v_lesson.course_version_id,p_lesson_id,p_last_block,case when p_read then now() end)
 on conflict(user_id,lesson_id) do update set last_block=excluded.last_block,
 read_at=coalesce(course_lesson_progress.read_at,excluded.read_at),updated_at=now() returning * into v_result;
 return v_result;
end;
$$;
revoke all on function public.enroll_in_course(uuid),public.get_course_lesson(uuid),public.save_course_lesson_progress(uuid,integer,boolean) from public,anon,authenticated;
grant execute on function public.enroll_in_course(uuid),public.get_course_lesson(uuid),public.save_course_lesson_progress(uuid,integer,boolean) to authenticated;
