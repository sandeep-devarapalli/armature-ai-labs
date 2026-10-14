-- New talent events reuse the protected delivery queue; existing history is not replayed.
alter table public.member_notifications add column talent_submission_id uuid references private.talent_submissions(id);
alter table public.member_notifications drop constraint member_notifications_kind_check;
alter table public.member_notifications add constraint member_notifications_kind_check check(kind in (
 'registration_saved','ready','resubmission_ready','admin_ready','corrections_requested','approved','rejected','revoked','reinstated',
 'talent_submission_admin','talent_submission_received','talent_submission_approved','talent_submission_rejected','talent_submission_changes_requested',
 'talent_admin_claim','talent_admin_correction','talent_admin_removal',
 'talent_claim_approved','talent_claim_rejected','talent_correction_approved','talent_correction_rejected','talent_removal_approved','talent_removal_rejected'));
alter table public.member_notifications drop constraint member_notifications_template_version_check;
alter table public.member_notifications add constraint member_notifications_template_version_check check(
 (kind like 'talent_submission_%' and template_version=5 and talent_submission_id is not null and talent_request_id is null)
 or (kind like 'talent_%' and kind not like 'talent_submission_%' and template_version=4 and talent_request_id is not null and talent_submission_id is null)
 or (kind not like 'talent_%' and talent_request_id is null and talent_submission_id is null and (template_version in (1,3) or (template_version=2 and kind='admin_ready'))));
create index member_notifications_talent_submission on public.member_notifications(talent_submission_id) where talent_submission_id is not null;

create function private.enqueue_talent_submission_notification(p_submission uuid,p_recipient uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.talent_submissions; event text;
begin
 select * into r from private.talent_submissions where id=p_submission;
 if not found then return; end if;
 if (r.status='pending' and p_kind not in ('talent_submission_admin','talent_submission_received'))
 or (r.status in ('approved','rejected','changes_requested') and p_kind<>'talent_submission_'||r.status)
 or r.status='draft' or (p_kind<>'talent_submission_admin' and p_recipient<>r.requester_id) then
 raise exception 'Notification does not match profile submission' using errcode='22023'; end if;
 event:='talent-submission:'||r.id::text||':'||r.revision::text||':'||r.status;
 perform pg_advisory_xact_lock(hashtextextended('member-notice:'||event||':'||p_recipient||':'||p_kind,0));
 if exists(select 1 from public.member_notification_tombstones where event_key=event and recipient_id=p_recipient and kind=p_kind)
 or exists(select 1 from public.member_notifications where event_key=event and recipient_id=p_recipient and kind=p_kind) then return; end if;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,template_version,talent_submission_id)
 select r.requester_id,u.id,lower(u.email),event,p_kind,r.status,r.revision,
 case when s.enabled and s.talent_notifications_enabled and (s.all_members_enabled or lower(u.email)=any(s.pilot_recipients)) then 'pending' else 'held' end,5,r.id
 from auth.users u cross join public.member_notification_settings s
 where u.id=p_recipient and u.email_confirmed_at is not null and u.deleted_at is null
 and u.email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from public.memberships m where m.user_id in (u.id,r.requester_id) and m.status='suspended')
 and not exists(select 1 from public.basic_onboarding_applications a where a.user_id in (u.id,r.requester_id) and a.status='revoked')
 and exists(select 1 from auth.users requester where requester.id=r.requester_id and requester.email_confirmed_at is not null and requester.deleted_at is null and (requester.banned_until is null or requester.banned_until<=now()))
 and (p_kind<>'talent_submission_admin' or (lower(u.email)='hello@armatureailabs.com' and exists(select 1 from public.staff_roles sr where sr.user_id=u.id and sr.role in ('admin','super_admin'))))
 on conflict(event_key,recipient_id,kind,template_version) do nothing;
end $$;

create function private.queue_talent_submission_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if new.status='pending' and old.status='draft' then
  perform private.enqueue_talent_submission_notification(new.id,new.requester_id,'talent_submission_received');
  for recipient in select u.id from auth.users u join public.staff_roles s on s.user_id=u.id
   where lower(u.email)='hello@armatureailabs.com' and s.role in ('admin','super_admin') loop
   perform private.enqueue_talent_submission_notification(new.id,recipient,'talent_submission_admin');
  end loop;
 elsif old.status='pending' and new.status in ('approved','rejected','changes_requested') then
  perform private.enqueue_talent_submission_notification(new.id,new.requester_id,'talent_submission_'||new.status);
 end if;
 return new;
end $$;
create trigger talent_submission_notification after update of status on private.talent_submissions
 for each row execute function private.queue_talent_submission_notification();

alter function private.member_notification_base_eligible(public.member_notifications) rename to member_notification_before_submissions_eligible;
create function private.member_notification_base_eligible(n public.member_notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select case when n.kind like 'talent_submission_%' then exists(
 select 1 from private.talent_submissions t
 join auth.users r on r.id=n.recipient_id join auth.users u on u.id=t.requester_id
 cross join public.member_notification_settings s
 where t.id=n.talent_submission_id and n.template_version=5 and n.user_id=t.requester_id
 and t.status=n.expected_status and n.application_revision=t.revision and n.event_key='talent-submission:'||t.id::text||':'||t.revision::text||':'||t.status
 and s.enabled and s.talent_notifications_enabled and (s.all_members_enabled or n.recipient_email=any(s.pilot_recipients))
 and r.email_confirmed_at is not null and r.deleted_at is null and lower(r.email)=n.recipient_email
 and r.email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
 and u.email_confirmed_at is not null and u.deleted_at is null
 and (r.banned_until is null or r.banned_until<=now()) and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from public.memberships m where m.user_id in (r.id,u.id) and m.status='suspended')
 and not exists(select 1 from public.basic_onboarding_applications a where a.user_id in (r.id,u.id) and a.status='revoked')
 and ((n.kind='talent_submission_admin' and t.status='pending' and lower(r.email)='hello@armatureailabs.com'
 and exists(select 1 from public.staff_roles sr where sr.user_id=r.id and sr.role in ('admin','super_admin')))
 or (n.kind='talent_submission_received' and t.status='pending' and r.id=t.requester_id)
 or (n.kind='talent_submission_'||t.status and t.status in ('approved','rejected','changes_requested') and r.id=t.requester_id)))
 else private.member_notification_before_submissions_eligible(n) end;
$$;

revoke all on function private.enqueue_talent_submission_notification(uuid,uuid,text),private.queue_talent_submission_notification(),private.member_notification_base_eligible(public.member_notifications),private.member_notification_before_submissions_eligible(public.member_notifications) from public,anon,authenticated,service_role;
