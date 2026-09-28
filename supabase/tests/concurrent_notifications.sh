#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR=$(mktemp -d)
SUBJECT=61000000-0000-4000-8000-000000000001
ADMIN=61000000-0000-4000-8000-000000000002
OLD_GATE=$($PSQL "$DATABASE_URL" -Atc 'select enabled from public.onboarding_settings')
cleanup() {
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 begin;
 set local storage.allow_delete_query='true';
 delete from storage.objects where bucket_id='onboarding-documents' and name in ('notification-race-photo','notification-race-id');
 delete from public.onboarding_documents where user_id='$SUBJECT';
 delete from public.onboarding_notice_acceptances where user_id='$SUBJECT';
 delete from public.basic_onboarding_applications where user_id='$SUBJECT';
 delete from auth.users where id in ('$SUBJECT','$ADMIN');
 update public.onboarding_settings set enabled='$OLD_GATE';
 commit;
SQL
 rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 update public.onboarding_settings set enabled=true;
 insert into auth.users(id,aud,role,email,email_confirmed_at) values('$ADMIN','authenticated','authenticated','hello@armatureailabs.com',now());
 insert into public.staff_roles(user_id,role) values('$ADMIN','admin');
 insert into auth.users(id,aud,role,email,email_confirmed_at) values('$SUBJECT','authenticated','authenticated','notification-race@example.test',now());
 insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth)
 values('$SUBJECT','Notification Race','notification-race@example.test','+919999999999','https://linkedin.com/in/test','1990-01-01');
 insert into public.onboarding_notice_acceptances(user_id,revision,notice_version) values('$SUBJECT',1,'2026-09-26-release-1');
 insert into public.onboarding_documents(user_id,kind,id_type,object_path) values
 ('$SUBJECT','photo',null,'notification-race-photo'),('$SUBJECT','government_id','pan','notification-race-id');
 insert into storage.objects(bucket_id,name) values('onboarding-documents','notification-race-photo'),('onboarding-documents','notification-race-id');
SQL
# Even direct scan-completion updates serialize readiness on the application row.
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 update public.onboarding_documents set uploaded_at=now() where user_id='$SUBJECT' and kind='photo';
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 update public.onboarding_documents set uploaded_at=now() where user_id='$SUBJECT' and kind='government_id';
SQL
wait "$PID"
COUNT=$($PSQL "$DATABASE_URL" -Atc "select count(*) from public.member_notifications where user_id='$SUBJECT' and kind='ready'")
[ "$COUNT" = 0 ] || { echo 'FAIL: scan completion queued readiness before submission'; exit 1; }
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/one.log" 2>&1 <<SQL &
 begin;
 set local role authenticated;
 select set_config('request.jwt.claims','{"sub":"$SUBJECT","role":"authenticated"}',true);
 select public.submit_basic_application_for_review(1);
 select pg_sleep(1);
 commit;
SQL
PID=$!
sleep 0.2
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/two.log" 2>&1 <<SQL
 begin;
 set local role authenticated;
 select set_config('request.jwt.claims','{"sub":"$SUBJECT","role":"authenticated"}',true);
 select public.submit_basic_application_for_review(1);
 commit;
SQL
wait "$PID"
COUNT=$($PSQL "$DATABASE_URL" -Atc "select count(*) from public.member_notifications where user_id='$SUBJECT' and kind in ('ready','admin_ready')")
[ "$COUNT" = 2 ] || { echo 'FAIL: concurrent submission lost or duplicated member/admin readiness'; exit 1; }
echo 'PASS: concurrent scans do not submit; racing explicit submissions create one member and one admin event'
