alter table public.member_notification_settings
 add column cleanup_enabled boolean not null default false,
 add column last_cleanup_at timestamptz;
-- Minimal markers survive history removal; no address or message content is retained here.
create table public.member_notification_tombstones (
 event_key text not null, user_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 kind text not null, template_version integer not null, provider_id text unique, recipient_hash text not null,
 primary key(event_key,recipient_id,kind,template_version)
);
alter table public.member_notification_tombstones enable row level security;
revoke all on public.member_notification_tombstones from public,anon,authenticated,service_role;
create index member_notification_events_retention on public.member_notification_events(received_at);
create index member_notifications_retention on public.member_notifications(completed_at) where completed_at is not null;

create or replace function private.enqueue_member_notification(p_user uuid,p_recipient uuid,p_event text,p_kind text,p_status text,p_revision integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('member-notice:'||p_event||':'||p_recipient||':'||p_kind,0));
 if exists(select 1 from public.member_notification_tombstones where event_key=p_event and recipient_id=p_recipient and kind=p_kind and template_version=1) then return; end if;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state)
 select p_user,u.id,lower(u.email),p_event,p_kind,p_status,p_revision,
 case when s.enabled and lower(u.email)=any(s.pilot_recipients) then 'pending' else 'held' end
 from auth.users u cross join public.member_notification_settings s
 where u.id=p_recipient and u.email_confirmed_at is not null and u.deleted_at is null
 on conflict(event_key,recipient_id,kind,template_version) do nothing;
end;
$$;
create or replace function private.member_notification_eligible(n public.member_notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select private.member_notification_base_eligible(n) and not exists(
 select 1 from public.member_notification_suppressions s where s.recipient_email=n.recipient_email
 or s.recipient_email='sha256:'||encode(extensions.digest(n.recipient_email,'sha256'),'hex'));
$$;
-- Archived provider IDs can still block late complaints without retaining their address.
alter function public.record_member_notification_event(text,text,text,timestamptz) set schema private;
create function public.record_member_notification_event(p_event_id text,p_provider_id text,p_event_type text,p_occurred_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_hash text;
begin
 if p_event_id is null or length(trim(p_event_id)) not between 1 and 200 or p_provider_id is null or length(trim(p_provider_id)) not between 1 and 200
 or p_event_type is null or p_event_type not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')
 or p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' then
 raise exception 'Invalid notification event' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
 select recipient_hash into v_hash from public.member_notification_tombstones where provider_id=p_provider_id;
 if found then
  if p_event_type in ('email.bounced','email.complained','email.suppressed') then
   insert into public.member_notification_suppressions(recipient_email,reason) values('sha256:'||v_hash,substr(p_event_type,7))
   on conflict(recipient_email) do update set reason=excluded.reason
   where private.member_delivery_rank(excluded.reason)>private.member_delivery_rank(member_notification_suppressions.reason);
  end if;
  return true;
 end if;
 return private.record_member_notification_event(p_event_id,p_provider_id,p_event_type,p_occurred_at);
end;
$$;
create function private.member_notification_cleanup_due(n public.member_notifications) returns boolean
language sql stable set search_path='' as $$
 select (n.state='held' and n.created_at<now()-interval '30 days')
 or (n.completed_at<now()-interval '30 days' and (n.state in ('failed','suppressed')
 or (n.state='accepted' and n.delivery_state in ('delivered','failed','bounced','complained','suppressed'))));
$$;
create function public.maintain_member_notifications(p_dry_run boolean default true,p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.member_notifications; candidate public.member_notifications; e public.member_notification_events;
 v_notices integer:=0; v_events integer:=0; v_more boolean; v_accounts integer;
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
 -- Matched unresolved events remain available; unmatched receipts expire by receipt time.
 for e in select * from public.member_notification_events q where q.received_at<now()-interval '30 days'
 and not exists(select 1 from public.member_notifications existing where existing.provider_id=q.provider_id)
 order by q.received_at,q.event_id limit p_limit loop
  if p_dry_run then v_events:=v_events+1; continue; end if;
  if not pg_try_advisory_xact_lock(hashtextextended('member-delivery:'||e.provider_id,0)) then continue; end if;
  if not exists(select 1 from public.member_notifications where provider_id=e.provider_id) then
   delete from public.member_notification_events where event_id=e.event_id and received_at<now()-interval '30 days';
   if found then v_events:=v_events+1; end if;
  end if;
 end loop;
 if not p_dry_run then update public.member_notification_settings set last_cleanup_at=now(); end if;
 select exists(select 1 from public.member_notifications q where private.member_notification_cleanup_due(q))
 or exists(select 1 from public.member_notification_events receipt where received_at<now()-interval '30 days'
 and not exists(select 1 from public.member_notifications existing where existing.provider_id=receipt.provider_id)) into v_more;
 return jsonb_build_object('dry_run',p_dry_run,'history',v_notices,'receipts',v_events,'remaining',v_more);
end;
$$;
create function public.member_notification_health() returns jsonb
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
 and not exists(select 1 from public.member_notification_tombstones t where t.provider_id=e.provider_id)),
 'history_due',(select count(*) from public.member_notifications q where private.member_notification_cleanup_due(q))) into v_result
 from public.member_notification_settings s;
 return v_result;
end;
$$;
revoke all on function private.record_member_notification_event(text,text,text,timestamptz),private.member_notification_cleanup_due(public.member_notifications) from public,anon,authenticated,service_role;
revoke all on function public.record_member_notification_event(text,text,text,timestamptz),public.maintain_member_notifications(boolean,integer),public.member_notification_health() from public,anon,authenticated,service_role;
grant execute on function public.record_member_notification_event(text,text,text,timestamptz),public.maintain_member_notifications(boolean,integer) to service_role;
grant execute on function public.member_notification_health() to service_role,authenticated;

create or replace function public.list_member_notification_status(p_page integer default 1,p_search text default '',p_state text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if coalesce(private.membership_role(auth.uid()),'') not in ('admin','super_admin') then
  raise exception 'Administrator access required' using errcode='42501'; end if;
 if p_page is null or p_page not between 1 and 100000 or p_search is null or length(p_search)>120
 or p_state is null or p_state not in ('','held','pending','leased','sending','accepted','failed','unknown','suppressed','unconfirmed','sent','delivery_delayed','delivered','bounced','complained') then
  raise exception 'Invalid notification filter' using errcode='22023'; end if;
 with filtered as (
  select n.id,n.recipient_email,n.kind,n.state,n.delivery_state,n.attempts,n.created_at,n.completed_at,n.delivery_updated_at,
  exists(select 1 from public.member_notification_suppressions s where (s.recipient_email=n.recipient_email or s.recipient_email='sha256:'||encode(extensions.digest(n.recipient_email,'sha256'),'hex'))) as suppressed
  from public.member_notifications n where (p_search='' or strpos(lower(n.recipient_email),lower(p_search))>0)
  and (p_state='' or n.state=p_state or n.delivery_state=p_state)
 ), page_rows as (select * from filtered order by created_at desc,id limit 25 offset (p_page-1)*25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id) from page_rows p),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',p_page) into v_result;
 return v_result;
end;
$$;
