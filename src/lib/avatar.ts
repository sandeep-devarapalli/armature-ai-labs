import { documentAvailable, type LocalDocument } from "./onboarding";
import type { SupabaseClient } from "@supabase/supabase-js";
export const AVATAR_CONSENT_VERSION = "2026-09-27-avatar-1";
export async function requestAvatar(client: SupabaseClient, userId: string, method = "GET", file?: File) {
    const { data: { session } } = await client.auth.getSession();
    if (!session || (method !== "GET" && session.user.id !== userId))
        throw new Error("Sign in to your account again to manage your profile photo.");
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

export async function requestVerificationPhoto(client: SupabaseClient, userId: string, document: LocalDocument) {
    if (document.user_id !== userId || document.kind !== "photo" || !document.uploaded_at || !documentAvailable(document))
        throw new Error("Your verification photo is unavailable for reuse. Upload a new profile photo.");
    const { data: { session } } = await client.auth.getSession();
    if (session?.user.id !== userId) throw new Error("Sign in to your account again.");
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/onboarding-document?id=${encodeURIComponent(document.id)}`, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "" }, cache: "no-store",
    });
    if (!response.ok) throw new Error("Your verification photo is unavailable for reuse. Upload a new profile photo.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if ((!png && !jpeg) || bytes.length > 5 * 1024 * 1024) throw new Error("This verification photo could not be opened. Upload a new PNG or JPEG.");
    return new File([bytes], `verification-photo.${png ? "png" : "jpg"}`, { type: png ? "image/png" : "image/jpeg" });
}
