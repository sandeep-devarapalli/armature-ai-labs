import { createClient } from "@supabase/supabase-js";

export const onboardingLocalUrl = "http://127.0.0.1:55421";
const localKey = import.meta.env.VITE_ONBOARDING_LOCAL_ANON_KEY as string | undefined;
export const onboardingLocalAvailable = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === "true"
  && ["127.0.0.1", "localhost", "[::1]"].includes(window.location.hostname) && Boolean(localKey);
export const onboardingLocal = onboardingLocalAvailable ? createClient(onboardingLocalUrl, localKey!, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "armature-onboarding-local" },
}) : null;

export interface LocalApplication {
  user_id: string; full_name: string; email: string; phone: string; linkedin_url: string;
  date_of_birth: string; status: string; revision: number;
}
export interface LocalDocument {
  id: string; user_id: string; kind: "photo" | "government_id"; id_type: string | null;
  uploaded_at: string | null; expires_at: string; deleted_at: string | null;
}
export interface LocalReview { id: string; decision: string; reason: string | null; created_at: string }
export function documentAvailable(document: LocalDocument) {
  return !document.deleted_at && Date.parse(document.expires_at) > Date.now();
}
export async function requestLocalDocument(id: string, file?: File) {
  if (!onboardingLocal) throw new Error("Local onboarding is not configured.");
  const { data: { session } } = await onboardingLocal.auth.getSession();
  if (!session) throw new Error("Sign in again to access this document.");
  const response = await fetch(`${onboardingLocalUrl}/functions/v1/onboarding-document?id=${encodeURIComponent(id)}`, {
    method: file ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: localKey!, ...(file ? { "Content-Type": file.type } : {}) },
    body: file,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Document request failed.");
  }
  return response;
}
