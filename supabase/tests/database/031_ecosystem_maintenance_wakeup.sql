begin;
select no_plan();

select ok(not has_table_privilege('anon', 'vault.decrypted_secrets', 'SELECT'), 'anonymous visitors cannot read the signing key');
select ok(not has_table_privilege('authenticated', 'vault.decrypted_secrets', 'SELECT'), 'members and staff cannot read the signing key');
select ok(not has_function_privilege('anon', 'private.wake_ecosystem_maintenance()', 'EXECUTE'), 'anonymous visitors cannot wake maintenance');
select ok(not has_function_privilege('authenticated', 'private.wake_ecosystem_maintenance()', 'EXECUTE'), 'authenticated clients cannot wake maintenance');
select ok(not has_function_privilege('service_role', 'private.wake_ecosystem_maintenance()', 'EXECUTE'), 'the service role cannot directly call the cron-only wakeup');
select is((select count(*) from cron.job where jobname = 'ecosystem-maintenance-every-five-minutes' and schedule = '*/5 * * * *' and command = 'select private.wake_ecosystem_maintenance()' and active), 1::bigint, 'five-minute maintenance is scheduled exactly once');
select is((select count(*) from cron.job where jobname = 'ecosystem-private-retention' and schedule = '17 * * * *' and command = 'select public.cleanup_ecosystem_private_data()' and active), 1::bigint, 'hourly retention exists even if migration001 ran before cron was installed');

create temp table ecosystem_http_baseline as select count(*) n from net.http_request_queue;
delete from vault.secrets where name = 'ecosystem_maintenance_key';
select throws_ok('select private.wake_ecosystem_maintenance()', 'P0001', 'Configure the dedicated ecosystem_maintenance_key in Vault before scheduling Builder Atlas maintenance', 'missing configuration fails visibly rather than reporting a successful wakeup');
select is((select count(*) from net.http_request_queue), (select n from ecosystem_http_baseline), 'a missing key queues no request');
select vault.create_secret(repeat('z', 40), 'ecosystem_maintenance_key');
create temp table ecosystem_http_sent as select private.wake_ecosystem_maintenance() id;
select is((select count(*) from net.http_request_queue), (select n + 1 from ecosystem_http_baseline), 'one wakeup queues exactly one request');
select ok(exists(select 1 from net.http_request_queue q join ecosystem_http_sent s on s.id = q.id
  where q.url = 'https://uxfhdfagrmaeyuaipaar.supabase.co/functions/v1/ecosystem-maintenance'
  and convert_from(q.body, 'UTF8') = '{}' and q.timeout_milliseconds = 120000), 'only the fixed endpoint receives an empty payload and bounded timeout');
select ok(exists(select 1 from net.http_request_queue q join ecosystem_http_sent s on s.id = q.id
  where q.headers->>'x-armature-wakeup-signature' = encode(extensions.hmac('ecosystem-maintenance:' || (q.headers->>'x-armature-wakeup-time'), repeat('z', 40), 'sha256'), 'hex')), 'signature binds the timestamp to the ecosystem-only purpose');
select ok(not exists(select 1 from net.http_request_queue q join ecosystem_http_sent s on s.id = q.id
  where q.headers ? 'x-armature-job-secret' or q.headers::text like '%' || repeat('z', 40) || '%'), 'pg_net never receives either reusable credential');

select * from finish();
rollback;
