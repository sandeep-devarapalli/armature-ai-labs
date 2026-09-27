alter table public.member_notifications
 add column delivery_state text not null default 'unconfirmed' check(delivery_state in ('unconfirmed','sent','delivery_delayed','delivered','failed','bounced','suppressed','complained')),
 add column delivery_updated_at timestamptz;
create unique index member_notifications_provider on public.member_notifications(provider_id) where provider_id is not null;
create index member_notifications_history on public.member_notifications(created_at desc,id);
create table public.member_notification_events (
 event_id text primary key check(length(event_id) between 1 and 200),
 provider_id text not null check(length(provider_id) between 1 and 200),
 event_type text not null check(event_type in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')),
 occurred_at timestamptz not null,
 received_at timestamptz not null default now()
);
create index member_notification_events_provider on public.member_notification_events(provider_id);
create table public.member_notification_suppressions (
 recipient_email text primary key,
 reason text not null check(reason in ('bounced','complained','suppressed')),
 created_at timestamptz not null default now()
);
alter table public.member_notification_events enable row level security;
alter table public.member_notification_suppressions enable row level security;
revoke all on public.member_notification_events,public.member_notification_suppressions from public,anon,authenticated,service_role;

create function private.member_delivery_rank(p_state text) returns integer
language sql immutable set search_path='' as $$
 select case p_state when 'complained' then 6 when 'bounced' then 5 when 'suppressed' then 5
 when 'failed' then 4 when 'delivered' then 3 when 'delivery_delayed' then 2 when 'sent' then 1 else 0 end;
$$;
create function private.reconcile_member_notification(p_provider text) returns void
language plpgsql security definer set search_path='' as $$
declare n public.member_notifications; e public.member_notification_events; v_state text;
begin
 select * into n from public.member_notifications where provider_id=p_provider for update;
 if not found then return; end if;
 select * into e from public.member_notification_events where provider_id=p_provider
 order by private.member_delivery_rank(substr(event_type,7)) desc,occurred_at desc,event_id desc limit 1;
 if not found then return; end if;
 v_state:=substr(e.event_type,7);
 if private.member_delivery_rank(v_state)>private.member_delivery_rank(n.delivery_state)
 or (private.member_delivery_rank(v_state)=private.member_delivery_rank(n.delivery_state) and e.occurred_at>n.delivery_updated_at) then
  update public.member_notifications set delivery_state=v_state,delivery_updated_at=e.occurred_at where id=n.id;
 end if;
 if v_state in ('bounced','complained','suppressed') then
  insert into public.member_notification_suppressions(recipient_email,reason) values(n.recipient_email,v_state)
  on conflict(recipient_email) do update set reason=excluded.reason
  where private.member_delivery_rank(excluded.reason)>private.member_delivery_rank(member_notification_suppressions.reason);
 end if;
end;
$$;
create function public.record_member_notification_event(p_event_id text,p_provider_id text,p_event_type text,p_occurred_at timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_inserted integer;
begin
 if p_event_id is null or length(trim(p_event_id)) not between 1 and 200 or p_provider_id is null or length(trim(p_provider_id)) not between 1 and 200
 or p_event_type is null or p_event_type not in ('email.sent','email.delivered','email.delivery_delayed','email.bounced','email.complained','email.failed','email.suppressed')
 or p_occurred_at is null or not isfinite(p_occurred_at) or p_occurred_at>now()+interval '5 minutes' then
  raise exception 'Invalid notification event' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
 insert into public.member_notification_events(event_id,provider_id,event_type,occurred_at)
 values(p_event_id,p_provider_id,p_event_type,p_occurred_at) on conflict(event_id) do nothing;
 get diagnostics v_inserted=row_count;
 if v_inserted=0 and not exists(select 1 from public.member_notification_events where event_id=p_event_id
 and provider_id=p_provider_id and event_type=p_event_type and occurred_at=p_occurred_at) then
  raise exception 'Conflicting notification event' using errcode='22023'; end if;
 perform private.reconcile_member_notification(p_provider_id);
 return v_inserted=1;
end;
$$;
create function private.reconcile_member_provider() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.provider_id is not null then perform private.reconcile_member_notification(new.provider_id); end if;
 return new;
end;
$$;
create trigger member_provider_delivery after update of provider_id on public.member_notifications
 for each row when(new.provider_id is distinct from old.provider_id) execute function private.reconcile_member_provider();
-- Both paths acquire the provider lock before locking the notification row.
alter function public.finish_member_notification(uuid,uuid,text,text) set schema private;
create function public.finish_member_notification(p_id uuid,p_lease_token uuid,p_outcome text,p_provider_id text default null) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if p_outcome='accepted' and p_provider_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||p_provider_id,0));
 end if;
 return private.finish_member_notification(p_id,p_lease_token,p_outcome,p_provider_id);
end;
$$;
alter function private.member_notification_eligible(public.member_notifications) rename to member_notification_base_eligible;
create function private.member_notification_eligible(n public.member_notifications) returns boolean
language sql stable security definer set search_path='' as $$
 select private.member_notification_base_eligible(n) and not exists(
 select 1 from public.member_notification_suppressions s where s.recipient_email=n.recipient_email);
$$;
create function public.list_member_notification_status(p_page integer default 1,p_search text default '',p_state text default '') returns jsonb
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
  exists(select 1 from public.member_notification_suppressions s where s.recipient_email=n.recipient_email) as suppressed
  from public.member_notifications n where (p_search='' or strpos(lower(n.recipient_email),lower(p_search))>0)
  and (p_state='' or n.state=p_state or n.delivery_state=p_state)
 ), page_rows as (select * from filtered order by created_at desc,id limit 25 offset (p_page-1)*25)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc,p.id) from page_rows p),'[]'::jsonb),
 'total',(select count(*) from filtered),'page',p_page) into v_result;
 return v_result;
end;
$$;
revoke all on function private.member_delivery_rank(text),private.reconcile_member_notification(text),private.reconcile_member_provider(),
 private.finish_member_notification(uuid,uuid,text,text),private.member_notification_eligible(public.member_notifications) from public,anon,authenticated,service_role;
revoke all on function public.record_member_notification_event(text,text,text,timestamptz),public.finish_member_notification(uuid,uuid,text,text),
 public.list_member_notification_status(integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.record_member_notification_event(text,text,text,timestamptz),public.finish_member_notification(uuid,uuid,text,text) to service_role;
grant execute on function public.list_member_notification_status(integer,text,text) to authenticated;
