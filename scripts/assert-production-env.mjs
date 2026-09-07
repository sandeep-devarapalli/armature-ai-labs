const required = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SITE_URL",
  "VITE_MEMBER_PLATFORM_ENABLED",
  "VITE_COMPONENT_REQUESTS_ENABLED"
];

const missing = required.filter((key) => !process.env[key]?.trim());
if (missing.length > 0) {
  throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
}

if (process.env.VITE_DEMO_MODE === "true") {
  throw new Error("Production builds cannot enable VITE_DEMO_MODE.");
}

if (process.env.VITE_SITE_URL !== "https://armatureailabs.com") {
  throw new Error("VITE_SITE_URL must be https://armatureailabs.com for production.");
}

for (const key of [
  "VITE_MEMBER_PLATFORM_ENABLED",
  "VITE_COMPONENT_REQUESTS_ENABLED"
]) {
  if (!['true', 'false'].includes(process.env[key])) {
    throw new Error(`${key} must be explicitly set to true or false.`);
  }
}
