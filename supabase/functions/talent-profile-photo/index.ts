import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requiredEnv } from "../_shared/env.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, json } from "../_shared/http.ts";
import { adminClient, authenticatedUser, bearerToken } from "../_shared/supabase.ts";
import { scanOnboardingImage } from "../_shared/onboarding-scanner.ts";
const bucket = "talent-profile-photos";
const consent = "2026-10-13-public-photo-v1";
const limit = 5 * 1024 * 1024;
async function readBody(request: Request, maximum: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Photo required.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length;
    if (size > maximum) { await reader.cancel(); throw new HttpError(413, "Photo must be at most 5 MiB."); }
    chunks.push(value);
  }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
Deno.serve(async (request) => {
  const cors = { ...corsHeaders(request), "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-photo-consent", "access-control-allow-methods": "GET, POST, DELETE, OPTIONS", "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  try {
    if (!["GET", "POST", "DELETE"].includes(request.method)) throw new HttpError(405, "Method not allowed.");
    const url = new URL(request.url); const profile = url.searchParams.get("profile_id");
    if (!profile || profile.length > 300) throw new HttpError(400, "Profile required.");
    const client = adminClient();
    if (request.method === "GET" && url.searchParams.get("source") !== "membership") {
      const { data, error } = await client.rpc("talent_photo_read", { p_profile: profile });
      if (error || !data) throw new HttpError(404, "Photo unavailable.");
      const { data: image, error: failed } = await client.storage.from(bucket).download(data.object_path);
      if (failed || !image) throw new HttpError(404, "Photo unavailable.");
      const { data: current } = await client.rpc("talent_photo_read", { p_profile: profile });
      if (current?.object_path !== data.object_path || current?.version !== data.version) throw new HttpError(404, "Photo unavailable.");
      return new Response(image, { headers: { ...cors, "content-type": data.content_type } });
    }
    const user = await authenticatedUser(request);
    const scoped = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${bearerToken(request)}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: status, error: statusError } = await scoped.rpc("talent_my_status", { profile_id: profile });
    const { data: published } = await scoped.from("talent_profiles").select("id").eq("id", profile).eq("published", true).maybeSingle();
    if (statusError || !status?.owner || !published) throw new HttpError(403, "Approved profile ownership required.");
    if (request.method === "DELETE") {
      const { error } = await client.rpc("talent_photo_begin", { p_profile: profile, p_user: user.id, p_remove: true });
      if (error) throw new HttpError(403, "Photo removal unavailable.");
      return json(request, { removed: true });
    }
    let bytes: Uint8Array; let type = request.headers.get("content-type") || "";
    const reuse = request.method === "GET" || type === "application/json";
    if (request.method !== "GET") {
      if (reuse) {
        let body; try { body = JSON.parse(new TextDecoder().decode(await readBody(request, 1024))); } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "Invalid consent request."); }
        if (body?.use_membership_photo !== true || body?.consent_version !== consent) throw new HttpError(400, "Confirm public photo use first.");
      } else if (request.headers.get("x-photo-consent") !== consent) throw new HttpError(400, "Confirm public photo use first.");
    }
    if (reuse) {
      const { data: avatar } = await scoped.from("member_avatars").select("object_path,content_type").eq("user_id", user.id).maybeSingle();
      let path = avatar?.object_path; let sourceBucket = "member-avatars";
      if (!path) {
        const { data: photo } = await scoped.from("onboarding_documents").select("object_path").eq("user_id", user.id).eq("kind", "photo").is("deleted_at", null).not("uploaded_at", "is", null).gt("expires_at", new Date().toISOString()).order("uploaded_at", { ascending: false }).limit(1).maybeSingle();
        path = photo?.object_path; sourceBucket = "onboarding-documents";
      }
      if (!path) throw new HttpError(404, "No membership photo is available. Upload a new photo.");
      const { data: image } = await client.storage.from(sourceBucket).download(path);
      if (!image || image.size > limit) throw new HttpError(404, "Membership photo unavailable.");
      bytes = new Uint8Array(await image.arrayBuffer());
      type = bytes[0] === 137 ? "image/png" : "image/jpeg";
      if (request.method === "GET") {
        const { data: currentStatus, error: currentError } = await scoped.rpc("talent_my_status", { profile_id: profile });
        const { data: currentProfile } = await scoped.from("talent_profiles").select("id").eq("id", profile).eq("published", true).maybeSingle();
        if (currentError || !currentStatus?.owner || !currentProfile) throw new HttpError(403, "Approved profile ownership required.");
        return new Response(bytes, { headers: { ...cors, "content-type": type } });
      }
    } else {
      if (!["image/png", "image/jpeg"].includes(type)) throw new HttpError(415, "Use PNG or JPEG.");
      bytes = await readBody(request, limit);
    }
    const { data: token, error: beginError } = await client.rpc("talent_photo_begin", { p_profile: profile, p_user: user.id, p_remove: false });
    if (beginError || !token) throw new HttpError(403, "Photo update unavailable.");
    const clean = await scanOnboardingImage(bytes, type, { url: Deno.env.get("ONBOARDING_SCANNER_URL"), secret: Deno.env.get("ONBOARDING_SCANNER_SECRET"), googleCredentials: Deno.env.get("ONBOARDING_SCANNER_GOOGLE_CREDENTIALS_JSON"), local: Deno.env.get("ONBOARDING_SCANNER_LOCAL") === "true" && new URL(requiredEnv("SUPABASE_URL")).hostname === "kong" });
    const path = `${user.id}/${token}`;
    const { error: queued } = await client.from("talent_photo_cleanup").insert({ object_path: path, queued_at: new Date(Date.now() + 3600000).toISOString() });
    if (queued) throw new Error("Unable to reserve photo.");
    const { error: uploadError } = await client.storage.from(bucket).upload(path, clean, { contentType: type, cacheControl: "0" });
    if (uploadError) throw new Error("Photo upload failed.");
    const { data: saved, error: saveError } = await client.rpc("talent_photo_finish", { p_profile: profile, p_user: user.id, p_token: token, p_path: path, p_type: type, p_source: reuse ? "membership" : "upload", p_consent: consent });
    if (saveError || !saved) throw new HttpError(409, "Profile changed during upload. Refresh and try again.");
    return json(request, { saved: true, photoVersion: token }, 201);
  } catch (error) {
    const response = json(request, { error: error instanceof HttpError ? error.message : "Photo request failed." }, error instanceof HttpError ? error.status : 500);
    response.headers.set("cache-control", "no-store, max-age=0"); return response;
  }
});
