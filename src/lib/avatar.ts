import type { SupabaseClient } from "@supabase/supabase-js";
export const AVATAR_CONSENT_VERSION = "2026-09-27-avatar-1";
export async function requestAvatar(client: SupabaseClient, userId: string, method = "GET", file?: File) {
    const { data: { session } } = await client.auth.getSession();
    if (!session)
        throw new Error("Sign in to manage your avatar.");
    const headers: Record<string, string> = { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "" };
    let body: BodyInit | undefined;
    if (method === "POST") {
        headers["content-type"] = file?.type || "application/json";
        headers["x-avatar-consent"] = AVATAR_CONSENT_VERSION;
        body = file || JSON.stringify({ use_profile_photo: true, consent_version: AVATAR_CONSENT_VERSION });
    }
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/member-avatar?user_id=${encodeURIComponent(userId)}`, { method, headers, body, cache: "no-store" });
    if (!response.ok) {
        if (method === "GET" && response.status === 404)
            return null;
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.error || "Avatar request failed.");
    }
    return method === "GET" ? response.blob() : null;
}
