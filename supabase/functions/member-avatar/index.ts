import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requiredEnv } from "../_shared/env.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, json } from "../_shared/http.ts";
import { adminClient, authenticatedUser, bearerToken } from "../_shared/supabase.ts";
import { scanOnboardingImage } from "../_shared/onboarding-scanner.ts";
const bucket = "member-avatars";
const consent = "2026-09-27-avatar-1";
const limit = 5 * 1024 * 1024;
Deno.serve(async (request) => {
    const cors = { ...corsHeaders(request), "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-avatar-consent", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS" };
    if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: cors });
    if (!["GET", "POST", "DELETE"].includes(request.method))
        return json(request, { error: "method_not_allowed" }, 405);
    try {
        const user = await authenticatedUser(request);
        const client = adminClient();
        const scoped = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${bearerToken(request)}` } }, auth: { persistSession: false, autoRefreshToken: false } });
        if (request.method === "GET") {
            const id = new URL(request.url).searchParams.get("user_id") || user.id;
            const { data, error } = await scoped.from("member_avatars").select("object_path,content_type").eq("user_id", id).maybeSingle();
            if (error || !data)
                throw new HttpError(404, "Avatar unavailable.");
            const { data: image, error: downloadError } = await client.storage.from(bucket).download(data.object_path);
            if (downloadError || !image)
                throw new HttpError(404, "Avatar unavailable.");
            const { data: current } = await scoped.from("member_avatars").select("object_path").eq("user_id", id).maybeSingle();
            if (current?.object_path !== data.object_path)
                throw new HttpError(404, "Avatar unavailable.");
            return new Response(image, { headers: { ...cors, "content-type": data.content_type, "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" } });
        }
        if (request.method === "DELETE") {
            const { error } = await client.rpc("begin_member_avatar_change", { p_user_id: user.id, p_remove: true });
            if (error)
                throw new Error("Avatar removal failed");
            return json(request, { removed: true });
        }
        const { data: operation, error: operationError } = await client.rpc("begin_member_avatar_change", { p_user_id: user.id, p_remove: false });
        if (operationError || !operation)
            throw new Error("Avatar update unavailable");
        let bytes: Uint8Array;
        let type = request.headers.get("content-type") || "";
        if (type === "application/json") {
            const reader = request.body?.getReader();
            if (!reader)
                throw new HttpError(400, "Consent required.");
            const chunks: Uint8Array[] = [];
            let length = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                length += value.length;
                if (length > 1024) {
                    await reader.cancel();
                    throw new HttpError(413, "Consent request too large.");
                }
                chunks.push(value);
            }
            const input = new Uint8Array(length);
            let at = 0;
            for (const chunk of chunks) {
                input.set(chunk, at);
                at += chunk.length;
            }
            let body;
            try {
                body = JSON.parse(new TextDecoder().decode(input));
            }
            catch {
                throw new HttpError(400, "Invalid consent request.");
            }
            if (!body || body.use_profile_photo !== true || body.consent_version !== consent)
                throw new HttpError(400, "Confirm profile photo use first.");
            const { data: document } = await scoped.from("onboarding_documents").select("object_path").eq("user_id", user.id).eq("kind", "photo").is("deleted_at", null).not("uploaded_at", "is", null).gt("expires_at", new Date().toISOString()).order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
            if (!document)
                throw new HttpError(404, "No current profile photo is available. Upload a new avatar.");
            const { data: image } = await client.storage.from("onboarding-documents").download(document.object_path);
            if (!image || image.size > limit)
                throw new HttpError(404, "Profile photo unavailable.");
            bytes = new Uint8Array(await image.arrayBuffer());
            type = bytes[0] === 137 ? "image/png" : "image/jpeg";
        }
        else {
            if (request.headers.get("x-avatar-consent") !== consent)
                throw new HttpError(400, "Confirm profile photo use first.");
            if (!["image/png", "image/jpeg"].includes(type))
                throw new HttpError(415, "Use PNG or JPEG.");
            const reader = request.body?.getReader();
            if (!reader)
                throw new HttpError(400, "Image required.");
            const chunks: Uint8Array[] = [];
            let size = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (done)
                    break;
                size += value.length;
                if (size > limit) {
                    await reader.cancel();
                    throw new HttpError(413, "Images must be at most 5 MiB.");
                }
                chunks.push(value);
            }
            bytes = new Uint8Array(size);
            let offset = 0;
            for (const chunk of chunks) {
                bytes.set(chunk, offset);
                offset += chunk.length;
            }
        }
        const clean = await scanOnboardingImage(bytes, type, { url: Deno.env.get("ONBOARDING_SCANNER_URL"), secret: Deno.env.get("ONBOARDING_SCANNER_SECRET"), googleCredentials: Deno.env.get("ONBOARDING_SCANNER_GOOGLE_CREDENTIALS_JSON"), local: Deno.env.get("ONBOARDING_SCANNER_LOCAL") === "true" && new URL(requiredEnv("SUPABASE_URL")).hostname === "kong" });
        const path = `${user.id}/${crypto.randomUUID()}`;
        const { error: queueError } = await client.from("member_avatar_cleanup").insert({ object_path: path, queued_at: new Date(Date.now() + 3600000).toISOString() });
        if (queueError)
            throw new Error("Avatar update unavailable");
        const { error: uploadError } = await client.storage.from(bucket).upload(path, clean, { contentType: type, cacheControl: "0" });
        if (uploadError)
            throw new Error("Avatar upload failed");
        const { data: saved, error: saveError } = await client.rpc("finish_member_avatar_change", { p_user_id: user.id, p_token: operation, p_path: path, p_type: type });
        if (saveError || !saved)
            throw new HttpError(409, "Avatar changed during this upload. Refresh and try again.");
        return json(request, { saved: true }, 201);
    }
    catch (error) {
        return json(request, { error: error instanceof HttpError ? error.message : "Avatar request failed." }, error instanceof HttpError ? error.status : 500);
    }
});
