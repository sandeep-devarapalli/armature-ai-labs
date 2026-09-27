create table public.member_avatars (
 user_id uuid primary key references auth.users(id) on delete cascade,
 object_path text not null unique,
 content_type text not null check(content_type in ('image/png','image/jpeg')),
 consent_version text not null check(consent_version='2026-09-27-avatar-1'),
 consented_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.member_avatars enable row level security;
create function private.can_read_member_avatar(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_user_id=auth.uid() or public.can_review_basic_application(p_user_id) or (
 exists(select 1 from public.basic_onboarding_applications where user_id=auth.uid() and status='approved')
 and exists(select 1 from public.basic_onboarding_applications where user_id=p_user_id and status='approved')));
$$;
revoke all on function private.can_read_member_avatar(uuid) from public,anon;
grant execute on function private.can_read_member_avatar(uuid) to authenticated;
create policy member_avatar_read on public.member_avatars for select to authenticated using(private.can_read_member_avatar(user_id));
grant select on public.member_avatars to authenticated;
grant all on public.member_avatars to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('member-avatars','member-avatars',false,5242880,array['image/png','image/jpeg']) on conflict(id) do nothing;
create table public.member_avatar_cleanup(object_path text primary key, queued_at timestamptz not null default now());
alter table public.member_avatar_cleanup enable row level security;
grant all on public.member_avatar_cleanup to service_role;
create function private.queue_member_avatar_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='DELETE' or old.object_path is distinct from new.object_path then
 insert into public.member_avatar_cleanup(object_path) values(old.object_path) on conflict do nothing;
 end if;
 return null;
end $$;
create trigger member_avatar_cleanup after delete or update on public.member_avatars for each row execute function private.queue_member_avatar_cleanup();
revoke all on function private.queue_member_avatar_cleanup() from public,anon,authenticated;

create table public.member_avatar_operations(user_id uuid primary key references auth.users(id) on delete cascade, token uuid not null);
alter table public.member_avatar_operations enable row level security;
grant all on public.member_avatar_operations to service_role;
create function public.begin_member_avatar_change(p_user_id uuid,p_remove boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare v_token uuid:=gen_random_uuid();
begin
 insert into public.member_avatar_operations values(p_user_id,v_token) on conflict(user_id) do update set token=excluded.token;
 if p_remove then delete from public.member_avatars where user_id=p_user_id; end if;
 return v_token;
end $$;
create function public.finish_member_avatar_change(p_user_id uuid,p_token uuid,p_path text,p_type text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.member_avatar_operations where user_id=p_user_id and token=p_token for update;
 if not found then return false; end if;
 if p_path not like p_user_id::text||'/%' then raise exception 'Invalid avatar path'; end if;
 insert into public.member_avatars(user_id,object_path,content_type,consent_version)
 values(p_user_id,p_path,p_type,'2026-09-27-avatar-1') on conflict(user_id) do update
 set object_path=excluded.object_path,content_type=excluded.content_type,consent_version=excluded.consent_version,consented_at=now(),updated_at=now();
 delete from public.member_avatar_cleanup where object_path=p_path;
 return true;
end $$;
revoke all on function public.begin_member_avatar_change(uuid,boolean),public.finish_member_avatar_change(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.begin_member_avatar_change(uuid,boolean),public.finish_member_avatar_change(uuid,uuid,text,text) to service_role;
