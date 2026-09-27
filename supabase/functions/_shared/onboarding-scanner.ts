import { HttpError } from "./http.ts";
import { scannerIdentityToken } from "./scanner-identity.ts";

const limit = 5 * 1024 * 1024;

export async function scanOnboardingImage(
  bytes: Uint8Array,
  contentType: string,
  config: { url?: string; secret?: string; local?: boolean; googleCredentials?: string },
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const unavailable = () => new HttpError(503, "Image safety checks are temporarily unavailable. Try again later.");
  if (!config.url || !config.secret || config.secret.length < 32) throw unavailable();
  let endpoint: URL;
  try { endpoint = new URL(config.url); } catch { throw unavailable(); }
  const localHosts = ["127.0.0.1", "localhost", "host.docker.internal", "armature-onboarding-scanner-gateway-1"];
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      (endpoint.protocol !== "https:" && !(config.local && endpoint.protocol === "http:" && localHosts.includes(endpoint.hostname)))) throw unavailable();
  if (!bytes.length || bytes.length > limit || !["image/png", "image/jpeg"].includes(contentType)) throw new HttpError(415, "Use a PNG or JPEG image of at most 5 MiB.");
  let identity: string | undefined;
  if (!(config.local && endpoint.protocol === "http:" && localHosts.includes(endpoint.hostname))) {
    if (!config.googleCredentials) throw unavailable();
    try { identity = await scannerIdentityToken(config.googleCredentials, endpoint, fetcher); } catch { throw unavailable(); }
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetcher(endpoint, {
      method: "POST", redirect: "error", signal: controller.signal,
      headers: { Authorization: `Bearer ${config.secret}`, "Content-Type": contentType, "Content-Length": String(bytes.length), ...(identity ? { "X-Serverless-Authorization": `Bearer ${identity}` } : {}) },
      body: new Uint8Array(bytes).buffer,
    });
    if (response.status === 422) throw new HttpError(422, "The image could not pass safety checks. Use a different PNG or JPEG.");
    if (!response.ok || response.headers.get("content-type") !== contentType || !response.body) throw unavailable();
    const declared = response.headers.get("content-length");
    if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
      await response.body.cancel();
      throw unavailable();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw unavailable(); }
      chunks.push(value);
    }
    const result = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => result[i] === value);
    const jpeg = result[0] === 255 && result[1] === 216 && result[2] === 255;
    if (!((contentType === "image/png" && png) || (contentType === "image/jpeg" && jpeg))) throw unavailable();
    return result;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw unavailable();
  } finally { clearTimeout(timeout); }
}
