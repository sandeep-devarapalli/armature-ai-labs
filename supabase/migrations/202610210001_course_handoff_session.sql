-- A signed-out bearer must not mint a new course session during its remaining JWT lifetime.
create or replace function public.course_handoff_session_active(p_session_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = p_session_id and s.user_id = p_user_id
      and (s.not_after is null or s.not_after > now())
      and u.email_confirmed_at is not null and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
  );
$$;
revoke all on function public.course_handoff_session_active(uuid, uuid) from public, anon, authenticated;
grant execute on function public.course_handoff_session_active(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
