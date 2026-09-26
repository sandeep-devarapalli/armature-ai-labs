import { createClient } from "@supabase/supabase-js";

export const onboardingLocalUrl = "http://127.0.0.1:55421";
const localKey = import.meta.env.VITE_ONBOARDING_LOCAL_ANON_KEY as string | undefined;
export const onboardingLocalAvailable = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true"
  && ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname) && Boolean(localKey);
export const onboardingLocal = onboardingLocalAvailable ? createClient(onboardingLocalUrl, localKey!, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "armature-onboarding-local" },
}) : null;


export { documentAvailable } from "./onboarding";
export type { LocalApplication, LocalDocument, LocalReview } from "./onboarding";
import { requestOnboardingDocument } from "./onboarding";
export async function requestLocalDocument(id: string, file?: File) {
  if (!onboardingLocal) throw new Error("Local onboarding is not configured.");
  return requestOnboardingDocument(onboardingLocal, onboardingLocalUrl, localKey!, id, file);
}
