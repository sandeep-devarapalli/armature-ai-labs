#!/bin/sh
set -eu

# Explicit fixed loopback targets only; provider requests and real access grants are absent.
TEST_DB_PORT=57440
TEST_DB_DATABASE=retention_test
TEST_DB_PASSWORD=''
case "$#" in
 0) ;;
 1) [ "$1" = '--supabase-local-ci' ] && [ "${GITHUB_ACTIONS:-}" = true ] || { echo '--supabase-local-ci requires GITHUB_ACTIONS=true'; exit 1; }
    TEST_DB_PORT=54322; TEST_DB_DATABASE=postgres; TEST_DB_PASSWORD=postgres ;;
 *) echo 'Use no arguments or the explicit --supabase-local-ci mode'; exit 1 ;;
esac
PSQL="${PSQL:-psql}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/razorpay-sql-race.XXXXXX")"
ACTOR='a4060000-0000-4000-8000-000000000001'
CREATED=0
PASSED=0
sql() {
 env -u PGHOSTADDR -u PGSERVICE -u PGSERVICEFILE -u PGDATABASE -u PGHOST -u PGPORT -u PGOPTIONS -u PGPASSFILE \
   PGPASSWORD="$TEST_DB_PASSWORD" "$PSQL" -X -h 127.0.0.1 -p "$TEST_DB_PORT" -U postgres -d "$TEST_DB_DATABASE" -v ON_ERROR_STOP=1 -q -t -A "$@"
}
access_counts() {
 sql -c "select jsonb_build_array((select count(*) from public.bookings),(select count(*) from public.paid_access_entitlements),(select count(*) from private.membership_paid_terms),(select count(*) from private.identity_service_periods));"
}
cleanup() {
 if [ "$CREATED" = 1 ]; then
  sql >"$RUN_DIR/cleanup.log" <<SQL
begin;
select public.razorpay_test_operation('$ACTOR','configure','{"enabled":false}');
delete from private.razorpay_test_webhook_events where event_id='a406-event-capture';
delete from private.razorpay_test_refunds where order_id in (select id from private.razorpay_test_orders where actor_id='$ACTOR');
delete from private.razorpay_test_payments where order_id in (select id from private.razorpay_test_orders where actor_id='$ACTOR');
delete from private.razorpay_test_orders where actor_id='$ACTOR';
delete from private.razorpay_test_quotes where actor_id='$ACTOR';
delete from auth.users where id='$ACTOR';
commit;
SQL
 fi
 if [ "$PASSED" = 1 ]; then rm -f "$RUN_DIR"/*.log; rmdir "$RUN_DIR";
 else echo "Concurrency logs retained at $RUN_DIR"; fi
}
trap cleanup EXIT INT TERM

[ "$(sql -c 'select current_database();')" = "$TEST_DB_DATABASE" ]
[ "$(sql -c 'select enabled from private.razorpay_test_settings;')" = f ] || { echo 'Disable the isolated test ledger before this test'; exit 1; }
[ "$(sql -c "select count(*) from auth.users where id='$ACTOR';")" = 0 ] || { echo 'Synthetic actor already exists; refusing to overwrite'; exit 1; }
[ "$(sql -c "select count(*) from private.razorpay_test_webhook_events where event_id='a406-event-capture';")" = 0 ] || { echo 'Synthetic event already exists; refusing to overwrite'; exit 1; }
BEFORE="$(access_counts)"
sql >"$RUN_DIR/setup.log" <<SQL
begin;
insert into auth.users(id,email,email_confirmed_at,aud,role) values('$ACTOR','razorpay-concurrency@example.test',now(),'authenticated','authenticated');
insert into public.staff_roles(user_id,role) values('$ACTOR','super_admin');
select public.razorpay_test_operation('$ACTOR','configure','{"enabled":true}');
commit;
SQL
CREATED=1
QUOTE="$(sql -c "select public.razorpay_test_operation('$ACTOR','create_fixture_quote')->'quote'->>'id';")"
reserve_order() {
 sql <<SQL
set role service_role;
begin;
select public.razorpay_test_operation('$ACTOR','reserve_order',jsonb_build_object('quoteId','$QUOTE','idempotencyKey','a406-same-order','policyVersion','2026-11-04-razorpay-test-v1','acceptedPolicies','{"terms":true,"privacy":true,"refund":true,"shipping":true,"paymentDataSharing":true}'::jsonb))->>'shouldCreate';
select pg_sleep(1);
commit;
SQL
}
reserve_order >"$RUN_DIR/order-one.log" 2>&1 & a=$!
sleep 0.2
reserve_order >"$RUN_DIR/order-two.log" 2>&1 & b=$!
wait "$a"; wait "$b"
[ "$(awk '$0=="true"{n++} END{print n+0}' "$RUN_DIR/order-one.log" "$RUN_DIR/order-two.log")" = 1 ]
[ "$(awk '$0=="false"{n++} END{print n+0}' "$RUN_DIR/order-one.log" "$RUN_DIR/order-two.log")" = 1 ]
ORDER="$(sql -c "select id from private.razorpay_test_orders where actor_id='$ACTOR' and idempotency_key='a406-same-order';")"
[ "$(sql -c "select public.razorpay_test_webhook('a406-event-capture',repeat('a',64),'payment.captured',jsonb_build_object('razorpayOrderId','order_ConcurrentFixture','paymentId','pay_ConcurrentFixture','amountPaise',100,'currency','INR','status','captured'))->>'applied';")" = false ]
sql >"$RUN_DIR/capture.log" <<SQL
set role service_role;
select public.razorpay_test_operation('$ACTOR','attach_order',jsonb_build_object('orderId','$ORDER','razorpayOrderId','order_ConcurrentFixture','amountPaise',100,'currency','INR'));
SQL

webhook() {
 sql <<SQL
set role service_role;
begin;
select public.razorpay_test_webhook('a406-event-capture',repeat('a',64),'payment.captured',jsonb_build_object('razorpayOrderId','order_ConcurrentFixture','paymentId','pay_ConcurrentFixture','amountPaise',100,'currency','INR','status','captured'))->>'duplicate';
select pg_sleep(1);
commit;
SQL
}
webhook >"$RUN_DIR/event-one.log" 2>&1 & a=$!
sleep 0.2
webhook >"$RUN_DIR/event-two.log" 2>&1 & b=$!
wait "$a"; wait "$b"
[ "$(awk '$0=="false"{n++} END{print n+0}' "$RUN_DIR/event-one.log" "$RUN_DIR/event-two.log")" = 1 ]
[ "$(awk '$0=="true"{n++} END{print n+0}' "$RUN_DIR/event-one.log" "$RUN_DIR/event-two.log")" = 1 ]
[ "$(sql -c "select count(*) from private.razorpay_test_webhook_events where event_id='a406-event-capture' and applied;")" = 1 ]
[ "$(sql -c "select count(*) from private.razorpay_test_payments where order_id='$ORDER';")" = 1 ]

reserve_refund() {
 sql <<SQL
set role service_role;
begin;
select public.razorpay_test_operation('$ACTOR','reserve_refund',jsonb_build_object('orderId','$ORDER','amountPaise',60,'idempotencyKey','$1'))->>'shouldRefund';
select pg_sleep(1);
commit;
SQL
}
reserve_refund a406-refund-one >"$RUN_DIR/refund-one.log" 2>&1 & a=$!
sleep 0.2
reserve_refund a406-refund-two >"$RUN_DIR/refund-two.log" 2>&1 & b=$!
a_status=0; b_status=0
wait "$a" || a_status=$?; wait "$b" || b_status=$?
if [ "$a_status" = 0 ]; then [ "$b_status" != 0 ]; grep -Fq 'Refund exceeds unreserved captured amount' "$RUN_DIR/refund-two.log";
else [ "$b_status" = 0 ]; grep -Fq 'Refund exceeds unreserved captured amount' "$RUN_DIR/refund-one.log"; fi
[ "$(sql -c "select count(*) from private.razorpay_test_refunds where order_id='$ORDER' and amount_paise=60;")" = 1 ]

[ "$(access_counts)" = "$BEFORE" ]
PASSED=1
echo 'PASS Razorpay TEST races: one order creator, bounded refunds, unapplied webhook replay applied once, no access grants'
