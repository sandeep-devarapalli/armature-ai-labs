begin;
create table private.market_worker_health (
 jobname text primary key,
 created_at timestamptz not null default now(),
 request_id bigint,
 requested_at timestamptz,
 status_code integer,
 response_failed boolean,
 checked_at timestamptz
);
alter table private.market_worker_health enable row level security;
revoke all on private.market_worker_health from public,anon,authenticated,service_role;
insert into private.market_worker_health(jobname) values ('market-message-reminders-every-five-minutes'),('market-private-file-cleanup-daily');
alter function private.wake_market_message_reminders() rename to wake_market_message_reminders_untracked;
revoke all on function private.wake_market_message_reminders_untracked() from public,anon,authenticated,service_role;
create function private.wake_market_message_reminders() returns bigint language plpgsql security definer set search_path='' as $$
declare rid bigint;
begin
 update private.market_worker_health w set status_code=r.status_code,response_failed=(coalesce(r.timed_out,false) or r.error_msg is not null or r.status_code is distinct from 200) from net._http_response r where r.id=w.request_id;
 update private.market_worker_health w set response_failed=true where w.requested_at<now()-interval '2 minutes' and w.checked_at is null and not exists(select 1 from net._http_response r where r.id=w.request_id);
 rid:=private.wake_market_message_reminders_untracked();
 update private.market_worker_health set request_id=rid,requested_at=now(),checked_at=null where jobname='market-message-reminders-every-five-minutes';
 return rid;
end $$;
revoke all on function private.wake_market_message_reminders() from public,anon,authenticated,service_role;
alter function private.wake_market_file_cleanup() rename to wake_market_file_cleanup_untracked;
revoke all on function private.wake_market_file_cleanup_untracked() from public,anon,authenticated,service_role;
create function private.wake_market_file_cleanup() returns bigint language plpgsql security definer set search_path='' as $$
declare rid bigint;
begin
 update private.market_worker_health w set status_code=r.status_code,response_failed=(coalesce(r.timed_out,false) or r.error_msg is not null or r.status_code is distinct from 200) from net._http_response r where r.id=w.request_id;
 update private.market_worker_health w set response_failed=true where w.requested_at<now()-interval '2 minutes' and w.checked_at is null and not exists(select 1 from net._http_response r where r.id=w.request_id);
 rid:=private.wake_market_file_cleanup_untracked();
 update private.market_worker_health set request_id=rid,requested_at=now(),checked_at=null where jobname='market-private-file-cleanup-daily';
 return rid;
end $$;
revoke all on function private.wake_market_file_cleanup() from public,anon,authenticated,service_role;
create function public.market_worker_health() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and coalesce(private.membership_role(auth.uid()),'') not in ('admin','super_admin') then raise exception 'Administrator access required' using errcode='42501'; end if;
 update private.market_worker_health w set status_code=r.status_code,response_failed=(coalesce(r.timed_out,false) or r.error_msg is not null or r.status_code is distinct from 200),checked_at=now() from net._http_response r where r.id=w.request_id;
 select jsonb_build_object(
 'market_worker_failed',count(*) filter(where j.active and (w.response_failed or (w.requested_at<now()-interval '5 minutes' and w.checked_at is null))),
 'market_worker_stale',count(*) filter(where j.active and coalesce(w.requested_at,w.created_at)<now()-case when w.jobname='market-private-file-cleanup-daily' then interval '26 hours' else interval '15 minutes' end),
 'market_cleanup_backlog',(select count(*) from private.market_attachments where purged_at is null and (status='rejected' or status='quarantined') and created_at<now()-interval '50 hours'),
 'market_workers',jsonb_agg(jsonb_build_object('job',w.jobname,'active',j.active,'requested_at',w.requested_at,'status',w.status_code,'checked_at',w.checked_at))) into result from private.market_worker_health w left join cron.job j using(jobname);
 return result;
end $$;
revoke all on function public.market_worker_health() from public,anon,authenticated,service_role;
grant execute on function public.market_worker_health() to authenticated,service_role;
alter function public.notification_delivery_health() rename to notification_delivery_health_before_market_workers;
alter function public.notification_delivery_health_before_market_workers() set schema private;
revoke all on function private.notification_delivery_health_before_market_workers() from public,anon,authenticated,service_role;
create function public.notification_delivery_health() returns jsonb language plpgsql security definer set search_path='' as $$
begin return private.notification_delivery_health_before_market_workers() || public.market_worker_health(); end $$;
revoke all on function public.notification_delivery_health() from public,anon,authenticated,service_role;
grant execute on function public.notification_delivery_health() to authenticated,service_role;
commit;
