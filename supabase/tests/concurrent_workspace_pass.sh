#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:57322/postgres}"
case "$DATABASE_URL" in *127.0.0.1:*|*localhost:*) ;; *) echo 'Local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/workspace-pass.XXXXXX")"
"$PSQL" "$DATABASE_URL" -At -c "select mock_grants_enabled from public.booking_policy_settings" > "$RUN_DIR/gate"
"$PSQL" "$DATABASE_URL" -At -c "select resource_id from public.booking_inventory where code='S25'" > "$RUN_DIR/old-resource"
cleanup() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
 update public.booking_policy_settings set mock_grants_enabled='$(cat "$RUN_DIR/gate")';
 begin;
 set local session_replication_role=replica;
 delete from public.audit_events where actor_user_id in ('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002');
 commit;
 delete from public.resource_reservations where resource_id='98000000-0000-4000-8000-000000000003';
 delete from public.workspace_pass_allocations where resource_id='98000000-0000-4000-8000-000000000003';
 delete from public.bookings where resource_id='98000000-0000-4000-8000-000000000003';
 delete from public.paid_access_entitlements where resource_id='98000000-0000-4000-8000-000000000003';
 delete from public.booking_inventory where resource_id='98000000-0000-4000-8000-000000000003';
 delete from public.resource_booking_policies where resource_id='98000000-0000-4000-8000-000000000003';
 delete from public.resources where id='98000000-0000-4000-8000-000000000003';
 delete from public.booking_products where code like 'concurrent-pass-%';
 delete from public.basic_onboarding_applications where user_id in ('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002');
 delete from auth.users where id in ('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002');
 update public.booking_policy_settings set mock_grants_enabled='$(cat "$RUN_DIR/gate")';
SQL
 if [ -s "$RUN_DIR/old-resource" ]; then "$PSQL" "$DATABASE_URL" -q -c "insert into public.booking_inventory values('$(cat "$RUN_DIR/old-resource")','S25','GF','GF-10')"; fi
 rm -f "$RUN_DIR/gate" "$RUN_DIR/old-resource" "$RUN_DIR/month.log" "$RUN_DIR/day.log" "$RUN_DIR/cancel-one.log" "$RUN_DIR/cancel-two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into auth.users(id,email,email_confirmed_at,aud,role) values
('98000000-0000-4000-8000-000000000001','race-month@example.test',now(),'authenticated','authenticated'),('98000000-0000-4000-8000-000000000002','race-day@example.test',now(),'authenticated','authenticated');
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) select id,'Synthetic race',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id in ('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000002');
insert into public.resources(id,location_id,slug,name,kind,max_guests,max_duration_minutes,booking_horizon_days) select '98000000-0000-4000-8000-000000000003',id,'concurrent-pass-chair','Synthetic pass race','workspace',0,480,10000 from public.locations limit 1;
insert into public.resource_booking_policies values('98000000-0000-4000-8000-000000000003','workspace');
delete from public.booking_inventory where code='S25';
insert into public.booking_inventory values('98000000-0000-4000-8000-000000000003','S25','GF','GF-10');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at) select '98000000-0000-4000-8000-000000000003',d,'09:00','17:00' from generate_series(0,6)d;
insert into public.booking_products(code,name,kind,unit,price_paise,enabled) values('concurrent-pass-month','Synthetic month','workspace','month',10000,true),('concurrent-pass-day','Synthetic day','workspace','day',1000,true);
update public.booking_policy_settings set mock_grants_enabled=true;
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,granted_by)
select '98000000-0000-4000-8000-000000000001',p.id,'98000000-0000-4000-8000-000000000003',(d::date+time '09:00') at time zone 'Asia/Kolkata',(d::date+time '17:00') at time zone 'Asia/Kolkata',1,1,'98000000-0000-4000-8000-000000000001' from public.booking_products p cross join generate_series(timestamp '2033-01-01',timestamp '2033-01-31',interval '1 day')d where p.code='concurrent-pass-month';
insert into public.paid_access_entitlements(user_id,product_id,resource_id,starts_at,ends_at,seats,price_paise,granted_by) select '98000000-0000-4000-8000-000000000002',id,'98000000-0000-4000-8000-000000000003','2033-01-15 09:00+05:30','2033-01-15 17:00+05:30',1,1,'98000000-0000-4000-8000-000000000002' from public.booking_products where code='concurrent-pass-day';
SQL
run_pass() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"$1","role":"authenticated"}',true);
select public.reserve_workspace_pass('98000000-0000-4000-8000-000000000003',(select id from public.booking_products where code='concurrent-pass-$2'),array[date '$3']);
select pg_sleep(0.5);
commit;
SQL
}
run_pass 98000000-0000-4000-8000-000000000001 month 2033-01-01 > "$RUN_DIR/month.log" 2>&1 & MONTH_PID=$!
run_pass 98000000-0000-4000-8000-000000000002 day 2033-01-15 > "$RUN_DIR/day.log" 2>&1 & DAY_PID=$!
MONTH_STATUS=0; wait "$MONTH_PID" || MONTH_STATUS=$?
DAY_STATUS=0; wait "$DAY_PID" || DAY_STATUS=$?
if { [ "$MONTH_STATUS" = 0 ] && [ "$DAY_STATUS" = 0 ]; } || { [ "$MONTH_STATUS" != 0 ] && [ "$DAY_STATUS" != 0 ]; }; then cat "$RUN_DIR/month.log" "$RUN_DIR/day.log"; exit 1; fi
COUNT="$("$PSQL" "$DATABASE_URL" -At -c "select count(*) from public.bookings where resource_id='98000000-0000-4000-8000-000000000003'")"
if [ "$COUNT" != 1 ] && [ "$COUNT" != 31 ]; then echo 'Partial pass survived'; exit 1; fi
echo 'ok - competing monthly/day requests produce one complete pass, never partial or double booking'

"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
insert into public.bookings(id,resource_id,member_id,status,starts_at,ends_at) values
('98000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000001','confirmed','2033-02-01 09:00+05:30','2033-02-01 17:00+05:30'),
('98000000-0000-4000-8000-000000000005','98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000001','confirmed','2033-02-02 09:00+05:30','2033-02-02 17:00+05:30');
insert into public.workspace_pass_allocations(resource_id,member_id,product_id,period,booking_ids) select '98000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000001',id,daterange('2033-02-01','2033-03-01','[)'),array['98000000-0000-4000-8000-000000000004'::uuid,'98000000-0000-4000-8000-000000000005'::uuid] from public.booking_products where code='concurrent-pass-month';
SQL
run_cancel() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
update public.bookings set status='cancelled',cancelled_at=now(),cancelled_by='98000000-0000-4000-8000-000000000001' where id='$1';
select pg_sleep(0.3);
commit;
SQL
}
run_cancel 98000000-0000-4000-8000-000000000004 > "$RUN_DIR/cancel-one.log" 2>&1 & CANCEL_ONE=$!
run_cancel 98000000-0000-4000-8000-000000000005 > "$RUN_DIR/cancel-two.log" 2>&1 & CANCEL_TWO=$!
wait "$CANCEL_ONE" || { cat "$RUN_DIR/cancel-one.log"; exit 1; }
wait "$CANCEL_TWO" || { cat "$RUN_DIR/cancel-two.log"; exit 1; }
RELEASED="$("$PSQL" "$DATABASE_URL" -At -c "select released_at is not null from public.workspace_pass_allocations where resource_id='98000000-0000-4000-8000-000000000003' and period=daterange('2033-02-01','2033-03-01','[)')")"
[ "$RELEASED" = t ] || { echo 'Concurrent final cancellation stranded allocation'; exit 1; }
echo 'ok - concurrent final two cancellations release monthly allocation'
