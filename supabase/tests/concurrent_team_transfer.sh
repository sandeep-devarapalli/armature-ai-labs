#!/bin/sh
set -eu

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
OLD_PAID_GATE=$("$PSQL" "$DATABASE_URL" -Atqc 'select mock_grants_enabled from public.booking_policy_settings')
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/armature-team-transfer.XXXXXX")"
ADMIN_ID="35000000-0000-4000-8000-000000000001"
TEAM_ID="35000000-0000-4000-8000-000000000002"

cleanup() {
  "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
update public.booking_policy_settings set mock_grants_enabled='$OLD_PAID_GATE';
begin;
set local session_replication_role=replica;
delete from public.audit_events where entity_id='$TEAM_ID';
commit;
delete from public.organizations where id='$TEAM_ID';
delete from public.basic_onboarding_applications where user_id::text like '35000000%';
delete from auth.users where id::text like '35000000%';
SQL
  rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
  rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM

"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
set local session_replication_role=replica;
delete from public.audit_events where entity_id='$TEAM_ID';
commit;
delete from public.organizations where id='$TEAM_ID';
delete from public.basic_onboarding_applications where user_id::text like '35000000%';
delete from auth.users where id::text like '35000000%';
insert into auth.users(id,aud,role,email,email_confirmed_at)
values ('$ADMIN_ID','authenticated','authenticated','seat-admin@example.test',now());
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
values ('$ADMIN_ID','Seat Admin','seat-admin@example.test','9999999999','https://linkedin.com/in/test','1990-01-01','approved');
insert into public.organizations(id,name)
values ('$TEAM_ID','Concurrent Transfer Test');
update public.booking_policy_settings set mock_grants_enabled=true;
insert into public.organization_memberships
  (organization_id,status,seat_allowance,starts_at,ends_at)
values ('$TEAM_ID','active',3,now()-interval '1 day',now()+interval '30 days');
insert into public.organization_members(organization_id,user_id,role,seat_enabled)
values ('$TEAM_ID','$ADMIN_ID','admin',false);
insert into auth.users(id,aud,role,email,email_confirmed_at)
select ('35000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'authenticated','authenticated','transfer-'||n||'@example.test',now() from generate_series(3,4) n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
select id,'Transfer Member',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like '35000000%' and id<>'$ADMIN_ID';
insert into public.organization_members(organization_id,user_id,role,seat_enabled)
select '$TEAM_ID',id,'member',true from auth.users where id::text like '35000000%' and id<>'$ADMIN_ID';
SQL

attempt() {
  target="$1"
  output="$2"
  "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 >"$output" 2>&1 <<SQL
begin;
select set_config('request.jwt.claims',
  '{"sub":"$ADMIN_ID","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.team_transfer_admin('$TEAM_ID','$target',true);
select pg_sleep(1);
commit;
SQL
}

set +e
attempt '35000000-0000-4000-8000-000000000003' "$RUN_DIR/one.log" &
PID_ONE=$!
attempt '35000000-0000-4000-8000-000000000004' "$RUN_DIR/two.log" &
PID_TWO=$!
wait "$PID_ONE"
STATUS_ONE=$?
wait "$PID_TWO"
STATUS_TWO=$?
set -e

SUCCESS_COUNT=0
[ "$STATUS_ONE" -eq 0 ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$STATUS_TWO" -eq 0 ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
ADMIN_COUNT="$("$PSQL" "$DATABASE_URL" -Atqc \
  "select count(*) from public.organization_members where organization_id='$TEAM_ID' and role='admin' and removed_at is null")"

if [ "$SUCCESS_COUNT" -ne 1 ] || [ "$ADMIN_COUNT" -ne 1 ]; then
  printf '%s\n' "Expected one successful transfer and one admin; got $SUCCESS_COUNT and $ADMIN_COUNT."
  sed -n '1,100p' "$RUN_DIR/one.log" "$RUN_DIR/two.log"
  exit 1
fi

printf '%s\n' 'ok - one concurrent transfer won and exactly one admin remains'
