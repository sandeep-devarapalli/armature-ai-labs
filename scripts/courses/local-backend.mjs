import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { fileURLToPath } from 'node:url';

// This harness is fixed to a local-only database and loopback ports; it never resets its source.
const directory = '/private/tmp/armature-courses-member-http';
const database = 'courses_member_http_check_20261004';
const sourceDatabase = 'courses_foundation_check_20261004';
const databaseContainer = 'supabase_db_armature-equipment-wishlist-check';
const network = 'supabase_network_armature-equipment-wishlist-check';
const command = process.argv[2] ?? 'setup';
const run = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const sql = (text) => run(['exec', '-i', databaseContainer, 'sh', '-c', 'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -U supabase_admin -d courses_member_http_check_20261004 -v ON_ERROR_STOP=1 -qAt'], text);
const write = (name, data) => writeFileSync(`${directory}/${name}`, data, { mode: 0o600 });
const envOf = name => Object.fromEntries(JSON.parse(run(['inspect', name]))[0].Config.Env.map(line => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));

if (command === 'proxy') {
  const config = JSON.parse(readFileSync(`${directory}/private.json`, 'utf8'));
  createServer((incoming, outgoing) => {
    const origin = incoming.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):(4189|4190|4191)$/.test(origin)) { outgoing.writeHead(403).end(); return; }
    outgoing.setHeader('Access-Control-Allow-Origin', origin ?? 'http://localhost:4191');
    outgoing.setHeader('Vary', 'Origin');
    outgoing.setHeader('Access-Control-Allow-Headers', 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,accept-profile,content-profile');
    outgoing.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    if (incoming.method === 'OPTIONS') { outgoing.writeHead(204).end(); return; }
    const emailVerification = incoming.method === 'GET' && (incoming.url.startsWith('/auth/v1/verify?') || incoming.url.startsWith('/verify?'));
    if (incoming.url.startsWith('/verify?')) incoming.url = '/auth/v1' + incoming.url;
    if (!emailVerification && ![config.anonKey, config.serviceKey].includes(incoming.headers.apikey)) { outgoing.writeHead(401).end('API key required'); return; }
    const auth = incoming.url.startsWith('/auth/v1/');
    if (!auth && !incoming.url.startsWith('/rest/v1/')) { outgoing.writeHead(404).end(); return; }
    const headers = { ...incoming.headers, host: '127.0.0.1', authorization: incoming.headers.authorization ?? `Bearer ${config.anonKey}` };
    const upstream = request({ hostname: '127.0.0.1', port: auth ? 58422 : 58423, path: incoming.url.replace(auth ? '/auth/v1' : '/rest/v1', ''), method: incoming.method, headers }, response => {
      outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
    });
    upstream.on('error', () => outgoing.writeHead(502).end('Local backend unavailable'));
    incoming.pipe(upstream);
  }).listen(58421, '127.0.0.1', () => console.log('Course test gateway listening at http://127.0.0.1:58421'));
} else if (command === 'setup') {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const exists = run(['exec', databaseContainer, 'psql', '-U', 'postgres', '-d', 'postgres', '-qAtc', `select 1 from pg_database where datname='${database}'`]).trim();
  if (exists && (existsSync(`${directory}/private.json`) || !process.argv.includes('--resume-setup'))) throw new Error('Isolated database already exists; reuse it rather than resetting.');
  if (!exists) run(['exec', databaseContainer, 'createdb', '-U', 'postgres', '-T', sourceDatabase, database]);
  // No real/synthetic identity from the source is carried into the HTTP fixture.
  sql(run(['exec', databaseContainer, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--data-only', '-t', 'auth.schema_migrations']));
  sql('truncate auth.users cascade; grant usage,create on schema auth to supabase_auth_admin; grant all on all tables in schema auth to supabase_auth_admin; grant all on all sequences in schema auth to supabase_auth_admin;');
  if (sql("select to_regprocedure('public.get_my_course_catalog()') is not null;").trim() !== 't') sql(readFileSync(fileURLToPath(new URL('../../supabase/migrations/202610040002_courses_member_api.sql', import.meta.url)), 'utf8'));
  sql(`do $$ declare r record; begin for r in select tablename from pg_tables where schemaname='auth' loop execute format('alter table auth.%I owner to supabase_auth_admin',r.tablename); end loop; end $$;`);
  const secret = randomBytes(48).toString('hex');
  const sign = (role, extra = {}) => {
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 7, ...extra })).toString('base64url');
    return `${head}.${body}.${createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')}`;
  };
  const authOriginal = envOf('supabase_auth_armature-equipment-wishlist-check');
  const restOriginal = envOf('supabase_rest_armature-equipment-wishlist-check');
  const authDatabase = new URL(authOriginal.GOTRUE_DB_DATABASE_URL); authDatabase.pathname = '/' + database;
  const restDatabase = new URL(restOriginal.PGRST_DB_URI); restDatabase.pathname = '/' + database;
  const authEnv = {
    GOTRUE_API_HOST: '0.0.0.0', GOTRUE_API_PORT: '9999', API_EXTERNAL_URL: 'http://127.0.0.1:58421/auth/v1',
    GOTRUE_DB_DRIVER: 'postgres', GOTRUE_DB_DATABASE_URL: authDatabase.toString(), GOTRUE_SITE_URL: 'http://localhost:4191', GOTRUE_URI_ALLOW_LIST: 'http://localhost:4190/**,http://localhost:4191/**,http://127.0.0.1:4191/**',
    GOTRUE_JWT_SECRET: secret, GOTRUE_JWT_AUD: 'authenticated', GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated', GOTRUE_JWT_ADMIN_ROLES: 'service_role', GOTRUE_JWT_EXP: '3600',
    GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true', GOTRUE_DISABLE_SIGNUP: 'true', GOTRUE_MAILER_AUTOCONFIRM: 'false',
    GOTRUE_SMTP_HOST: 'supabase_inbucket_armature-equipment-wishlist-check', GOTRUE_SMTP_PORT: '1025', GOTRUE_SMTP_ADMIN_EMAIL: 'courses@example.test', GOTRUE_SMTP_SENDER_NAME: 'Local courses fixture',
    GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: 'true', GOTRUE_DB_MIGRATIONS_PATH: '/usr/local/etc/auth/migrations'
  };
  const restEnv = { PGRST_DB_URI: restDatabase.toString(), PGRST_DB_SCHEMAS: 'public', PGRST_DB_EXTRA_SEARCH_PATH: 'public,extensions', PGRST_DB_ANON_ROLE: 'anon', PGRST_JWT_SECRET: secret, PGRST_DB_MAX_ROWS: '1000' };
  for (const [name, values] of [['auth.env', authEnv], ['rest.env', restEnv]]) write(name, Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
  const config = { url: 'http://127.0.0.1:58421', database, databaseContainer, secret, anonKey: sign('anon'), serviceKey: sign('service_role') };
  write('private.json', JSON.stringify(config));
  write('frontend.env', `VITE_COURSES_SUPABASE_URL=${config.url}\nVITE_COURSES_SUPABASE_PUBLISHABLE_KEY=${config.anonKey}\nVITE_COURSES_LOCAL_PASSWORD=true\n`);
  run(['run', '-d', '--name', 'armature-courses-auth-check', '--network', network, '-p', '127.0.0.1:58422:9999', '--env-file', `${directory}/auth.env`, 'public.ecr.aws/supabase/gotrue:v2.192.0']);
  run(['run', '-d', '--name', 'armature-courses-rest-check', '--network', network, '-p', '127.0.0.1:58423:3000', '--env-file', `${directory}/rest.env`, 'public.ecr.aws/supabase/postgrest:v14.14']);
  console.log(`Created ${database}; local configuration: ${directory}/frontend.env. Start proxy, then run check-member-api.mjs.`);
} else throw new Error('Use setup or proxy');
