import type { SupabaseClient } from "@supabase/supabase-js";

export const ONBOARDING_NOTICE_VERSION = "2026-09-26";
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
export async function requestOnboardingDocument(client: SupabaseClient, url: string, key: string, id: string, file?: File) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error("Sign in again to access this document.");
  const response = await fetch(`${url}/functions/v1/onboarding-document?id=${encodeURIComponent(id)}`, {
    method: file ? "POST" : "GET", cache: "no-store",
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: key, ...(file ? { "Content-Type": file.type } : {}) },
    body: file,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Document request failed.");
  }
  return response;
}
