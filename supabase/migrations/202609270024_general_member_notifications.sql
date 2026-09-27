-- General delivery remains opt-in; held history is never promoted.
alter table public.member_notification_settings add column all_members_enabled boolean not null default false;

create or replace function private.enqueue_member_notification(p_user uuid,p_recipient uuid,p_event text,p_kind text,p_status text,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('member-notice:'||p_event||':'||p_recipient||':'||p_kind,0));
 if exists(select 1 from public.member_notification_tombstones where event_key=p_event and recipient_id=p_recipient and kind=p_kind and template_version=1) then return; end if;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state)
 select p_user,u.id,lower(u.email),p_event,p_kind,p_status,p_revision,
 case when s.enabled and (s.all_members_enabled or lower(u.email)=any(s.pilot_recipients)) then 'pending' else 'held' end
 from auth.users u cross join public.member_notification_settings s
 where u.id=p_recipient and u.email_confirmed_at is not null and u.deleted_at is null
 on conflict(event_key,recipient_id,kind,template_version) do nothing;
end;
$$;
create or replace function private.member_notification_base_eligible(n public.member_notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_notification_settings s
 join auth.users r on r.id=n.recipient_id join auth.users u on u.id=n.user_id
 join public.basic_onboarding_applications a on a.user_id=u.id
 where s.enabled and (s.all_members_enabled or n.recipient_email=any(s.pilot_recipients))
 and r.email_confirmed_at is not null and r.deleted_at is null and lower(r.email)=n.recipient_email
 and u.deleted_at is null and u.email_confirmed_at is not null
 and a.status=n.expected_status and a.revision=n.application_revision
 and (n.kind not in ('ready','resubmission_ready','admin_ready') or private.member_notification_ready(n.user_id))
 and (n.kind<>'registration_saved' or (not private.member_notification_ready(n.user_id) and exists(select 1 from public.onboarding_notice_acceptances
 where user_id=n.user_id and revision=a.revision and notice_version='2026-09-26-release-1')))
 and (n.kind<>'admin_ready' or (lower(r.email)='hello@armatureailabs.com' and private.membership_role(r.id) in ('admin','super_admin'))));
$$;
