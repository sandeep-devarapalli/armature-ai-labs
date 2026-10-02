begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create or replace function private.wake_ecosystem_maintenance()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  signing_key text;
  stamp text;
  signature text;
begin
  select decrypted_secret into signing_key
  from vault.decrypted_secrets where name = 'ecosystem_maintenance_key';
  if signing_key is null or length(signing_key) not between 32 and 256 then
    raise exception 'Configure the dedicated ecosystem_maintenance_key in Vault before scheduling Builder Atlas maintenance';
  end if;
  stamp := floor(extract(epoch from clock_timestamp()))::bigint::text;
  signature := encode(extensions.hmac('ecosystem-maintenance:' || stamp, signing_key, 'sha256'), 'hex');
  return net.http_post(
    url := 'https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/ecosystem-maintenance',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-armature-wakeup-time', stamp, 'x-armature-wakeup-signature', signature),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function private.wake_ecosystem_maintenance() from public, anon, authenticated, service_role;

do $$
begin
  if has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT')
    or has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT') then
    raise exception 'Vault secrets must not be publicly readable before enabling ecosystem maintenance';
  end if;
  perform cron.schedule('ecosystem-private-retention', '17 * * * *', 'select public.cleanup_ecosystem_private_data()');
  perform cron.schedule('ecosystem-maintenance-every-five-minutes', '*/5 * * * *', 'select private.wake_ecosystem_maintenance()');
end;
$$;

commit;
