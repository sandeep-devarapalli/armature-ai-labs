-- Membership reviewers must not inherit legacy operational staff permissions.
create or replace function private.is_staff(p_roles public.staff_role[] default null)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_roles where user_id=(select auth.uid())
 and ((p_roles is null and role <> 'membership_reviewer') or role=any(p_roles)));
$$;

create function private.membership_role(p_user_id uuid) returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select role::text from public.staff_roles where user_id=p_user_id
 and role in ('super_admin','admin','membership_reviewer')
 order by case role when 'super_admin' then 1 when 'admin' then 2 else 3 end limit 1),'member');
$$;
revoke all on function private.membership_role(uuid) from public,anon,authenticated;

create function public.can_review_basic_application(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_staff(array['admin','super_admin']::public.staff_role[]) or
 (private.is_staff(array['membership_reviewer']::public.staff_role[]) and exists
 (select 1 from public.basic_onboarding_applications where user_id=p_user_id and status='pending'));
$$;
revoke all on function public.can_review_basic_application(uuid) from public,anon;
grant execute on function public.can_review_basic_application(uuid) to authenticated;
drop policy onboarding_application_read on public.basic_onboarding_applications;
create policy onboarding_application_read on public.basic_onboarding_applications for select to authenticated using(user_id=(select auth.uid()) or public.can_review_basic_application(user_id));
drop policy onboarding_document_read on public.onboarding_documents;
create policy onboarding_document_read on public.onboarding_documents for select to authenticated using(user_id=(select auth.uid()) or public.can_review_basic_application(user_id));

alter table public.basic_onboarding_applications drop constraint basic_onboarding_applications_status_check;
alter table public.basic_onboarding_applications add constraint basic_onboarding_applications_status_check
 check(status in ('pending','approved','rejected','corrections_requested','revoked'));
alter table public.onboarding_reviews drop constraint onboarding_reviews_decision_check;
alter table public.onboarding_reviews add constraint onboarding_reviews_decision_check
 check(decision in ('approved','rejected','corrections_requested','revoked','reinstated'));
alter table public.onboarding_reviews add column application_revision integer;
alter table public.onboarding_reviews add column previous_status text;
alter table public.onboarding_reviews add column reviewer_role text;

create table public.membership_role_audit (
 id uuid primary key default extensions.gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 user_id uuid references auth.users(id) on delete set null, previous_role text not null, new_role text not null,
 reason text not null, created_at timestamptz not null default now()
);
alter table public.membership_role_audit enable row level security;
create policy membership_role_audit_read on public.membership_role_audit for select to authenticated
 using(private.is_staff(array['admin','super_admin']::public.staff_role[]));
revoke all on public.membership_role_audit from public,anon,authenticated;
grant select on public.membership_role_audit to authenticated;

create table private.owner_membership_exception (
 user_id uuid primary key references auth.users(id), consumed_at timestamptz
);
revoke all on private.owner_membership_exception from public,anon,authenticated,service_role;
-- No identity is created. An absent identity in local/test environments is a no-op.
do $$
declare v_user uuid;
begin
 select (array_agg(u.id))[1] into v_user from auth.users u where u.id='fcb10225-243a-463a-ab4b-4dbb73ea24e3' and lower(u.email)='sandeep@armatureailabs.com'
 and u.email_confirmed_at is not null and exists(select 1 from public.staff_roles r where r.user_id=u.id and r.role='admin') having count(*)=1;
 if v_user is not null then
  insert into public.membership_role_audit(actor_id,user_id,previous_role,new_role,reason)
  values(null,v_user,private.membership_role(v_user),'super_admin','Owner-authorised role bootstrap, 27 September 2026');
  insert into public.staff_roles(user_id,role) values(v_user,'super_admin') on conflict do nothing;
  delete from public.staff_roles where user_id=v_user and role in ('admin','membership_reviewer');
  insert into private.owner_membership_exception(user_id) values(v_user);
 end if;
end;
$$;

create function public.set_membership_staff_role(p_user_id uuid,p_role text,p_expected_role text)
returns text language plpgsql security definer set search_path='' as $$
declare v_actor text; v_previous text;
begin
 perform private.require_onboarding_enabled();
 -- Serialize role edits with review decisions, including concurrent actor demotion.
 perform pg_advisory_xact_lock(92726001);
 v_actor := private.membership_role(auth.uid());
 v_previous := private.membership_role(p_user_id);
 if auth.uid() is null or p_user_id=auth.uid() or v_actor not in ('admin','super_admin')
 or v_previous='super_admin' or (v_actor='admin' and (v_previous='admin' or p_role='admin')) then
  raise exception 'Role change not permitted' using errcode='42501';
 end if;
 if p_role is null or p_role not in ('member','membership_reviewer','admin') then raise exception 'Invalid role' using errcode='22023'; end if;
 if v_previous is distinct from p_expected_role then raise exception 'Role changed; reload before editing' using errcode='40001'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and email_confirmed_at is not null and deleted_at is null) then
  raise exception 'Verified registered account required' using errcode='22023'; end if;
 delete from public.staff_roles where user_id=p_user_id and role in ('admin','membership_reviewer');
 if p_role <> 'member' then insert into public.staff_roles(user_id,role,granted_by) values(p_user_id,p_role::public.staff_role,auth.uid()); end if;
 insert into public.membership_role_audit(actor_id,user_id,previous_role,new_role,reason)
 values(auth.uid(),p_user_id,v_previous,p_role,'Confirmed role assignment');
 return p_role;
end;
$$;
revoke all on function public.set_membership_staff_role(uuid,text,text) from public,anon;
grant execute on function public.set_membership_staff_role(uuid,text,text) to authenticated;
create function private.decide_basic_onboarding(p_user_id uuid, p_decision text, p_guardian_email text default null, p_guardian_evidence text default null, p_guardian_received_at timestamptz default null, p_expected_revision integer default null, p_reason text default null, p_owner_exception boolean default false)
returns public.basic_onboarding_applications language plpgsql security definer set search_path = '' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  perform pg_advisory_xact_lock(92726001);
  if not public.can_review_basic_application(p_user_id) or (auth.uid() = p_user_id and not p_owner_exception) or (p_decision <> 'approved' and not private.is_staff(array['admin','super_admin']::public.staff_role[])) then
    raise exception 'Independent admin review required' using errcode = '42501';
  end if;
  perform private.require_onboarding_notice(p_user_id);
  if p_decision='rejected' and (p_reason is null or length(trim(p_reason)) not between 10 and 1000) then raise exception 'Decision reason must contain 10 to 1000 characters' using errcode='22023'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision' using errcode = '22023'; end if;
  select * into v_application from public.basic_onboarding_applications where user_id = p_user_id for update;
  if not found or v_application.status <> 'pending' then raise exception 'Pending application required' using errcode = '22023'; end if;
  if coalesce(p_expected_revision,1) <> v_application.revision then raise exception 'Application changed; reload before reviewing' using errcode='40001'; end if;
  if p_decision = 'approved' then
    if not exists(select 1 from public.onboarding_documents d join storage.objects o on o.bucket_id = 'onboarding-documents' and o.name = d.object_path
      where d.user_id = p_user_id and d.kind = 'photo' and d.uploaded_at is not null and d.deleted_at is null and d.expires_at > now()) or
      not exists(select 1 from public.onboarding_documents d join storage.objects o on o.bucket_id = 'onboarding-documents' and o.name = d.object_path
      where d.user_id = p_user_id and d.kind = 'government_id' and d.uploaded_at is not null and d.deleted_at is null and d.expires_at > now()) then
      raise exception 'Unexpired photo and government ID uploads required' using errcode = '22023';
    end if;
    if v_application.date_of_birth > ((now() at time zone 'Asia/Kolkata')::date - interval '18 years')::date and
       (p_guardian_email is null or p_guardian_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' or lower(p_guardian_email) = lower(v_application.email)
       or p_guardian_evidence is null or length(trim(p_guardian_evidence)) not between 10 and 300
       or p_guardian_received_at is null or p_guardian_received_at > now()) then
      raise exception 'Reviewed guardian email evidence required' using errcode = '22023';
    end if;
  end if;
  insert into public.onboarding_reviews(user_id,reviewer_id,decision,guardian_email,guardian_evidence,guardian_received_at,reason,application_revision,previous_status,reviewer_role)
  values(p_user_id,auth.uid(),p_decision,p_guardian_email,p_guardian_evidence,p_guardian_received_at,p_reason,v_application.revision,v_application.status,private.membership_role(auth.uid()));
  update public.basic_onboarding_applications set status = p_decision, reviewed_at = now() where user_id = p_user_id returning * into v_application;
  return v_application;
end;
$$;

revoke all on function private.decide_basic_onboarding(uuid,text,text,text,timestamptz,integer,text,boolean) from public,anon,authenticated,service_role;
drop function public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer);
create function public.review_basic_onboarding(p_user_id uuid,p_decision text,p_guardian_email text default null,p_guardian_evidence text default null,p_guardian_received_at timestamptz default null,p_expected_revision integer default null,p_reason text default null)
returns public.basic_onboarding_applications language sql security definer set search_path='' as $$
 select private.decide_basic_onboarding(p_user_id,p_decision,p_guardian_email,p_guardian_evidence,p_guardian_received_at,p_expected_revision,p_reason,false);
$$;
revoke all on function public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer,text) from public,anon;
grant execute on function public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer,text) to authenticated;

create function public.approve_owner_basic_membership(p_expected_revision integer,p_confirm boolean)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
 perform pg_advisory_xact_lock(92726001);
 if p_confirm is distinct from true or private.membership_role(auth.uid()) <> 'super_admin' or not exists
 (select 1 from auth.users where id=auth.uid() and lower(email)='sandeep@armatureailabs.com' and email_confirmed_at is not null) then
 raise exception 'Confirmed owner exception required' using errcode='42501'; end if;
 perform 1 from private.owner_membership_exception where user_id=auth.uid() and consumed_at is null for update;
 if not found then raise exception 'Owner exception unavailable' using errcode='42501'; end if;
 v_application := private.decide_basic_onboarding(auth.uid(),'approved',null,null,null,p_expected_revision,'One-time owner approval exception',true);
 update private.owner_membership_exception set consumed_at=now() where user_id=auth.uid();
 return v_application;
end;
$$;
revoke all on function public.approve_owner_basic_membership(integer,boolean) from public,anon;
grant execute on function public.approve_owner_basic_membership(integer,boolean) to authenticated;

create function public.change_basic_membership(p_user_id uuid,p_action text,p_reason text,p_expected_revision integer)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
 perform private.require_onboarding_enabled();
 perform pg_advisory_xact_lock(92726001);
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) or auth.uid()=p_user_id then raise exception 'Independent admin review required' using errcode='42501'; end if;
 if p_action is null or p_action not in ('revoke','reinstate') or p_reason is null or length(trim(p_reason)) not between 10 and 1000 then raise exception 'Action and reason required' using errcode='22023'; end if;
 select * into v_application from public.basic_onboarding_applications where user_id=p_user_id for update;
 if not found or (p_action='revoke' and v_application.status<>'approved') or (p_action='reinstate' and v_application.status<>'revoked') then raise exception 'Invalid membership transition' using errcode='22023'; end if;
 if p_expected_revision is distinct from v_application.revision then raise exception 'Application changed; reload before reviewing' using errcode='40001'; end if;
 insert into public.onboarding_reviews(user_id,reviewer_id,decision,reason,application_revision,previous_status,reviewer_role)
 values(p_user_id,auth.uid(),case p_action when 'revoke' then 'revoked' else 'reinstated' end,trim(p_reason),v_application.revision,v_application.status,private.membership_role(auth.uid()));
 update public.basic_onboarding_applications set status=case p_action when 'revoke' then 'revoked' else 'approved' end,revision=revision+1,reviewed_at=now()
 where user_id=p_user_id returning * into v_application;
 return v_application;
end;
$$;
revoke all on function public.change_basic_membership(uuid,text,text,integer) from public,anon;
grant execute on function public.change_basic_membership(uuid,text,text,integer) to authenticated;

create function private.basic_member_summary(p_user_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('user_id',u.id,'name',coalesce(a.full_name,nullif(u.raw_user_meta_data->>'full_name',''),split_part(u.email,'@',1)),
 'email',u.email,'registered_at',u.created_at,'application_status',a.status,
 'status',case when a.user_id is null or (a.status='pending' and not(d.photo and d.govid)) then 'incomplete' else a.status end,
 'role',private.membership_role(u.id),'revision',a.revision,'reviewed_at',a.reviewed_at,
 'photo_available',d.photo,'id_available',d.govid,'complete',a.user_id is not null and d.photo and d.govid,
 'owner_approval_available',exists(select 1 from private.owner_membership_exception e where e.user_id=u.id and consumed_at is null))
 from auth.users u left join public.basic_onboarding_applications a on a.user_id=u.id
 cross join lateral(select coalesce(bool_or(kind='photo'),false) photo,coalesce(bool_or(kind='government_id'),false) govid
 from public.onboarding_documents d where d.user_id=u.id and uploaded_at is not null and deleted_at is null and expires_at>now()
 and exists(select 1 from storage.objects o where o.bucket_id='onboarding-documents' and o.name=d.object_path)) d
 where u.id=p_user_id and u.deleted_at is null;
$$;
revoke all on function private.basic_member_summary(uuid) from public,anon,authenticated;

create function public.get_basic_account_summary() returns jsonb
language sql stable security definer set search_path='' as $$ select private.basic_member_summary(auth.uid()); $$;
revoke all on function public.get_basic_account_summary() from public,anon;
grant execute on function public.get_basic_account_summary() to authenticated;

create function public.list_basic_members(p_search text default '',p_status text default null,p_role text default null,p_page integer default 1,p_page_size integer default 25)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_admin boolean := private.is_staff(array['admin','super_admin']::public.staff_role[]); v_result jsonb;
begin
 if not v_admin and not private.is_staff(array['membership_reviewer']::public.staff_role[]) then raise exception 'Membership reviewer required' using errcode='42501'; end if;
 if p_page is null or p_page<1 or p_page_size is null or p_page_size not between 1 and 100 or length(coalesce(p_search,''))>120 then raise exception 'Invalid pagination or search' using errcode='22023'; end if;
 with candidates as materialized (
 select private.basic_member_summary(u.id) item from auth.users u
 where u.deleted_at is null and (v_admin or exists(select 1 from public.basic_onboarding_applications a where a.user_id=u.id and a.status='pending'))
 ), searched as materialized (
 select item from candidates where (coalesce(p_search,'')='' or strpos(lower(item->>'name'),lower(p_search))>0 or strpos(lower(item->>'email'),lower(p_search))>0)
 and (p_role is null or item->>'role'=p_role)
 ), filtered as materialized (select item from searched where p_status is null or item->>'status'=p_status),
 page as (select item from filtered order by item->>'registered_at' desc,item->>'user_id' limit p_page_size offset (p_page-1)::bigint*p_page_size)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item) from page),'[]'::jsonb),'total',(select count(*) from filtered),
 'counts',coalesce((select jsonb_object_agg(status,n) from (select item->>'status' status,count(*) n from searched group by item->>'status') c),'{}'::jsonb)) into v_result;
 return v_result;
end;
$$;
revoke all on function public.list_basic_members(text,text,text,integer,integer) from public,anon;
grant execute on function public.list_basic_members(text,text,text,integer,integer) to authenticated;

create or replace function public.request_onboarding_corrections(p_user_id uuid,p_reason text,p_expected_revision integer default null)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  perform pg_advisory_xact_lock(92726001);
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) or auth.uid()=p_user_id then
    raise exception 'Independent admin review required' using errcode='42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 10 and 1000 then
    raise exception 'Correction reason must contain 10 to 1000 characters' using errcode='22023';
  end if;
  select * into v_application from public.basic_onboarding_applications where user_id=p_user_id for update;
  if not found or v_application.status not in ('pending','rejected') then
    raise exception 'Pending or rejected application required' using errcode='22023';
  end if;
  if coalesce(p_expected_revision,1) <> v_application.revision then raise exception 'Application changed; reload before reviewing' using errcode='40001'; end if;
  insert into public.onboarding_reviews(user_id,reviewer_id,decision,reason,application_revision,previous_status,reviewer_role)
    values(p_user_id,auth.uid(),'corrections_requested',trim(p_reason),v_application.revision,v_application.status,private.membership_role(auth.uid()));
  update public.onboarding_documents set expires_at=least(expires_at,now()) where user_id=p_user_id;
  update public.basic_onboarding_applications set status='corrections_requested',reviewed_at=now()
    where user_id=p_user_id returning * into v_application;
  return v_application;
end;
$$;
