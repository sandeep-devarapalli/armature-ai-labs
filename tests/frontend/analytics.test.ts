import { afterEach, beforeEach, expect, it, vi } from "vitest";

let analytics: typeof import("../../src/lib/analytics");
const requests: { url: string; body: string }[] = [];
let status = 200;
beforeEach(async () => {
  vi.resetModules(); localStorage.clear(); sessionStorage.clear(); requests.length = 0; status = 200;
  history.replaceState({}, "", "/?email=secret@example.test#token");
  vi.stubEnv("VITE_ANALYTICS_ENABLED", "true"); vi.stubEnv("VITE_POSTHOG_KEY", "phc_synthetic_test");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    requests.push({ url: String(url), body: String(options?.body ?? "") });
    return new Response("{}", { status, headers: { "Content-Type": "application/json" } });
  }));
  analytics = await import("../../src/lib/analytics");
});
afterEach(() => { analytics.setAnalyticsConsent(false); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
const settle = () => new Promise(resolve => setTimeout(resolve, 100));
function events() { return requests.filter(request => request.body).flatMap(request => JSON.parse(request.body).batch); }
it("does not load or request analytics without consent, or for excluded routes", async () => {
  analytics.trackPublicPageview("/"); analytics.trackRegistrationMilestone("details_saved"); await settle();
  expect(requests).toHaveLength(0);
  analytics.setAnalyticsConsent(true);
  for (const path of ["/admin/members", "/auth/callback", "/workspace/team", "/onboarding", "/components/wishlist"]) analytics.trackPublicPageview(path);
  await settle(); expect(requests).toHaveLength(0);
});
it("uses the real SDK and sends only the explicit anonymous page fields", async () => {
  analytics.setAnalyticsConsent(true); analytics.trackPublicPageview("/?email=secret@example.test#token");
  await vi.waitFor(() => expect(events()).toHaveLength(1));
  expect(requests).toHaveLength(1); expect(requests[0].url).toContain("/e/");
  expect(events()[0].event).toBe("$pageview");
  expect(events()[0].properties).toEqual({ token: "phc_synthetic_test", distinct_id: expect.any(String), $process_person_profile: false, $geoip_disable: true, $pathname: "/", $current_url: "https://armatureailabs.com/" });
  expect(JSON.stringify(requests)).not.toMatch(/secret|email=|\$referrer|\$browser|\$session_id|\$set/);
  expect(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter(key => !key.startsWith("__ph_opt_in_out_"))).toEqual([]);
});
it("groups product routes and permits only registration milestone enums on onboarding", async () => {
  analytics.setAnalyticsConsent(true); history.replaceState({}, "", "/components/jetson-orin-nano?private=yes");
  analytics.trackPublicPageview(location.pathname); await vi.waitFor(() => expect(events()).toHaveLength(1));
  expect(events()[0].properties.$pathname).toBe("/components/:slug");
  history.replaceState({}, "", "/onboarding?token=private");
  analytics.trackRegistrationMilestone("details_saved"); analytics.trackRegistrationMilestone("details_saved");
  analytics.trackRegistrationMilestone("email@example.test" as never);
  await vi.waitFor(() => expect(events()).toHaveLength(2));
  expect(events()[1].properties).toEqual({ token: "phc_synthetic_test", distinct_id: expect.any(String), $process_person_profile: false, $geoip_disable: true, step: "details_saved" });
});
it("withdrawal defeats pending initialization and fresh consent creates a new memory identity", async () => {
  analytics.setAnalyticsConsent(true); analytics.trackPublicPageview("/"); analytics.setAnalyticsConsent(false);
  await settle(); expect(requests).toHaveLength(0);
  analytics.setAnalyticsConsent(true); analytics.trackPublicPageview("/"); await vi.waitFor(() => expect(events()).toHaveLength(1));
  const previous = events()[0].properties.distinct_id;
  analytics.setAnalyticsConsent(false); analytics.trackPublicPageview("/"); await settle(); expect(events()).toHaveLength(1);
  analytics.setAnalyticsConsent(true); analytics.trackPublicPageview("/"); await vi.waitFor(() => expect(events()).toHaveLength(2));
  expect(events()[1].properties.distinct_id).not.toBe(previous);
});
it("drops failed-request retries after withdrawal with the pinned real SDK", async () => {
  vi.useFakeTimers(); status = 503; analytics.setAnalyticsConsent(true); analytics.trackPublicPageview("/");
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  analytics.setAnalyticsConsent(false); window.dispatchEvent(new Event("online"));
  await vi.advanceTimersByTimeAsync(12000); expect(requests).toHaveLength(1);
});

it("rejects non-ingestion hosts", async () => {
  vi.stubEnv("VITE_POSTHOG_HOST", "https://example.test"); vi.resetModules();
  const invalid = await import("../../src/lib/analytics"); expect(invalid.analyticsConfigured).toBe(false);
  invalid.setAnalyticsConsent(true); invalid.trackPublicPageview("/"); await settle(); expect(requests).toHaveLength(0);
  invalid.setAnalyticsConsent(false);
});
