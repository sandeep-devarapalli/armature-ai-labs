-- Preserve historical acceptance; never silently accept the launch notice for an applicant.
alter table public.onboarding_notice_acceptances
  drop constraint onboarding_notice_acceptances_notice_version_check;
alter table public.onboarding_notice_acceptances
  add constraint onboarding_notice_acceptances_notice_version_check
  check (notice_version in ('2026-09-26', '2026-09-26-release-1'));

create or replace function private.require_onboarding_notice(p_user_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_revision integer;
begin
  select revision into v_revision from public.basic_onboarding_applications where user_id=p_user_id for update;
  if found and not exists(select 1 from public.onboarding_notice_acceptances
    where user_id=p_user_id and revision=v_revision and notice_version='2026-09-26-release-1') then
    raise exception 'Current privacy notice acceptance required' using errcode='42501';
  end if;
end;
$$;

create or replace function public.submit_basic_onboarding(p_full_name text,p_phone text,p_linkedin_url text,p_date_of_birth date,p_notice_version text)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  if p_notice_version is distinct from '2026-09-26-release-1' then
    raise exception 'Current privacy notice acceptance required' using errcode='42501';
  end if;
  v_application := private.submit_basic_onboarding(p_full_name,p_phone,p_linkedin_url,p_date_of_birth);
  insert into public.onboarding_notice_acceptances(user_id,revision,notice_version)
    values(v_application.user_id,v_application.revision,p_notice_version);
  return v_application;
end;
$$;

create or replace function public.resubmit_basic_onboarding(p_full_name text,p_phone text,p_linkedin_url text,p_date_of_birth date,p_notice_version text)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare v_application public.basic_onboarding_applications;
begin
  perform private.require_onboarding_enabled();
  if p_notice_version is distinct from '2026-09-26-release-1' then
    raise exception 'Current privacy notice acceptance required' using errcode='42501';
  end if;
  v_application := private.resubmit_basic_onboarding(p_full_name,p_phone,p_linkedin_url,p_date_of_birth);
  insert into public.onboarding_notice_acceptances(user_id,revision,notice_version)
    values(v_application.user_id,v_application.revision,p_notice_version);
  return v_application;
end;
$$;
