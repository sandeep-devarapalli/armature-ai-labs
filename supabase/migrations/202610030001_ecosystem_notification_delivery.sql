-- Provider IDs link the Atlas outbox to the shared, immutable delivery receipts.
alter table private.ecosystem_notifications
 drop constraint ecosystem_notifications_state_check,
 add constraint ecosystem_notifications_state_check check(state in ('pending','sending','sent','failed','unknown','suppressed','cancelled')),
 add column provider_id text unique check(provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 add column recipient_email text,
 add column recipient_hash text,
 add column completed_at timestamptz,
 add column delivery_state text not null default 'unconfirmed' check(delivery_state in ('unconfirmed','sent','delivery_delayed','delivered','failed','bounced','suppressed','complained')),
 add column delivery_updated_at timestamptz;
update private.ecosystem_notifications set completed_at=coalesce(sent_at,now()) where state in ('sent','failed');
update private.ecosystem_notifications set state='unknown' where state='pending' and attempts>0;
create table private.ecosystem_notification_reconciliations (
 submission_id uuid primary key references private.ecosystem_notifications(submission_id),
 provider_id text not null unique, recipient_hash text not null,
 receipt_reference text not null, reason text not null,
 actor text not null default session_user, created_at timestamptz not null default now()
);
revoke all on private.ecosystem_notification_reconciliations from public,anon,authenticated,service_role;

create function private.reconcile_ecosystem_delivery(p_provider text) returns void
language plpgsql security definer set search_path='' as $$
declare n private.ecosystem_notifications; e public.member_notification_events; v_state text;
begin
 select * into n from private.ecosystem_notifications where provider_id=p_provider for update;
 if not found then return; end if;
 select * into e from public.member_notification_events where provider_id=p_provider
 order by private.member_delivery_rank(substr(event_type,7)) desc,occurred_at desc,event_id desc limit 1;
 if not found then return; end if;
 v_state:=substr(e.event_type,7);
 if private.member_delivery_rank(v_state)>private.member_delivery_rank(n.delivery_state)
 or (private.member_delivery_rank(v_state)=private.member_delivery_rank(n.delivery_state) and e.occurred_at>n.delivery_updated_at) then
  update private.ecosystem_notifications set delivery_state=v_state,delivery_updated_at=e.occurred_at where submission_id=n.submission_id;
 end if;
 if v_state in ('bounced','complained','suppressed') and n.recipient_hash is not null then
  insert into public.member_notification_suppressions(recipient_email,reason) values(coalesce(n.recipient_email,'sha256:'||n.recipient_hash),v_state)
  on conflict(recipient_email) do update set reason=excluded.reason
  where private.member_delivery_rank(excluded.reason)>private.member_delivery_rank(member_notification_suppressions.reason);
 end if;
end; $$;

-- Keep the old worker inert until its recipient-aware replacement is deployed.
create or replace function public.claim_ecosystem_notifications() returns table(submission_id uuid,lease uuid)
language sql security definer set search_path='' as $$ select null::uuid,null::uuid where false; $$;
create function public.claim_ecosystem_notifications(p_recipient_email text) returns table(submission_id uuid,lease uuid)
language plpgsql security definer set search_path='' as $$
begin
 p_recipient_email:=lower(trim(p_recipient_email));
 if p_recipient_email is null or length(p_recipient_email)>254 or p_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
  raise exception 'Invalid recipient' using errcode='22023'; end if;
 -- A crashed sender may have sent already. It must never be reclaimed blindly.
 update private.ecosystem_notifications set state='unknown',lease=null where state='sending' and retry_at<=now();
 if exists(select 1 from public.member_notification_suppressions s where s.recipient_email=p_recipient_email
 or s.recipient_email='sha256:'||encode(extensions.digest(p_recipient_email,'sha256'),'hex')) then
  update private.ecosystem_notifications n set state='suppressed',recipient_email=p_recipient_email,recipient_hash=encode(extensions.digest(p_recipient_email,'sha256'),'hex'),completed_at=now(),lease=null
  where n.state='pending' and exists(select 1 from public.ecosystem_submissions s where s.id=n.submission_id and s.status in ('pending','needs_info'));
  return;
 end if;
 return query with ready as (
 select n.submission_id from private.ecosystem_notifications n join public.ecosystem_submissions s on s.id=n.submission_id
 where n.state='pending' and n.retry_at<=now() and s.status in ('pending','needs_info') and n.attempts<5
 order by n.retry_at,n.submission_id limit 10 for update of n skip locked
 ) update private.ecosystem_notifications n set state='sending',attempts=n.attempts+1,lease=extensions.gen_random_uuid(),
 recipient_email=p_recipient_email,recipient_hash=encode(extensions.digest(p_recipient_email,'sha256'),'hex'),retry_at=now()+interval '5 minutes'
 from ready where ready.submission_id=n.submission_id returning n.submission_id,n.lease;
end; $$;

create function public.prepare_ecosystem_notification(p_submission_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare n private.ecosystem_notifications;
begin
 select * into n from private.ecosystem_notifications where submission_id=p_submission_id for update;
 if not found or n.state<>'sending' or n.lease is distinct from p_lease then return false; end if;
 if n.retry_at<=now() then
  update private.ecosystem_notifications set state='unknown',lease=null,completed_at=now() where submission_id=p_submission_id;
  return false;
 end if;
 if not exists(select 1 from public.ecosystem_submissions where id=p_submission_id and status in ('pending','needs_info')) then
  update private.ecosystem_notifications set state='cancelled',lease=null,completed_at=now() where submission_id=p_submission_id;
  return false;
 end if;
 if n.recipient_email is null or exists(select 1 from public.member_notification_suppressions s
 where s.recipient_email=n.recipient_email or s.recipient_email='sha256:'||n.recipient_hash) then
  update private.ecosystem_notifications set state='suppressed',lease=null,completed_at=now() where submission_id=p_submission_id;
  return false;
 end if;
 return true;
end; $$;

create function public.finish_ecosystem_notification(p_submission_id uuid,p_lease uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
declare n private.ecosystem_notifications; v_state text;
begin
 if p_outcome is null or p_outcome not in ('accepted','retry','failed','unknown') then raise exception 'Invalid delivery outcome' using errcode='22023'; end if;
 if p_outcome='accepted' and (p_provider_id is null or p_provider_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then p_outcome:='unknown'; end if;
 if p_outcome='accepted' then perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0)); end if;
 select * into n from private.ecosystem_notifications where submission_id=p_submission_id for update;
 if not found or n.state<>'sending' or n.lease is distinct from p_lease then return false; end if;
 if n.retry_at<=now() then
  update private.ecosystem_notifications set state='unknown',lease=null where submission_id=p_submission_id;
  return false;
 end if;
 if p_outcome='accepted' and (exists(select 1 from public.member_notifications where provider_id=p_provider_id)
 or exists(select 1 from public.member_notification_tombstones where provider_id=p_provider_id)
 or exists(select 1 from private.ecosystem_notifications where provider_id=p_provider_id and submission_id<>p_submission_id)) then
  p_outcome:='unknown';
 end if;
 v_state:=case when p_outcome='accepted' then 'sent' when p_outcome='retry' and n.attempts<5 then 'pending' when p_outcome='retry' then 'failed' else p_outcome end;
 update private.ecosystem_notifications set state=v_state,provider_id=case when p_outcome='accepted' then p_provider_id end,
 sent_at=case when p_outcome='accepted' then now() end,completed_at=case when v_state<>'pending' then now() end,retry_at=now()+interval '5 minutes',lease=null where submission_id=p_submission_id;
 if p_outcome='accepted' then perform private.reconcile_ecosystem_delivery(p_provider_id); end if;
 return true;
end; $$;
create or replace function public.finish_ecosystem_notification(p_submission_id uuid,p_lease uuid,p_success boolean) returns void
language sql security definer set search_path='' as $$
 select public.finish_ecosystem_notification(p_submission_id,p_lease,'unknown'::text,null::text);
$$;

-- Both callback orders serialize before either outbox row is locked.
alter function public.record_member_notification_event(text,text,text,timestamptz) rename to record_member_notification_event_legacy;
alter function public.record_member_notification_event_legacy(text,text,text,timestamptz) set schema private;
create function public.record_member_notification_event(p_event_id text,p_provider_id text,p_event_type text,p_occurred_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare inserted boolean;
begin
 inserted:=private.record_member_notification_event_legacy(p_event_id,p_provider_id,p_event_type,p_occurred_at);
 perform private.reconcile_ecosystem_delivery(p_provider_id);
 return inserted;
end; $$;
create or replace function public.finish_member_notification(p_id uuid,p_lease_token uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' and p_provider_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
  if exists(select 1 from private.ecosystem_notifications where provider_id=p_provider_id) then
   return private.finish_member_notification(p_id,p_lease_token,'unknown',null);
  end if;
 end if;
 return private.finish_member_notification(p_id,p_lease_token,p_outcome,p_provider_id);
end; $$;

create function public.reconcile_ecosystem_notification(p_submission_id uuid,p_provider_id text,p_recipient_email text,p_receipt_reference text,p_reason text) returns boolean
language plpgsql security definer set search_path='' as $$
declare n private.ecosystem_notifications;
begin
 p_recipient_email:=lower(trim(p_recipient_email));
 if p_provider_id is null or p_provider_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or p_recipient_email is null or length(p_recipient_email)>254 or p_recipient_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 or p_receipt_reference is distinct from 'Receipt: '||p_submission_id::text or p_reason is null or length(trim(p_reason)) not between 20 and 1000 then
 raise exception 'Exact provider and receipt evidence required' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
 select * into n from private.ecosystem_notifications where submission_id=p_submission_id for update;
 if exists(select 1 from private.ecosystem_notification_reconciliations a where a.submission_id=p_submission_id
 and a.provider_id=p_provider_id and a.recipient_hash=encode(extensions.digest(p_recipient_email,'sha256'),'hex') and a.receipt_reference=p_receipt_reference) then return false; end if;
 if not found or n.state<>'sent' or n.provider_id is not null or n.sent_at is null
 or not exists(select 1 from public.member_notification_events where provider_id=p_provider_id)
 or exists(select 1 from public.member_notifications where provider_id=p_provider_id)
 or exists(select 1 from public.member_notification_tombstones where provider_id=p_provider_id) then
 raise exception 'Notification cannot be reconciled from this evidence' using errcode='22023'; end if;
 update private.ecosystem_notifications set provider_id=p_provider_id,recipient_email=p_recipient_email,recipient_hash=encode(extensions.digest(p_recipient_email,'sha256'),'hex'),completed_at=coalesce(completed_at,sent_at) where submission_id=p_submission_id;
 insert into private.ecosystem_notification_reconciliations(submission_id,provider_id,recipient_hash,receipt_reference,reason)
 values(p_submission_id,p_provider_id,encode(extensions.digest(p_recipient_email,'sha256'),'hex'),p_receipt_reference,trim(p_reason));
 perform private.reconcile_ecosystem_delivery(p_provider_id);
 return true;
end; $$;

create or replace function public.cleanup_ecosystem_private_data() returns void language plpgsql security definer set search_path='' as $$
begin
 delete from private.ecosystem_rate_limits where window_start < now()-interval '24 hours';
 update private.ecosystem_notifications set state='unknown',lease=null where state='sending' and retry_at<=now();
 update public.ecosystem_submissions set submitter_name=null,submitter_email=null,reviewer_notes=null,payload_hash='expired:'||id::text
 where closed_at < now()-interval '90 days' and (submitter_name is not null or submitter_email is not null or reviewer_notes is not null);
end; $$;
create function private.ecosystem_notification_cleanup_due(n private.ecosystem_notifications) returns boolean
language sql stable set search_path='' as $$
 select coalesce(n.completed_at<now()-interval '30 days' and (n.state in ('failed','suppressed','cancelled')
 or (n.state='sent' and n.delivery_state in ('delivered','failed','bounced','complained','suppressed'))),false);
$$;
create or replace function public.maintain_member_notifications(p_dry_run boolean default true,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.member_notifications; candidate public.member_notifications; e public.member_notification_events;
 v_notices integer:=0; v_events integer:=0; v_more boolean; v_accounts integer; a private.ecosystem_notifications;
begin
 if p_dry_run is null or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid maintenance options' using errcode='22023'; end if;
 if not p_dry_run and not exists(select 1 from public.member_notification_settings where cleanup_enabled) then raise exception 'Notification cleanup disabled' using errcode='42501'; end if;
 for candidate in select * from public.member_notifications q where private.member_notification_cleanup_due(q) order by q.created_at,q.id limit p_limit loop
  if p_dry_run then v_notices:=v_notices+1; continue; end if;
  -- Skip busy locks: a readiness transaction may enqueue multiple events in another order.
  if candidate.provider_id is not null and not pg_try_advisory_xact_lock(hashtextextended('member-delivery:'||candidate.provider_id,0)) then continue; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('member-notice:'||candidate.event_key||':'||candidate.recipient_id||':'||candidate.kind,0)) then continue; end if;
  select count(*) into v_accounts from (select id from auth.users
   where id in (candidate.user_id,candidate.recipient_id) order by id for key share skip locked) accounts;
  if v_accounts<>(case when candidate.user_id=candidate.recipient_id then 1 else 2 end) then continue; end if;
  select * into n from public.member_notifications where id=candidate.id for update skip locked;
  if not found or not private.member_notification_cleanup_due(n) then continue; end if;
  insert into public.member_notification_tombstones(event_key,user_id,recipient_id,kind,template_version,provider_id,recipient_hash)
  values(n.event_key,n.user_id,n.recipient_id,n.kind,n.template_version,n.provider_id,encode(extensions.digest(n.recipient_email,'sha256'),'hex')) on conflict do nothing;
  delete from public.member_notifications where id=n.id;
  v_notices:=v_notices+1;
 end loop;
 -- Redact completed Atlas recipient addresses; hashes retain late suppression protection.
 for a in select * from private.ecosystem_notifications q where q.recipient_email is not null
 and private.ecosystem_notification_cleanup_due(q) order by q.completed_at,q.submission_id limit greatest(0,p_limit-v_notices) loop
  if p_dry_run then v_notices:=v_notices+1; continue; end if;
  if a.provider_id is not null and not pg_try_advisory_xact_lock(hashtextextended('member-delivery:'||a.provider_id,0)) then continue; end if;
  select * into a from private.ecosystem_notifications where submission_id=a.submission_id for update skip locked;
  if not found or a.recipient_email is null or not private.ecosystem_notification_cleanup_due(a) then continue; end if;
  update private.ecosystem_notifications set recipient_email=null where submission_id=a.submission_id;
  v_notices:=v_notices+1;
 end loop;
 -- Matched unresolved events remain available; unmatched receipts expire by receipt time.
 for e in select * from public.member_notification_events q where q.received_at<now()-interval '30 days'
 and not exists(select 1 from public.member_notifications existing where existing.provider_id=q.provider_id)
 and not exists(select 1 from private.ecosystem_notifications atlas where atlas.provider_id=q.provider_id and not private.ecosystem_notification_cleanup_due(atlas))
 order by q.received_at,q.event_id limit p_limit loop
  if p_dry_run then v_events:=v_events+1; continue; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('member-delivery:'||e.provider_id,0)) then continue; end if;
  if not exists(select 1 from public.member_notifications where provider_id=e.provider_id)
  and not exists(select 1 from private.ecosystem_notifications atlas where provider_id=e.provider_id and not private.ecosystem_notification_cleanup_due(atlas)) then
   delete from public.member_notification_events where event_id=e.event_id and received_at<now()-interval '30 days';
   if found then v_events:=v_events+1; end if;
  end if;
 end loop;
 if not p_dry_run then update public.member_notification_settings set last_cleanup_at=now(); end if;
 select exists(select 1 from public.member_notifications q where private.member_notification_cleanup_due(q))
 or exists(select 1 from public.member_notification_events receipt where received_at<now()-interval '30 days'
 and not exists(select 1 from public.member_notifications existing where existing.provider_id=receipt.provider_id)
 and not exists(select 1 from private.ecosystem_notifications atlas where atlas.provider_id=receipt.provider_id and not private.ecosystem_notification_cleanup_due(atlas)))
 or exists(select 1 from private.ecosystem_notifications due where due.recipient_email is not null and private.ecosystem_notification_cleanup_due(due)) into v_more;
 return jsonb_build_object('dry_run',p_dry_run,'history',v_notices,'receipts',v_events,'remaining',v_more);
end;
$$;
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
 and not exists(select 1 from private.ecosystem_notifications a where a.provider_id=e.provider_id)),
 'history_due',(select count(*) from public.member_notifications q where private.member_notification_cleanup_due(q))) into v_result
 from public.member_notification_settings s;
 return v_result;
end;
$$;
-- Versioned endpoint permits migration-first rollout without breaking the old strict monitor.
create function public.notification_delivery_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare health jsonb;
begin
 health:=public.member_notification_health();
 return health||jsonb_build_object(
 'atlas_queue_overdue',(select count(*) from private.ecosystem_notifications n join public.ecosystem_submissions s on s.id=n.submission_id where n.state='pending' and n.retry_at<now()-interval '15 minutes' and s.status in ('pending','needs_info')),
 'atlas_expired_leases',(select count(*) from private.ecosystem_notifications where state='sending' and retry_at<=now()),
 'atlas_unknown',(select count(*) from private.ecosystem_notifications where state='unknown' or (state='sent' and provider_id is null)),
 'atlas_failed',(select count(*) from private.ecosystem_notifications where state in ('failed','suppressed')),
 'atlas_delivery_failed',(select count(*) from private.ecosystem_notifications where delivery_state in ('failed','bounced','complained','suppressed')),
 'atlas_delivery_unconfirmed',(select count(*) from private.ecosystem_notifications where state='sent' and provider_id is not null and delivery_state in ('unconfirmed','sent','delivery_delayed') and sent_at<now()-interval '24 hours'));
end; $$;
revoke all on function private.ecosystem_notification_cleanup_due(private.ecosystem_notifications),private.reconcile_ecosystem_delivery(text),private.record_member_notification_event_legacy(text,text,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.prepare_ecosystem_notification(uuid,uuid),public.claim_ecosystem_notifications(text),public.finish_ecosystem_notification(uuid,uuid,text,text),
 public.reconcile_ecosystem_notification(uuid,text,text,text,text),public.record_member_notification_event(text,text,text,timestamptz),public.notification_delivery_health() from public,anon,authenticated,service_role;
grant execute on function public.prepare_ecosystem_notification(uuid,uuid),public.claim_ecosystem_notifications(text),public.finish_ecosystem_notification(uuid,uuid,text,text),
 public.reconcile_ecosystem_notification(uuid,text,text,text,text),public.record_member_notification_event(text,text,text,timestamptz) to service_role;
grant execute on function public.notification_delivery_health() to service_role,authenticated;
