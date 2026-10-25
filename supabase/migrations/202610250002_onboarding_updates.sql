-- Proposed corrections never replace an active identity before independent review.
create table private.onboarding_updates (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.basic_onboarding_applications(user_id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 revision integer not null default 1 check(revision>0),
 application_revision integer not null,
 application_status text not null,
 previous_details jsonb not null,
 full_name text not null,
 linkedin_url text not null,
 date_of_birth date not null,
 notice_version text not null check(notice_version='2026-09-26-release-1'),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 reviewer_id uuid references auth.users(id) on delete set null,
 review_reason text,
 guardian_email text,
 guardian_evidence text,
 guardian_received_at timestamptz
);
create unique index onboarding_one_pending_update on private.onboarding_updates(user_id) where status='pending';
create index onboarding_updates_queue on private.onboarding_updates(status,updated_at desc,id);
create table private.onboarding_update_history (
 id bigint generated always as identity primary key,
 update_id uuid not null references private.onboarding_updates(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 recorded_at timestamptz not null default now(),
 snapshot jsonb not null
);
alter table private.onboarding_updates enable row level security;
alter table private.onboarding_update_history enable row level security;
revoke all on private.onboarding_updates,private.onboarding_update_history from public,anon,authenticated,service_role;

create function private.onboarding_update_account_active(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=p_user and u.email_confirmed_at is not null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from public.memberships m where m.user_id=u.id and m.status='suspended'));
$$;
create function private.onboarding_update_reviewer() returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_basic_membership(auth.uid()) and private.is_staff(array['admin','super_admin','membership_reviewer']::public.staff_role[]);
$$;
create function private.onboarding_update_documents(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select count(distinct d.kind)=2 from public.onboarding_documents d join storage.objects o
 on o.bucket_id='onboarding-documents' and o.name=d.object_path
 where d.user_id=p_user and d.kind in ('photo','government_id') and d.uploaded_at is not null and d.deleted_at is null and d.expires_at>now();
$$;
create function private.onboarding_update_json(u private.onboarding_updates) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',u.id,'user_id',u.user_id,'status',u.status,'revision',u.revision,
 'application_revision',u.application_revision,'application_status',u.application_status,'previous_details',u.previous_details,
 'full_name',u.full_name,'linkedin_url',u.linkedin_url,'date_of_birth',u.date_of_birth,'notice_version',u.notice_version,
 'created_at',u.created_at,'updated_at',u.updated_at,'review_reason',u.review_reason,
 'identity_changed',u.full_name is distinct from u.previous_details->>'full_name' or u.date_of_birth::text is distinct from u.previous_details->>'date_of_birth',
 'needs_documents',u.application_status='approved' and (u.full_name is distinct from u.previous_details->>'full_name' or u.date_of_birth::text is distinct from u.previous_details->>'date_of_birth') and not private.onboarding_update_documents(u.user_id));
$$;
create function private.audit_onboarding_update() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.onboarding_update_history(update_id,actor_id,snapshot) values(new.id,auth.uid(),to_jsonb(new));
 return new;
end; $$;
create trigger onboarding_update_audit after insert or update on private.onboarding_updates for each row execute function private.audit_onboarding_update();

create or replace function private.require_submitted_membership_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.decision='approved' and new.previous_status='pending' then
  if not exists(select 1 from public.basic_onboarding_applications a where a.user_id=new.user_id and a.submitted_revision=a.revision and a.submitted_at is not null) then
   raise exception 'Member must submit the application for review first' using errcode='22023';
  end if;
  if exists(select 1 from private.onboarding_updates where user_id=new.user_id and status='pending') then
   raise exception 'Proposed changes must be resolved before identity approval' using errcode='22023';
  end if;
 end if;
 return new;
end; $$;

create function public.get_onboarding_update(p_user_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid:=coalesce(p_user_id,auth.uid()); result jsonb;
begin
 if auth.uid() is null or (target<>auth.uid() and not private.onboarding_update_reviewer()) then raise exception 'Application owner or reviewer required' using errcode='42501'; end if;
 select private.onboarding_update_json(u) into result from private.onboarding_updates u where user_id=target
 and (target=auth.uid() or private.is_staff(array['admin','super_admin']::public.staff_role[]) or status='pending')
 order by (status='pending') desc,updated_at desc,id desc limit 1;
 return result;
end; $$;

create function public.submit_onboarding_update(p_full_name text,p_linkedin_url text,p_date_of_birth date,p_notice_version text,p_expected_application_revision integer,p_expected_update_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.basic_onboarding_applications; u private.onboarding_updates;
begin
 perform private.require_onboarding_enabled();
 if not private.onboarding_update_account_active(auth.uid()) then raise exception 'Active confirmed account required' using errcode='42501'; end if;
 if p_notice_version is distinct from '2026-09-26-release-1' then raise exception 'Current privacy notice acceptance required' using errcode='42501'; end if;
 if p_full_name is null or length(trim(p_full_name)) not between 2 and 120 or p_linkedin_url is null or length(p_linkedin_url)>300
 or p_linkedin_url !~ '^https://(www\.)?linkedin\.com/in/[A-Za-z0-9_%_-]+/?$' then raise exception 'Name and personal LinkedIn profile are required' using errcode='22023'; end if;
 if p_date_of_birth is null or p_date_of_birth>((now() at time zone 'Asia/Kolkata')::date-interval '16 years')::date then raise exception 'Minimum age is 16' using errcode='22023'; end if;
 select * into a from public.basic_onboarding_applications where user_id=auth.uid() for update;
 if not found or (a.status='pending' and (a.submitted_revision is distinct from a.revision or a.submitted_at is null)) then raise exception 'Submitted application required' using errcode='22023'; end if;
 if p_expected_application_revision is distinct from a.revision then raise exception 'Application changed; reload before submitting' using errcode='40001'; end if;
 if row(trim(p_full_name),p_linkedin_url,p_date_of_birth) is not distinct from row(a.full_name,a.linkedin_url,a.date_of_birth) then raise exception 'Change at least one application detail' using errcode='22023'; end if;
 select * into u from private.onboarding_updates where user_id=a.user_id and status='pending' for update;
 if found then
  if p_expected_update_revision is distinct from u.revision then raise exception 'Update changed; reload before submitting' using errcode='40001'; end if;
  update private.onboarding_updates set full_name=trim(p_full_name),linkedin_url=p_linkedin_url,date_of_birth=p_date_of_birth,
   application_revision=a.revision,application_status=a.status,previous_details=jsonb_build_object('full_name',a.full_name,'linkedin_url',a.linkedin_url,'date_of_birth',a.date_of_birth),
   revision=revision+1,updated_at=now(),notice_version=p_notice_version where id=u.id returning * into u;
 else
  if p_expected_update_revision is not null then raise exception 'Update changed; reload before submitting' using errcode='40001'; end if;
  insert into private.onboarding_updates(user_id,application_revision,application_status,previous_details,full_name,linkedin_url,date_of_birth,notice_version)
  values(a.user_id,a.revision,a.status,jsonb_build_object('full_name',a.full_name,'linkedin_url',a.linkedin_url,'date_of_birth',a.date_of_birth),trim(p_full_name),p_linkedin_url,p_date_of_birth,p_notice_version) returning * into u;
 end if;
 return private.onboarding_update_json(u);
end; $$;

create function public.withdraw_onboarding_update(p_id uuid,p_expected_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u private.onboarding_updates;
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform 1 from public.basic_onboarding_applications where user_id=auth.uid() for update;
 select * into u from private.onboarding_updates where id=p_id and user_id=auth.uid() for update;
 if not found then raise exception 'Own update required' using errcode='42501'; end if;
 if u.revision is distinct from p_expected_revision or u.status<>'pending' then raise exception 'Update changed; reload before withdrawing' using errcode='40001'; end if;
 update private.onboarding_updates set status='withdrawn',revision=revision+1,updated_at=now() where id=u.id returning * into u;
 return private.onboarding_update_json(u);
end; $$;

create function public.list_onboarding_updates(p_status text default 'pending',p_page integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.onboarding_update_reviewer() then raise exception 'Membership reviewer required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('all','pending','approved','rejected','withdrawn') or p_page is null or p_page<1 then raise exception 'Invalid status or pagination' using errcode='22023'; end if;
 if p_status<>'pending' and not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Admin required for update history' using errcode='42501'; end if;
 with filtered as materialized(select u.*,private.onboarding_update_json(u) item from private.onboarding_updates u where user_id<>auth.uid() and (p_status='all' or status=p_status)),
 page as(select item from filtered order by updated_at desc,id desc limit 20 offset (p_page-1)::bigint*20)
 select jsonb_build_object('items',coalesce((select jsonb_agg(item) from page),'[]'::jsonb),'total',(select count(*) from filtered)) into result;
 return result;
end; $$;

create function public.review_onboarding_update(p_id uuid,p_expected_revision integer,p_decision text,p_reason text,p_guardian_email text default null,p_guardian_evidence text default null,p_guardian_received_at timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u private.onboarding_updates; a public.basic_onboarding_applications; target uuid; identity_changed boolean;
begin
 perform private.require_onboarding_enabled();
 perform pg_advisory_xact_lock(92726001);
 if not private.onboarding_update_reviewer() or (p_decision='rejected' and not private.is_staff(array['admin','super_admin']::public.staff_role[])) then raise exception 'Independent authorised reviewer required' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('approved','rejected') or p_reason is null or length(trim(p_reason)) not between 10 and 1000 then raise exception 'Decision and reason of 10 to 1000 characters required' using errcode='22023'; end if;
 select user_id into target from private.onboarding_updates where id=p_id;
 if target is null or target=auth.uid() then raise exception 'Independent authorised reviewer required' using errcode='42501'; end if;
 select * into a from public.basic_onboarding_applications where user_id=target for update;
 select * into u from private.onboarding_updates where id=p_id for update;
 if u.status<>'pending' or u.revision is distinct from p_expected_revision then raise exception 'Update changed; reload before reviewing' using errcode='40001'; end if;
 if p_decision='approved' then
  if not private.onboarding_update_account_active(target) then raise exception 'Active confirmed account required' using errcode='42501'; end if;
  if u.application_revision<>a.revision or u.application_status<>a.status or u.previous_details is distinct from jsonb_build_object('full_name',a.full_name,'linkedin_url',a.linkedin_url,'date_of_birth',a.date_of_birth) then raise exception 'Application changed; applicant must refresh the proposed update' using errcode='40001'; end if;
  if a.status='revoked' and not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Admin required for revoked account details' using errcode='42501'; end if;
  identity_changed:=u.full_name is distinct from a.full_name or u.date_of_birth is distinct from a.date_of_birth;
  if a.status='approved' and identity_changed then
   perform 1 from public.onboarding_documents where user_id=target for share;
   if not private.onboarding_update_documents(target) then raise exception 'Unexpired scanned photo and government ID required for identity changes' using errcode='22023'; end if;
   if u.date_of_birth>((now() at time zone 'Asia/Kolkata')::date-interval '18 years')::date and
    (p_guardian_email is null or p_guardian_email !~ '^[^ @]+@[^ @]+\.[^ @]+$' or lower(p_guardian_email)=lower(a.email)
    or p_guardian_evidence is null or length(trim(p_guardian_evidence)) not between 10 and 300 or p_guardian_received_at is null or p_guardian_received_at>now()) then raise exception 'Reviewed guardian email evidence required' using errcode='22023'; end if;
  end if;
  update public.basic_onboarding_applications set full_name=u.full_name,linkedin_url=u.linkedin_url,date_of_birth=u.date_of_birth,revision=revision+1,
   submitted_at=case when status='approved' then submitted_at else null end,submitted_revision=case when status='approved' then submitted_revision else null end where user_id=target returning * into a;
  insert into public.onboarding_notice_acceptances(user_id,revision,notice_version) values(target,a.revision,u.notice_version);
 end if;
 update private.onboarding_updates set status=p_decision,revision=revision+1,updated_at=now(),reviewer_id=auth.uid(),review_reason=trim(p_reason),
  guardian_email=p_guardian_email,guardian_evidence=p_guardian_evidence,guardian_received_at=p_guardian_received_at where id=u.id returning * into u;
 return private.onboarding_update_json(u);
end; $$;

-- Only pending proposals expose supporting evidence to independent Staff reviewers.
create function public.can_review_onboarding_update(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_user_id<>auth.uid() and private.onboarding_update_reviewer() and exists(select 1 from private.onboarding_updates where user_id=p_user_id and status='pending');
$$;
create policy onboarding_update_document_read on public.onboarding_documents for select to authenticated using(public.can_review_onboarding_update(user_id));
create policy onboarding_update_application_read on public.basic_onboarding_applications for select to authenticated using(public.can_review_onboarding_update(user_id));

create function private.require_onboarding_document_update(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.basic_onboarding_applications;
begin
 perform private.require_onboarding_enabled();
 select * into a from public.basic_onboarding_applications where user_id=p_user for update;
 if a.status='pending' then perform private.require_onboarding_notice(p_user); return; end if;
 if a.status='approved' and private.has_basic_membership(p_user) and exists(select 1 from private.onboarding_updates u where u.user_id=p_user and u.status='pending'
  and u.application_revision=a.revision and u.application_status=a.status and u.notice_version='2026-09-26-release-1'
  and (u.full_name is distinct from a.full_name or u.date_of_birth is distinct from a.date_of_birth)) then return; end if;
 raise exception 'Pending application or current approved identity update required' using errcode='42501';
end; $$;
create function public.onboarding_document_upload_allowed() returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 perform private.require_onboarding_document_update(auth.uid()); return true;
end; $$;
create or replace function public.reserve_onboarding_document(p_kind text,p_id_type text default null)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents;
begin
 perform private.require_onboarding_document_update(auth.uid());
 if p_kind is null or p_kind not in ('photo','government_id') or (p_kind='government_id' and (p_id_type is null or p_id_type not in ('pan','aadhaar','passport'))) or (p_kind='photo' and p_id_type is not null) then raise exception 'Invalid document type' using errcode='22023'; end if;
 if exists(select 1 from public.onboarding_documents where user_id=auth.uid() and kind=p_kind and deleted_at is null and expires_at>now()) then raise exception 'An unexpired document slot already exists' using errcode='23505'; end if;
 insert into public.onboarding_documents(user_id,kind,id_type) values(auth.uid(),p_kind,p_id_type) returning * into d;
 return d;
end; $$;
create or replace function public.finalize_onboarding_document(p_document_id uuid)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents; uploaded timestamptz;
begin
 perform private.require_onboarding_document_update((select user_id from public.onboarding_documents where id=p_document_id));
 select * into d from public.onboarding_documents where id=p_document_id for update;
 if not found or d.deleted_at is not null or d.expires_at<=now() then raise exception 'Unexpired document reservation required' using errcode='22023'; end if;
 select created_at into uploaded from storage.objects where bucket_id='onboarding-documents' and name=d.object_path;
 if uploaded is null then raise exception 'Uploaded storage object required' using errcode='22023'; end if;
 if d.uploaded_at is null then
  update public.onboarding_documents set uploaded_at=uploaded,expires_at=uploaded+interval '30 days' where id=d.id returning * into d;
 end if;
 if d.kind='government_id' and exists(select 1 from private.government_id_retention_consents where document_id=d.id and user_id=d.user_id) then
  update public.onboarding_documents set expires_at='infinity'::timestamptz where id=d.id returning * into d;
 end if;
 return d;
end; $$;

revoke all on function private.onboarding_update_account_active(uuid),private.onboarding_update_reviewer(),private.onboarding_update_documents(uuid),private.onboarding_update_json(private.onboarding_updates),private.audit_onboarding_update(),private.require_onboarding_document_update(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_onboarding_update(uuid),public.submit_onboarding_update(text,text,date,text,integer,integer),public.withdraw_onboarding_update(uuid,integer),public.list_onboarding_updates(text,integer),public.review_onboarding_update(uuid,integer,text,text,text,text,timestamptz),public.can_review_onboarding_update(uuid),public.onboarding_document_upload_allowed() from public,anon,authenticated,service_role;
grant execute on function public.get_onboarding_update(uuid),public.submit_onboarding_update(text,text,date,text,integer,integer),public.withdraw_onboarding_update(uuid,integer),public.list_onboarding_updates(text,integer),public.review_onboarding_update(uuid,integer,text,text,text,text,timestamptz),public.can_review_onboarding_update(uuid),public.onboarding_document_upload_allowed() to authenticated;
