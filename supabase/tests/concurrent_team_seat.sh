#!/bin/sh
set -eu

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PSQL="${PSQL:-psql}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/armature-team-seat.XXXXXX")"
ADMIN_ID="34000000-0000-4000-8000-000000000001"
TEAM_ID="34000000-0000-4000-8000-000000000002"

cleanup() {
  "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
set local session_replication_role=replica;
delete from public.audit_events where entity_id='$TEAM_ID';
commit;
delete from public.organizations where id='$TEAM_ID';
delete from auth.users where id='$ADMIN_ID';
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
delete from auth.users where id='$ADMIN_ID';
insert into auth.users(id,aud,role,email,email_confirmed_at)
values ('$ADMIN_ID','authenticated','authenticated','seat-admin@example.test',now());
insert into public.organizations(id,name)
values ('$TEAM_ID','Concurrent Seat Test');
insert into public.organization_memberships
  (organization_id,status,seat_allowance,starts_at,ends_at)
values ('$TEAM_ID','active',1,now()-interval '1 day',now()+interval '30 days');
insert into public.organization_members(organization_id,user_id,role,seat_enabled)
values ('$TEAM_ID','$ADMIN_ID','admin',false);
SQL

attempt() {
  email="$1"
  output="$2"
  "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 >"$output" 2>&1 <<SQL
begin;
select set_config('request.jwt.claims',
  '{"sub":"$ADMIN_ID","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.team_create_invitation('$TEAM_ID','$email');
select pg_sleep(1);
commit;
SQL
}

set +e
attempt 'seat-one@example.test' "$RUN_DIR/one.log" &
PID_ONE=$!
attempt 'seat-two@example.test' "$RUN_DIR/two.log" &
PID_TWO=$!
wait "$PID_ONE"
STATUS_ONE=$?
wait "$PID_TWO"
STATUS_TWO=$?
set -e

SUCCESS_COUNT=0
[ "$STATUS_ONE" -eq 0 ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
[ "$STATUS_TWO" -eq 0 ] && SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
INVITATION_COUNT="$("$PSQL" "$DATABASE_URL" -Atqc \
  "select count(*) from public.organization_invitations where organization_id='$TEAM_ID' and revoked_at is null and accepted_at is null")"

if [ "$SUCCESS_COUNT" -ne 1 ] || [ "$INVITATION_COUNT" -ne 1 ]; then
  printf '%s\n' "Expected one successful claim and one open invitation; got $SUCCESS_COUNT and $INVITATION_COUNT."
  sed -n '1,100p' "$RUN_DIR/one.log" "$RUN_DIR/two.log"
  exit 1
fi

printf '%s\n' 'ok - one concurrent claim won the final team seat'
