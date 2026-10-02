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

it("does not send ecosystem filter events without consent or after withdrawal", async () => {
  history.replaceState({}, "", "/ecosystem?private=secret");
  analytics.trackEcosystemFilter("type", "startup"); analytics.trackEcosystemFilter("need", "build");
  await settle(); expect(requests).toHaveLength(0);
  analytics.setAnalyticsConsent(true); analytics.trackEcosystemFilter("need", "source"); analytics.setAnalyticsConsent(false);
  await settle(); expect(requests).toHaveLength(0);
});

it("sends only allowlisted ecosystem filter enums and never search or contribution contents", async () => {
  history.replaceState({}, "", "/ecosystem?q=secret@example.test&contribute=startup&phone=9876543210#private");
  analytics.setAnalyticsConsent(true);
  const types = ["", "startup", "research-ecosystem", "supplier", "vendor", "other"];
  const needs = ["", "build", "source", "manufacture", "test", "learn", "fund", "pilot"];
  types.forEach(value => analytics.trackEcosystemFilter("type", value));
  needs.forEach(value => analytics.trackEcosystemFilter("need", value));
  analytics.trackEcosystemFilter("type", "secret@example.test");
  analytics.trackEcosystemFilter("need", "https://example.test/private-source");
  await vi.waitFor(() => expect(events()).toHaveLength(types.length + needs.length));
  for (const event of events()) {
    expect(event.event).toBe("ecosystem_filter");
    expect(event.properties).toEqual({ token: "phc_synthetic_test", distinct_id: expect.any(String), $process_person_profile: false, $geoip_disable: true, filter: expect.stringMatching(/^(type|need)$/), value: expect.any(String) });
    expect(event.properties.filter === "type" ? types : needs).toContain(event.properties.value);
  }
  expect(JSON.stringify(requests)).not.toMatch(/secret|9876543210|private-source|contribute|\$current_url|\$referrer|\$session_id|\$set/);
});

it("drops queued ecosystem events when navigation leaves the public atlas", async () => {
  history.replaceState({}, "", "/ecosystem"); analytics.setAnalyticsConsent(true);
  analytics.trackEcosystemFilter("need", "test");
  history.replaceState({}, "", "/admin/ecosystem");
  await settle(); expect(requests).toHaveLength(0);
  analytics.trackEcosystemFilter("type", "startup"); await settle(); expect(requests).toHaveLength(0);
});
