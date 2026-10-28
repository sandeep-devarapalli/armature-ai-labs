-- Learner-facing reads never expose drafts, private assessment material or another member's history.
create function public.get_course_membership() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 return jsonb_build_object('verified',private.has_approved_basic_membership(auth.uid()));
end;
$$;

create function public.get_my_course_catalog() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',c.slug,'versionId',v.id,'title',v.title,'description',v.description,
  'moduleCount',(select count(*) from public.course_modules m where m.course_version_id=v.id),
  'lessonCount',(select count(*) from public.course_lessons l where l.course_version_id=v.id),
  'accessTier',v.access_tier,'finalAssessmentRoute',v.final_assessment_route,'labPolicyStatus',v.lab_policy_status,
  'canLearn',private.course_can_learn(v.id),'enrolled',e.user_id is not null,
  'readCount',(select count(*) from public.course_lesson_progress p where p.user_id=auth.uid() and p.course_version_id=v.id and p.read_at is not null),
  'resumeLessonId',recent.lesson_id,'lastBlock',coalesce(recent.last_block,0)
 ) order by c.slug,v.version desc)
 from public.course_versions v join public.courses c on c.id=v.course_id
 left join public.course_enrollments e on e.course_version_id=v.id and e.user_id=auth.uid()
 left join lateral (select p.lesson_id,p.last_block from public.course_lesson_progress p
  where p.user_id=auth.uid() and p.course_version_id=v.id order by p.updated_at desc,p.lesson_id limit 1) recent on true
 where v.status='published' and (e.user_id is not null or not exists(
  select 1 from public.course_versions newer where newer.course_id=v.course_id and newer.status='published' and newer.version>v.version))), '[]'::jsonb);
end;
$$;

create function public.get_course_syllabus(p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.course_versions where id=p_version_id and status='published')
 then raise exception 'Course access denied' using errcode='42501'; end if;
 return jsonb_build_object('modules',coalesce((select jsonb_agg(jsonb_build_object(
  'id',m.id,'title',m.title,
  'subItems',coalesce((select jsonb_agg(l.title order by l.position) from public.course_lessons l where l.module_id=m.id),'[]'::jsonb),
  'lessons',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'title',l.title,'isSample',l.is_sample) order by l.position)
   from public.course_lessons l where l.module_id=m.id),'[]'::jsonb),
  'lessonContent','{}'::jsonb) order by m.position)
 from public.course_modules m where m.course_version_id=p_version_id),'[]'::jsonb),
 'labRequirements',coalesce((select jsonb_agg(jsonb_build_object(
  'id',r.id,'moduleId',r.module_id,'title',r.title,'brief',r.brief,
  'completionCriteria',r.completion_criteria,'mandatory',r.mandatory,'location',r.location) order by r.id)
 from public.course_lab_requirements r where r.course_version_id=p_version_id),'[]'::jsonb));
end;
$$;

create function public.get_my_course_progress(p_version_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('lessonId',p.lesson_id,'lastBlock',p.last_block,
  'readAt',p.read_at,'updatedAt',p.updated_at) order by p.updated_at,p.lesson_id)
 from public.course_lesson_progress p where p.user_id=auth.uid() and p.course_version_id=p_version_id),'[]'::jsonb);
end;
$$;

-- Samples waive identity approval, not an account ban or suspension.
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
 if not ((v_status='draft' and private.course_is_admin()) or (v_status='published' and
 (v_lesson.is_sample or (private.course_can_learn(v_lesson.course_version_id) and exists(
 select 1 from public.course_enrollments e where e.user_id=auth.uid() and e.course_version_id=v_lesson.course_version_id)))))
 then raise exception 'Course access denied' using errcode='42501'; end if;
 return (select blocks from private.course_lesson_content where lesson_id=p_lesson_id);
end;
$$;
revoke all on function public.get_course_membership(),public.get_my_course_catalog(),public.get_course_syllabus(uuid),public.get_my_course_progress(uuid) from public,anon,authenticated;
grant execute on function public.get_course_membership(),public.get_my_course_catalog(),public.get_course_syllabus(uuid),public.get_my_course_progress(uuid) to authenticated;
