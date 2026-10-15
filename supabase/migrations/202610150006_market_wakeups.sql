begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create function private.wake_market_message_reminders() returns bigint language plpgsql security definer set search_path='' as $$
declare signing_key text; stamp text; signature text;
begin
 select decrypted_secret into signing_key from vault.decrypted_secrets where name='market_message_wakeup_key';
 if signing_key is null or length(signing_key) not between 32 and 256 then raise exception 'Configure dedicated market_message_wakeup_key before activation'; end if;
 stamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 signature:=encode(extensions.hmac('market-message-reminders:'||stamp,signing_key,'sha256'),'hex');
 return net.http_post(url:='https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/market-message-reminders',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-armature-wakeup-time',stamp,'x-armature-wakeup-signature',signature),timeout_milliseconds:=120000);
end $$;
create function private.wake_market_file_cleanup() returns bigint language plpgsql security definer set search_path='' as $$
declare signing_key text; stamp text; signature text;
begin
 select decrypted_secret into signing_key from vault.decrypted_secrets where name='market_file_cleanup_wakeup_key';
 if signing_key is null or length(signing_key) not between 32 and 256 then raise exception 'Configure dedicated market_file_cleanup_wakeup_key before activation'; end if;
 stamp:=floor(extract(epoch from clock_timestamp()))::bigint::text;
 signature:=encode(extensions.hmac('market-message-maintenance:'||stamp,signing_key,'sha256'),'hex');
 return net.http_post(url:='https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/market-message-maintenance',body:='{}'::jsonb,headers:=jsonb_build_object('Content-Type','application/json','x-armature-wakeup-time',stamp,'x-armature-wakeup-signature',signature),timeout_milliseconds:=120000);
end $$;
revoke all on function private.wake_market_message_reminders(),private.wake_market_file_cleanup() from public,anon,authenticated,service_role;

do $$ declare job_id bigint; begin
 if has_table_privilege('anon','vault.decrypted_secrets','SELECT') or has_table_privilege('authenticated','vault.decrypted_secrets','SELECT') then raise exception 'Vault secrets must remain private'; end if;
 job_id:=cron.schedule('market-message-reminders-every-five-minutes','*/5 * * * *','select private.wake_market_message_reminders()');
 perform cron.alter_job(job_id,active:=false);
 job_id:=cron.schedule('market-private-file-cleanup-daily','23 2 * * *','select private.wake_market_file_cleanup()');
 perform cron.alter_job(job_id,active:=false);
end $$;

commit;
