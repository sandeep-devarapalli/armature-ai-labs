import { adminClient, parseJwtClaims } from "../_shared/supabase.ts";

const origin = "https://armatureailabs.com";

export async function handleCourseSessionHandoff(request: Request): Promise<Response> {
  const headers = new Headers({
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json",
    "x-content-type-options": "nosniff",
    "vary": "Origin",
  });
  const respond = (status: number, body: object) => new Response(JSON.stringify(body), { status, headers });
  if (request.headers.get("origin") !== origin) return respond(403, { error: "Origin not allowed." });
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  headers.set("access-control-allow-headers", "authorization, apikey, content-type, x-client-info");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond(405, { error: "Method not allowed." });
  const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return respond(401, { error: "Authentication required." });
  try {
    const client = adminClient();
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return respond(401, { error: "Authentication required." });
    const user = data.user as typeof data.user & { deleted_at?: string; banned_until?: string };
    if (!user.email || !user.email_confirmed_at || user.deleted_at ||
        (user.banned_until && (!Number.isFinite(Date.parse(user.banned_until)) || Date.parse(user.banned_until) > Date.now()))) {
      return respond(403, { error: "Account is unavailable for sign-in." });
    }
    const claims = parseJwtClaims(token);
    if (claims.sub !== user.id || typeof claims.session_id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(claims.session_id)) {
      return respond(401, { error: "Active session required." });
    }
    const active = await client.rpc("course_handoff_session_active", { p_session_id: claims.session_id, p_user_id: user.id });
    if (active.error || active.data !== true) return respond(401, { error: "Active session required." });
    const generated = await client.auth.admin.generateLink({ type: "magiclink", email: user.email });
    if (generated.error || generated.data.user?.id !== user.id || !generated.data.properties?.hashed_token) {
      return respond(503, { error: "Course sign-in is temporarily unavailable." });
    }
    return respond(200, { token_hash: generated.data.properties.hashed_token, user_id: user.id });
  } catch {
    return respond(503, { error: "Course sign-in is temporarily unavailable." });
  }
}
