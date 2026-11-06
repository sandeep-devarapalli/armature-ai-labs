-- Preparation only. The owner-approved seven-day review period requires a reviewed activation.
create table private.active_service_id_retention_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 initial_review_hours integer not null default 168 check(initial_review_hours between 1 and 168), activated_at timestamptz
);
insert into private.active_service_id_retention_settings default values;
create table private.identity_service_periods (
 id uuid primary key default extensions.gen_random_uuid(), user_id uuid not null references public.basic_onboarding_applications(user_id),
 booking_id uuid references public.bookings(id), service_kind text not null check(service_kind in ('cabin','equipment','other')),
 starts_at timestamptz not null, ends_at timestamptz not null, evidence_reference text not null check(length(trim(evidence_reference)) between 10 and 300),
 approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
 revoked_at timestamptz, revoked_by uuid references auth.users(id), revocation_reason text,
 check(isfinite(starts_at) and isfinite(ends_at) and ends_at>starts_at), check((revoked_at is null)=(revoked_by is null))
);
create index identity_service_periods_member on private.identity_service_periods(user_id,ends_at);
create index identity_service_periods_booking on private.identity_service_periods(booking_id) where booking_id is not null;
create table private.active_service_id_consents (
 document_id uuid primary key references public.onboarding_documents(id), user_id uuid not null references auth.users(id),
 notice_version text not null check(notice_version='2026-11-04-active-service-id-v1'), accepted_at timestamptz not null default now(),
 review_deadline timestamptz, review_completed_at timestamptz
);
alter table public.onboarding_documents add column retention_notice_version text, add column retention_reviewed_at timestamptz;
alter table public.onboarding_documents drop constraint onboarding_documents_check;
alter table public.onboarding_documents add constraint onboarding_documents_check check (
 (kind='photo' and id_type is null) or (kind='government_id' and ((id_type is not null and id_type in ('pan','aadhaar','passport')) or (deleted_at is not null and id_type is null)))
);
alter table private.active_service_id_retention_settings enable row level security;
alter table private.identity_service_periods enable row level security;
alter table private.active_service_id_consents enable row level security;
revoke all on private.active_service_id_retention_settings,private.identity_service_periods,private.active_service_id_consents from public,anon,authenticated,service_role;

create function private.identity_service_retention_end(p_user uuid) returns timestamptz
language sql stable security definer set search_path='' as $$
 select max(least(s.ends_at,coalesce(s.revoked_at,'infinity'),
   case when s.booking_id is null then 'infinity'::timestamptz
        when b.status='cancelled' then coalesce(b.cancelled_at,s.approved_at)
        when b.status in ('confirmed','completed') then b.ends_at else s.approved_at end))
 from private.identity_service_periods s left join public.bookings b on b.id=s.booking_id
 where s.user_id=p_user and s.starts_at<=now();
$$;

create function private.government_id_deadline(d public.onboarding_documents) returns timestamptz
language plpgsql stable security definer set search_path='' as $$
declare settings private.active_service_id_retention_settings; c private.active_service_id_consents; service_end timestamptz; deadline timestamptz;
begin
 if d.kind<>'government_id' or d.deleted_at is not null then return d.expires_at; end if;
 select * into settings from private.active_service_id_retention_settings where singleton;
 if not settings.enabled then return d.expires_at; end if;
 select * into c from private.active_service_id_consents where document_id=d.id and user_id=d.user_id;
 service_end:=private.identity_service_retention_end(d.user_id);
 if c.document_id is null then
   return least(d.expires_at,greatest(service_end,settings.activated_at));
 end if;
 deadline:=coalesce(c.review_completed_at,c.review_deadline,c.accepted_at);
 return least(d.expires_at,greatest(deadline,service_end));
end; $$;

create function private.refresh_service_id_deadlines(p_user uuid) returns void
language plpgsql security definer set search_path='' as $$
declare service_end timestamptz; d public.onboarding_documents; c private.active_service_id_consents; deadline timestamptz;
begin
 if not exists(select 1 from private.active_service_id_retention_settings where enabled) then return; end if;
 service_end:=private.identity_service_retention_end(p_user);
 for d in select * from public.onboarding_documents where user_id=p_user and kind='government_id' and deleted_at is null for update loop
  select * into c from private.active_service_id_consents where document_id=d.id and user_id=d.user_id;
  if c.document_id is not null and d.expires_at>now() and d.deletion_attempted_at is null then
   deadline:=greatest(coalesce(c.review_completed_at,c.review_deadline,c.accepted_at),service_end);
   update public.onboarding_documents set expires_at=deadline where id=d.id;
  else
   update public.onboarding_documents set expires_at=private.government_id_deadline(d) where id=d.id;
  end if;
 end loop;
end; $$;

create function public.configure_active_service_id_retention(p_enabled boolean,p_initial_review_hours integer) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if not private.is_staff(array['super_admin']::public.staff_role[]) then raise exception 'Super admin required' using errcode='42501'; end if;
 if p_enabled is null or p_initial_review_hours is null or p_initial_review_hours not between 1 and 168 then raise exception 'Initial review cannot exceed seven days' using errcode='22023'; end if;
 if not p_enabled and exists(select 1 from private.active_service_id_retention_settings where enabled) then raise exception 'An activated retention policy cannot be disabled to restore older retention' using errcode='42501'; end if;
 update private.active_service_id_retention_settings set enabled=p_enabled,initial_review_hours=p_initial_review_hours,
 activated_at=case when p_enabled then coalesce(activated_at,now()) else activated_at end where singleton;
 if p_enabled then
  for target in select distinct user_id from public.onboarding_documents where kind='government_id' and deleted_at is null loop
   perform private.refresh_service_id_deadlines(target);
  end loop;
 end if;
 insert into public.audit_events(actor_user_id,actor_type,action,entity_type,after_state)
 values(auth.uid(),'staff','configure_id_retention','id_retention_settings',jsonb_build_object('enabled',p_enabled,'initial_review_hours',p_initial_review_hours));
end; $$;

create function public.record_identity_service_period(p_user_id uuid,p_service_kind text,p_starts_at timestamptz,p_ends_at timestamptz,p_evidence_reference text,p_booking_id uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid; b public.bookings;
begin
 perform private.require_paid_admin();
 if p_user_id=auth.uid() then raise exception 'Independent service approval required' using errcode='42501'; end if;
 if p_booking_id is not null then
  select * into b from public.bookings where id=p_booking_id for share;
  if b.id is null or b.status<>'confirmed' or b.member_id<>p_user_id or p_ends_at>b.ends_at then raise exception 'Confirmed own bounded booking required' using errcode='22023'; end if;
 end if;
 insert into private.identity_service_periods(user_id,service_kind,starts_at,ends_at,evidence_reference,booking_id,approved_by)
 values(p_user_id,p_service_kind,p_starts_at,p_ends_at,trim(p_evidence_reference),p_booking_id,auth.uid()) returning id into result;
 insert into public.audit_events(actor_user_id,actor_type,action,entity_type,entity_id,after_state)
 values(auth.uid(),'staff','approve_identity_service_period','identity_service_period',result,jsonb_build_object('user_id',p_user_id,'service_kind',p_service_kind,'starts_at',p_starts_at,'ends_at',p_ends_at,'booking_id',p_booking_id));
 perform private.refresh_service_id_deadlines(p_user_id);
 return result;
end; $$;

create function public.end_identity_service_period(p_period_id uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 perform private.require_paid_admin();
 if p_reason is null or length(trim(p_reason)) not between 10 and 300 then raise exception 'Service ending reason required' using errcode='22023'; end if;
 update private.identity_service_periods set revoked_at=now(),revoked_by=auth.uid(),revocation_reason=trim(p_reason)
 where id=p_period_id and revoked_at is null returning user_id into target;
 if target is null then raise exception 'Active service period required' using errcode='22023'; end if;
 insert into public.audit_events(actor_user_id,actor_type,action,entity_type,entity_id,reason)
 values(auth.uid(),'staff','end_identity_service_period','identity_service_period',p_period_id,trim(p_reason));
 perform private.refresh_service_id_deadlines(target);
end; $$;

create or replace function public.accept_government_id_retention(p_document_id uuid,p_notice_version text) returns void
language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents; settings private.active_service_id_retention_settings;
begin
 perform private.require_onboarding_enabled();
 select * into settings from private.active_service_id_retention_settings where singleton;
 if not settings.enabled then
  if auth.uid() is null or p_notice_version is distinct from '2026-10-14-equipment-id-v1' then raise exception 'Explicit current ID retention consent required' using errcode='42501'; end if;
  select * into d from public.onboarding_documents where id=p_document_id and user_id=auth.uid() for update;
  if d.id is null or d.kind<>'government_id' or d.deleted_at is not null or d.expires_at<=now() or d.deletion_attempted_at is not null then raise exception 'Current own government ID required' using errcode='42501'; end if;
  insert into private.government_id_retention_consents(document_id,user_id,notice_version) values(d.id,auth.uid(),p_notice_version) on conflict(document_id) do nothing;
  if d.uploaded_at is not null then update public.onboarding_documents set expires_at='infinity'::timestamptz where id=d.id; end if;
  return;
 end if;
 if not settings.enabled or settings.initial_review_hours is null or auth.uid() is null or not private.onboarding_update_account_active(auth.uid()) or p_notice_version is distinct from '2026-11-04-active-service-id-v1' then raise exception 'Explicit current active-service ID notice required' using errcode='42501'; end if;
 select * into d from public.onboarding_documents where id=p_document_id and user_id=auth.uid() for update;
 if d.id is null or d.kind<>'government_id' or d.deleted_at is not null or d.expires_at<=now() or d.deletion_attempted_at is not null then raise exception 'Current own government ID required' using errcode='42501'; end if;
 insert into private.active_service_id_consents(document_id,user_id,notice_version,review_deadline)
 values(d.id,auth.uid(),p_notice_version,coalesce(d.uploaded_at,now())+make_interval(hours=>settings.initial_review_hours)) on conflict(document_id) do nothing;
 update public.onboarding_documents set retention_notice_version=p_notice_version where id=d.id;
 perform private.refresh_service_id_deadlines(d.user_id);
end; $$;

create or replace function public.has_government_id_retention_consent(p_document_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from private.active_service_id_retention_settings where enabled)
 then exists(select 1 from private.active_service_id_retention_settings s join private.active_service_id_consents c on c.document_id=p_document_id where s.initial_review_hours is not null and c.notice_version='2026-11-04-active-service-id-v1')
 else exists(select 1 from private.government_id_retention_consents where document_id=p_document_id) end;
$$;

create function public.onboarding_service_id_upload_allowed(p_document_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.onboarding_documents d join public.basic_onboarding_applications a on a.user_id=d.user_id
 where d.id=p_document_id and d.user_id=auth.uid() and d.kind='government_id' and a.status='approved'
 and private.onboarding_update_account_active(auth.uid()) and d.deleted_at is null and private.government_id_deadline(d)>now());
$$;

create or replace function public.reserve_onboarding_document(p_kind text,p_id_type text default null) returns public.onboarding_documents
language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents; approved boolean;
begin
 perform private.require_onboarding_enabled();
 select status='approved' into approved from public.basic_onboarding_applications where user_id=auth.uid() for update;
 if not (coalesce(approved,false) and p_kind='government_id' and private.onboarding_update_account_active(auth.uid()) and exists(select 1 from private.active_service_id_retention_settings where enabled)) then perform private.require_onboarding_document_update(auth.uid()); end if;
 if p_kind is null or p_kind not in ('photo','government_id') or (p_kind='government_id' and (p_id_type is null or p_id_type not in ('pan','aadhaar','passport'))) or (p_kind='photo' and p_id_type is not null) then raise exception 'Invalid document type' using errcode='22023'; end if;
 if exists(select 1 from public.onboarding_documents x where user_id=auth.uid() and kind=p_kind and deleted_at is null and private.government_id_deadline(x)>now()) then raise exception 'An unexpired document slot already exists' using errcode='23505'; end if;
 insert into public.onboarding_documents(user_id,kind,id_type,expires_at)
 values(auth.uid(),p_kind,p_id_type,case when p_kind='government_id' and exists(select 1 from private.active_service_id_retention_settings where enabled)
 then now()+make_interval(hours=>(select initial_review_hours from private.active_service_id_retention_settings where singleton)) else now()+interval '30 days' end) returning * into d;
 return d;
end; $$;

create or replace function public.finalize_onboarding_document(p_document_id uuid) returns public.onboarding_documents
language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents; uploaded timestamptz; settings private.active_service_id_retention_settings;
begin
 select * into d from public.onboarding_documents where id=p_document_id for update;
 if d.id is null or d.deleted_at is not null or private.government_id_deadline(d)<=now() or d.deletion_attempted_at is not null then raise exception 'Unexpired document reservation required' using errcode='22023'; end if;
 if not(d.kind='government_id' and exists(select 1 from public.basic_onboarding_applications where user_id=d.user_id and status='approved') and exists(select 1 from private.active_service_id_retention_settings where enabled)) then perform private.require_onboarding_document_update(d.user_id); end if;
 select created_at into uploaded from storage.objects where bucket_id='onboarding-documents' and name=d.object_path;
 if uploaded is null then raise exception 'Uploaded storage object required' using errcode='22023'; end if;
 select * into settings from private.active_service_id_retention_settings where singleton;
 if d.kind='government_id' and settings.enabled and not public.has_government_id_retention_consent(d.id) then raise exception 'Current active-service ID consent required' using errcode='42501'; end if;
 if d.uploaded_at is null then
  update public.onboarding_documents set uploaded_at=uploaded,expires_at=uploaded+interval '30 days' where id=d.id returning * into d;
  if d.kind='government_id' and settings.enabled then
   update private.active_service_id_consents set review_deadline=uploaded+make_interval(hours=>settings.initial_review_hours) where document_id=d.id;
   perform private.refresh_service_id_deadlines(d.user_id);
  end if;
 end if;
 if d.kind='government_id' and not settings.enabled and exists(select 1 from private.government_id_retention_consents where document_id=d.id and user_id=d.user_id) then update public.onboarding_documents set expires_at='infinity'::timestamptz where id=d.id; end if;
 select * into d from public.onboarding_documents where id=p_document_id;
 return d;
end; $$;

create function public.get_onboarding_document_retention(p_document_id uuid) returns public.onboarding_documents
language plpgsql stable security definer set search_path='' as $$
declare d public.onboarding_documents;
begin
 select * into d from public.onboarding_documents where id=p_document_id;
 if d.id is null or auth.uid() is null or (d.user_id<>auth.uid() and not private.is_staff(array['admin','super_admin']::public.staff_role[]) and not (private.onboarding_update_reviewer() and exists(select 1 from public.basic_onboarding_applications where user_id=d.user_id and status='pending'))) then raise exception 'Document owner or reviewer required' using errcode='42501'; end if;
 d.expires_at:=private.government_id_deadline(d);
 return d;
end; $$;

create function public.review_service_government_id(p_document_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.onboarding_documents;
begin
 if not private.is_staff(array['admin','super_admin']::public.staff_role[]) then raise exception 'Independent identity Admin required' using errcode='42501'; end if;
 select * into d from public.onboarding_documents where id=p_document_id for update;
 if d.id is null or d.user_id=auth.uid() or d.kind<>'government_id' or d.uploaded_at is null or d.deleted_at is not null or private.government_id_deadline(d)<=now() or not public.has_government_id_retention_consent(d.id)
 or not exists(select 1 from storage.objects where bucket_id='onboarding-documents' and name=d.object_path) then raise exception 'Current independently reviewed government ID required' using errcode='42501'; end if;
 if d.retention_reviewed_at is not null then return; end if;
 update public.onboarding_documents set retention_reviewed_at=now() where id=d.id;
 update private.active_service_id_consents set review_completed_at=now() where document_id=d.id;
 insert into public.audit_events(actor_user_id,actor_type,action,entity_type,entity_id) values(auth.uid(),'staff','review_service_government_id','onboarding_document',d.id);
 perform private.refresh_service_id_deadlines(d.user_id);
end; $$;

create function public.service_government_id_ready(p_user_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.onboarding_documents d join storage.objects o on o.bucket_id='onboarding-documents' and o.name=d.object_path
 where d.user_id=p_user_id and d.kind='government_id' and d.uploaded_at is not null and d.deleted_at is null
 and d.retention_reviewed_at is not null and d.retention_notice_version='2026-11-04-active-service-id-v1' and private.government_id_deadline(d)>now()
 and private.onboarding_update_account_active(p_user_id) and exists(select 1 from public.basic_onboarding_applications where user_id=p_user_id and status='approved'));
$$;

create function private.close_initial_id_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status is distinct from new.status and new.status<>'pending' then
  update private.active_service_id_consents c set review_completed_at=now() from public.onboarding_documents d
  where c.document_id=d.id and d.user_id=new.user_id and d.deleted_at is null and c.review_completed_at is null;
  if new.status='approved' then update public.onboarding_documents set retention_reviewed_at=now() where user_id=new.user_id and kind='government_id' and uploaded_at is not null and deleted_at is null and expires_at>now() and retention_notice_version='2026-11-04-active-service-id-v1'; end if;
  perform private.refresh_service_id_deadlines(new.user_id);
 end if;
 return new;
end; $$;
create trigger close_initial_id_review after update of status on public.basic_onboarding_applications for each row execute function private.close_initial_id_review();

create function private.booking_id_retention_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 for target in select distinct user_id from private.identity_service_periods where booking_id=new.id loop perform private.refresh_service_id_deadlines(target); end loop;
 return new;
end; $$;
create trigger booking_id_retention_changed after update of status,ends_at,cancelled_at on public.bookings for each row execute function private.booking_id_retention_changed();

create or replace function public.list_due_onboarding_documents(p_limit integer default 100) returns setof public.onboarding_documents
language sql security definer set search_path='' as $$
 with due as (
  select d.id,private.government_id_deadline(d) deadline from public.onboarding_documents d
  where private.government_id_deadline(d)<=now()
  and (d.deletion_attempted_at is null or d.deletion_attempted_at<=now()-interval '5 minutes')
  and (d.deleted_at is null or exists(select 1 from storage.objects o where o.bucket_id='onboarding-documents' and o.name=d.object_path))
  order by (d.kind='government_id') desc,d.expires_at,d.deletion_attempted_at nulls first limit greatest(1,least(p_limit,100)) for update skip locked
 ) update public.onboarding_documents d set deletion_attempted_at=now(),expires_at=least(d.expires_at,due.deadline) from due where d.id=due.id returning d.*;
$$;

create function public.onboarding_id_retention_sla() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('overdue',count(*)) from public.onboarding_documents d
 where d.kind='government_id' and exists(select 1 from private.active_service_id_retention_settings where enabled)
 and private.government_id_deadline(d)<=now()-interval '24 hours'
 and (d.deleted_at is null or exists(select 1 from storage.objects o where o.bucket_id='onboarding-documents' and o.name=d.object_path));
$$;
revoke all on function public.onboarding_id_retention_sla() from public,anon,authenticated,service_role;
grant execute on function public.onboarding_id_retention_sla() to service_role;

create or replace function public.mark_onboarding_document_deleted(p_document_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.onboarding_documents d join storage.objects o on o.bucket_id='onboarding-documents' and o.name=d.object_path where d.id=p_document_id) then raise exception 'Delete the storage object first' using errcode='22023'; end if;
 update public.onboarding_documents d set deleted_at=coalesce(deleted_at,now()),id_type=case when kind='government_id' then null else id_type end
 where id=p_document_id and private.government_id_deadline(d)<=now();
end; $$;

revoke all on function private.identity_service_retention_end(uuid),private.government_id_deadline(public.onboarding_documents),private.refresh_service_id_deadlines(uuid),private.close_initial_id_review(),private.booking_id_retention_changed() from public,anon,authenticated,service_role;
revoke all on function public.configure_active_service_id_retention(boolean,integer),public.record_identity_service_period(uuid,text,timestamptz,timestamptz,text,uuid),public.end_identity_service_period(uuid,text),public.onboarding_service_id_upload_allowed(uuid),public.get_onboarding_document_retention(uuid),public.review_service_government_id(uuid),public.service_government_id_ready(uuid) from public,anon,authenticated,service_role;
grant execute on function public.configure_active_service_id_retention(boolean,integer),public.record_identity_service_period(uuid,text,timestamptz,timestamptz,text,uuid),public.end_identity_service_period(uuid,text),public.onboarding_service_id_upload_allowed(uuid),public.get_onboarding_document_retention(uuid),public.review_service_government_id(uuid) to authenticated;
grant execute on function public.service_government_id_ready(uuid) to service_role;
