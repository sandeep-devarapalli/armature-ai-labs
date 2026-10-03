#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR=$(mktemp -d)
LEASE=a8200000-0000-4000-8000-000000000001
cleanup() {
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
 delete from private.ecosystem_notification_reconciliations where submission_id::text like 'a8100000-%';
 delete from private.ecosystem_notifications where submission_id::text like 'a8100000-%';
 delete from public.ecosystem_submissions where id::text like 'a8100000-%';
 delete from public.member_notification_events where provider_id like 'a8300000-%';
 delete from public.member_notification_suppressions where recipient_email='atlas-race@example.test';
SQL
 rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 insert into public.ecosystem_submissions(id,idempotency_key,payload_hash,kind,proposed)
 select ('a8100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'atlas-race:'||i,repeat('a',64),'new','{}' from generate_series(1,3) i;
 insert into private.ecosystem_notifications(submission_id,state,attempts,lease,retry_at,recipient_email,recipient_hash)
 select id,'sending',1,'$LEASE',now()+interval '5 minutes','atlas-race@example.test',encode(extensions.digest('atlas-race@example.test','sha256'),'hex')
 from public.ecosystem_submissions where id::text like 'a8100000-%';
SQL
# Acknowledgement holds the provider lock before the webhook starts.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.finish_ecosystem_notification('a8100000-0000-4000-8000-000000000001','$LEASE','accepted','a8300000-0000-4000-8000-000000000001');
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<'SQL'
 select public.record_member_notification_event('atlas-race-finish','a8300000-0000-4000-8000-000000000001','email.delivered','2026-01-01Z');
SQL
wait "$PID"
# Early complaint holds the provider lock while sender completion arrives.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<'SQL' &
 begin;
 select public.record_member_notification_event('atlas-race-early','a8300000-0000-4000-8000-000000000002','email.complained','2026-01-01Z');
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.finish_ecosystem_notification('a8100000-0000-4000-8000-000000000002','$LEASE','accepted','a8300000-0000-4000-8000-000000000002');
SQL
wait "$PID"
# Two finishers cannot attach different provider IDs to the same lease.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select public.finish_ecosystem_notification('a8100000-0000-4000-8000-000000000003','$LEASE','accepted','a8300000-0000-4000-8000-000000000003');
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select public.finish_ecosystem_notification('a8100000-0000-4000-8000-000000000003','$LEASE','accepted','a8300000-0000-4000-8000-000000000004');
SQL
wait "$PID"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
 do $$ begin
 if not exists(select 1 from private.ecosystem_notifications where provider_id='a8300000-0000-4000-8000-000000000001' and delivery_state='delivered') then raise exception 'Lost concurrent delivery'; end if;
 if not exists(select 1 from private.ecosystem_notifications where provider_id='a8300000-0000-4000-8000-000000000002' and delivery_state='complained') then raise exception 'Lost early complaint'; end if;
 if not exists(select 1 from public.member_notification_suppressions where recipient_email='atlas-race@example.test') then raise exception 'Lost suppression'; end if;
 if not exists(select 1 from private.ecosystem_notifications where submission_id='a8100000-0000-4000-8000-000000000003' and provider_id='a8300000-0000-4000-8000-000000000003') then raise exception 'Concurrent completion replaced provider'; end if;
 end $$;
SQL
echo 'PASS: Atlas callback ordering, concurrent completion, and suppression'
