create function public.desk_request_admin_detail(p_admin uuid, p_quote uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists (select 1 from public.staff_roles where user_id=p_admin and role in ('admin','super_admin')) then
    raise exception using errcode='42501', message='Admin role required';
  end if;
  return (
    select jsonb_build_object('memberId', q.member_id, 'customerEmail', u.email)
    from private.live_desk_quotes q join auth.users u on u.id=q.member_id
    where q.id=p_quote
  );
end;
$$;
revoke all on function public.desk_request_admin_detail(uuid,uuid) from public,anon,authenticated;
grant execute on function public.desk_request_admin_detail(uuid,uuid) to service_role;
