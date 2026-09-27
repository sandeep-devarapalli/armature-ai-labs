-- Event wake-ups are optional; the scheduled sender remains the recovery path.
create extension if not exists pg_net with schema extensions;
alter table public.member_notification_settings add column immediate_enabled boolean not null default false;

create function private.wake_member_notification_sender() returns trigger
language plpgsql security definer set search_path='' as $$
declare token text; stamp text; signature text;
begin
 if not exists(select 1 from new_notifications where state='pending')
 or not exists(select 1 from public.member_notification_settings where enabled and immediate_enabled) then return null; end if;
 select decrypted_secret into token from vault.decrypted_secrets where name='member_notifications_wakeup_key';
 if token is null or length(token) not between 32 and 256 then
  raise warning 'Membership notification wake-up unavailable; scheduled sender will recover';
  return null;
 end if;
 stamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 signature:=encode(extensions.hmac('member-notifications:'||stamp,token,'sha256'),'hex');
 perform net.http_post(
  url:='https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/member-notifications',
  body:='{}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json','x-armature-wakeup-time',stamp,'x-armature-wakeup-signature',signature),
  timeout_milliseconds:=120000);
 return null;
exception when others then
 raise warning 'Membership notification wake-up unavailable; scheduled sender will recover';
 return null;
end;
$$;
revoke all on function private.wake_member_notification_sender() from public,anon,authenticated,service_role;
do $$ begin
 if has_table_privilege('anon','vault.decrypted_secrets','SELECT')
 or has_table_privilege('authenticated','vault.decrypted_secrets','SELECT') then
  raise exception 'Notification credential storage must not be accessible to member roles';
 end if;
end $$;
create trigger member_notification_immediate_insert after insert on public.member_notifications
referencing new table as new_notifications for each statement execute function private.wake_member_notification_sender();
