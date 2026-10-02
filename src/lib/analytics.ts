import type { CaptureResult, PostHog } from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY?.trim();
const host = import.meta.env.VITE_POSTHOG_HOST?.trim();
export const analyticsConfigured = import.meta.env.VITE_ANALYTICS_ENABLED === "true"
  && Boolean(key?.startsWith("phc_")) && ["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(host ?? "");
const publicPaths = new Set(["/", "/about", "/team", "/services", "/projects", "/branding", "/blog", "/blog/model-hardware-standard", "/projects/electrofluidic-fiber-muscles", "/building-vision", "/ecosystem", "/components", "/join", "/booking-beta", "/privacy"]);
const milestones = ["details_saved", "photo_uploaded", "government_id_uploaded", "application_submitted"] as const;
const atlasFilters = { type: ["", "startup", "research-ecosystem", "supplier", "vendor", "other"], need: ["", "build", "source", "manufacture", "test", "learn", "fund", "pilot"] };
export type RegistrationMilestone = typeof milestones[number];

function normalizedPublicPath(value: string): string | null {
  const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (publicPaths.has(path)) return path;
  if (/^\/components\/[a-z0-9-]{1,80}$/.test(path) && !["/components/request", "/components/wishlist"].includes(path)) return "/components/:slug";
  return null;
}
export function isAnalyticsPage(pathname: string): boolean {
  return normalizedPublicPath(pathname) !== null || pathname.replace(/\/+$/, "") === "/onboarding";
}
let consent = false;
let generation = 0;
let client: PostHog | undefined;
let loading: Promise<PostHog | undefined> | undefined;
let anonymousId: string | undefined;
let lastPath: string | undefined;
const countedMilestones = new Set<RegistrationMilestone>();

function sanitize(event: CaptureResult | null, epoch: number): CaptureResult | null {
  if (!event || !consent || generation !== epoch || !anonymousId) return null;
  const properties: Record<string, string | boolean> = { token: key!, distinct_id: anonymousId, $process_person_profile: false, $geoip_disable: true };
  if (event.event === "$pageview") {
    const path = event.properties.$pathname === "/components/:slug" ? "/components/:slug" : normalizedPublicPath(String(event.properties.$pathname ?? ""));
    if (!path || normalizedPublicPath(window.location.pathname) !== path) return null;
    properties.$pathname = path;
    properties.$current_url = `https://armatureailabs.com${path}`;
  } else if (event.event === "registration_step" && milestones.includes(event.properties.step)
    && window.location.pathname.replace(/\/+$/, "") === "/onboarding") {
    properties.step = event.properties.step;
  } else if (event.event === "ecosystem_filter" && window.location.pathname.replace(/\/+$/, "") === "/ecosystem"
    && ["type", "need"].includes(event.properties.filter)
    && atlasFilters[event.properties.filter as keyof typeof atlasFilters].includes(event.properties.value)) {
    properties.filter = event.properties.filter;
    properties.value = event.properties.value;
  } else return null;
  return { uuid: event.uuid, event: event.event, properties };
}

async function ready(): Promise<PostHog | undefined> {
  if (!consent || !analyticsConfigured) return;
  if (client) return client;
  if (loading) return loading;
  const epoch = generation;
  const pending = import("posthog-js").then(({ PostHog: Client }) => {
    if (!consent || generation !== epoch) return;
    const instance = new Client();
    instance.init(key!, {
      api_host: host!, persistence: "memory", disable_persistence: true,
      autocapture: false, capture_pageview: false, capture_pageleave: false,
      capture_exceptions: false, capture_performance: false, capture_heatmaps: false,
      capture_dead_clicks: false, rageclick: false,
      disable_session_recording: true, disable_surveys: true, disable_product_tours: true,
      disable_web_experiments: true, disable_external_dependency_loading: true,
      advanced_disable_flags: true, advanced_disable_feature_flags: true,
      person_profiles: "never", ip: false, save_referrer: false, save_campaign_params: false,
      request_batching: false, disable_compression: true,
      get_current_url: () => "https://armatureailabs.com",
      before_send: event => sanitize(event, epoch),
    });
    if (!consent || generation !== epoch) { instance.opt_out_capturing(); return; }
    instance.opt_in_capturing({ captureEventName: false });
    anonymousId = instance.get_distinct_id();
    client = instance;
    return instance;
  }).catch(() => undefined).finally(() => { if (loading === pending) loading = undefined; });
  loading = pending;
  return pending;
}

export function setAnalyticsConsent(granted: boolean): void {
  if (consent === granted) return;
  consent = granted;
  generation++;
  lastPath = undefined;
  countedMilestones.clear();
  if (!granted) {
    if (client) {
      client.opt_out_capturing();
      // Pinned SDK shutdown flushes queues, so discard transports before disposal.
      client._send_request = () => undefined;
      client._send_retriable_request = () => undefined;
      void client.shutdown();
      client.__loaded = false;
    }
    client = undefined; anonymousId = undefined; loading = undefined;
  }
}
export function trackPublicPageview(pathname: string): void {
  const path = normalizedPublicPath(pathname);
  if (!path) { lastPath = undefined; return; }
  if (!consent || path === lastPath || normalizedPublicPath(window.location.pathname) !== path) return;
  const epoch = generation;
  void ready().then(instance => {
    if (!instance || !consent || epoch !== generation || path === lastPath || normalizedPublicPath(window.location.pathname) !== path) return;
    lastPath = path;
    instance.capture("$pageview", { $pathname: path });
  });
}
export function trackRegistrationMilestone(step: RegistrationMilestone): void {
  if (!consent || !milestones.includes(step) || countedMilestones.has(step) || window.location.pathname.replace(/\/+$/, "") !== "/onboarding") return;
  const epoch = generation;
  void ready().then(instance => {
    if (!instance || !consent || epoch !== generation || countedMilestones.has(step) || window.location.pathname.replace(/\/+$/, "") !== "/onboarding") return;
    countedMilestones.add(step);
    instance.capture("registration_step", { step });
  });
}

export function trackEcosystemFilter(filter: "type" | "need", value: string): void {
  if (!consent || !atlasFilters[filter].includes(value) || window.location.pathname.replace(/\/+$/, "") !== "/ecosystem") return;
  const epoch = generation;
  void ready().then(instance => {
    if (!instance || !consent || epoch !== generation) return;
    instance.capture("ecosystem_filter", { filter, value });
  });
}
