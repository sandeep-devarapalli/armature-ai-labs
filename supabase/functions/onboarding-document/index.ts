import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requiredEnv } from "../_shared/env.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, json } from "../_shared/http.ts";
import { adminClient, authenticatedUser, bearerToken } from "../_shared/supabase.ts";

import { scanOnboardingImage } from "../_shared/onboarding-scanner.ts";

const bucket = "onboarding-documents";
const maxBytes = 5 * 1024 * 1024;

async function readImage(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "An image is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "Images must be at most 5 MiB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const type = request.headers.get("content-type");
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!((type === "image/png" && png) || (type === "image/jpeg" && jpeg))) {
    throw new HttpError(415, "Use a PNG or JPEG image.");
  }
  return bytes;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (!["GET", "POST"].includes(request.method)) return json(request, { error: "method_not_allowed" }, 405);
  try {
    const user = await authenticatedUser(request);
    if (Deno.env.get("ONBOARDING_ENABLED") !== "true") return json(request, { error: "onboarding_disabled" }, 503);
    const id = new URL(request.url).searchParams.get("id");
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(400, "A document ID is required.");
    const client = adminClient();
    const { data: settings, error: settingsError } = await client.from("onboarding_settings").select("enabled").eq("singleton", true).single();
    if (settingsError || !settings?.enabled) return json(request, { error: "onboarding_disabled" }, 503);
    const scopedClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: `Bearer ${bearerToken(request)}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: document, error } = await scopedClient.from("onboarding_documents").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error("Document lookup failed");
    if (!document) throw new HttpError(404, "Document unavailable.");
    if (document.user_id !== user.id) {
      if (request.method === "POST") throw new HttpError(403, "Only the applicant can upload.");
      // RLS above permits only the applicant or an admin reviewer.
    }
    if (document.deleted_at || Date.parse(document.expires_at) <= Date.now()) throw new HttpError(410, "Document retention period has ended.");
    if (request.method === "GET") {
      if (!document.uploaded_at) throw new HttpError(404, "Document unavailable.");
      const { data, error: downloadError } = await client.storage.from(bucket).download(document.object_path);
      if (downloadError || !data) throw new HttpError(404, "Document unavailable.");
      // Proxy instead of issuing a bearer URL that can outlive authorization or expiry.
      const { data: current } = await scopedClient.from("onboarding_documents").select("expires_at,deleted_at").eq("id", id).maybeSingle();
      if (!current || current.deleted_at || Date.parse(current.expires_at) <= Date.now()) throw new HttpError(410, "Document retention period has ended.");
      return new Response(data, { headers: {
        ...corsHeaders(request), "content-type": "application/octet-stream",
        "content-disposition": 'attachment; filename="onboarding-image"',
        "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff",
      } });
    }
    const { data: application, error: appError } = await client.from("basic_onboarding_applications").select("status,revision").eq("user_id", user.id).single();
    if (appError || application?.status !== "pending") throw new HttpError(409, "Application is not awaiting documents.");
    const { data: acceptance, error: acceptanceError } = await scopedClient.from("onboarding_notice_acceptances")
      .select("notice_version").eq("user_id", user.id).eq("revision", application.revision).eq("notice_version", "2026-09-26-release-1").maybeSingle();
    if (acceptanceError) throw new HttpError(503, "Privacy notice acceptance could not be checked. Try again later.");
    if (!acceptance) throw new HttpError(403, "Accept the current privacy notice before uploading.");
    const original = await readImage(request);
    const bytes = await scanOnboardingImage(original, request.headers.get("content-type")!, {
      url: Deno.env.get("ONBOARDING_SCANNER_URL"),
      secret: Deno.env.get("ONBOARDING_SCANNER_SECRET"),
      googleCredentials: Deno.env.get("ONBOARDING_SCANNER_GOOGLE_CREDENTIALS_JSON"),
      local: Deno.env.get("ONBOARDING_SCANNER_LOCAL") === "true" && new URL(requiredEnv("SUPABASE_URL")).hostname === "kong",
    });
    if (Date.parse(document.expires_at) <= Date.now()) throw new HttpError(410, "Document retention period has ended.");
    const { error: uploadError } = await client.storage.from(bucket).upload(document.object_path, bytes, {
      contentType: request.headers.get("content-type")!, cacheControl: "0", upsert: false,
    });
    if (uploadError) throw new HttpError(409, "Document could not be uploaded. Existing uploads cannot be overwritten.");
    await client.rpc("finalize_onboarding_document", { p_document_id: id });
    const { data: latest, error: latestError } = await client.from("onboarding_documents").select("expires_at,deleted_at,uploaded_at").eq("id", id).single();
    if (latestError || !latest) throw new HttpError(503, "Upload status could not be read. Refresh before trying again.");
    if (!latest.uploaded_at || latest.deleted_at || Date.parse(latest.expires_at) <= Date.now()) {
      await client.storage.from(bucket).remove([document.object_path]);
      throw new HttpError(410, "Document retention period has ended.");
    }
    return json(request, { id, expires_at: latest.expires_at }, 201);
  } catch (error) {
    // Never log IDs, image bytes, tokens, or database/storage errors.
    return json(request, { error: error instanceof HttpError ? error.message : "Document request failed." }, error instanceof HttpError ? error.status : 500);
  }
});
