import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), generateLink: vi.fn(), rpc: vi.fn(), claims: vi.fn() }));
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({
  adminClient: () => ({ auth: { getUser: mocks.getUser, admin: { generateLink: mocks.generateLink } }, rpc: mocks.rpc }),
  parseJwtClaims: mocks.claims,
}));
import { handleCourseSessionHandoff } from "../../supabase/functions/course-session-handoff/handler";

const id = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000001";
const user = { id, email: "synthetic@example.org", email_confirmed_at: "2026-01-01T00:00:00Z" };
const request = (method = "POST", origin: string | null = "https://armatureailabs.com", authorization: string | null = "Bearer verified-jwt") => {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  if (authorization !== null) headers.set("authorization", authorization);
  return new Request("https://api.example.org/course-session-handoff", { method, headers,
    ...(method === "POST" ? { body: JSON.stringify({ email: "victim@example.org", user_id: "victim" }) } : {}) });
};

describe("course session handoff", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.claims.mockReturnValue({ sub: id, session_id: sessionId });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.generateLink.mockResolvedValue({ data: { user, properties: { hashed_token: "one-use-credential", action_link: "secret-url" } }, error: null });
  });

  it("issues only the authenticated user's one-use credential and ignores supplied identity", async () => {
    const response = await handleCourseSessionHandoff(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ token_hash: "one-use-credential", user_id: id });
    expect(mocks.getUser).toHaveBeenCalledWith("verified-jwt");
    expect(mocks.rpc).toHaveBeenCalledWith("course_handoff_session_active", { p_session_id: sessionId, p_user_id: id });
    expect(mocks.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: user.email });
    expect(mocks.getUser.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.rpc.mock.invocationCallOrder[0]).toBeLessThan(mocks.generateLink.mock.invocationCallOrder[0]);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it.each([null, "https://evil.example", "https://armatureailabs.com.evil.example", "https://courses.armatureailabs.com"])("rejects origin %s before auth", async (origin) => {
    const response = await handleCourseSessionHandoff(request("POST", origin));
    expect(response.status).toBe(403);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("accepts browser preflight without issuing credentials", async () => {
    const response = await handleCourseSessionHandoff(request("OPTIONS"));
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://armatureailabs.com");
    expect(response.headers.get("access-control-allow-headers")).toContain("authorization");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects GET", async () => {
    expect((await handleCourseSessionHandoff(request("GET"))).status).toBe(405);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it.each([null, "Bearer ", "Basic token", "Bearer token extra"])("rejects invalid authorization %s", async (authorization) => {
    expect((await handleCourseSessionHandoff(request("POST", "https://armatureailabs.com", authorization))).status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects a bearer rejected by Auth before decoding claims", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "invalid" } });
    expect((await handleCourseSessionHandoff(request())).status).toBe(401);
    expect(mocks.claims).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
  it.each([{ email: undefined }, { email_confirmed_at: null }, { deleted_at: "2026-01-01" }, { banned_until: "2999-01-01" }, { banned_until: "invalid" }])("rejects unavailable account %j", async (patch) => {
    mocks.getUser.mockResolvedValue({ data: { user: { ...user, ...patch } }, error: null });
    expect((await handleCourseSessionHandoff(request())).status).toBe(403);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
  it.each([{ sub: id }, { sub: "other", session_id: sessionId }, { sub: id, session_id: "bad" }])("rejects missing or mismatched session claims %j", async (claims) => {
    mocks.claims.mockReturnValue(claims);
    expect((await handleCourseSessionHandoff(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
  it.each([{ data: false, error: null }, { data: null, error: { message: "failure" } }])("rejects revoked or unverifiable session %j", async (result) => {
    mocks.rpc.mockResolvedValue(result);
    expect((await handleCourseSessionHandoff(request())).status).toBe(401);
    expect(mocks.generateLink).not.toHaveBeenCalled();
  });
  it.each([
    { data: { user: { id: "other" }, properties: { hashed_token: "secret" } }, error: null },
    { data: { user, properties: {} }, error: null },
    { data: {}, error: { message: "sensitive provider failure" } },
  ])("fails closed for invalid generated credential %j", async (result) => {
    mocks.generateLink.mockResolvedValue(result);
    const response = await handleCourseSessionHandoff(request());
    expect(response.status).toBe(503);
    expect(await response.text()).toBe('{"error":"Course sign-in is temporarily unavailable."}');
  });
  it("does not expose unexpected provider exceptions", async () => {
    mocks.getUser.mockRejectedValue(new Error("secret details"));
    const response = await handleCourseSessionHandoff(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret details");
  });
});
