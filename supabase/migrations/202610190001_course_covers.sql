-- Course covers (19 October 2026): one cover image per course, hosted on Cloudflare R2 at media.armatureailabs.com.
begin;

alter table public.courses add column cover_url text;
alter table public.courses add constraint courses_cover_url_check
  check (cover_url is null or cover_url ~ '^https://media\.armatureailabs\.com/covers/[A-Za-z0-9._/-]+\.webp$');

alter table private.course_admin_audit drop constraint course_admin_audit_action_check;
alter table private.course_admin_audit add constraint course_admin_audit_action_check
  check (action = any (array['metadata','lesson','labs','review','publish','withdraw','clone','cover']));

CREATE OR REPLACE FUNCTION public.get_my_course_catalog()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Course access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object(
  'id',c.slug,'versionId',v.id,'title',v.title,'description',v.description,
  'moduleCount',(select count(*) from public.course_modules m where m.course_version_id=v.id),
  'lessonCount',(select count(*) from public.course_lessons l where l.course_version_id=v.id),
  'accessTier',v.access_tier,'finalAssessmentRoute',v.final_assessment_route,'labPolicyStatus',v.lab_policy_status,
  'canLearn',private.course_can_learn(v.id),'enrolled',e.user_id is not null,
  'readCount',(select count(*) from public.course_lesson_progress p where p.user_id=auth.uid() and p.course_version_id=v.id and p.read_at is not null),
  'resumeLessonId',recent.lesson_id,'lastBlock',coalesce(recent.last_block,0),
  'coverUrl',c.cover_url
 ) order by c.slug,v.version desc)
 from public.course_versions v join public.courses c on c.id=v.course_id
 left join public.course_enrollments e on e.course_version_id=v.id and e.user_id=auth.uid()
 left join lateral (select p.lesson_id,p.last_block from public.course_lesson_progress p
  where p.user_id=auth.uid() and p.course_version_id=v.id order by p.updated_at desc,p.lesson_id limit 1) recent on true
 where v.status='published' and (e.user_id is not null or not exists(
  select 1 from public.course_versions newer where newer.course_id=v.course_id and newer.status='published' and newer.version>v.version))), '[]'::jsonb);
end;
$function$;

create or replace function public.admin_set_course_cover(p_slug text, p_cover_url text, p_note text)
 returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare cid uuid; v public.course_versions;
begin
 perform private.course_admin_require();
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'A review note is required (maximum 2000 characters)' using errcode='22023'; end if;
 if p_cover_url is not null and p_cover_url !~ '^https://media\.armatureailabs\.com/covers/[A-Za-z0-9._/-]+\.webp$' then
  raise exception 'Covers must be .webp files under https://media.armatureailabs.com/covers/' using errcode='22023'; end if;
 select id into cid from public.courses where slug=p_slug for update;
 if not found then raise exception 'Course not found' using errcode='22023'; end if;
 select * into v from public.course_versions where course_id=cid order by version desc limit 1;
 update public.courses set cover_url=p_cover_url where id=cid;
 insert into private.course_admin_audit(course_version_id, actor_id, action, revision, note) values (v.id, auth.uid(), 'cover', v.revision, btrim(p_note));
 return jsonb_build_object('slug', p_slug, 'coverUrl', p_cover_url);
end;
$function$;
revoke all on function public.admin_set_course_cover(text, text, text) from public, anon;
grant execute on function public.admin_set_course_cover(text, text, text) to authenticated, service_role;

commit;
