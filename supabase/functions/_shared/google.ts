import { bytesToBase64Url } from "./crypto.ts";
import { primaryUser } from "./booking-mail.ts";
import { requiredEnv } from "./env.ts";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const cachedTokens = new Map<string, { value: string; expiresAt: number }>();

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replaceAll(/\s/gu, "");
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

export async function googleAccessToken(scope: string): Promise<string> {
  const subject = requiredEnv("GOOGLE_WORKSPACE_SUBJECT");
  if (subject.toLowerCase() !== primaryUser) {
    throw new Error("Google delegation must impersonate the primary Workspace user.");
  }
  const cacheKey = `${subject}:${scope}`;
  const cachedToken = cachedTokens.get(cacheKey);
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const account = JSON.parse(
    requiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON"),
  ) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = account.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const claims = bytesToBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        iss: account.client_email,
        sub: subject,
        scope,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const unsigned = `${header}.${claims}`;
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(account.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${bytesToBase64Url(new Uint8Array(signature))}`;

  const response = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth failed (${response.status}): ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };
  const token = {
    value: payload.access_token,
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  cachedTokens.set(cacheKey, token);
  return token.value;
}

export async function googleCalendarRequest(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const token = await googleAccessToken("https://www.googleapis.com/auth/calendar");
  return fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}
