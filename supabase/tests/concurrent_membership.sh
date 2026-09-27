#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR=$(mktemp -d)
SUPER=32000000-0000-4000-8000-000000000001
ADMIN=32000000-0000-4000-8000-000000000002
TARGET=32000000-0000-4000-8000-000000000003
OLD_GATE=$($PSQL "$DATABASE_URL" -Atc 'select enabled from public.onboarding_settings')
cleanup() {
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 delete from public.membership_role_audit where user_id in ('$SUPER','$ADMIN','$TARGET');
 delete from auth.users where id in ('$SUPER','$ADMIN','$TARGET');
 update public.onboarding_settings set enabled='$OLD_GATE';
SQL
 rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
update public.onboarding_settings set enabled=true;
insert into auth.users(id,aud,role,email,email_confirmed_at) values
('$SUPER','authenticated','authenticated','concurrent-super@example.test',now()),
('$ADMIN','authenticated','authenticated','concurrent-admin@example.test',now()),
('$TARGET','authenticated','authenticated','concurrent-target@example.test',now());
insert into public.staff_roles(user_id,role) values('$SUPER','super_admin'),('$ADMIN','admin');
SQL
# Hold a successful edit open while another request submits the same expected role.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}',true);
select public.set_membership_staff_role('$TARGET','membership_reviewer','member');
select pg_sleep(1);
commit;
SQL
PID=$!
sleep 0.2
if "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}',true);
select public.set_membership_staff_role('$TARGET','membership_reviewer','member');
commit;
SQL
then echo 'FAIL: duplicate concurrent role change succeeded'; exit 1; fi
wait "$PID"
grep -q 'Role changed; reload before editing' "$RUN_DIR/two.log"
# An actor waiting behind its own demotion must fail after the demotion commits.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$SUPER","role":"authenticated"}',true);
select public.set_membership_staff_role('$ADMIN','member','admin');
select pg_sleep(1);
commit;
SQL
PID=$!
sleep 0.2
if "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"$ADMIN","role":"authenticated"}',true);
select public.set_membership_staff_role('$TARGET','member','membership_reviewer');
commit;
SQL
then echo 'FAIL: demoted actor performed a role edit'; exit 1; fi
wait "$PID"
grep -q 'Role change not permitted' "$RUN_DIR/two.log"
echo 'PASS: concurrent stale role edit and concurrent actor demotion rejected'
