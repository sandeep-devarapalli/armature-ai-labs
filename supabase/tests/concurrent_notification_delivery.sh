#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR=$(mktemp -d)
SUBJECT=62000000-0000-4000-8000-000000000001
LEASE=62000000-0000-4000-8000-000000000099
cleanup() {
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 delete from auth.users where id='$SUBJECT';
 delete from public.member_notification_events where provider_id in ('race-finish-first','race-event-first','race-duplicate');
 delete from public.member_notification_suppressions where recipient_email='delivery-race@example.test';
SQL
 rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 insert into auth.users(id,aud,role,email,email_confirmed_at) values('$SUBJECT','authenticated','authenticated','delivery-race@example.test',now());
 insert into public.member_notifications(id,user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,lease_token,lease_until)
 select ('62000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'$SUBJECT','$SUBJECT','delivery-race@example.test','delivery-race:'||i,'approved','approved',1,'sending','$LEASE',now()+interval '2 minutes' from generate_series(10,11) i;
SQL
# Provider acknowledgement commits after the webhook request starts.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.finish_member_notification('62000000-0000-4000-8000-000000000010','$LEASE','accepted','race-finish-first');
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.record_member_notification_event('race-finish-event','race-finish-first','email.delivered','2026-01-01Z');
SQL
wait "$PID"
# A webhook commits after the acknowledgement request starts.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.record_member_notification_event('race-event-first','race-event-first','email.bounced','2026-01-01Z');
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.finish_member_notification('62000000-0000-4000-8000-000000000011','$LEASE','accepted','race-event-first');
SQL
wait "$PID"
# Concurrent provider retries retain one immutable event.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.record_member_notification_event('race-duplicate','race-duplicate','email.sent','2026-01-01Z');
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.record_member_notification_event('race-duplicate','race-duplicate','email.sent','2026-01-01Z');
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 do \$\$ begin
 if not exists(select 1 from public.member_notifications where provider_id='race-finish-first' and delivery_state='delivered') then raise exception 'Lost concurrent delivery'; end if;
 if not exists(select 1 from public.member_notifications where provider_id='race-event-first' and delivery_state='bounced') then raise exception 'Lost early bounce'; end if;
 if not exists(select 1 from public.member_notification_suppressions where recipient_email='delivery-race@example.test') then raise exception 'Lost suppression'; end if;
 if (select count(*) from public.member_notification_events where event_id='race-duplicate')<>1 then raise exception 'Duplicate event'; end if;
 end \$\$;
SQL
echo 'PASS: acknowledgement/webhook races in both orders and concurrent webhook duplicates'
