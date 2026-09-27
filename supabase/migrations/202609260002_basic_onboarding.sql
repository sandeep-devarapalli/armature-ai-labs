create table public.onboarding_settings (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into public.onboarding_settings default values;
alter table public.onboarding_settings enable row level security;
revoke all on public.onboarding_settings from anon, authenticated;
grant select, update on public.onboarding_settings to service_role;
create function private.require_onboarding_enabled() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.onboarding_settings where enabled) then
    raise exception 'Onboarding is disabled' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_onboarding_enabled() from public, anon, authenticated;

-- Free identity verification is deliberately separate from paid memberships.
create table public.basic_onboarding_applications (
  user_id uuid primary key references auth.users(id),
  full_name text not null,
  email text not null,
  phone text not null,
  linkedin_url text not null,
  date_of_birth date not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create table public.onboarding_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.basic_onboarding_applications(user_id),
  kind text not null check (kind in ('photo', 'government_id')),
  id_type text,
  object_path text not null unique default extensions.gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  deleted_at timestamptz,
  uploaded_at timestamptz,
  deletion_attempted_at timestamptz,
  check ((kind = 'photo' and id_type is null) or (kind = 'government_id' and id_type in ('pan', 'aadhaar', 'passport')))
);
create index onboarding_documents_retention on public.onboarding_documents(expires_at) where deleted_at is null;
create index onboarding_documents_owner on public.onboarding_documents(user_id);
create table public.onboarding_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.basic_onboarding_applications(user_id),
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected')),
  guardian_email text,
  guardian_evidence text,
  guardian_received_at timestamptz,
  created_at timestamptz not null default now()
);
create index onboarding_reviews_owner on public.onboarding_reviews(user_id);
alter table public.basic_onboarding_applications enable row level security;
alter table public.onboarding_documents enable row level security;
alter table public.onboarding_reviews enable row level security;
create policy onboarding_application_read on public.basic_onboarding_applications for select to authenticated
using (user_id = (select auth.uid()) or private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy onboarding_document_read on public.onboarding_documents for select to authenticated
using (user_id = (select auth.uid()) or private.is_staff(array['admin','super_admin']::public.staff_role[]));
create policy onboarding_review_read on public.onboarding_reviews for select to authenticated
using (user_id = (select auth.uid()) or private.is_staff(array['admin','super_admin']::public.staff_role[]));
revoke all on public.basic_onboarding_applications, public.onboarding_documents, public.onboarding_reviews from anon, authenticated;
grant select on public.basic_onboarding_applications, public.onboarding_documents, public.onboarding_reviews to authenticated;
grant all on public.basic_onboarding_applications, public.onboarding_documents, public.onboarding_reviews to service_role;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onboarding-documents', 'onboarding-documents', false, 5242880, array['image/jpeg','image/png']);

create function public.submit_basic_onboarding(p_full_name text, p_phone text, p_linkedin_url text, p_date_of_birth date)
returns public.basic_onboarding_applications language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_result public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_date_of_birth is null or p_date_of_birth > ((now() at time zone 'Asia/Kolkata')::date - interval '16 years')::date then
    raise exception 'Minimum age is 16' using errcode = '22023';
  end if;
  if p_full_name is null or length(trim(p_full_name)) not between 2 and 120
    or p_phone is null or p_phone !~ '^\+?[0-9 ()-]{7,25}$'
    or length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 7
    or p_linkedin_url is null or p_linkedin_url !~ '^https://(www\.)?linkedin\.com/in/[A-Za-z0-9_%_-]+/?$' then
    raise exception 'Name, phone and personal LinkedIn profile are required' using errcode = '22023';
  end if;
  select email into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is null then raise exception 'Verified email required' using errcode = '42501'; end if;
  insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth)
  values(v_user,trim(p_full_name),v_email,trim(p_phone),p_linkedin_url,p_date_of_birth)
  returning * into v_result;
  return v_result;
end;
$$;

create function public.reserve_onboarding_document(p_kind text, p_id_type text default null)
returns public.onboarding_documents language plpgsql security definer set search_path = '' as $$
declare v_result public.onboarding_documents; v_status text;
begin
  perform private.require_onboarding_enabled();
  select status into v_status from public.basic_onboarding_applications where user_id = auth.uid() for update;
  if v_status is distinct from 'pending' then raise exception 'Pending application required' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('photo','government_id') or
     (p_kind = 'government_id' and (p_id_type is null or p_id_type not in ('pan','aadhaar','passport'))) or
     (p_kind = 'photo' and p_id_type is not null) then raise exception 'Invalid document type' using errcode = '22023'; end if;
  if exists(select 1 from public.onboarding_documents where user_id = auth.uid() and kind = p_kind and deleted_at is null and expires_at > now()) then
    raise exception 'An unexpired document slot already exists' using errcode = '23505';
  end if;
  insert into public.onboarding_documents(user_id,kind,id_type) values(auth.uid(),p_kind,p_id_type) returning * into v_result;
  return v_result;
end;
$$;

create function public.review_basic_onboarding(p_user_id uuid, p_decision text, p_guardian_email text default null, p_guardian_evidence text default null, p_guardian_received_at timestamptz default null)
returns public.basic_onboarding_applications language plpgsql security definer set search_path = '' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) or auth.uid() = p_user_id then
    raise exception 'Independent admin review required' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved','rejected') then raise exception 'Invalid decision' using errcode = '22023'; end if;
  select * into v_application from public.basic_onboarding_applications where user_id = p_user_id for update;
  if not found or v_application.status <> 'pending' then raise exception 'Pending application required' using errcode = '22023'; end if;
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
  insert into public.onboarding_reviews(user_id,reviewer_id,decision,guardian_email,guardian_evidence,guardian_received_at)
  values(p_user_id,auth.uid(),p_decision,p_guardian_email,p_guardian_evidence,p_guardian_received_at);
  update public.basic_onboarding_applications set status = p_decision, reviewed_at = now() where user_id = p_user_id returning * into v_application;
  return v_application;
end;
$$;

create function public.mark_onboarding_document_deleted(p_document_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.onboarding_documents d join storage.objects o on o.bucket_id = 'onboarding-documents' and o.name = d.object_path where d.id = p_document_id) then
    raise exception 'Delete the storage object first' using errcode = '22023';
  end if;
  update public.onboarding_documents set deleted_at = coalesce(deleted_at,now()) where id = p_document_id and expires_at <= now();
end;
$$;
revoke all on function public.submit_basic_onboarding(text,text,text,date), public.reserve_onboarding_document(text,text), public.review_basic_onboarding(uuid,text,text,text,timestamptz), public.mark_onboarding_document_deleted(uuid) from public, anon, authenticated;
grant execute on function public.submit_basic_onboarding(text,text,text,date), public.reserve_onboarding_document(text,text), public.review_basic_onboarding(uuid,text,text,text,timestamptz) to authenticated;
grant execute on function public.mark_onboarding_document_deleted(uuid) to service_role;

create function public.finalize_onboarding_document(p_document_id uuid)
returns public.onboarding_documents language plpgsql security definer set search_path = '' as $$
declare v_document public.onboarding_documents; v_uploaded_at timestamptz;
begin
  perform private.require_onboarding_enabled();
  perform 1 from public.basic_onboarding_applications
  where user_id=(select user_id from public.onboarding_documents where id=p_document_id) and status='pending' for update;
  if not found then raise exception 'Pending application required' using errcode = '22023'; end if;
  select * into v_document from public.onboarding_documents where id = p_document_id for update;
  if not found or v_document.deleted_at is not null or v_document.expires_at <= now() then
    raise exception 'Unexpired document reservation required' using errcode = '22023';
  end if;
  select created_at into v_uploaded_at from storage.objects where bucket_id='onboarding-documents' and name=v_document.object_path;
  if v_uploaded_at is null then raise exception 'Uploaded storage object required' using errcode = '22023'; end if;
  if v_document.uploaded_at is null then
    update public.onboarding_documents set uploaded_at=v_uploaded_at, expires_at=v_uploaded_at+interval '30 days'
    where id=p_document_id returning * into v_document;
  end if;
  return v_document;
end;
$$;
revoke all on function public.finalize_onboarding_document(uuid) from public, anon, authenticated;
grant execute on function public.finalize_onboarding_document(uuid) to service_role;

create function public.list_due_onboarding_documents(p_limit integer default 100)
returns setof public.onboarding_documents language sql security definer set search_path = '' as $$
  with due as (
    select d.id from public.onboarding_documents d
    where d.expires_at <= now()
      and (d.deletion_attempted_at is null or d.deletion_attempted_at <= now()-interval '5 minutes')
      and (d.deleted_at is null or exists (
        select 1 from storage.objects o where o.bucket_id = 'onboarding-documents' and o.name = d.object_path
      ))
    order by d.deletion_attempted_at nulls first, d.expires_at
    limit greatest(1, least(p_limit, 100)) for update skip locked
  )
  update public.onboarding_documents d set deletion_attempted_at=now() from due where d.id=due.id returning d.*;
$$;
revoke all on function public.list_due_onboarding_documents(integer) from public, anon, authenticated;
grant execute on function public.list_due_onboarding_documents(integer) to service_role;
