#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:58322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/daily-use-race.XXXXXX")"
"$PSQL" "$DATABASE_URL" -Atqc "select format('update public.booking_policy_settings set mock_grants_enabled=%L;',mock_grants_enabled) from public.booking_policy_settings union all select format('update public.equipment_rental_settings set mock_payments_enabled=%L;',mock_payments_enabled) from public.equipment_rental_settings" > "$RUN_DIR/restore.sql"
"$PSQL" "$DATABASE_URL" -Atqc "select format('insert into public.booking_inventory values(%L,%L,%L,%L);',resource_id,code,floor,room) from public.booking_inventory " >> "$RUN_DIR/restore.sql"
"$PSQL" "$DATABASE_URL" -Atqc "select format('update public.booking_products set price_paise=%L,enabled=%L where id=%L;',price_paise,enabled,id) from public.booking_products" >> "$RUN_DIR/restore.sql"
cleanup() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
begin;
set local session_replication_role=replica;
delete from public.audit_events where actor_user_id::text like 'f1000000%';
commit;
delete from public.equipment_daily_sessions where user_id::text like 'f1000000%';
delete from public.checkin_intents where user_id::text like 'f1000000%';
delete from public.kiosk_devices where id::text like 'f4000000%';
delete from public.equipment_rental_orders where quote_id in(select id from public.equipment_rental_quotes where user_id::text like 'f1000000%');
delete from public.equipment_rental_quotes where user_id::text like 'f1000000%';
delete from public.resource_reservations where resource_id::text like 'f2000000%';
delete from public.bookings where resource_id::text like 'f2000000%';
delete from public.paid_access_entitlements where resource_id::text like 'f2000000%';
delete from public.equipment_rental_rates where unit_id in(select id from public.equipment_rental_units where asset_unit_id::text like 'f3000000%');
delete from public.equipment_rental_units where asset_unit_id::text like 'f3000000%';
delete from public.booking_inventory where resource_id::text like 'f2000000%';
delete from public.resource_booking_policies where resource_id::text like 'f2000000%';
delete from public.resources where id::text like 'f2000000%';
delete from public.asset_units where id::text like 'f3000000%';
delete from public.inventory_locations where id::text like 'f3000000%';

delete from public.staff_roles where user_id::text like 'f1000000%';
delete from public.basic_onboarding_applications where user_id::text like 'f1000000%';
delete from auth.users where id::text like 'f1000000%';
SQL
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$RUN_DIR/restore.sql"
 rm -f "$RUN_DIR/restore.sql" "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q > "$RUN_DIR/one.log" <<'SQL'
begin;

insert into auth.users(id,email,email_confirmed_at,aud,role) select ('f1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'operations-'||n||'@example.test',now(),'authenticated','authenticated' from generate_series(1,4)n;
insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) select id,'Rental Test',email,'9999999999','https://linkedin.com/in/test','1990-01-01','approved' from auth.users where id::text like 'f1000000%';
insert into public.staff_roles(user_id,role) values('f1000000-0000-4000-8000-000000000001','admin'),('f1000000-0000-4000-8000-000000000004','membership_reviewer');
insert into public.resources(id,location_id,slug,name,kind,capacity,max_guests,max_duration_minutes,booking_horizon_days)
select ('f2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,l.id,'operations-fixture-'||n,'Rental fixture '||n,case when n=1 then 'workspace'::public.resource_kind else 'equipment'::public.resource_kind end,1,0,1440,10000 from generate_series(1,2)n cross join lateral(select id from public.locations limit 1)l;
insert into public.resource_booking_policies values('f2000000-0000-4000-8000-000000000001','workspace'),('f2000000-0000-4000-8000-000000000002','equipment');
insert into public.resource_hours(resource_id,day_of_week,opens_at,closes_at) select id,d,'09:00','17:00' from public.resources cross join generate_series(0,6)d where id::text like 'f2000000%';
delete from public.booking_inventory;
insert into public.booking_inventory values('f2000000-0000-4000-8000-000000000001','S01','GF','GF-10');
insert into public.inventory_locations(id,lab_location_id,code,name) select 'f3000000-0000-4000-8000-000000000001',id,'OPERATIONS-TEST','Rental test' from public.locations limit 1;
insert into public.asset_units(id,component_id,inventory_location_id,asset_tag) select 'f3000000-0000-4000-8000-000000000002',id,'f3000000-0000-4000-8000-000000000001','ARM-TEST-990004' from public.components limit 1;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select set_config('rental.unit',public.configure_equipment_rental_unit('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002',true,'Synthetic commissioning only')::text,true);
select set_config('rental.rate',public.approve_equipment_rental_rate(current_setting('rental.unit')::uuid,'hour',10000,now()-interval '1 day',null,0)::text,true);
select set_config('rental.dayrate',public.approve_equipment_rental_rate(current_setting('rental.unit')::uuid,'day',50000,now()-interval '1 day',null,0)::text,true);
select set_config('rental.notax',public.approve_equipment_rental_rate(current_setting('rental.unit')::uuid,'hour',10000,'2020-01-01','2021-01-01')::text,true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.equipment_rental_settings set mock_payments_enabled=true;
update public.booking_policy_settings set mock_grants_enabled=true;
update public.booking_products set enabled=true,price_paise=50000;
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.grant_mock_access('f1000000-0000-4000-8000-000000000002',(select id from public.booking_products where code='workspace-day'),'f2000000-0000-4000-8000-000000000001',array[date '2030-01-07',date '2030-01-08']);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('ops.quote',public.create_equipment_rental_quote(current_setting('rental.dayrate')::uuid,null,null,array[date '2030-01-07',date '2030-01-08'])::text,true);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.authorize_mock_equipment_payment(current_setting('ops.quote')::uuid);
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select set_config('ops.order',public.reserve_equipment_rental(current_setting('ops.quote')::uuid,null,'f2000000-0000-4000-8000-000000000001',(select id from public.booking_products where code='workspace-day'),array[date '2030-01-07',date '2030-01-08'])::text,true);
select set_config('ops.booking',(select booking_id::text from public.equipment_rental_orders where id=current_setting('ops.order')::uuid),true);
insert into public.kiosk_devices(id,location_id,name,public_key_jwk,key_thumbprint,status) select 'f4000000-0000-4000-8000-000000000001',id,'Synthetic daily equipment kiosk','{}','operations-test','active' from public.locations limit 1;

insert into public.kiosk_devices(id,location_id,name,public_key_jwk,key_thumbprint,status) select 'f4000000-0000-4000-8000-000000000002',location_id,'Synthetic second kiosk','{}','operations-test-second','active' from public.kiosk_devices where id='f4000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select private.create_equipment_daily_intent(current_setting('ops.order')::uuid,'check_in','2030-01-07 10:00+05:30');
commit;
SQL
redeem() {
 "$PSQL" "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
select private.redeem_equipment_daily_intent((select encode(token_hash,'hex') from public.checkin_intents where user_id='f1000000-0000-4000-8000-000000000002' and action='check_in'),'$1','2030-01-07 10:00:10+05:30');
select pg_sleep(0.2);
commit;
SQL
}
redeem f4000000-0000-4000-8000-000000000001 > "$RUN_DIR/one.log" 2>&1 & ONE=$!
redeem f4000000-0000-4000-8000-000000000002 > "$RUN_DIR/two.log" 2>&1 & TWO=$!
A=0; B=0
wait "$ONE" || A=$?
wait "$TWO" || B=$?
if [ "$A" -eq 0 ] && [ "$B" -eq 0 ]; then echo 'Token redeemed twice'; exit 1; fi
if [ "$A" -ne 0 ] && [ "$B" -ne 0 ]; then cat "$RUN_DIR/one.log" "$RUN_DIR/two.log"; exit 1; fi
STATE=$("$PSQL" "$DATABASE_URL" -Atqc "select count(*) from public.equipment_daily_sessions where user_id='f1000000-0000-4000-8000-000000000002'")
[ "$STATE" = '1' ] || { echo 'Expected exactly one daily equipment session'; exit 1; }
echo 'PASS: two kiosks racing one daily token create exactly one equipment session'
