#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:58322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:58322/'*|*'@localhost:58322/'*) ;; *) echo 'Isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bundle-race.XXXXXX")"
"$PSQL" "$DATABASE_URL" -Atqc "select format('update public.booking_policy_settings set mock_grants_enabled=%L;',mock_grants_enabled) from public.booking_policy_settings union all select format('update public.equipment_rental_settings set mock_payments_enabled=%L;',mock_payments_enabled) from public.equipment_rental_settings" > "$RUN_DIR/restore.sql"
"$PSQL" "$DATABASE_URL" -Atqc "select format('insert into public.booking_inventory values(%L,%L,%L,%L);',resource_id,code,floor,room) from public.booking_inventory where code in ('S22','S23')" >> "$RUN_DIR/restore.sql"
cleanup() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
begin;
set local session_replication_role=replica;
delete from public.audit_events where actor_user_id::text like 'b1000000%';
commit;
delete from public.equipment_rental_orders where quote_id in(select id from public.equipment_rental_quotes where user_id::text like 'b1000000%');
delete from public.equipment_workspace_quotes where quote_id in(select id from public.equipment_rental_quotes where user_id::text like 'b1000000%');
delete from public.equipment_rental_quotes where user_id::text like 'b1000000%';
delete from public.resource_reservations where resource_id::text like 'b2000000%';
delete from public.bookings where resource_id::text like 'b2000000%';
delete from public.paid_access_entitlements where resource_id::text like 'b2000000%';
delete from public.equipment_rental_rates where unit_id in(select id from public.equipment_rental_units where asset_unit_id::text like 'b3000000%');
delete from public.equipment_rental_units where asset_unit_id::text like 'b3000000%';
delete from public.booking_inventory where resource_id::text like 'b2000000%';
delete from public.resource_booking_policies where resource_id::text like 'b2000000%';
delete from public.resources where id::text like 'b2000000%';
delete from public.asset_units where id::text like 'b3000000%';
delete from public.inventory_locations where id::text like 'b3000000%';
delete from public.booking_products where code like 'bundle-race-%';
delete from public.staff_roles where user_id::text like 'b1000000%';
delete from public.basic_onboarding_applications where user_id::text like 'b1000000%';
delete from auth.users where id::text like 'b1000000%';
SQL
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$RUN_DIR/restore.sql"
 rm -f "$RUN_DIR/restore.sql" "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q > "$RUN_DIR/one.log" <<'SQL'
begin;
delete from public.booking_inventory where code in ('S22','S23');
insert into auth.users(id,email,email_confirmed_at,aud,role) select ('b1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'bundle-race-'||n||'@example.test',now(),'authenticated','authenticated' from generate_series(1,4)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) select id,'Rental Test',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like 'b1000000%';
insert into public.staff_roles(user_id,role) values('b1000000-0000-4000-8000-000000000001','admin'),('b1000000-0000-4000-8000-000000000004','membership_reviewer');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_guests,max_duration_minutes,booking_horizon_days)
select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,l.id,'bundle-race-'||n,'Rental fixture '||n,case when n=1 then 'workspace'::public.resource_kind else 'equipment'::public.resource_kind end,1,0,1440,10000 from generate_series(1,2)n cross join lateral(select id from public.locations limit 1)l;
insert into public.resource_booking_policies values('b2000000-0000-4000-8000-000000000001','workspace'),('b2000000-0000-4000-8000-000000000002','equipment');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at) select id,d,'09:00','17:00' from public.resources cross join generate_series(0,6)d where id::text like 'b2000000%';
insert into public.booking_inventory values('b2000000-0000-4000-8000-000000000001','S23','GF','GF-10');
insert into public.inventory_locations(id,lab_location_id,code,name) select 'b3000000-0000-4000-8000-000000000001',id,'BUNDLE-RACE','Rental test' from public.locations limit 1;
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) select 'b3000000-0000-4000-8000-000000000002',id,'b3000000-0000-4000-8000-000000000001','ARM-TEST-990006' from public.components limit 1;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('rental.unit',public.configure_equipment_rental_unit('b3000000-0000-4000-8000-000000000002','b2000000-0000-4000-8000-000000000002',true,'Synthetic commissioning only')::text,true);
select set_config('rental.rate',public.approve_equipment_rental_rate(current_setting('rental.unit')::uuid,'hour',10000,now()-interval '1 day',null,0)::text,true);
select set_config('rental.dayrate',public.approve_equipment_rental_rate(current_setting('rental.unit')::uuid,'day',50000,now()-interval '1 day',null,0)::text,true);
select set_config('rental.notax',public.approve_equipment_rental_rate(current_setting('rental.unit')::uuid,'hour',10000,'2020-01-01','2021-01-01')::text,true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);update public.equipment_rental_settings set mock_payments_enabled=true;
update public.booking_policy_settings set mock_grants_enabled=true;
insert into public.booking_products(code,name,kind,unit,price_paise,enabled,tax_bps) values('bundle-race-workspace','Synthetic workspace','workspace','day',10000,true,1800),('bundle-race-equipment','Synthetic equipment','equipment','hour',10000,true,0);
insert into public.resources(id,location_id,slug,name,kind,capacity,max_guests,max_duration_minutes,booking_horizon_days) select 'b2000000-0000-4000-8000-000000000003',location_id,'bundle-race-chair-two','Race chair two','workspace',1,0,1440,10000 from public.resources where id='b2000000-0000-4000-8000-000000000001';
insert into public.resource_booking_policies values('b2000000-0000-4000-8000-000000000003','workspace');
insert into public.booking_inventory values('b2000000-0000-4000-8000-000000000003','S22','GF','GF-10');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at) select 'b2000000-0000-4000-8000-000000000003',d,'09:00','17:00' from generate_series(0,6)d;
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select public.create_equipment_workspace_quote(current_setting('rental.rate')::uuid,'2030-01-07 10:00+05:30','2030-01-07 11:00+05:30','b2000000-0000-4000-8000-000000000001',(select id from public.booking_products where code='bundle-race-workspace'),array[date '2030-01-07']);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select public.create_equipment_workspace_quote(current_setting('rental.rate')::uuid,'2030-01-07 10:00+05:30','2030-01-07 11:00+05:30','b2000000-0000-4000-8000-000000000003',(select id from public.booking_products where code='bundle-race-workspace'),array[date '2030-01-07']);
select set_config('request.jwt.claims','{"sub":"b1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.authorize_mock_equipment_bundle(id) from public.equipment_rental_quotes where user_id::text like 'b1000000%';
commit;
SQL
reserve() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
select set_config('request.jwt.claims','{"sub":"$1","role":"authenticated"}',true);
select public.reserve_equipment_workspace_bundle((select id from public.equipment_rental_quotes where user_id='$1'));
select pg_sleep(0.2);
commit;
SQL
}
reserve b1000000-0000-4000-8000-000000000002 b2000000-0000-4000-8000-000000000001 > "$RUN_DIR/one.log" 2>&1 & ONE=$!
reserve b1000000-0000-4000-8000-000000000003 b2000000-0000-4000-8000-000000000003 > "$RUN_DIR/two.log" 2>&1 & TWO=$!
A=0; B=0
wait "$ONE" || A=$?
wait "$TWO" || B=$?
if [ "$A" -eq 0 ] && [ "$B" -eq 0 ]; then echo 'Both competing units captured'; exit 1; fi
if [ "$A" -ne 0 ] && [ "$B" -ne 0 ]; then cat "$RUN_DIR/one.log" "$RUN_DIR/two.log"; exit 1; fi
STATE=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) filter(where payment_state='captured')||':'||count(*) filter(where payment_state='authorized') from public.equipment_rental_quotes where user_id::text like 'b1000000%'")
[ "$STATE" = '1:1' ] || { echo "Unexpected capture state $STATE"; exit 1; }
STATE=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) from public.bookings where resource_id::text like 'b2000000%'")
[ "$STATE" = '2' ] || { echo 'Losing workspace booking was not rolled back'; exit 1; }
STATE=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*)||':'||sum(price_paise) from public.paid_access_entitlements where resource_id::text like 'b2000000%'")
[ "$STATE" = '2:21800' ] || { echo "Unexpected entitlement ledger $STATE"; exit 1; }
STATE=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) from public.paid_access_entitlements e join public.equipment_rental_quotes q on q.user_id=e.user_id where q.user_id::text like 'b1000000%' and q.payment_state='authorized'")
[ "$STATE" = '0' ] || { echo 'Losing payer retained an entitlement'; exit 1; }
STATE=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) filter(where captured_at is not null)||':'||sum(cardinality(entitlement_ids)) from public.equipment_workspace_quotes where quote_id in(select id from public.equipment_rental_quotes where user_id::text like 'b1000000%')")
[ "$STATE" = '1:1' ] || { echo "Unexpected bundle state $STATE"; exit 1; }
echo 'PASS: one combined checkout captures; loser remains authorized; no orphan workspace or equipment entitlement; exact tax ledger' 
