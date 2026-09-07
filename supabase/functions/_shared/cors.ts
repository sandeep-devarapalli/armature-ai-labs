const configuredOrigins = (
  Deno.env.get("ALLOWED_ORIGINS") ??
  Deno.env.get("ALLOWED_ORIGIN") ??
  "https://armatureailabs.com,https://armaturelab.org"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin");
  const isLocalPreview =
    origin === "http://localhost:5173" || origin === "http://localhost:4173";
  const allowedOrigin =
    origin && (configuredOrigins.includes(origin) || isLocalPreview)
      ? origin
      : configuredOrigins[0];

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-armature-job-secret, x-kiosk-device-id, x-kiosk-nonce, x-kiosk-timestamp, x-kiosk-signature",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    vary: "Origin",
  };
}
