-- Reserved test destinations must never enter the external delivery path.
create function private.notification_reserved_recipient(p_email text) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(lower(btrim(split_part(p_email,'@',2))) ~ '(^|\.)(test|invalid|localhost|example|example\.(com|org|net))\.?$',false);
$$;
create function public.skip_reserved_member_notification(p_id uuid,p_lease_token uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 update public.member_notifications set
 state=case when first_attempt_at is null then 'suppressed' else 'unknown' end,
 completed_at=now(),lease_token=null,lease_until=null
 where id=p_id and state='leased' and lease_token=p_lease_token and lease_until>now()
 and private.notification_reserved_recipient(recipient_email);
 return found;
end; $$;
revoke all on function private.notification_reserved_recipient(text),public.skip_reserved_member_notification(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.skip_reserved_member_notification(uuid,uuid) to service_role;

-- Explicit operator evidence only; raw provider receipts remain intact.
create table private.synthetic_notification_resolutions (
 provider_id text primary key check(provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 recipient_hash text not null check(recipient_hash ~ '^[0-9a-f]{64}$'),
 recipient_domain text not null check(private.notification_reserved_recipient('audit@'||recipient_domain)),
 subject text not null check(length(btrim(subject)) between 1 and 200),
 evidence text not null check(length(btrim(evidence)) between 40 and 2000),
 reviewed_by text not null check(length(btrim(reviewed_by)) between 3 and 200),
 resolved_at timestamptz not null default now()
);
alter table private.synthetic_notification_resolutions enable row level security;
revoke all on private.synthetic_notification_resolutions from public,anon,authenticated,service_role;
create function private.resolve_synthetic_notification(p_provider_id text,p_recipient text,p_subject text,p_evidence text,p_reviewed_by text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.notification_reserved_recipient(p_recipient)
 or not exists(select 1 from public.member_notification_events where provider_id=p_provider_id)
 or exists(select 1 from public.member_notifications where provider_id=p_provider_id)
 or exists(select 1 from private.ecosystem_notifications where provider_id=p_provider_id) then
  raise exception 'Reserved recipient and unmatched provider evidence required' using errcode='22023';
 end if;
 insert into private.synthetic_notification_resolutions(provider_id,recipient_hash,recipient_domain,subject,evidence,reviewed_by)
 values(p_provider_id,encode(extensions.digest(lower(btrim(p_recipient)),'sha256'),'hex'),lower(btrim(split_part(p_recipient,'@',2))),p_subject,p_evidence,p_reviewed_by);
end; $$;
revoke all on function private.resolve_synthetic_notification(text,text,text,text,text) from public,anon,authenticated,service_role;

create or replace function public.member_notification_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and coalesce(private.membership_role(auth.uid()),'') not in ('admin','super_admin') then
 raise exception 'Administrator access required' using errcode='42501'; end if;
 select jsonb_build_object('sending_enabled',s.enabled,'cleanup_enabled',s.cleanup_enabled,'last_cleanup_at',s.last_cleanup_at,
 'cleanup_overdue',s.cleanup_enabled and (s.last_cleanup_at is null or s.last_cleanup_at<now()-interval '26 hours'),
 'held',(select count(*) from public.member_notifications where state='held'),
 'queue_overdue',(select count(*) from public.member_notifications where state='pending' and available_at<now()-interval '15 minutes'),
 'expired_leases',(select count(*) from public.member_notifications where state in ('leased','sending') and lease_until<now()),
 'unknown',(select count(*) from public.member_notifications where state='unknown'),
 'failed',(select count(*) from public.member_notifications where state='failed'),
 'delivery_unconfirmed',(select count(*) from public.member_notifications where state='accepted' and delivery_state in ('unconfirmed','sent','delivery_delayed') and completed_at<now()-interval '24 hours'),
 'unmatched_receipts',(select count(*) from public.member_notification_events e where received_at<now()-interval '1 hour'
 and not exists(select 1 from public.member_notifications n where n.provider_id=e.provider_id)
 and not exists(select 1 from public.member_notification_tombstones t where t.provider_id=e.provider_id)
 and not exists(select 1 from private.ecosystem_notifications a where a.provider_id=e.provider_id)
 and not exists(select 1 from private.synthetic_notification_resolutions resolved where resolved.provider_id=e.provider_id)
 and not exists(select 1 from private.auth_notification_sources a where a.provider_id=e.provider_id
  and exists(select 1 from public.member_notification_events delivered where delivered.provider_id=e.provider_id and delivered.event_type='email.delivered')
  and not exists(select 1 from public.member_notification_events failed where failed.provider_id=e.provider_id and failed.event_type in ('email.failed','email.bounced','email.complained','email.suppressed')))),
 'history_due',(select count(*) from public.member_notifications q where private.member_notification_cleanup_due(q))) into v_result
 from public.member_notification_settings s;
 return v_result;
end;
$$;
