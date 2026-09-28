-- Existing complete pending applications retain review eligibility without replaying notifications.
alter table public.basic_onboarding_applications add column submitted_revision integer, add column submitted_at timestamptz,
 add constraint onboarding_submission_pair check ((submitted_revision is null)=(submitted_at is null) and (submitted_revision is null or submitted_revision between 1 and revision));
alter function private.member_notification_ready(uuid) rename to member_application_complete;
update public.basic_onboarding_applications set submitted_revision=revision,submitted_at=now()
 where status='pending' and private.member_application_complete(user_id);
create function private.member_notification_ready(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.member_application_complete(p_user) and exists(select 1 from public.basic_onboarding_applications where user_id=p_user and submitted_revision=revision and submitted_at is not null);
$$;
revoke all on function private.member_notification_ready(uuid) from public,anon,authenticated,service_role;
create function public.submit_basic_application_for_review(p_expected_revision integer)
returns public.basic_onboarding_applications language plpgsql security definer set search_path='' as $$
declare a public.basic_onboarding_applications;
begin
 perform private.require_onboarding_enabled();
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into a from public.basic_onboarding_applications where user_id=auth.uid() for update;
 if a.user_id is null or a.status<>'pending' then raise exception 'Pending application required' using errcode='22023'; end if;
 if p_expected_revision is distinct from a.revision then raise exception 'Application changed; reload before submitting' using errcode='40001'; end if;
 if a.submitted_revision=a.revision then return a; end if;
 perform 1 from public.onboarding_documents where user_id=a.user_id for share;
 if not private.member_application_complete(a.user_id) then raise exception 'Complete profile, current privacy acceptance and scanned photo and ID required' using errcode='22023'; end if;
 update public.basic_onboarding_applications set submitted_revision=revision,submitted_at=now() where user_id=a.user_id returning * into a;
 return a;
end; $$;
revoke all on function public.submit_basic_application_for_review(integer) from public,anon;
grant execute on function public.submit_basic_application_for_review(integer) to authenticated;
create trigger member_submission_notifications after update of submitted_revision on public.basic_onboarding_applications
 for each row when(new.submitted_revision is distinct from old.submitted_revision) execute function private.queue_member_readiness();
create function private.require_submitted_membership_review() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.decision='approved' and new.previous_status='pending' and not exists(select 1 from public.basic_onboarding_applications a where a.user_id=new.user_id and a.submitted_revision=a.revision and a.submitted_at is not null) then
  raise exception 'Member must submit the application for review first' using errcode='22023';
 end if;
 return new;
end; $$;
revoke all on function private.require_submitted_membership_review() from public,anon,authenticated,service_role;
create trigger require_submitted_membership_review before insert on public.onboarding_reviews for each row execute function private.require_submitted_membership_review();
