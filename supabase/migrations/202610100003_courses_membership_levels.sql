-- Optional course module: existing enrolments, lessons and progress are untouched.
do $migration$
begin
 if to_regprocedure('private.course_can_learn(uuid)') is null then return; end if;
 execute $definition$
 create or replace function private.course_can_learn(p_version_id uuid) returns boolean
 language sql stable security definer set search_path='' as $function$
  select exists(select 1 from public.course_versions v where v.id=p_version_id and v.status='published'
   and case when private.membership_levels_enabled() and v.access_tier='free'
    then private.has_basic_membership(auth.uid())
    else private.has_approved_basic_membership(auth.uid()) and (v.access_tier='free' or
     (v.access_tier='paid' and exists(select 1 from public.course_entitlements e
      where e.user_id=auth.uid() and e.course_id=v.course_id and e.revoked_at is null
      and e.starts_at<=now() and e.ends_at>now()))) end);
 $function$;
 $definition$;
 execute $definition$
 create or replace function public.get_course_membership() returns jsonb
 language plpgsql stable security definer set search_path='' as $function$
 begin
  if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
  if not private.membership_levels_enabled() then
   return jsonb_build_object('verified',private.has_approved_basic_membership(auth.uid()));
  end if;
  return jsonb_build_object('verified',private.has_approved_basic_membership(auth.uid()),
   'basic',case when private.membership_levels_enabled() then private.has_basic_membership(auth.uid())
    else private.has_approved_basic_membership(auth.uid()) end,
   'role',private.membership_role(auth.uid())) || private.membership_level_summary(auth.uid());
 end;
 $function$;
 $definition$;
 if to_regprocedure('private.get_course_lesson_before_levels(uuid)') is null then
  alter function public.get_course_lesson(uuid) set schema private;
  alter function private.get_course_lesson(uuid) rename to get_course_lesson_before_levels;
  revoke all on function private.get_course_lesson_before_levels(uuid) from public,anon,authenticated;
 end if;
 execute $definition$
 create or replace function public.get_course_lesson(p_lesson_id uuid) returns jsonb
 language plpgsql stable security definer set search_path='' as $function$
 begin
  if private.membership_levels_enabled() and not private.has_basic_membership(auth.uid()) then
   raise exception 'Course access denied' using errcode='42501';
  end if;
  return private.get_course_lesson_before_levels(p_lesson_id);
 end;
 $function$;
 $definition$;
 revoke all on function public.get_course_lesson(uuid) from public,anon;
 grant execute on function public.get_course_lesson(uuid) to authenticated;
end;
$migration$;
