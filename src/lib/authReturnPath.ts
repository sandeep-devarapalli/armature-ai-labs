const fallbackPath = "/dashboard";

export function safeAuthReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) return fallbackPath;

  try {
    const base = new URL("https://armature.invalid");
    const target = new URL(value, base);
    if (target.origin !== base.origin) return fallbackPath;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallbackPath;
  }
}

export function onboardingAuthReturnPath(value: unknown, basicOnly: boolean) {
  const safe = safeAuthReturnPath(value);
  const pathname = safe.split(/[?#]/)[0];
  if (/^\/bookings\/?$/.test(pathname)) {
    if (import.meta.env.VITE_DESK_CHECKOUT_ENABLED === "true") return safe;
    if (import.meta.env.VITE_EVENT_CHECKOUT_ENABLED === "true" && new URL(safe, "https://armature.invalid").searchParams.get("item") === "event") return safe;
    if (import.meta.env.VITE_BASIC_ONBOARDING_ENABLED === "true" && new URL(safe, "https://armature.invalid").searchParams.get("item") === "guest") return safe;
  }
  if (import.meta.env.VITE_BASIC_ONBOARDING_ENABLED === "true" && /^\/(golden-pass|admin\/passes)\/?$/.test(pathname)) return safe;
  if (import.meta.env.VITE_VENTURE_PASS_ENABLED === "true" &&
      import.meta.env.VITE_BASIC_ONBOARDING_ENABLED === "true" &&
      /^\/(venture-partner-pass|admin\/booking-management)\/?$/.test(pathname)) return safe;
  return basicOnly && !new Set(["/components/wishlist", "/talent-network", "/talent-network/", "/directory-profile", "/directory-profile/", "/resources/white-paper/robotic-actuators/feedback", "/resources/white-paper/robotic-actuators/feedback/", "/admin/resource-feedback", "/admin/resource-feedback/"]).has(safe.split(/[?#]/)[0]) ? "/onboarding" : safe;
}
