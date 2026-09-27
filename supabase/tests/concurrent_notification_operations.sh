#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
export PGOPTIONS='-c statement_timeout=5000 -c lock_timeout=3000'
RUN_DIR=$(mktemp -d)
SUBJECT=64000000-0000-4000-8000-000000000001
ADMIN=64000000-0000-4000-8000-000000000002
OLD_GATE=$($PSQL "$DATABASE_URL" -Atc 'select cleanup_enabled from public.member_notification_settings')
cleanup() {
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 delete from auth.users where id in ('$SUBJECT','$ADMIN');
 delete from public.member_notification_events where provider_id in ('ops-race-before','ops-race-after');
 delete from public.member_notification_suppressions where recipient_email in ('ops-race@example.test','sha256:'||encode(extensions.digest('ops-race@example.test','sha256'),'hex'));
 update public.member_notification_settings set cleanup_enabled='$OLD_GATE';
SQL
 rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 update public.member_notification_settings set cleanup_enabled=true;
 insert into auth.users(id,aud,role,email,email_confirmed_at) values('$SUBJECT','authenticated','authenticated','ops-race@example.test',now()),('$ADMIN','authenticated','authenticated','ops-race-admin@example.test',now());
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,created_at)
 values('$SUBJECT','$SUBJECT','ops-race@example.test','ops-race-ready','ready','pending',1,'held',now()-interval '31 days'),
 ('$SUBJECT','$ADMIN','ops-race-admin@example.test','ops-race-ready','admin_ready','pending',1,'held',now()-interval '32 days');
SQL
# Enqueue holds member then admin; cleanup deliberately visits admin then member.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select private.enqueue_member_notification('$SUBJECT','$SUBJECT','ops-race-ready','ready','pending',1);
 select pg_sleep(1);
 select private.enqueue_member_notification('$SUBJECT','$ADMIN','ops-race-ready','admin_ready','pending',1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.maintain_member_notifications(false);
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 select public.maintain_member_notifications(false);
 do \$\$ begin
 if exists(select 1 from public.member_notifications where event_key='ops-race-ready') then raise exception 'Archived readiness recreated'; end if;
 if (select count(*) from public.member_notification_tombstones where event_key='ops-race-ready')<>2 then raise exception 'Lost readiness marker'; end if;
 end \$\$;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,created_at,completed_at,provider_id,delivery_state)
 values('$SUBJECT','$SUBJECT','ops-race@example.test','ops-race-before','approved','approved',1,'accepted',now()-interval '31 days',now()-interval '31 days','ops-race-before','delivered');
SQL
# Cleanup commits after a late complaint starts: the webhook must use its tombstone.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.maintain_member_notifications(false);
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.record_member_notification_event('ops-race-before','ops-race-before','email.complained',now());
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 do \$\$ begin
 if not exists(select 1 from public.member_notification_suppressions where recipient_email='sha256:'||encode(extensions.digest('ops-race@example.test','sha256'),'hex') and reason='complained') then raise exception 'Lost late hashed suppression'; end if;
 end \$\$;
 delete from public.member_notification_suppressions where recipient_email='sha256:'||encode(extensions.digest('ops-race@example.test','sha256'),'hex');
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,created_at,completed_at,provider_id,delivery_state)
 values('$SUBJECT','$SUBJECT','ops-race@example.test','ops-race-after','approved','approved',1,'accepted',now()-interval '31 days',now()-interval '31 days','ops-race-after','delivered');
SQL
# Complaint commits after cleanup starts: cleanup skips the busy provider then retries.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.record_member_notification_event('ops-race-after','ops-race-after','email.complained',now());
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.maintain_member_notifications(false);
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 select public.maintain_member_notifications(false);
 do \$\$ begin
 if exists(select 1 from public.member_notifications where provider_id='ops-race-after') then raise exception 'Cleanup retry failed'; end if;
 if not exists(select 1 from public.member_notification_suppressions where recipient_email='ops-race@example.test' and reason='complained') then raise exception 'Lost concurrent suppression'; end if;
 end \$\$;
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,created_at)
 select '$SUBJECT','$SUBJECT','ops-race@example.test','ops-race-workers:'||i,'approved','approved',1,'held',now()-interval '31 days' from generate_series(1,10) i;
SQL
# Two maintenance workers must converge without duplicate markers or waiting cycles.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.maintain_member_notifications(false,5);
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.maintain_member_notifications(false,5);
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 select public.maintain_member_notifications(false);
 do \$\$ begin
 if exists(select 1 from public.member_notifications where event_key like 'ops-race-workers:%') then raise exception 'Concurrent cleanup did not converge'; end if;
 if (select count(*) from public.member_notification_tombstones where event_key like 'ops-race-workers:%')<>10 then raise exception 'Wrong deduplication marker count'; end if;
 end \$\$;
SQL
# A deletion holding the applicant row must not wait for a cleanup-held notice.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,created_at)
 values('$SUBJECT','$ADMIN','ops-race-admin@example.test','ops-race-delete','admin_ready','pending',1,'held',now()-interval '31 days');
SQL
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select id from auth.users where id='$SUBJECT' for update;
 select pg_sleep(1);
 delete from auth.users where id='$SUBJECT';
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.maintain_member_notifications(false);
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 do \$\$ begin
 if exists(select 1 from public.member_notification_tombstones where user_id='$SUBJECT' or recipient_id='$SUBJECT') then raise exception 'Applicant deletion left markers'; end if;
 if exists(select 1 from public.member_notifications where user_id='$SUBJECT') then raise exception 'Applicant deletion left notification'; end if;
 end \$\$;
 insert into auth.users(id,aud,role,email,email_confirmed_at) values('$SUBJECT','authenticated','authenticated','ops-race@example.test',now());
 insert into public.member_notifications(user_id,recipient_id,recipient_email,event_key,kind,expected_status,application_revision,state,created_at)
 values('$SUBJECT','$ADMIN','ops-race-admin@example.test','ops-race-delete-reverse','admin_ready','pending',1,'held',now()-interval '31 days');
SQL
# When cleanup wins first, deletion waits then cascades its newly created marker.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.maintain_member_notifications(false);
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 delete from auth.users where id='$SUBJECT';
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 do \$\$ begin
 if exists(select 1 from public.member_notification_tombstones where user_id='$SUBJECT' or recipient_id='$SUBJECT') then raise exception 'Reverse deletion left markers'; end if;
 if not exists(select 1 from auth.users where id='$ADMIN') then raise exception 'Unrelated recipient account deleted'; end if;
 end \$\$;
SQL
echo 'PASS: inverse enqueue order, complaint/cleanup races, two cleanup workers, and applicant deletion in both orders'
