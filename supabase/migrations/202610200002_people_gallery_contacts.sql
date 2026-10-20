alter table private.member_directory_profiles
 add column email_source text not null default 'none' check(email_source in ('none','sign_in','custom')),
 add column public_email text,
 add column linkedin_url text,
 add column contact_consented_at timestamptz;

create or replace function private.directory_public_card(p private.member_directory_profiles) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'bio',p.bio,'skills',p.skills,
 'public_email',case when p.contact_consented_at is not null and (p.email_source='custom' or (p.email_source='sign_in' and exists(select 1 from auth.users u where u.id=p.user_id and u.email=p.public_email and u.email_confirmed_at is not null))) then p.public_email end,'linkedin_url',case when p.contact_consented_at is not null then p.linkedin_url end,
 'has_avatar',exists(select 1 from public.member_avatars a where a.user_id=p.user_id and a.object_path=p.avatar_path));
$$;

create or replace function public.get_my_directory_profile() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select private.directory_public_card(p)||jsonb_build_object('email_source',p.email_source,'public_email',p.public_email,'linkedin_url',p.linkedin_url,'contact_consent',p.contact_consented_at is not null and (p.email_source<>'sign_in' or exists(select 1 from auth.users u where u.id=p.user_id and u.email=p.public_email and u.email_confirmed_at is not null)),'avatar_revision',(select md5(a.object_path) from public.member_avatars a where a.user_id=p.user_id),'published',p.published,'share_avatar',p.avatar_path is not null and exists(select 1 from public.member_avatars a where a.user_id=p.user_id and a.object_path=p.avatar_path),'avatar_available',exists(select 1 from public.member_avatars a where a.user_id=p.user_id))
 from private.member_directory_profiles p where p.user_id=auth.uid()),jsonb_build_object('email_source','none','public_email',null,'linkedin_url',null,'contact_consent',false,'avatar_revision',(select md5(a.object_path) from public.member_avatars a where a.user_id=auth.uid()),'id',null,'display_name','','bio','','skills','[]'::jsonb,'published',false,'share_avatar',false,'avatar_available',exists(select 1 from public.member_avatars a where a.user_id=auth.uid())));
$$;


create function public.save_my_directory_profile_with_contacts(
 p_display_name text,p_bio text,p_skills text[],p_published boolean,p_share_avatar boolean,
 p_consent_version text,p_avatar_revision text,p_email_source text,p_public_email text,
 p_linkedin_url text,p_contact_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v_email text; v_link text:=nullif(trim(p_linkedin_url),'');
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_email_source is null or p_email_source not in ('none','sign_in','custom') or p_contact_consent is null then raise exception 'Invalid contact choices' using errcode='22023'; end if;
 if p_email_source='sign_in' then
  select email into v_email from auth.users where id=u and email_confirmed_at is not null;
  if v_email is null then raise exception 'Confirmed sign-in email required' using errcode='22023'; end if;
  if p_contact_consent and p_public_email is not null and p_public_email is distinct from v_email then raise exception 'Your sign-in email changed. Select it again and confirm sharing.' using errcode='22023'; end if;
 elsif p_email_source='custom' then v_email:=nullif(trim(p_public_email),''); end if;
 if p_email_source<>'none' and (v_email is null or length(v_email)>254 or v_email !~ '^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$') then raise exception 'Enter a valid public email' using errcode='22023'; end if;
 if v_link is not null and (length(v_link)>300 or v_link !~ '^https://(www\.)?linkedin\.com/in/[A-Za-z0-9_%~-]+/?$') then raise exception 'Enter an HTTPS LinkedIn profile URL' using errcode='22023'; end if;
 perform public.save_my_directory_profile(p_display_name,p_bio,p_skills,p_published,p_share_avatar,p_consent_version,p_avatar_revision);
 update private.member_directory_profiles set email_source=p_email_source,public_email=v_email,linkedin_url=v_link,
 contact_consented_at=case when p_contact_consent and (v_email is not null or v_link is not null) then now() end where user_id=u;
 return public.get_my_directory_profile();
end $$;
revoke all on function public.save_my_directory_profile_with_contacts(text,text,text[],boolean,boolean,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.save_my_directory_profile_with_contacts(text,text,text[],boolean,boolean,text,text,text,text,text,boolean) to authenticated;
