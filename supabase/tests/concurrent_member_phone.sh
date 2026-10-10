#!/bin/sh
set -eu
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DATABASE_URL" in *'@127.0.0.1:'*|*'@localhost:'*) ;; *) echo 'Use an isolated local database only'; exit 1;; esac
PSQL="${PSQL:-psql}"
RUN_DIR=$(mktemp -d)
ONE=72000000-0000-4000-8000-000000000001
TWO=72000000-0000-4000-8000-000000000002
cleanup() {
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 delete from auth.users where id in ('$ONE','$TWO');
 delete from private.member_phone_limits where key in ('account:$ONE','account:$TWO','phone:'||encode(extensions.digest('+919000000072','sha256'),'hex'));
 delete from private.member_phone_hook_receipts where hook_id='concurrent-phone-fixture';
SQL
 rm -f "$RUN_DIR/one.log" "$RUN_DIR/two.log"
 rmdir "$RUN_DIR"
}
trap cleanup EXIT INT TERM
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<SQL
 insert into auth.users(id,aud,role,email,email_confirmed_at) values
 ('$ONE','authenticated','authenticated','phone-race-one@example.test',now()),
 ('$TWO','authenticated','authenticated','phone-race-two@example.test',now());
SQL
for SUBJECT in "$ONE" "$TWO"; do
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/$(test "$SUBJECT" = "$ONE" && echo one || echo two).log" 2>&1 <<SQL &
 begin;
 select set_config('request.jwt.claims','{"role":"service_role"}',true);
 select public.member_phone_operation('start','$SUBJECT','+919000000072','whatsapp');
 select pg_sleep(0.2);
 commit;
SQL
 if [ "$SUBJECT" = "$ONE" ]; then PID_ONE=$!; else PID_TWO=$!; fi
done
wait "$PID_ONE"; wait "$PID_TWO"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if (select count(*) from private.member_phone_intents where phone='+919000000072')<>1 then raise exception 'Concurrent target reservation was not unique'; end if;
end $$;
SQL
WINNER=$("$PSQL" "$DATABASE_URL" -Atc "select user_id from private.member_phone_intents where phone='+919000000072'")
for ATTEMPT in one two; do
 "$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 > "$RUN_DIR/$ATTEMPT.log" 2>&1 <<SQL &
 begin;
 select set_config('request.jwt.claims','{"role":"service_role"}',true);
 select public.member_phone_operation('claim_hook','$WINNER','+919000000072',p_hook_id=>'concurrent-phone-fixture');
 select pg_sleep(0.2);
 commit;
SQL
 if [ "$ATTEMPT" = one ]; then PID_ONE=$!; else PID_TWO=$!; fi
done
wait "$PID_ONE"; wait "$PID_TWO"
"$PSQL" "$DATABASE_URL" -q -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 if (select count(*) from private.member_phone_hook_receipts where hook_id='concurrent-phone-fixture')<>1 then raise exception 'Concurrent hook not deduplicated'; end if;
end $$;
SQL
printf 'Phone target and hook concurrency passed\n'
