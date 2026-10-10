-- Prepared only. Enabling tiers requires verified production OTP delivery.
create table private.membership_level_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false
);
insert into private.membership_level_settings default values;
create table private.member_phone_verifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone text not null unique check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 verified_at timestamptz not null
);
-- Only a trusted payment integration may record real captured workspace terms.
-- This is badge evidence, not a booking entitlement or a payment activation switch.
create table private.membership_paid_terms (
 id uuid primary key default extensions.gen_random_uuid(),
 user_id uuid references auth.users(id) on delete cascade,
 organization_id uuid references public.organizations(id) on delete cascade,
 kind text not null check(kind in ('workspace','cabin')),
 unit text not null check(unit in ('day','week','month')),
 starts_at timestamptz not null, ends_at timestamptz not null,
 provider text not null check(provider in ('razorpay','dodo')),
 payment_reference text not null check(length(trim(payment_reference)) between 1 and 200),
 captured_at timestamptz not null, revoked_at timestamptz,
 created_at timestamptz not null default now(),
 unique(provider,payment_reference),
 check((user_id is null)<>(organization_id is null)), check(ends_at>starts_at),
 check(kind<>'cabin' or (unit='month' and organization_id is not null)),
 check(unit<>'day' or (
  (starts_at at time zone 'Asia/Kolkata')::date=(ends_at at time zone 'Asia/Kolkata')::date
  and (starts_at at time zone 'Asia/Kolkata')::time>='09:00'::time
  and (ends_at at time zone 'Asia/Kolkata')::time<='17:00'::time))
);
create index membership_paid_terms_user on private.membership_paid_terms(user_id,starts_at,ends_at) where revoked_at is null;
create index membership_paid_terms_team on private.membership_paid_terms(organization_id,starts_at,ends_at) where revoked_at is null;
alter table private.membership_level_settings enable row level security;
alter table private.member_phone_verifications enable row level security;
alter table private.membership_paid_terms enable row level security;
revoke all on private.membership_level_settings,private.member_phone_verifications,private.membership_paid_terms from public,anon,authenticated;
grant all on private.membership_level_settings,private.member_phone_verifications,private.membership_paid_terms to service_role;

create function private.membership_levels_enabled() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select enabled from private.membership_level_settings where singleton),false);
$$;
create function private.normalize_membership_phone(p_phone text) returns text
language sql immutable set search_path='' as $$
 select case when n ~ '^\+[1-9][0-9]{7,14}$' then n end
 from (select regexp_replace(p_phone,'[[:space:]()-]','','g') n) normalized;
$$;
create function private.has_basic_membership(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_user_id and u.email_confirmed_at is not null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from public.memberships m where m.user_id=u.id and m.status='suspended')
 and not exists(select 1 from public.basic_onboarding_applications a where a.user_id=u.id and a.status='revoked'));
$$;
create function private.has_verified_mobile(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.member_phone_verifications p
 join auth.users u on u.id=p.user_id join public.basic_onboarding_applications a on a.user_id=p.user_id
 where p.user_id=p_user_id and p.verified_at<=now() and u.phone_confirmed_at is not null
 and p.phone=private.normalize_membership_phone('+'||ltrim(u.phone,'+'))
 and p.phone=private.normalize_membership_phone(a.phone));
$$;
create function private.has_verified_membership(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_basic_membership(p_user_id) and private.has_verified_mobile(p_user_id)
 and exists(select 1 from public.basic_onboarding_applications a where a.user_id=p_user_id and a.status='approved');
$$;
create or replace function private.has_approved_basic_membership(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when private.membership_levels_enabled() then private.has_verified_membership(p_user_id) else
 exists(select 1 from public.basic_onboarding_applications a join auth.users u on u.id=a.user_id
 left join public.memberships m on m.user_id=a.user_id
 where a.user_id=p_user_id and a.status='approved' and u.email_confirmed_at is not null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 and coalesce(m.status<>'suspended',true)) end;
$$;
create function private.member_premium_periods(p_user_id uuid)
returns table(starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path='' as $$
 select t.starts_at,t.ends_at from private.membership_paid_terms t
 where t.user_id=p_user_id and t.revoked_at is null and t.captured_at<=now()
 union all
 select greatest(t.starts_at,m.starts_at,o.joined_at),least(t.ends_at,m.ends_at)
 from private.membership_paid_terms t
 join public.organization_members o on o.organization_id=t.organization_id and o.user_id=p_user_id and o.removed_at is null
 join public.organization_memberships m on m.organization_id=o.organization_id and m.status='active'
 where t.revoked_at is null and t.captured_at<=now()
 and greatest(t.starts_at,m.starts_at,o.joined_at)<least(t.ends_at,m.ends_at);
$$;
create function private.membership_level_at(p_user_id uuid,p_at timestamptz default now()) returns text
language sql stable security definer set search_path='' as $$
 select case when not private.has_basic_membership(p_user_id) then null
 when not private.has_verified_membership(p_user_id) then 'basic'
 when exists(select 1 from private.member_premium_periods(p_user_id) p where p.starts_at<=p_at and p.ends_at>p_at) then 'premium'
 else 'verified' end;
$$;
create function private.membership_level_summary(p_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('membership_levels_enabled',enabled,
 'membership_level',case when enabled then private.membership_level_at(p_user_id) end,
 'verification',jsonb_build_object(
 'email',exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null and deleted_at is null),
 'mobile',private.has_verified_mobile(p_user_id),
 'identity',exists(select 1 from public.basic_onboarding_applications where user_id=p_user_id and status='approved')),
 'next_status_change_at',case when enabled and private.has_verified_membership(p_user_id) then (
 select min(boundary) from (
 select starts_at boundary from private.member_premium_periods(p_user_id)
 union select ends_at from private.member_premium_periods(p_user_id)) boundaries
 where boundary>now() and private.membership_level_at(p_user_id,boundary) is distinct from private.membership_level_at(p_user_id)) end)
 from (select private.membership_levels_enabled() enabled) settings;
$$;
revoke all on function private.membership_levels_enabled(),private.normalize_membership_phone(text),private.has_basic_membership(uuid),private.has_verified_mobile(uuid),private.has_verified_membership(uuid),private.member_premium_periods(uuid),private.membership_level_at(uuid,timestamptz),private.membership_level_summary(uuid) from public,anon,authenticated;

create function public.has_verified_member_access() returns boolean
language sql stable security definer set search_path='' as $$ select private.has_approved_basic_membership(auth.uid()); $$;
revoke all on function public.has_verified_member_access() from public,anon;
grant execute on function public.has_verified_member_access() to authenticated;

create or replace function private.wishlist_member_approved(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$ select private.has_approved_basic_membership(p_user_id); $$;
create or replace function private.can_read_member_avatar(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (p_user_id=auth.uid() or public.can_review_basic_application(p_user_id) or
 case when private.membership_levels_enabled() then
 private.has_verified_membership(auth.uid()) and private.has_verified_membership(p_user_id)
 else exists(select 1 from public.basic_onboarding_applications where user_id=auth.uid() and status='approved')
 and exists(select 1 from public.basic_onboarding_applications where user_id=p_user_id and status='approved') end);
$$;

create or replace function private.basic_member_summary(p_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',u.id,'name',coalesce(a.full_name,nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1)),
 'email',u.email,'registered_at',u.created_at,'application_status',a.status,
 'status',case when a.user_id is null or (a.status='pending' and (not(d.photo and d.govid) or a.submitted_revision is distinct from a.revision or a.submitted_at is null)) then 'incomplete' else a.status end,
 'submitted_revision',a.submitted_revision,'submitted_at',a.submitted_at,
 'role',private.membership_role(u.id),'revision',a.revision,'reviewed_at',a.reviewed_at,
 'photo_available',d.photo,'id_available',d.govid,'complete',a.user_id is not null and d.photo and d.govid,
 'owner_approval_available',exists(select 1 from private.owner_membership_exception e where e.user_id=u.id and consumed_at is null)) || private.membership_level_summary(u.id)
 from auth.users u left join public.basic_onboarding_applications a on a.user_id=u.id
 cross join lateral(select coalesce(bool_or(kind='photo'),false) photo,coalesce(bool_or(kind='government_id'),false) govid
 from public.onboarding_documents d where d.user_id=u.id and uploaded_at is not null and deleted_at is null and expires_at>now()
 and exists(select 1 from storage.objects o where o.bucket_id='onboarding-documents' and o.name=d.object_path)) d
 where u.id=p_user_id and u.deleted_at is null;
$$;


create function public.get_membership_levels_release_status() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('membership_levels_enabled',private.membership_levels_enabled());
$$;
revoke all on function public.get_membership_levels_release_status() from public;
grant execute on function public.get_membership_levels_release_status() to anon,authenticated;

drop function public.list_basic_members(text,text,text,integer,integer);
create or replace function public.list_basic_members(p_search text default '',p_status text default null,p_role text default null,p_page integer default 1,p_page_size integer default 25,p_membership_level text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean := private.is_staff(array['admin','super_admin']::public.staff_role[]); v_result jsonb;
begin
 if not v_admin and not private.is_staff(array['membership_reviewer']::public.staff_role[]) then raise exception 'Membership reviewer required' using errcode='42501'; end if;
 if p_page is null or p_page<1 or p_page_size is null or p_page_size not between 1 and 100 or length(coalesce(p_search,''))>120 then raise exception 'Invalid pagination or search' using errcode='22023'; end if;
 if p_membership_level is not null and p_membership_level not in ('basic','verified','premium') then raise exception 'Invalid membership level' using errcode='22023'; end if;
 with candidates as materialized (
 select private.basic_member_summary(u.id) item from auth.users u
 where u.deleted_at is null and (v_admin or public.can_review_basic_application(u.id))
 ), searched as materialized (
 select item from candidates where (coalesce(p_search,'')='' or strpos(lower(item->>'name'),lower(p_search))>0 or strpos(lower(item->>'email'),lower(p_search))>0)
 and (p_role is null or item->>'role'=p_role)
 ), filtered as materialized (select item from searched where (p_status is null or item->>'status'=p_status) and (p_membership_level is null or item->>'membership_level'=p_membership_level)),
 page as (select item from filtered order by item->>'registered_at' desc,item->>'user_id' limit p_page_size offset (p_page-1)::bigint*p_page_size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item) from page),'[]'::jsonb),'total',(select count(*) from filtered),
 'counts',coalesce((select jsonb_object_agg(status,n) from (select item->>'status' status,count(*) n from searched group by item->>'status') c),'{}'::jsonb)) into v_result;
 return v_result;
end;
$$;

revoke all on function public.list_basic_members(text,text,text,integer,integer,text) from public,anon;
grant execute on function public.list_basic_members(text,text,text,integer,integer,text) to authenticated;

-- Existing queued v1 messages remain immutable; new admin readiness uses the submission checklist.
alter table public.member_notifications drop constraint member_notifications_template_version_check;
alter table public.member_notifications add constraint member_notifications_template_version_check check(template_version in (1,3) or (template_version=2 and kind='admin_ready'));
create or replace function private.enqueue_member_notification(p_user uuid,p_recipient uuid,p_event text,p_kind text,p_status text,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare v_version integer:=case when private.membership_levels_enabled() then 3 when p_kind='admin_ready' then 2 else 1 end;
begin
 perform pg_advisory_xact_lock(hashtextextended('member-notice:'||p_event||':'||p_recipient||':'||p_kind,0));
 if exists(select 1 from public.member_notification_tombstones where event_key=p_event and recipient_id=p_recipient and kind=p_kind) then return; end if;
 if exists(select 1 from public.member_notifications where event_key=p_event and recipient_id=p_recipient and kind=p_kind) then return; end if;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,template_version)
 select p_user,u.id,lower(u.email),p_event,p_kind,p_status,p_revision,
 case when s.enabled and (s.all_members_enabled or lower(u.email)=any(s.pilot_recipients)) then 'pending' else 'held' end,v_version
 from auth.users u cross join public.member_notification_settings s
 where u.id=p_recipient and u.email_confirmed_at is not null and u.deleted_at is null
 on conflict(event_key,recipient_id,kind,template_version) do nothing;
end;
$$;
