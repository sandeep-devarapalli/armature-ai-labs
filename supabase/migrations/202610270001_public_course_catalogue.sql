-- Public discovery exposes only the latest published course metadata.
begin;
create function public.get_public_course_catalog() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',c.slug,'versionId',v.id,'title',v.title,'description',v.description,
  'moduleCount',(select count(*) from public.course_modules m where m.course_version_id=v.id),
  'lessonCount',(select count(*) from public.course_lessons l where l.course_version_id=v.id),
  'accessTier',v.access_tier,'requiresVerifiedMembership',c.requires_verified_membership,'coverUrl',c.cover_url
 ) order by c.slug),'[]'::jsonb)
 from public.courses c join lateral (
  select id,title,description,access_tier from public.course_versions
  where course_id=c.id and status='published' order by version desc limit 1
 ) v on true;
$$;
revoke all on function public.get_public_course_catalog() from public;
grant execute on function public.get_public_course_catalog() to anon,authenticated;
commit;
