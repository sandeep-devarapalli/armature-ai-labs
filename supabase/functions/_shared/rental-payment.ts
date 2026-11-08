import { liveRazorpay, productionBackend, type LiveRazorpay } from "./live-desk-payment.ts";
import { RazorpayRequestError } from "./razorpay-signature.ts";

export const rentalStagingBackend = "https://gwrdmpvczwuypvvzfyty.supabase.co";
export function rentalProvider(mode: "test" | "live", env = (name: string) => Deno.env.get(name), fetcher = fetch): LiveRazorpay | null {
  if (mode === "live") return env("SUPABASE_URL") === productionBackend ? liveRazorpay(env, fetcher) : null;
  const keyId = env("RENTAL_TEST_RAZORPAY_KEY_ID") ?? "";
  const keySecret = env("RENTAL_TEST_RAZORPAY_KEY_SECRET") ?? "";
  if (env("SUPABASE_URL") !== rentalStagingBackend || !/^rzp_test_[A-Za-z0-9]{1,80}$/.test(keyId) || keySecret.length < 12) return null;
  return { keyId, keySecret, async request<T>(path: string, body?: object): Promise<T> {
    const result = await fetcher("https://api.razorpay.com/v1" + path, {
      method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { Authorization: "Basic " + btoa(keyId + ":" + keySecret), ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!result.ok) throw new RazorpayRequestError(502, "provider_request_rejected");
    return result.json() as Promise<T>;
  } };
}
