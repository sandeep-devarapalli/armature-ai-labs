-- Classify positively identified Auth email without discarding delivery reports.
create table private.auth_notification_sources (
 provider_id text primary key check(provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 sender text not null check(sender='no-reply@mail.armatureailabs.com'),
 subject text not null check(subject='Your sign-in link'),
 source text not null check(source in ('signed_webhook','operator_verified')),
 source_event_id text,
 source_occurred_at timestamptz not null check(isfinite(source_occurred_at)),
 evidence text not null check(length(btrim(evidence)) between 20 and 1000),
 classified_at timestamptz not null default now(),
 check(source<>'signed_webhook' or (source_event_id is not null and length(source_event_id) between 1 and 200))
);
alter table private.auth_notification_sources enable row level security;
revoke all on private.auth_notification_sources from public,anon,authenticated,service_role;

create function public.record_classified_notification_event(p_event_id text,p_provider_id text,p_event_type text,p_occurred_at timestamptz,p_sender text,p_subject text) returns boolean
language plpgsql security definer set search_path='' as $$
declare inserted boolean;
begin
 -- The existing function serializes both callback orders and rejects conflicting event IDs.
 inserted:=public.record_member_notification_event(p_event_id,p_provider_id,p_event_type,p_occurred_at);
 if p_subject='Your sign-in link' and p_sender in ('no-reply@mail.armatureailabs.com','Armature AI Labs <no-reply@mail.armatureailabs.com>','"Armature AI Labs" <no-reply@mail.armatureailabs.com>')
 and p_provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 and exists(select 1 from public.member_notification_events where event_id=p_event_id and provider_id=p_provider_id and event_type=p_event_type and occurred_at=p_occurred_at)
 and not exists(select 1 from public.member_notifications where provider_id=p_provider_id)
 and not exists(select 1 from private.ecosystem_notifications where provider_id=p_provider_id)
 and not exists(select 1 from public.member_notification_tombstones where provider_id=p_provider_id) then
  insert into private.auth_notification_sources(provider_id,sender,subject,source,source_event_id,source_occurred_at,evidence)
  values(p_provider_id,'no-reply@mail.armatureailabs.com',p_subject,'signed_webhook',p_event_id,p_occurred_at,'Verified Resend signature and shared Supabase project header; exact configured Auth sender and sign-in subject.') on conflict(provider_id) do nothing;
 end if;
 return inserted;
end; $$;
revoke all on function public.record_classified_notification_event(text,text,text,timestamptz,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_classified_notification_event(text,text,text,timestamptz,text,text) to service_role;

-- A provider classified as Auth cannot later satisfy an application outbox send.
alter function public.finish_member_notification(uuid,uuid,text,text) rename to finish_member_notification_before_auth_sources;
alter function public.finish_member_notification_before_auth_sources(uuid,uuid,text,text) set schema private;
create function public.finish_member_notification(p_id uuid,p_lease_token uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' and p_provider_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
  if exists(select 1 from private.auth_notification_sources where provider_id=p_provider_id) then
   return private.finish_member_notification_before_auth_sources(p_id,p_lease_token,'unknown',null);
  end if;
 end if;
 return private.finish_member_notification_before_auth_sources(p_id,p_lease_token,p_outcome,p_provider_id);
end; $$;
alter function public.finish_ecosystem_notification(uuid,uuid,text,text) rename to finish_ecosystem_notification_before_auth_sources;
alter function public.finish_ecosystem_notification_before_auth_sources(uuid,uuid,text,text) set schema private;
create function public.finish_ecosystem_notification(p_submission_id uuid,p_lease uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' and p_provider_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
  if exists(select 1 from private.auth_notification_sources where provider_id=p_provider_id) then
   return private.finish_ecosystem_notification_before_auth_sources(p_submission_id,p_lease,'unknown',null);
  end if;
 end if;
 return private.finish_ecosystem_notification_before_auth_sources(p_submission_id,p_lease,p_outcome,p_provider_id);
end; $$;
alter function public.reconcile_ecosystem_notification(uuid,text,text,text,text) rename to reconcile_ecosystem_notification_before_auth_sources;
alter function public.reconcile_ecosystem_notification_before_auth_sources(uuid,text,text,text,text) set schema private;
create function public.reconcile_ecosystem_notification(p_submission_id uuid,p_provider_id text,p_recipient_email text,p_receipt_reference text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_provider_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
  if exists(select 1 from private.auth_notification_sources where provider_id=p_provider_id) then
   raise exception 'Auth provider cannot reconcile an application notification' using errcode='22023';
  end if;
 end if;
 return private.reconcile_ecosystem_notification_before_auth_sources(p_submission_id,p_provider_id,p_recipient_email,p_receipt_reference,p_reason);
end; $$;
revoke all on function private.finish_member_notification_before_auth_sources(uuid,uuid,text,text),private.finish_ecosystem_notification_before_auth_sources(uuid,uuid,text,text),private.reconcile_ecosystem_notification_before_auth_sources(uuid,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.finish_member_notification(uuid,uuid,text,text),public.finish_ecosystem_notification(uuid,uuid,text,text),public.reconcile_ecosystem_notification(uuid,text,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.finish_member_notification(uuid,uuid,text,text),public.finish_ecosystem_notification(uuid,uuid,text,text),public.reconcile_ecosystem_notification(uuid,text,text,text,text) to service_role;

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
 and not exists(select 1 from private.auth_notification_sources a where a.provider_id=e.provider_id
  and exists(select 1 from public.member_notification_events delivered where delivered.provider_id=e.provider_id and delivered.event_type='email.delivered')
  and not exists(select 1 from public.member_notification_events failed where failed.provider_id=e.provider_id and failed.event_type in ('email.failed','email.bounced','email.complained','email.suppressed')))),
 'history_due',(select count(*) from public.member_notifications q where private.member_notification_cleanup_due(q))) into v_result
 from public.member_notification_settings s;
 return v_result;
end;
$$;
