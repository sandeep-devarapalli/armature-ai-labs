#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:58322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/wishlist-race.XXXXXX")"
cleanup() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
begin;
set local session_replication_role=replica;
delete from public.audit_events where entity_id in ('b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000012');
commit;
delete from public.component_requests where id in ('b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000012');
delete from public.staff_roles where user_id::text like 'b3000000%';
delete from public.basic_onboarding_applications where user_id::text like 'b3000000%';
delete from auth.users where id::text like 'b3000000%';
SQL
 rm -f "$RUN_DIR/one" "$RUN_DIR/two" "$RUN_DIR/merge" "$RUN_DIR/vote"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into auth.users(id,email,email_confirmed_at,aud,role) select ('b3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'wishlist-race-'||n||'@example.test',now(),'authenticated','authenticated' from generate_series(1,3)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) select id,'Synthetic race',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like 'b3000000%';
insert into public.staff_roles(user_id,role) values('b3000000-0000-4000-8000-000000000003','admin');
insert into public.component_requests(id,requester_email,component_name,project_use_case,request_scope,wishlist_category,verified_at,is_published) values
('b3000000-0000-4000-8000-000000000011','race@example.test','Source test','Synthetic equipment request for race test','equipment_wishlist','Other',now(),true),
('b3000000-0000-4000-8000-000000000012','race@example.test','Target test','Synthetic target request for merge test','equipment_wishlist','Other',now(),true);
SQL
vote() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"$1","role":"authenticated"}',true);
select public.vote_component_request('b3000000-0000-4000-8000-000000000011',true);
select pg_sleep(0.2);
commit;
SQL
}
vote b3000000-0000-4000-8000-000000000001 > "$RUN_DIR/one" 2>&1 & ONE=$!
vote b3000000-0000-4000-8000-000000000001 > "$RUN_DIR/two" 2>&1 & TWO=$!
wait "$ONE" || { cat "$RUN_DIR/one"; exit 1; }
wait "$TWO" || { cat "$RUN_DIR/two"; exit 1; }
COUNT=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) from public.component_request_votes where request_id='b3000000-0000-4000-8000-000000000011'")
[ "$COUNT" = 1 ] || { echo 'Duplicate concurrent vote'; exit 1; }
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q > "$RUN_DIR/merge" 2>&1 <<'SQL' &
begin;
select set_config('request.jwt.claims','{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.merge_equipment_wishes('b3000000-0000-4000-8000-000000000011','b3000000-0000-4000-8000-000000000012','Synthetic race merge');
select pg_sleep(0.2);
commit;
SQL
MERGE=$!
vote b3000000-0000-4000-8000-000000000002 > "$RUN_DIR/vote" 2>&1 & VOTE=$!
wait "$MERGE" || { cat "$RUN_DIR/merge"; exit 1; }
wait "$VOTE" || { grep -q 'Published open wishlist item required' "$RUN_DIR/vote" || { cat "$RUN_DIR/vote"; exit 1; }; }
RESULT=$("$PSQL" "$DATABASE_URL" -Atqc "select (select count(*) from public.component_request_votes where request_id='b3000000-0000-4000-8000-000000000011')=0 and (select count(*) from public.component_request_votes where request_id='b3000000-0000-4000-8000-000000000012') between 1 and 2 and (select merged_into from public.component_requests where id='b3000000-0000-4000-8000-000000000011')='b3000000-0000-4000-8000-000000000012'::uuid")
[ "$RESULT" = t ] || { echo 'Merge/vote race lost or stranded support'; exit 1; }
echo 'PASS: concurrent duplicate votes count once; merge/vote race never strands source votes'
