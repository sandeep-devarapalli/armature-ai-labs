alter table public.basic_onboarding_applications drop constraint basic_onboarding_applications_status_check;
alter table public.basic_onboarding_applications add constraint basic_onboarding_applications_status_check
  check(status in ('pending','approved','rejected','corrections_requested'));
alter table public.basic_onboarding_applications add column revision integer not null default 1 check(revision > 0);
alter table public.onboarding_reviews drop constraint onboarding_reviews_decision_check;
alter table public.onboarding_reviews add constraint onboarding_reviews_decision_check
  check(decision in ('approved','rejected','corrections_requested'));
alter table public.onboarding_reviews add column reason text;
alter table public.onboarding_reviews add constraint onboarding_correction_reason_check
  check(decision <> 'corrections_requested' or (reason is not null and length(trim(reason)) between 10 and 1000));

create table public.onboarding_resubmissions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.basic_onboarding_applications(user_id),
  revision integer not null check(revision > 1),
  created_at timestamptz not null default now(),
  unique(user_id,revision)
);
alter table public.onboarding_resubmissions enable row level security;
create policy onboarding_resubmission_read on public.onboarding_resubmissions for select to authenticated
  using(user_id=(select auth.uid()) or private.is_staff(array['admin','super_admin']::public.staff_role[]));
revoke all on public.onboarding_resubmissions from anon,authenticated;
grant select on public.onboarding_resubmissions to authenticated;
grant all on public.onboarding_resubmissions to service_role;

create function public.request_onboarding_corrections(p_user_id uuid,p_reason text,p_expected_revision integer default null)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
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
  insert into public.onboarding_reviews(user_id,reviewer_id,decision,reason)
    values(p_user_id,auth.uid(),'corrections_requested',trim(p_reason));
  update public.onboarding_documents set expires_at=least(expires_at,now()) where user_id=p_user_id;
  update public.basic_onboarding_applications set status='corrections_requested',reviewed_at=now()
    where user_id=p_user_id returning * into v_application;
  return v_application;
end;
$$;

create function public.resubmit_basic_onboarding(p_full_name text, p_phone text, p_linkedin_url text, p_date_of_birth date)
returns public.basic_onboarding_applications language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_status text;
  v_result public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  if v_user is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  select status into v_status from public.basic_onboarding_applications where user_id=v_user for update;
  if v_status is distinct from 'corrections_requested' then raise exception 'Corrections requested application required' using errcode='22023'; end if;
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
  update public.basic_onboarding_applications set full_name=trim(p_full_name),email=v_email,
    phone=trim(p_phone),linkedin_url=p_linkedin_url,date_of_birth=p_date_of_birth,
    status='pending',reviewed_at=null,revision=revision+1 where user_id=v_user returning * into v_result;
  insert into public.onboarding_resubmissions(user_id,revision) values(v_user,v_result.revision);
  return v_result;
end;
$$;

drop function public.review_basic_onboarding(uuid,text,text,text,timestamptz);
create function public.review_basic_onboarding(p_user_id uuid, p_decision text, p_guardian_email text default null, p_guardian_evidence text default null, p_guardian_received_at timestamptz default null, p_expected_revision integer default null)
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
  insert into public.onboarding_reviews(user_id,reviewer_id,decision,guardian_email,guardian_evidence,guardian_received_at)
  values(p_user_id,auth.uid(),p_decision,p_guardian_email,p_guardian_evidence,p_guardian_received_at);
  update public.basic_onboarding_applications set status = p_decision, reviewed_at = now() where user_id = p_user_id returning * into v_application;
  return v_application;
end;
$$;

revoke all on function public.request_onboarding_corrections(uuid,text,integer),public.resubmit_basic_onboarding(text,text,text,date),public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.request_onboarding_corrections(uuid,text,integer),public.resubmit_basic_onboarding(text,text,text,date),public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer) to authenticated;
