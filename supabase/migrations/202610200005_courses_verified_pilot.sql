-- Preserve existing free-course membership behavior; these original courses require verification.
begin;
alter table public.courses add column requires_verified_membership boolean not null default false;
alter function private.course_can_learn(uuid) rename to course_can_learn_before_verified_pilot;
create function private.course_can_learn(p_version_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.course_can_learn_before_verified_pilot(p_version_id) and exists(
  select 1 from public.course_versions v join public.courses c on c.id=v.course_id
  where v.id=p_version_id and (not c.requires_verified_membership or private.has_approved_basic_membership(auth.uid())));
$$;
revoke all on function private.course_can_learn(uuid),private.course_can_learn_before_verified_pilot(uuid) from public,anon,authenticated;
alter function public.get_my_course_catalog() set schema private;
alter function private.get_my_course_catalog() rename to get_my_course_catalog_before_verified_pilot;
revoke all on function private.get_my_course_catalog_before_verified_pilot() from public,anon,authenticated;
create function public.get_my_course_catalog() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(item || jsonb_build_object('requiresVerifiedMembership',c.requires_verified_membership) order by ordinal),'[]'::jsonb)
 from jsonb_array_elements(private.get_my_course_catalog_before_verified_pilot()) with ordinality as rows(item,ordinal)
 join public.courses c on c.slug=item->>'id';
$$;
revoke all on function public.get_my_course_catalog() from public,anon;
grant execute on function public.get_my_course_catalog() to authenticated;
commit;
