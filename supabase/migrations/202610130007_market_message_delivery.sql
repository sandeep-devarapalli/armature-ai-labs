alter table private.market_message_reminders
 add column lease_token uuid,
 add column lease_until timestamptz,
 add column attempts integer not null default 0,
 add column next_attempt_at timestamptz not null default now(),
 add column provider_id text;

create function private.market_reset_reminder_delivery() returns trigger language plpgsql set search_path='' as $$
begin
 if new.queued_at is distinct from old.queued_at then
  new.lease_token:=null; new.lease_until:=null; new.attempts:=0; new.next_attempt_at:=now(); new.provider_id:=null;
 end if;
 return new;
end $$;
create trigger market_reset_reminder_delivery before update on private.market_message_reminders for each row execute function private.market_reset_reminder_delivery();
revoke all on function private.market_reset_reminder_delivery() from public,anon,authenticated;

create function private.market_reminder_eligible(uid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.has_basic_membership(uid)
 and coalesce((select email_enabled from private.market_message_preferences where user_id=uid),true)
 and not exists(select 1 from public.member_notification_suppressions s join auth.users u on lower(trim(u.email))=s.recipient_email or s.recipient_email='sha256:'||encode(extensions.digest(lower(trim(u.email)),'sha256'),'hex') where u.id=uid)
 and exists(select 1 from private.market_messages m join private.market_conversations c on c.id=m.conversation_id
 left join private.market_read_positions r on r.conversation_id=c.id and r.user_id=uid
 where uid in(c.initiator_id,c.recipient_id) and c.status in('active','pending') and m.sender_id<>uid
 and (m.created_at,m.id)>(coalesce(r.read_at,'-infinity'),coalesce(r.read_message_id,'00000000-0000-0000-0000-000000000000'::uuid)) and m.created_at<now()-interval '15 minutes');
$$;
create function public.market_claim_reminders() returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.market_message_reminders; result jsonb:='[]'; token uuid;
begin
 perform private.market_queue_reminders();
 for r in select * from private.market_message_reminders where (status='pending' or (status='sending' and lease_until<now())) and next_attempt_at<=now() and attempts<5 for update skip locked limit 10 loop
  if not private.market_reminder_eligible(r.user_id) then update private.market_message_reminders set status='skipped' where user_id=r.user_id; continue; end if;
  token:=gen_random_uuid();
  update private.market_message_reminders set status='sending',lease_token=token,lease_until=now()+interval '2 minutes',attempts=attempts+1 where user_id=r.user_id;
  result:=result||jsonb_build_array(jsonb_build_object('user_id',r.user_id,'lease_token',token,'email',(select email from auth.users where id=r.user_id),'event_key',r.user_id::text||':'||r.queued_at::text));
 end loop;
 return result;
end $$;
create function public.market_prepare_reminder(user_id uuid,lease_token uuid,recipient_email text) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from private.market_message_reminders r where r.user_id=market_prepare_reminder.user_id and r.lease_token=market_prepare_reminder.lease_token and r.status='sending' and r.lease_until>now() and private.market_reminder_eligible(r.user_id) and exists(select 1 from auth.users u where u.id=r.user_id and u.email=recipient_email));
$$;
create function public.market_finish_reminder(user_id uuid,lease_token uuid,outcome text,provider_id text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if outcome not in('accepted','retry','failed','skipped') or outcome is null then raise exception 'Invalid delivery outcome'; end if;
 update private.market_message_reminders r set status=case when outcome='retry' and attempts<5 then 'pending' when outcome='retry' then 'failed' else outcome end,provider_id=market_finish_reminder.provider_id,lease_until=null,next_attempt_at=now()+interval '15 minutes'
 where r.user_id=market_finish_reminder.user_id and r.lease_token=market_finish_reminder.lease_token and r.status='sending';
end $$;
revoke all on function private.market_reminder_eligible(uuid),public.market_claim_reminders(),public.market_prepare_reminder(uuid,uuid,text),public.market_finish_reminder(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.market_claim_reminders(),public.market_prepare_reminder(uuid,uuid,text),public.market_finish_reminder(uuid,uuid,text,text) to service_role;
