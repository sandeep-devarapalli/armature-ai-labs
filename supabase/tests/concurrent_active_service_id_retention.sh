#!/bin/sh
set -eu
# Fixed loopback-only synthetic database; no production connection parameters are read.
python3 - "$@" <<'PY'
import argparse
import os
import re
import shutil
import subprocess
import time

parser = argparse.ArgumentParser(description='Synthetic retention lease checks on isolated local PostgreSQL.')
parser.add_argument('--port', type=int)
parser.add_argument('--database')
parser.add_argument('--supabase-local-ci', action='store_true')
options = parser.parse_args()
if options.supabase_local_ci and os.environ.get('GITHUB_ACTIONS') != 'true':
    raise SystemExit('--supabase-local-ci requires GITHUB_ACTIONS=true.')
expected_port, expected_database = (54322, 'postgres') if options.supabase_local_ci else (57440, 'retention_test')
options.port = expected_port if options.port is None else options.port
options.database = expected_database if options.database is None else options.database
if options.port != expected_port or options.database != expected_database:
    raise SystemExit('Use only the fixed local database selected by the explicit test mode.')
psql = shutil.which('psql')
if not psql:
    raise SystemExit('PostgreSQL psql is required; no software is installed by this test.')
args = [psql, '-X', '-h', '127.0.0.1', '-p', str(options.port), '-U', 'postgres',
        '-d', options.database, '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A']
environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
if options.supabase_local_ci:
    environment['PGPASSWORD'] = 'postgres'
user = 'a4040000-0000-4000-8000-000000000001'
documents = ['a4040000-0000-4000-8000-000000000002', 'a4040000-0000-4000-8000-000000000003']


def sql(command):
    result = subprocess.run(args, input=command, text=True, capture_output=True, timeout=15, env=environment)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def ids(output):
    return re.findall(r'^a4040000-0000-4000-8000-[0-9]{12}$', output, re.M)


if sql(f"select count(*) from auth.users where id='{user}';") != '0':
    raise SystemExit('Synthetic fixture already exists; refusing to overwrite it.')
if sql('select count(*) from public.onboarding_documents;') != '0':
    raise SystemExit('Use an empty synthetic document dataset; this check claims due documents.')
created = False
first = None
try:
    sql(f"""
    begin;
    insert into auth.users(id,email,email_confirmed_at,aud,role)
    values('{user}','retention-race@example.test',now(),'authenticated','authenticated');
    insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth)
    values('{user}','Synthetic Retention Race','retention-race@example.test','9999999999',
           'https://linkedin.com/in/synthetic-retention-race','1990-01-01');
    insert into public.onboarding_documents(id,user_id,kind,id_type,expires_at,uploaded_at)
    values('{documents[0]}','{user}','government_id','pan',now()-interval '1 hour',now()-interval '31 days'),
          ('{documents[1]}','{user}','government_id','passport',now()-interval '1 hour',now()-interval '31 days');
    commit;
    """)
    created = True
    first = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=environment)
    first.stdin.write('set role service_role; begin; select id from public.list_due_onboarding_documents(1); select pg_sleep(1); commit;')
    first.stdin.close()
    time.sleep(0.2)
    second = subprocess.run(args, input='set role service_role; select id from public.list_due_onboarding_documents(1);',
                            capture_output=True, text=True, timeout=10, env=environment)
    first.wait(timeout=10)
    one, two = first.stdout.read(), second.stdout
    assert first.returncode == 0, first.stderr.read()
    assert second.returncode == 0, second.stderr
    assert len(ids(one)) == len(ids(two)) == 1 and ids(one)[0] != ids(two)[0], (one, two)
    assert set(ids(one) + ids(two)) == set(documents), (one, two)
    assert sql('set role service_role; select count(*) from public.list_due_onboarding_documents(100);') == '0', 'Active lease replayed'
    sql(f"update public.onboarding_documents set deletion_attempted_at=now()-interval '6 minutes' where id='{documents[0]}';")
    assert ids(sql('set role service_role; select id from public.list_due_onboarding_documents(100);')) == [documents[0]], 'Expired lease not recovered exactly once'
    print('PASS retention leases: concurrent distinct claims, no active lease replay, expired lease recovery')
finally:
    if first is not None and first.poll() is None:
        first.kill()
        first.wait()
    if created:
        sql(f"""
        begin;
        delete from public.onboarding_documents where user_id='{user}';
        delete from public.member_notifications where user_id='{user}' or recipient_id='{user}';
        delete from public.basic_onboarding_applications where user_id='{user}';
        delete from auth.users where id='{user}';
        commit;
        """)
PY
