import { base64UrlToBytes, bytesToBase64Url, sha256Bytes } from "./crypto.ts";

const tokenUrl = "https://oauth2.googleapis.com/token";
const cached = new Map<string, { token: string; expires: number }>();

export async function scannerIdentityToken(credentials: string, endpoint: URL, fetcher: typeof fetch = fetch): Promise<string> {
  if (endpoint.protocol !== "https:" || endpoint.port || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(endpoint.hostname)) throw new Error("Invalid scanner identity configuration.");
  const audience = endpoint.origin;
  const account = JSON.parse(credentials);
  if (account.type !== "service_account" || typeof account.client_email !== "string" ||
      !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(account.client_email) ||
      typeof account.private_key !== "string" || (account.token_uri && account.token_uri !== tokenUrl)) throw new Error("Invalid scanner identity configuration.");
  const cacheKey = bytesToBase64Url(await sha256Bytes(credentials + audience));
  const now = Math.floor(Date.now() / 1000);
  const previous = cached.get(cacheKey);
  if (previous && previous.expires > now + 60) return previous.token;
  const encode = (value: unknown) => bytesToBase64Url(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, aud: tokenUrl, iat: now, exp: now + 3600, target_audience: audience })}`;
  const pem = account.private_key.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replaceAll(/\s/gu, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(tokenUrl, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}` }),
    });
    if (!response.ok || !response.body) throw new Error("Scanner identity unavailable.");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16384) { await reader.cancel(); throw new Error("Scanner identity unavailable."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const token = JSON.parse(new TextDecoder().decode(bytes)).id_token;
    if (typeof token !== "string" || token.split(".").length !== 3) throw new Error("Scanner identity unavailable.");
    // The token is received directly from Google's fixed HTTPS endpoint, never from the caller.
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(token.split(".")[1])));
    const received = Math.floor(Date.now() / 1000);
    if (claims.aud !== audience || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= received + 60 || claims.exp > received + 3660) throw new Error("Scanner identity unavailable.");
    if (cached.size >= 8) cached.clear();
    cached.set(cacheKey, { token, expires: claims.exp });
    return token;
  } finally { clearTimeout(timeout); }
}
