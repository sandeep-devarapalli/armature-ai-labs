#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR=$(mktemp -d)
SUBJECT=74000000-0000-4000-8000-000000000001
REQUEST=74000000-0000-4000-8000-000000000010
OLD_SETTINGS=$($PSQL "$DATABASE_URL" -Atc "select enabled||','||all_members_enabled||','||immediate_enabled||','||talent_notifications_enabled from public.member_notification_settings")
cleanup() {
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 begin;
 delete from public.member_notifications where user_id='$SUBJECT';
 delete from public.member_notification_tombstones where user_id='$SUBJECT';
 delete from private.talent_requests where id='$REQUEST';
 delete from public.talent_profiles where id='talent-notification-race';
 delete from auth.users where id='$SUBJECT';
 commit;
SQL
 if [ -z "$OLD_SETTINGS" ]; then
  "$PSQL" "$DATABASE_URL" -q -c 'delete from public.member_notification_settings';
 else
  "$PSQL" "$DATABASE_URL" -q -c "update public.member_notification_settings set (enabled,all_members_enabled,immediate_enabled,talent_notifications_enabled)=($OLD_SETTINGS)";
 fi
 rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 insert into public.member_notification_settings(singleton) values(true) on conflict do nothing;
 update public.member_notification_settings set enabled=true,all_members_enabled=true,immediate_enabled=false,talent_notifications_enabled=true;
 insert into auth.users(id,email,email_confirmed_at) values('$SUBJECT','talent-race@example.test',now());
 insert into public.talent_profiles(id,data) values('talent-notification-race','{"name":"Synthetic notification race","linkedinUrl":"https://www.linkedin.com/in/talent-notification-race"}');
 insert into private.talent_requests(id,profile_id,requester_id,kind,evidence,base_revision,status)
 values('$REQUEST','talent-notification-race','$SUBJECT','claim','Synthetic concurrency test evidence',1,'approved');
SQL
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 select private.enqueue_talent_notification('$REQUEST','$SUBJECT','talent_claim_approved');
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 select private.enqueue_talent_notification('$REQUEST','$SUBJECT','talent_claim_approved');
SQL
wait "$PID"
COUNT=$($PSQL "$DATABASE_URL" -Atc "select count(*) from public.member_notifications where talent_request_id='$REQUEST'")
[ "$COUNT" = 1 ] || { echo 'FAIL: concurrent enqueue duplicated talent notification'; exit 1; }
NOTICE=$($PSQL "$DATABASE_URL" -Atc "select id from public.member_notifications where talent_request_id='$REQUEST'")
"$PSQL" "$DATABASE_URL" -At -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 set local role service_role;
 select id from public.claim_member_notifications(10);
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -At -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 begin;
 set local role service_role;
 select id from public.claim_member_notifications(10);
 commit;
SQL
wait "$PID"
COUNT=$(cat "$RUN_DIR/one.log" "$RUN_DIR/two.log" | grep -c "$NOTICE")
[ "$COUNT" = 1 ] || { echo 'FAIL: concurrent workers leased talent notification more than once'; exit 1; }
RESULT=$($PSQL "$DATABASE_URL" -Atc "select state||':'||attempts from public.member_notifications where id='$NOTICE'")
[ "$RESULT" = leased:1 ] || { echo 'FAIL: unexpected talent lease state'; exit 1; }
echo 'PASS: concurrent talent enqueue is idempotent and service workers lease once'
