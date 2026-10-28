-- Learning publication may precede owner assessment/lab decisions. No policies or certificates are assigned.
create or replace function public.admin_publish_course_version(p_version_id uuid,p_expected_revision bigint,p_note text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.course_versions; b jsonb;
begin
 v:=private.course_admin_lock(p_version_id,p_expected_revision,p_note);
 if v.reviewed_revision is distinct from v.revision then raise exception 'Review the current revision before publication' using errcode='22023'; end if;
 if v.access_tier='unassigned' then raise exception 'Assign learning access before publication' using errcode='22023'; end if;
 if (v.lab_policy_status in ('none','unassigned') and exists(select 1 from public.course_lab_requirements where course_version_id=v.id))
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
