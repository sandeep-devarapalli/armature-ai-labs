create table private.member_directory_profiles (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null unique references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 100),
 bio text not null default '' check(length(bio)<=600),
 skills text[] not null default '{}',
 published boolean not null default false,
 consent_version text,
 consented_at timestamptz,
 avatar_path text,
 updated_at timestamptz not null default now(),
 check(cardinality(skills)<=12),
 check(not published or (consent_version='2026-10-20-public-directory-v1' and consented_at is not null))
);
alter table private.member_directory_profiles enable row level security;
revoke all on private.member_directory_profiles from public,anon,authenticated;

create function private.directory_public_card(p private.member_directory_profiles) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',p.id,'display_name',p.display_name,'bio',p.bio,'skills',p.skills,
 'has_avatar',exists(select 1 from public.member_avatars a where a.user_id=p.user_id and a.object_path=p.avatar_path));
$$;
revoke all on function private.directory_public_card(private.member_directory_profiles) from public,anon,authenticated;

create function public.list_public_member_profiles(p_search text default '',p_page integer default 1,p_page_size integer default 24) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_page integer:=greatest(1,least(coalesce(p_page,1),10000)); v_size integer:=greatest(1,least(coalesce(p_page_size,24),48)); v_query text:=left(trim(coalesce(p_search,'')),100); result jsonb;
begin
 with eligible as materialized (
 select p.* from private.member_directory_profiles p where p.published and private.has_basic_membership(p.user_id)
 and (v_query='' or strpos(lower(p.display_name||' '||p.bio||' '||array_to_string(p.skills,' ')),lower(v_query))>0)
 ), page as (select * from eligible order by lower(display_name),id offset (v_page-1)*v_size limit v_size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(private.directory_public_card(page::private.member_directory_profiles) order by lower(display_name),id) from page),'[]'::jsonb),'total',(select count(*) from eligible),'page',v_page,'page_size',v_size) into result;
 return result;
end $$;

create function public.get_public_member_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select private.directory_public_card(p) from private.member_directory_profiles p where p.id=p_id and p.published and private.has_basic_membership(p.user_id);
$$;

create function public.get_my_directory_profile() returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce((select private.directory_public_card(p)||jsonb_build_object('avatar_revision',(select md5(a.object_path) from public.member_avatars a where a.user_id=p.user_id),'published',p.published,'share_avatar',p.avatar_path is not null and exists(select 1 from public.member_avatars a where a.user_id=p.user_id and a.object_path=p.avatar_path),'avatar_available',exists(select 1 from public.member_avatars a where a.user_id=p.user_id))
 from private.member_directory_profiles p where p.user_id=auth.uid()),jsonb_build_object('avatar_revision',(select md5(a.object_path) from public.member_avatars a where a.user_id=auth.uid()),'id',null,'display_name','','bio','','skills','[]'::jsonb,'published',false,'share_avatar',false,'avatar_available',exists(select 1 from public.member_avatars a where a.user_id=auth.uid())));
$$;

create function public.save_my_directory_profile(p_display_name text,p_bio text,p_skills text[],p_published boolean,p_share_avatar boolean,p_consent_version text default null,p_avatar_revision text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); v_path text; v_skills text[];
begin
 if u is null then raise exception 'Sign in required' using errcode='42501'; end if;
 -- Unlisting remains possible even after eligibility has been revoked.
 if p_published and not private.has_basic_membership(u) then raise exception 'Active Basic membership required' using errcode='42501'; end if;
 if p_published and p_consent_version is distinct from '2026-10-20-public-directory-v1' then raise exception 'Confirm public profile consent' using errcode='22023'; end if;
 if p_published is null or p_share_avatar is null or p_display_name is null or length(trim(p_display_name)) not between 1 and 100 or length(coalesce(p_bio,''))>600 or coalesce(cardinality(p_skills),0)>12 or exists(select 1 from unnest(p_skills) s where s is null or length(trim(s)) not between 1 and 40) then raise exception 'Invalid directory profile' using errcode='22023'; end if;
 select coalesce(array_agg(s order by s),'{}') into v_skills from (select distinct trim(s) s from unnest(p_skills) s) t;
 if p_share_avatar and p_published then
  select object_path into v_path from public.member_avatars where user_id=u for share;
  if v_path is null then raise exception 'Upload a scanned profile avatar before sharing it' using errcode='22023'; end if;
  if p_avatar_revision is distinct from md5(v_path) then raise exception 'Your profile photo changed. Reload and confirm public photo sharing again.' using errcode='22023'; end if;
 end if;
 insert into private.member_directory_profiles(user_id,display_name,bio,skills,published,consent_version,consented_at,avatar_path)
 values(u,trim(p_display_name),trim(coalesce(p_bio,'')),v_skills,p_published,case when p_published then p_consent_version end,case when p_published then now() end,v_path)
 on conflict(user_id) do update set display_name=excluded.display_name,bio=excluded.bio,skills=excluded.skills,published=excluded.published,consent_version=excluded.consent_version,consented_at=excluded.consented_at,avatar_path=excluded.avatar_path,updated_at=now();
 return public.get_my_directory_profile();
end $$;

create function public.read_public_directory_avatar(p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('object_path',a.object_path,'content_type',a.content_type)
 from private.member_directory_profiles p join public.member_avatars a on a.user_id=p.user_id and a.object_path=p.avatar_path
 where p.id=p_id and p.published and private.has_basic_membership(p.user_id);
$$;
revoke all on function public.list_public_member_profiles(text,integer,integer),public.get_public_member_profile(uuid),public.get_my_directory_profile(),public.save_my_directory_profile(text,text,text[],boolean,boolean,text,text),public.read_public_directory_avatar(uuid) from public,anon,authenticated;
grant execute on function public.list_public_member_profiles(text,integer,integer),public.get_public_member_profile(uuid) to anon,authenticated;
grant execute on function public.get_my_directory_profile(),public.save_my_directory_profile(text,text,text[],boolean,boolean,text,text) to authenticated;
grant execute on function public.read_public_directory_avatar(uuid) to service_role;

create function public.hide_my_directory_profile() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 update private.member_directory_profiles set published=false,avatar_path=null,consent_version=null,consented_at=null,updated_at=now() where user_id=auth.uid();
 return public.get_my_directory_profile();
end $$;
revoke all on function public.hide_my_directory_profile() from public,anon;
grant execute on function public.hide_my_directory_profile() to authenticated;
