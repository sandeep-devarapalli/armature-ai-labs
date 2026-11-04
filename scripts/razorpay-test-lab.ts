import { createTestHandler, createTestWebhookHandler, testConfig, TestPaymentError, type TestDependencies } from "../supabase/functions/_shared/razorpay-test.ts";

const host = "127.0.0.1", port = 57441;
const actor = "a4070000-0000-4000-8000-000000000001";
const email = "razorpay-local-admin@example.test";
const password = "Local-Test-Only-57441!";
const refreshToken = "local-synthetic-refresh-token";
const jwtSecret = "synthetic-local-auth-only-not-a-production-key-57441";
const issuer = `http://${host}:${port}/auth/v1`;
const psql = "/opt/homebrew/opt/postgresql@15/bin/psql";
const literal = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const jsonSql = (value: unknown) => value === null ? "null" : literal(JSON.stringify(value)) + "::jsonb";

async function sql(command: string): Promise<unknown> {
  const child = new Deno.Command(psql, {
    args: ["-X", "-h", host, "-p", "57440", "-U", "postgres", "-d", "retention_test", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=sqlstate", "-q", "-t", "-A"],
    clearEnv: true, stdin: "piped", stdout: "piped", stderr: "piped",
  }).spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode("set statement_timeout='10s'; set standard_conforming_strings=on;\n" + command));
  await writer.close();
  const result = await child.output();
  if (!result.success) {
    const code = new TextDecoder().decode(result.stderr).match(/ERROR:\s+([A-Z0-9]{5})/)?.[1];
    throw new TestPaymentError(code === "42501" ? 403 : code === "22023" ? 400 : code === "23505" || code === "40001" ? 409 : 503, "local_ledger_rejected");
  }
  const output = new TextDecoder().decode(result.stdout).trim();
  return output ? JSON.parse(output) : null;
}

function headers(request: Request): HeadersInit {
  const origin = request.headers.get("origin") ?? "";
  return { "access-control-allow-origin": /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin) ? origin : `http://${host}:57442`,
    "access-control-allow-headers": "authorization,apikey,content-type,content-profile,accept-profile,x-client-info,x-supabase-api-version",
    "access-control-allow-methods": "GET,POST,OPTIONS", "cache-control": "no-store", vary: "Origin" };
}
function reply(request: Request, value: unknown, status = 200): Response { return Response.json(value, { status, headers: headers(request) }); }
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const encodedJson = (value: unknown) => encode(new TextEncoder().encode(JSON.stringify(value)));
function decode(value: string): Uint8Array {
  const base = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(base + "=".repeat((4 - base.length % 4) % 4)), char => char.charCodeAt(0));
}
const jwtKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
const user = { id: actor, aud: "authenticated", role: "authenticated", email, email_confirmed_at: "2026-11-04T00:00:00Z", confirmed_at: "2026-11-04T00:00:00Z",
  app_metadata: { provider: "email", providers: ["email"] }, user_metadata: { full_name: "Synthetic local payment Admin" },
  identities: [], created_at: "2026-11-04T00:00:00Z", updated_at: "2026-11-04T00:00:00Z", is_anonymous: false };

async function activeActor(): Promise<void> {
  const active = await sql(`select to_jsonb(private.has_basic_membership('${actor}') and exists(select 1 from public.staff_roles where user_id='${actor}' and role='admin'));`);
  if (active !== true) throw new TestPaymentError(403, "synthetic_admin_inactive");
}
async function session(): Promise<unknown> {
  await activeActor();
  const now = Math.floor(Date.now() / 1000), expires = now + 3600;
  const unsigned = encodedJson({ alg: "HS256", typ: "JWT" }) + "." + encodedJson({ sub: actor, aud: "authenticated", role: "authenticated", iss: issuer, iat: now, exp: expires, aal: "aal1", session_id: actor });
  const signature = encode(new Uint8Array(await crypto.subtle.sign("HMAC", jwtKey, new TextEncoder().encode(unsigned))));
  return { access_token: unsigned + "." + signature, token_type: "bearer", expires_in: 3600, expires_at: expires, refresh_token: refreshToken, user };
}
async function authenticate(request: Request): Promise<string> {
  try {
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer /, ""), parts = token.split(".");
    if (parts.length !== 3 || !await crypto.subtle.verify("HMAC", jwtKey, decode(parts[2]) as BufferSource, new TextEncoder().encode(parts[0] + "." + parts[1]))) throw new Error();
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0]))), claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    if (header.alg !== "HS256" || claims.sub !== actor || claims.iss !== issuer || claims.aud !== "authenticated" || !Number.isInteger(claims.exp) || claims.exp <= now || claims.exp > now + 3600 || claims.iat > now + 5) throw new Error();
  } catch { throw new TestPaymentError(401, "synthetic_authentication_required"); }
  await activeActor();
  return actor;
}
const deps: TestDependencies = {
  config: () => testConfig(name => Deno.env.get(name)), authenticate, headers,
  diagnostic: (code, status) => console.info(JSON.stringify({ event: "local_test_request_failed", code, status })),
  operation: async (id, action, input) => await sql(`set role service_role; select public.razorpay_test_operation(${literal(id)}::uuid,${literal(action)},${literal(JSON.stringify(input))}::jsonb);`) as Record<string, unknown>,
  webhook: (id, hash, event, payment, refund) => sql(`set role service_role; select public.razorpay_test_webhook(${literal(id)},${literal(hash)},${literal(event)},${jsonSql(payment)},${jsonSql(refund)});`),
};
const paymentHandler = createTestHandler(deps), webhookHandler = createTestWebhookHandler(deps);

await sql(`do $$begin
 if exists(select 1 from auth.users where id='${actor}' and email is distinct from ${literal(email)}) then raise exception 'Synthetic actor conflict'; end if;
end$$;
insert into auth.users(id,email,email_confirmed_at,aud,role,raw_user_meta_data) values('${actor}',${literal(email)},now(),'authenticated','authenticated','{"full_name":"Synthetic local payment Admin"}') on conflict(id) do nothing;
insert into public.staff_roles(user_id,role) values('${actor}','admin') on conflict(user_id,role) do nothing;`);
const previousEnabled = await sql("select enabled::text::jsonb from private.razorpay_test_settings where singleton;");
await sql("update private.razorpay_test_settings set enabled=true where singleton;");

const server = Deno.serve({ hostname: host, port, onListen: () => console.log("Local Razorpay TEST lab: http://127.0.0.1:57441; synthetic Admin auth; native local SQL; no paid access grants.") }, async request => {
  try {
    const url = new URL(request.url), origin = request.headers.get("origin");
    if (origin && !/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin)) return reply(request, { error: "local_origin_required" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(request) });
    if (url.pathname === "/health" && request.method === "GET") return reply(request, { mode: "test", syntheticAuth: true, localDatabase: true, paidAccessGranted: false });
    if (url.pathname === "/auth/v1/token" && request.method === "POST") {
      const raw = await request.text();
      if (raw.length > 4096) throw new TestPaymentError(413, "body_too_large");
      const body = JSON.parse(raw);
      const passwordGrant = url.searchParams.get("grant_type") === "password" && body.email === email && body.password === password;
      const refreshGrant = url.searchParams.get("grant_type") === "refresh_token" && body.refresh_token === refreshToken;
      if (!passwordGrant && !refreshGrant) return reply(request, { error_code: "invalid_credentials", msg: "Use the documented synthetic local fixture." }, 400);
      return reply(request, await session());
    }
    if (url.pathname === "/auth/v1/user" && request.method === "GET") { await authenticate(request); return reply(request, user); }
    if (url.pathname === "/auth/v1/logout" && request.method === "POST") { await authenticate(request); return new Response(null, { status: 204, headers: headers(request) }); }
    if (url.pathname === "/rest/v1/rpc/get_basic_account_summary" && request.method === "POST") {
      await authenticate(request);
      return reply(request, await sql(`set role authenticated; set request.jwt.claims=${literal(JSON.stringify({ sub: actor, role: "authenticated" }))}; select public.get_basic_account_summary();`));
    }
    if (url.pathname === "/functions/v1/razorpay-test") return paymentHandler(request);
    if (url.pathname === "/functions/v1/razorpay-test-webhook") return webhookHandler(request);
    return reply(request, { error: "local_route_not_found" }, 404);
  } catch (error) {
    return reply(request, { error: error instanceof TestPaymentError ? error.code : "local_lab_unavailable" }, error instanceof TestPaymentError ? error.status : 503);
  }
});
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await server.shutdown();
  await sql(`update private.razorpay_test_settings set enabled=${previousEnabled === true ? "true" : "false"} where singleton;`);
}
Deno.addSignalListener("SIGINT", () => { void stop(); });
Deno.addSignalListener("SIGTERM", () => { void stop(); });
await server.finished;
