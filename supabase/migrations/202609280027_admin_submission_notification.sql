-- Existing queued v1 messages remain immutable; new admin readiness uses the submission checklist.
alter table public.member_notifications drop constraint member_notifications_template_version_check;
alter table public.member_notifications add constraint member_notifications_template_version_check check(template_version=1 or (template_version=2 and kind='admin_ready'));
create or replace function private.enqueue_member_notification(p_user uuid,p_recipient uuid,p_event text,p_kind text,p_status text,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
declare v_version integer:=case when p_kind='admin_ready' then 2 else 1 end;
begin
 perform pg_advisory_xact_lock(hashtextextended('member-notice:'||p_event||':'||p_recipient||':'||p_kind,0));
 if exists(select 1 from public.member_notification_tombstones where event_key=p_event and recipient_id=p_recipient and kind=p_kind) then return; end if;
 if exists(select 1 from public.member_notifications where event_key=p_event and recipient_id=p_recipient and kind=p_kind) then return; end if;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,template_version)
 select p_user,u.id,lower(u.email),p_event,p_kind,p_status,p_revision,
 case when s.enabled and (s.all_members_enabled or lower(u.email)=any(s.pilot_recipients)) then 'pending' else 'held' end,v_version
 from auth.users u cross join public.member_notification_settings s
 where u.id=p_recipient and u.email_confirmed_at is not null and u.deleted_at is null
 on conflict(event_key,recipient_id,kind,template_version) do nothing;
end;
$$;
