create table public.onboarding_notice_acceptances (
  user_id uuid not null references public.basic_onboarding_applications(user_id),
  revision integer not null check (revision > 0),
  notice_version text not null check (notice_version = '2026-09-26'),
  accepted_at timestamptz not null default now(),
  primary key (user_id, revision)
);
alter table public.onboarding_notice_acceptances enable row level security;
create policy onboarding_notice_read on public.onboarding_notice_acceptances for select to authenticated
  using(user_id=(select auth.uid()) or private.is_staff(array['admin','super_admin']::public.staff_role[]));
revoke all on public.onboarding_notice_acceptances from public,anon,authenticated,service_role;
grant select on public.onboarding_notice_acceptances to authenticated,service_role;

create function private.require_onboarding_notice(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_revision integer;
begin
  select revision into v_revision from public.basic_onboarding_applications where user_id=p_user_id for update;
  if found and not exists(select 1 from public.onboarding_notice_acceptances
    where user_id=p_user_id and revision=v_revision and notice_version='2026-09-26') then
    raise exception 'Current privacy notice acceptance required' using errcode='42501';
  end if;
end;
$$;
revoke all on function private.require_onboarding_notice(uuid) from public,anon,authenticated,service_role;

alter function public.submit_basic_onboarding(text,text,text,date) set schema private;
revoke all on function private.submit_basic_onboarding(text,text,text,date) from public,anon,authenticated,service_role;
create function public.submit_basic_onboarding(p_full_name text,p_phone text,p_linkedin_url text,p_date_of_birth date,p_notice_version text)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  if p_notice_version is distinct from '2026-09-26' then
    raise exception 'Current privacy notice acceptance required' using errcode='42501';
  end if;
  v_application := private.submit_basic_onboarding(p_full_name,p_phone,p_linkedin_url,p_date_of_birth);
  insert into public.onboarding_notice_acceptances(user_id,revision,notice_version)
    values(v_application.user_id,v_application.revision,p_notice_version);
  return v_application;
end;
$$;
revoke all on function public.submit_basic_onboarding(text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.submit_basic_onboarding(text,text,text,date,text) to authenticated;

alter function public.resubmit_basic_onboarding(text,text,text,date) set schema private;
revoke all on function private.resubmit_basic_onboarding(text,text,text,date) from public,anon,authenticated,service_role;
create function public.resubmit_basic_onboarding(p_full_name text,p_phone text,p_linkedin_url text,p_date_of_birth date,p_notice_version text)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  if p_notice_version is distinct from '2026-09-26' then
    raise exception 'Current privacy notice acceptance required' using errcode='42501';
  end if;
  v_application := private.resubmit_basic_onboarding(p_full_name,p_phone,p_linkedin_url,p_date_of_birth);
  insert into public.onboarding_notice_acceptances(user_id,revision,notice_version)
    values(v_application.user_id,v_application.revision,p_notice_version);
  return v_application;
end;
$$;
revoke all on function public.resubmit_basic_onboarding(text,text,text,date,text) from public,anon,authenticated;
grant execute on function public.resubmit_basic_onboarding(text,text,text,date,text) to authenticated;

alter function public.reserve_onboarding_document(text,text) set schema private;
revoke all on function private.reserve_onboarding_document(text,text) from public,anon,authenticated,service_role;
create function public.reserve_onboarding_document(p_kind text,p_id_type text default null)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
begin
  perform private.require_onboarding_enabled();
  perform private.require_onboarding_notice(auth.uid());
  return private.reserve_onboarding_document(p_kind,p_id_type);
end;
$$;
revoke all on function public.reserve_onboarding_document(text,text) from public,anon,authenticated,service_role;
grant execute on function public.reserve_onboarding_document(text,text) to authenticated;

alter function public.finalize_onboarding_document(uuid) set schema private;
revoke all on function private.finalize_onboarding_document(uuid) from public,anon,authenticated,service_role;
create function public.finalize_onboarding_document(p_document_id uuid)
returns public.onboarding_documents language plpgsql security definer set search_path='' as $$
begin
  perform private.require_onboarding_enabled();
  perform private.require_onboarding_notice((select user_id from public.onboarding_documents where id=p_document_id));
  return private.finalize_onboarding_document(p_document_id);
end;
$$;
revoke all on function public.finalize_onboarding_document(uuid) from public,anon,authenticated,service_role;
grant execute on function public.finalize_onboarding_document(uuid) to service_role;

alter function public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer) set schema private;
revoke all on function private.review_basic_onboarding(uuid,text,text,text,timestamptz,integer) from public,anon,authenticated,service_role;
create function public.review_basic_onboarding(p_user_id uuid,p_decision text,p_guardian_email text default null,p_guardian_evidence text default null,p_guardian_received_at timestamptz default null,p_expected_revision integer default null)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
begin
  perform private.require_onboarding_enabled();
  if not private.is_staff(array['admin','super_admin']::public.staff_role[]) or auth.uid()=p_user_id then
    raise exception 'Independent admin review required' using errcode='42501';
  end if;
  perform private.require_onboarding_notice(p_user_id);
  return private.review_basic_onboarding(p_user_id,p_decision,p_guardian_email,p_guardian_evidence,p_guardian_received_at,p_expected_revision);
end;
$$;
revoke all on function public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer) from public,anon,authenticated,service_role;
grant execute on function public.review_basic_onboarding(uuid,text,text,text,timestamptz,integer) to authenticated;

