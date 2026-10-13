-- New talent events reuse the protected delivery queue; existing history is not replayed.
alter table public.member_notification_settings add column talent_notifications_enabled boolean not null default false;
alter table public.member_notifications add column talent_request_id uuid references private.talent_requests(id);
alter table public.member_notifications drop constraint member_notifications_kind_check;
alter table public.member_notifications add constraint member_notifications_kind_check check(kind in (
 'registration_saved','ready','resubmission_ready','admin_ready','corrections_requested','approved','rejected','revoked','reinstated',
 'talent_admin_claim','talent_admin_correction','talent_admin_removal',
 'talent_claim_approved','talent_claim_rejected','talent_correction_approved','talent_correction_rejected','talent_removal_approved','talent_removal_rejected'));
alter table public.member_notifications drop constraint member_notifications_template_version_check;
alter table public.member_notifications add constraint member_notifications_template_version_check check(
 (kind like 'talent_%' and template_version=4 and talent_request_id is not null)
 or (kind not like 'talent_%' and talent_request_id is null and (template_version in (1,3) or (template_version=2 and kind='admin_ready'))));
create index member_notifications_talent_request on public.member_notifications(talent_request_id) where talent_request_id is not null;

create function private.enqueue_talent_notification(p_request uuid,p_recipient uuid,p_kind text) returns void
language plpgsql security definer set search_path='' as $$
declare r private.talent_requests; event text;
begin
 select * into r from private.talent_requests where id=p_request;
 if not found then return; end if;
 if p_kind not in ('talent_admin_'||r.kind,'talent_'||r.kind||'_approved','talent_'||r.kind||'_rejected')
 or (p_kind like 'talent_admin_%' and r.status<>'pending')
 or (p_kind not like 'talent_admin_%' and (r.status='pending' or p_kind<>'talent_'||r.kind||'_'||r.status or p_recipient<>r.requester_id)) then
 raise exception 'Notification does not match talent request' using errcode='22023'; end if;
 event:='talent:'||r.id::text||':'||r.status;
 perform pg_advisory_xact_lock(hashtextextended('member-notice:'||event||':'||p_recipient||':'||p_kind,0));
 if exists(select 1 from public.member_notification_tombstones where event_key=event and recipient_id=p_recipient and kind=p_kind)
 or exists(select 1 from public.member_notifications where event_key=event and recipient_id=p_recipient and kind=p_kind) then return; end if;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,template_version,talent_request_id)
 select r.requester_id,u.id,lower(u.email),event,p_kind,r.status,r.base_revision,
 case when s.enabled and s.talent_notifications_enabled and (s.all_members_enabled or lower(u.email)=any(s.pilot_recipients)) then 'pending' else 'held' end,4,r.id
 from auth.users u cross join public.member_notification_settings s
 where u.id=p_recipient and u.email_confirmed_at is not null and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from public.memberships m where m.user_id in (u.id,r.requester_id) and m.status='suspended')
 and not exists(select 1 from public.basic_onboarding_applications a where a.user_id in (u.id,r.requester_id) and a.status='revoked')
 and exists(select 1 from auth.users requester where requester.id=r.requester_id and requester.email_confirmed_at is not null and requester.deleted_at is null and (requester.banned_until is null or requester.banned_until<=now()))
 and (p_kind not like 'talent_admin_%' or (lower(u.email)='hello@armatureailabs.com' and exists(select 1 from public.staff_roles sr where sr.user_id=u.id and sr.role in ('admin','super_admin'))))
 on conflict(event_key,recipient_id,kind,template_version) do nothing;
end $$;

create function private.queue_talent_notification() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 if tg_op='INSERT' and new.status='pending' then
  for recipient in select u.id from auth.users u join public.staff_roles s on s.user_id=u.id
   where lower(u.email)='hello@armatureailabs.com' and s.role in ('admin','super_admin') loop
   perform private.enqueue_talent_notification(new.id,recipient,'talent_admin_'||new.kind);
  end loop;
 elsif tg_op='UPDATE' and old.status='pending' and new.status in ('approved','rejected') then
  perform private.enqueue_talent_notification(new.id,new.requester_id,'talent_'||new.kind||'_'||new.status);
 end if;
 return new;
end $$;
create trigger talent_request_notification after insert or update of status on private.talent_requests
 for each row execute function private.queue_talent_notification();

-- Preserve membership eligibility unchanged and branch only the new template family.
alter function private.member_notification_base_eligible(public.member_notifications) rename to member_notification_membership_eligible;
create function private.member_notification_base_eligible(n public.member_notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select case when n.kind like 'talent_%' then exists(
 select 1 from private.talent_requests t
 join auth.users r on r.id=n.recipient_id join auth.users u on u.id=t.requester_id
 cross join public.member_notification_settings s
 where t.id=n.talent_request_id and n.template_version=4 and n.user_id=t.requester_id
 and t.status=n.expected_status and n.event_key='talent:'||t.id::text||':'||t.status
 and s.enabled and s.talent_notifications_enabled and (s.all_members_enabled or n.recipient_email=any(s.pilot_recipients))
 and r.email_confirmed_at is not null and r.deleted_at is null and lower(r.email)=n.recipient_email
 and u.email_confirmed_at is not null and u.deleted_at is null
 and (r.banned_until is null or r.banned_until<=now()) and (u.banned_until is null or u.banned_until<=now())
 and not exists(select 1 from public.memberships m where m.user_id in (r.id,u.id) and m.status='suspended')
 and not exists(select 1 from public.basic_onboarding_applications a where a.user_id in (r.id,u.id) and a.status='revoked')
 and ((n.kind='talent_admin_'||t.kind and t.status='pending' and lower(r.email)='hello@armatureailabs.com'
 and exists(select 1 from public.staff_roles sr where sr.user_id=r.id and sr.role in ('admin','super_admin')))
 or (n.kind='talent_'||t.kind||'_'||t.status and t.status in ('approved','rejected') and r.id=t.requester_id)))
 else private.member_notification_membership_eligible(n) end;
$$;

create function public.talent_my_requests() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.talent_require_account();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'status',r.status,'review_note',r.review_note,
 'created_at',r.created_at,'reviewed_at',r.reviewed_at,'profile_id',r.profile_id,'profile_name',p.data->>'name','published',p.published)
 order by r.created_at desc,r.id) from private.talent_requests r join public.talent_profiles p on p.id=r.profile_id where r.requester_id=u),'[]'::jsonb);
end $$;
revoke all on function private.enqueue_talent_notification(uuid,uuid,text),private.queue_talent_notification(),private.member_notification_base_eligible(public.member_notifications) from public,anon,authenticated,service_role;
revoke all on function public.talent_my_requests() from public,anon,authenticated,service_role;
grant execute on function public.talent_my_requests() to authenticated;
