-- Ownership, including an unlisted profile, is determined from the signed-in account.
create function public.talent_my_profile() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := private.talent_require_account();
begin
 return (select jsonb_build_object('id',p.id,'published',p.published)
 from private.talent_owners o join public.talent_profiles p on p.id=o.profile_id
 where o.user_id=u order by p.published desc,o.approved_at desc,p.id limit 1);
end $$;
revoke all on function public.talent_my_profile() from public,anon,authenticated;
grant execute on function public.talent_my_profile() to authenticated;
