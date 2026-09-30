#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:58322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/discount-race.XXXXXX")"
cleanup() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
delete from private.discount_redemptions where member_id='d4000000-0000-4000-8000-000000000001';
delete from private.discount_quotes where member_id='d4000000-0000-4000-8000-000000000001';
delete from public.discount_offers where id='d4000000-0000-4000-8000-000000000002';
delete from public.basic_onboarding_applications where user_id='d4000000-0000-4000-8000-000000000001';
delete from auth.users where id='d4000000-0000-4000-8000-000000000001';
SQL
}
trap cleanup EXIT
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into auth.users(id,email,email_confirmed_at,aud,role) values('d4000000-0000-4000-8000-000000000001','discount-race@example.test',now(),'authenticated','authenticated');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) values('d4000000-0000-4000-8000-000000000001','Synthetic Discount','discount-race@example.test','9999999999','https://linkedin.com/in/test','1990-01-01','approved');
insert into public.discount_offers(id,name,audience,value_kind,value,categories,starts_at,ends_at,total_limit) values('d4000000-0000-4000-8000-000000000002','Race fixture','public','percent',50,array['equipment'],now()-interval '1 hour',now()+interval '1 day',1);
insert into private.discount_quotes(id,member_id,category,base_paise,payable_paise,offer_id,offer_revision,breakdown) select ('d4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'d4000000-0000-4000-8000-000000000001','equipment',10000,5000,'d4000000-0000-4000-8000-000000000002',1,'{}' from generate_series(3,4)n;
SQL
("$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q >"$RUN_DIR/one" 2>&1 <<'SQL'
begin;
select public.reserve_discount_quote('d4000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000001','discount-race-first');
select pg_sleep(1);
commit;
SQL
) & a=$!
("$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q >"$RUN_DIR/two" 2>&1 <<'SQL'
select public.reserve_discount_quote('d4000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000001','discount-race-second');
SQL
) & b=$!
a_result=0; b_result=0
wait "$a" || a_result=$?
wait "$b" || b_result=$?
if [ "$a_result" -eq 0 ]; then [ "$b_result" -ne 0 ] || exit 1; else [ "$b_result" -eq 0 ] || { cat "$RUN_DIR/one" "$RUN_DIR/two"; exit 1; }; fi
if [ "$a_result" -eq 0 ]; then grep -q 'Offer changed or exhausted; requote' "$RUN_DIR/two"; else grep -q 'Offer changed or exhausted; requote' "$RUN_DIR/one"; fi
count=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) from private.discount_redemptions where offer_id='d4000000-0000-4000-8000-000000000002' and state='reserved'")
[ "$count" = 1 ] || exit 1
echo 'PASS concurrent total limit: exactly one reservation'
# A transaction started before expiration must not capture after another checkout can reuse the quota.
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "update private.discount_redemptions set expires_at=clock_timestamp()+interval '1 second' where offer_id='d4000000-0000-4000-8000-000000000002'"
if "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q >"$RUN_DIR/expired" 2>&1 <<'SQL'
begin;
select pg_sleep(1.2);
select public.settle_discount_reservation((select id from private.discount_redemptions where offer_id='d4000000-0000-4000-8000-000000000002'),true);
commit;
SQL
then echo 'FAIL expired capture succeeded'; exit 1; fi
grep -q 'Reservation no longer active' "$RUN_DIR/expired"
captured=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) from private.discount_redemptions where offer_id='d4000000-0000-4000-8000-000000000002' and state='captured'")
[ "$captured" = 0 ] || exit 1
echo 'PASS transaction-start timestamp cannot capture expired reservation'
