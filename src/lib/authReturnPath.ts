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
