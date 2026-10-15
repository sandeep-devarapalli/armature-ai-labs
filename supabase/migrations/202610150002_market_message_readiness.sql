-- Service cleanup only returns private paths; deletion is confirmed after Storage succeeds.
alter table private.market_attachments add column purged_at timestamptz;
create function public.market_attachment_cleanup_candidates() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 with candidates as (select id from private.market_attachments where purged_at is null and (status='rejected' or (status='quarantined' and created_at<now()-interval '1 day')) order by created_at limit 100 for update skip locked),
 claimed as (update private.market_attachments a set status='rejected' from candidates c where a.id=c.id returning a.id,a.object_path)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'object_path',object_path)),'[]') into result from claimed;
 return result;
end $$;
create function public.market_attachment_cleanup_complete(attachment_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update private.market_attachments set purged_at=now() where id=attachment_id and status='rejected' and purged_at is null;
end $$;
revoke all on function public.market_attachment_cleanup_candidates(),public.market_attachment_cleanup_complete(uuid) from public,anon,authenticated;
grant execute on function public.market_attachment_cleanup_candidates(),public.market_attachment_cleanup_complete(uuid) to service_role;

alter table private.market_message_reminders add column recipient_hash text;

-- Preserve accepted provider identities across daily reminders and account deletion.
create table private.market_reminder_deliveries (
 provider_id text primary key check(provider_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
 user_id uuid references auth.users(id) on delete set null,
 recipient_hash text not null check(recipient_hash ~ '^[0-9a-f]{64}$'),
 recorded_at timestamptz not null default now()
);
alter table private.market_reminder_deliveries enable row level security;
revoke all on private.market_reminder_deliveries from public,anon,authenticated,service_role;
create or replace function public.market_finish_reminder(user_id uuid,lease_token uuid,outcome text,provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
declare updated integer;
begin
 if outcome not in('accepted','retry','failed','skipped','unknown') or outcome is null
 or (outcome='accepted' and (provider_id is null or provider_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) then raise exception 'Invalid delivery outcome'; end if;
 update private.market_message_reminders r set status=case when outcome='retry' and attempts<5 then 'pending' when outcome='retry' then 'failed' else outcome end,provider_id=case when outcome='accepted' then market_finish_reminder.provider_id else null end,lease_until=null,next_attempt_at=now()+interval '15 minutes'
 where r.user_id=market_finish_reminder.user_id and r.lease_token=market_finish_reminder.lease_token and r.status='sending' and r.lease_until>now();
 get diagnostics updated=row_count;
 if updated<>1 then raise exception 'Reminder lease expired'; end if;
 if outcome='accepted' then
  perform pg_advisory_xact_lock(hashtextextended('member-delivery:'||provider_id,0));
  insert into private.market_reminder_deliveries(provider_id,user_id,recipient_hash) select market_finish_reminder.provider_id,r.user_id,r.recipient_hash from private.market_message_reminders r where r.user_id=market_finish_reminder.user_id;
  insert into public.member_notification_suppressions(recipient_email,reason) select 'sha256:'||r.recipient_hash,substr(e.event_type,7) from private.market_message_reminders r join public.member_notification_events e on e.provider_id=market_finish_reminder.provider_id where r.user_id=market_finish_reminder.user_id and e.event_type in ('email.bounced','email.complained','email.suppressed') order by e.occurred_at desc limit 1 on conflict(recipient_email) do update set reason=excluded.reason;
 end if;
end $$;
create or replace function public.market_claim_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.market_message_reminders; result jsonb:='[]'; token uuid;
begin
 update private.market_message_reminders set status='unknown',lease_until=null where status='sending' and lease_until<now();
 perform private.market_queue_reminders();
 for r in select * from private.market_message_reminders where status='pending' and next_attempt_at<=now() and attempts<5 for update skip locked limit 10 loop
  if not private.market_reminder_eligible(r.user_id) then update private.market_message_reminders set status='skipped' where user_id=r.user_id; continue; end if;
  token:=gen_random_uuid();
  update private.market_message_reminders set status='sending',lease_token=token,lease_until=now()+interval '2 minutes',attempts=attempts+1 where user_id=r.user_id;
  result:=result||jsonb_build_array(jsonb_build_object('user_id',r.user_id,'lease_token',token,'email',(select email from auth.users where id=r.user_id),'event_key',r.user_id::text||':'||r.queued_at::text));
 end loop;
 return result;
end $$;
create or replace function private.market_queue_reminders() returns integer language plpgsql security definer set search_path='' as $$ declare n integer; begin
 insert into private.market_message_reminders(user_id,unread_count)
 select e.user_id,count(*) from public.market_inbox_events e join private.market_conversations c on c.id=e.conversation_id join private.market_messages m on m.conversation_id=c.id and m.sender_id<>e.user_id left join private.market_read_positions r on r.conversation_id=c.id and r.user_id=e.user_id left join private.market_message_preferences p on p.user_id=e.user_id where c.status in('pending','active') and coalesce(p.email_enabled,true) and (m.created_at,m.id)>(coalesce(r.read_at,'-infinity'),coalesce(r.read_message_id,'00000000-0000-0000-0000-000000000000'::uuid)) and m.created_at<now()-interval '15 minutes' group by e.user_id
 on conflict(user_id) do update set unread_count=excluded.unread_count,status='pending',queued_at=now(),last_queued_at=now(),attempts=0,next_attempt_at=now(),provider_id=null,lease_token=null,lease_until=null,recipient_hash=null where private.market_message_reminders.status in ('accepted','skipped') and private.market_message_reminders.last_queued_at<now()-interval '1 day'; get diagnostics n=row_count; return n; end $$;

create or replace function public.member_notification_health() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_result jsonb;
begin
 if coalesce(auth.role(),'')<>'service_role' and coalesce(private.membership_role(auth.uid()),'') not in ('admin','super_admin') then
 raise exception 'Administrator access required' using errcode='42501'; end if;
 select jsonb_build_object('sending_enabled',s.enabled,'cleanup_enabled',s.cleanup_enabled,'last_cleanup_at',s.last_cleanup_at,
 'cleanup_overdue',s.cleanup_enabled and (s.last_cleanup_at is null or s.last_cleanup_at<now()-interval '26 hours'),
 'held',(select count(*) from public.member_notifications where state='held'),
 'queue_overdue',(select count(*) from public.member_notifications where state='pending' and available_at<now()-interval '15 minutes')+(select count(*) from private.market_message_reminders where status='pending' and next_attempt_at<now()-interval '15 minutes'),
 'expired_leases',(select count(*) from public.member_notifications where state in ('leased','sending') and lease_until<now()),
 'unknown',(select count(*) from public.member_notifications where state='unknown')+(select count(*) from private.market_message_reminders where status='unknown' or (status='sending' and lease_until<now())),
 'failed',(select count(*) from public.member_notifications where state='failed')+(select count(*) from private.market_message_reminders where status='failed'),
 'delivery_unconfirmed',(select count(*) from public.member_notifications where state='accepted' and delivery_state in ('unconfirmed','sent','delivery_delayed') and completed_at<now()-interval '24 hours')+(select count(*) from private.market_reminder_deliveries mr where recorded_at<now()-interval '24 hours' and not exists(select 1 from public.member_notification_events e where e.provider_id=mr.provider_id and e.event_type in ('email.delivered','email.failed','email.bounced','email.complained','email.suppressed'))),
 'unmatched_receipts',(select count(*) from public.member_notification_events e where received_at<now()-interval '1 hour'
 and not exists(select 1 from public.member_notifications n where n.provider_id=e.provider_id)
 and not exists(select 1 from public.member_notification_tombstones t where t.provider_id=e.provider_id)
 and not exists(select 1 from private.ecosystem_notifications a where a.provider_id=e.provider_id)
 and not exists(select 1 from private.market_reminder_deliveries mr where mr.provider_id=e.provider_id
 and exists(select 1 from public.member_notification_events delivered where delivered.provider_id=e.provider_id and delivered.event_type='email.delivered')
 and not exists(select 1 from public.member_notification_events bad where bad.provider_id=e.provider_id and bad.event_type in ('email.failed','email.bounced','email.complained','email.suppressed')))
 and not exists(select 1 from private.synthetic_notification_resolutions resolved where resolved.provider_id=e.provider_id)
 and not exists(select 1 from private.auth_notification_sources a where a.provider_id=e.provider_id
  and exists(select 1 from public.member_notification_events delivered where delivered.provider_id=e.provider_id and delivered.event_type='email.delivered')
  and not exists(select 1 from public.member_notification_events failed where failed.provider_id=e.provider_id and failed.event_type in ('email.failed','email.bounced','email.complained','email.suppressed')))),
 'history_due',(select count(*) from public.member_notifications q where private.member_notification_cleanup_due(q))) into v_result
 from public.member_notification_settings s;
 return v_result;
end;
$$;

create or replace function public.market_prepare_attachment(conversation_id uuid,filename text,content_type text,byte_size bigint) returns jsonb language plpgsql security definer set search_path='' as $$ declare c private.market_conversations:=private.market_conversation_access(conversation_id); aid uuid:=gen_random_uuid(); path text; ext text; begin
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,6010));
 perform 1 from private.market_conversations where id=c.id for update; select * into c from private.market_conversations where id=c.id;
 if c.status<>'active' then raise exception 'Accepted conversation required'; end if;
 if (select count(*) from private.market_attachments where uploader_id=auth.uid() and created_at>now()-interval '1 day')>=100 then raise exception 'Daily file limit reached'; end if;
 ext:=lower(substring(filename from '\.([^.]+)$'));
 if filename is null or filename ~ '[[:cntrl:]]' or length(filename) not between 1 and 200 or filename ~ '[/\\]' or ext is null or ext not in('png','jpg','jpeg','webp','pdf','txt','csv','docx','xlsx','pptx','step','stp','stl','iges','igs','dxf','dwg','fcstd','kicad_pcb','kicad_sch','zip') or byte_size is null or byte_size not between 1 and 52428800 or content_type is null or content_type not in ('image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv','application/zip','application/octet-stream','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation') then raise exception 'Unsupported file or exceeds 50 MB'; end if;
 path:=c.id::text||'/'||aid::text;
 insert into private.market_attachments(id,conversation_id,uploader_id,filename,content_type,byte_size,object_path) values(aid,c.id,auth.uid(),filename,content_type,byte_size,path);
 return jsonb_build_object('id',aid,'object_path',path,'status','quarantined'); end $$;

create or replace function public.market_prepare_reminder(user_id uuid,lease_token uuid,recipient_email text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update private.market_message_reminders r set recipient_hash=encode(extensions.digest(lower(trim(recipient_email)),'sha256'),'hex')
 where r.user_id=market_prepare_reminder.user_id and r.lease_token=market_prepare_reminder.lease_token and r.status='sending' and r.lease_until>now() and private.market_reminder_eligible(r.user_id)
 and exists(select 1 from auth.users u where u.id=r.user_id and u.email=recipient_email);
 return found;
end $$;
alter function public.record_member_notification_event(text,text,text,timestamptz) rename to record_member_notification_event_before_market;
alter function public.record_member_notification_event_before_market(text,text,text,timestamptz) set schema private;
create function public.record_member_notification_event(p_event_id text,p_provider_id text,p_event_type text,p_occurred_at timestamptz) returns boolean language plpgsql security definer set search_path='' as $$
declare inserted boolean;
begin
 inserted:=private.record_member_notification_event_before_market(p_event_id,p_provider_id,p_event_type,p_occurred_at);
 if p_event_type in ('email.bounced','email.complained','email.suppressed') then
  insert into public.member_notification_suppressions(recipient_email,reason)
  select 'sha256:'||recipient_hash,substr(p_event_type,7) from private.market_reminder_deliveries where provider_id=p_provider_id
  on conflict(recipient_email) do update set reason=excluded.reason;
 end if;
 return inserted;
end $$;
revoke all on function private.record_member_notification_event_before_market(text,text,text,timestamptz),public.record_member_notification_event(text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.record_member_notification_event(text,text,text,timestamptz) to service_role;
