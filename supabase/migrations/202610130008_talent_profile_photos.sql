create table private.talent_profile_photos (
 profile_id text primary key references public.talent_profiles(id),
 user_id uuid not null references auth.users(id),
 token uuid not null,
 object_path text,
 content_type text check(content_type in ('image/png','image/jpeg')),
 consent_version text,
 consent_at timestamptz,
 source text check(source in ('membership','upload'))
);
create table public.talent_photo_cleanup(object_path text primary key, queued_at timestamptz not null default now());
create table private.talent_photo_audit(id uuid primary key default gen_random_uuid(), profile_id text not null, user_id uuid not null, action text not null, consent_version text, at timestamptz not null default now());
alter table private.talent_profile_photos enable row level security;
alter table private.talent_photo_audit enable row level security;
alter table public.talent_photo_cleanup enable row level security;
revoke all on private.talent_profile_photos,private.talent_photo_audit,public.talent_photo_cleanup from public,anon,authenticated;
grant all on public.talent_photo_cleanup to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('talent-profile-photos','talent-profile-photos',false,5242880,array['image/png','image/jpeg']);

create function public.talent_photo_begin(p_profile text,p_user uuid,p_remove boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid:=gen_random_uuid(); oldpath text;
begin
 perform 1 from public.talent_profiles p join private.talent_owners o on o.profile_id=p.id where p.id=p_profile and p.published and o.user_id=p_user and p.data->>'claimed'='true' for update of p;
 if not found or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<now())) or exists(select 1 from public.memberships where user_id=p_user and status='suspended') or exists(select 1 from public.basic_onboarding_applications where user_id=p_user and status='revoked') then raise exception 'Approved profile ownership required' using errcode='42501'; end if;
 select object_path into oldpath from private.talent_profile_photos where profile_id=p_profile for update;
 insert into private.talent_profile_photos(profile_id,user_id,token) values(p_profile,p_user,v) on conflict(profile_id) do update set token=v;
 if p_remove then
  if oldpath is not null then insert into public.talent_photo_cleanup values(oldpath,now()) on conflict(object_path) do update set queued_at=excluded.queued_at; end if;
  update private.talent_profile_photos set object_path=null,consent_version=null,consent_at=null where profile_id=p_profile;
  update public.talent_profiles set data=data-'photoVersion',revision=revision+1 where id=p_profile;
  insert into private.talent_photo_audit(profile_id,user_id,action) values(p_profile,p_user,'remove');
 end if;
 return v;
end $$;
create function public.talent_photo_finish(p_profile text,p_user uuid,p_token uuid,p_path text,p_type text,p_source text,p_consent text) returns boolean language plpgsql security definer set search_path='' as $$
declare oldpath text;
begin
 perform 1 from public.talent_profiles p join private.talent_owners o on o.profile_id=p.id where p.id=p_profile and p.published and o.user_id=p_user and p.data->>'claimed'='true' for update of p;
 if not found or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null and deleted_at is null and (banned_until is null or banned_until<now())) or exists(select 1 from public.memberships where user_id=p_user and status='suspended') or exists(select 1 from public.basic_onboarding_applications where user_id=p_user and status='revoked') then return false; end if;
 select object_path into oldpath from private.talent_profile_photos where profile_id=p_profile and user_id=p_user and token=p_token for update;
 if not found then return false; end if;
 if p_consent is distinct from '2026-10-13-public-photo-v1' or p_type is null or p_source is null or p_type not in ('image/png','image/jpeg') or p_source not in ('membership','upload') or p_path is distinct from p_user::text||'/'||p_token::text then raise exception 'Invalid photo publication' using errcode='22023'; end if;
 perform 1 from public.talent_photo_cleanup where object_path=p_path and queued_at>clock_timestamp() for update;
 if not found then return false; end if;
 if oldpath is not null then insert into public.talent_photo_cleanup values(oldpath,now()) on conflict(object_path) do update set queued_at=excluded.queued_at; end if;
 update private.talent_profile_photos set object_path=p_path,content_type=p_type,consent_version=p_consent,consent_at=now(),source=p_source where profile_id=p_profile;
 update public.talent_profiles set data=jsonb_set(data,'{photoVersion}',to_jsonb(p_token::text)),revision=revision+1 where id=p_profile;
 delete from public.talent_photo_cleanup where object_path=p_path;
 insert into private.talent_photo_audit(profile_id,user_id,action,consent_version) values(p_profile,p_user,'publish',p_consent);
 return true;
end $$;
create function public.talent_photo_read(p_profile text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('object_path',f.object_path,'content_type',f.content_type,'version',f.token) from private.talent_profile_photos f join public.talent_profiles p on p.id=f.profile_id join private.talent_owners o on o.profile_id=p.id and o.user_id=f.user_id where p.id=p_profile and p.published and p.data->>'claimed'='true' and f.object_path is not null and f.consent_version='2026-10-13-public-photo-v1' and f.consent_at is not null and exists(select 1 from auth.users u where u.id=f.user_id and u.deleted_at is null and (u.banned_until is null or u.banned_until<now())) and not exists(select 1 from public.memberships m where m.user_id=f.user_id and m.status='suspended') and not exists(select 1 from public.basic_onboarding_applications a where a.user_id=f.user_id and a.status='revoked');
$$;
revoke all on function public.talent_photo_begin(text,uuid,boolean),public.talent_photo_finish(text,uuid,uuid,text,text,text,text),public.talent_photo_read(text) from public,anon,authenticated;
grant execute on function public.talent_photo_begin(text,uuid,boolean),public.talent_photo_finish(text,uuid,uuid,text,text,text,text),public.talent_photo_read(text) to service_role;

create function private.talent_photo_unpublish() returns trigger language plpgsql security definer set search_path='' as $$
declare pid text; oldpath text;
begin
 if tg_table_name='talent_profiles' then
  if new.published and new.data->>'claimed'='true' then return new; end if;
  pid:=new.id;
 else pid:=old.profile_id; end if;
 select object_path into oldpath from private.talent_profile_photos where profile_id=pid for update;
 if oldpath is not null then insert into public.talent_photo_cleanup values(oldpath,now()) on conflict(object_path) do update set queued_at=excluded.queued_at; end if;
 delete from private.talent_profile_photos where profile_id=pid;
 if tg_table_name='talent_profiles' then new.data:=new.data-'photoVersion'; return new; end if;
 update public.talent_profiles set data=data-'photoVersion',revision=revision+1 where id=pid;
 return old;
end $$;
create trigger talent_photo_unpublish before update of published,data on public.talent_profiles for each row when (new.published=false or new.data->>'claimed' is distinct from 'true') execute function private.talent_photo_unpublish();
create trigger talent_photo_owner_removed after delete on private.talent_owners for each row execute function private.talent_photo_unpublish();
revoke all on function private.talent_photo_unpublish() from public,anon,authenticated;

create function public.claim_talent_photo_cleanup(p_limit integer default 100) returns table(object_path text) language sql security definer set search_path='' as $$
 select q.object_path from public.talent_photo_cleanup q where q.queued_at<=clock_timestamp() order by q.queued_at limit greatest(0,least(p_limit,100)) for update skip locked;
$$;
revoke all on function public.claim_talent_photo_cleanup(integer) from public,anon,authenticated;
grant execute on function public.claim_talent_photo_cleanup(integer) to service_role;
