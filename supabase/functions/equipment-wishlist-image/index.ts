import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requiredEnv } from "../_shared/env.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, json } from "../_shared/http.ts";
import { adminClient, authenticatedUser, bearerToken } from "../_shared/supabase.ts";
import { scanOnboardingImage } from "../_shared/onboarding-scanner.ts";
const bucket = "equipment-wishlist-images";
const limit = 5 * 1024 * 1024;
Deno.serve(async (request) => {
  const cors = { ...corsHeaders(request), "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-image-rights" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!["GET", "POST"].includes(request.method)) return json(request, { error: "method_not_allowed" }, 405);
  try {
    const id = new URL(request.url).searchParams.get("request_id");
    if (!id || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)) throw new HttpError(400, "Valid request ID required.");
    const client = adminClient();
    if (request.method === "GET") {
      const lookup = () => client.from("component_requests").select("image_path,image_content_type,is_published,requester_user_id").eq("id", id).eq("request_scope", "equipment_wishlist").is("merged_into", null).maybeSingle();
      const { data: row, error } = await lookup();
      if (error || !row?.image_path) throw new HttpError(404, "Image unavailable.");
      let viewer: string | undefined;
      const authorized = async (record: { is_published: boolean; requester_user_id: string }) => {
        if (record.is_published) return true;
        if (!viewer) viewer = (await authenticatedUser(request)).id;
        if (record.requester_user_id === viewer) return true;
        const { data: roles } = await client.from("staff_roles").select("role").eq("user_id", viewer).in("role", ["admin", "super_admin"]).limit(1);
        return Boolean(roles?.length);
      };
      if (!(await authorized(row))) throw new HttpError(404, "Image unavailable.");
      const { data: image, error: downloadError } = await client.storage.from(bucket).download(row.image_path);
      if (downloadError || !image) throw new HttpError(404, "Image unavailable.");
      const { data: current } = await lookup();
      if (!current || current.image_path !== row.image_path || !(await authorized(current))) throw new HttpError(404, "Image unavailable.");
      return new Response(image, { headers: { ...cors, "content-type": row.image_content_type, "cache-control": "no-store", "x-content-type-options": "nosniff" } });
    }
    const user = await authenticatedUser(request);
    const scoped = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${bearerToken(request)}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: row } = await scoped.from("my_equipment_wishlist").select("id").eq("id", id).eq("is_published", false).is("merged_into", null).maybeSingle();
    const { data: membership } = await scoped.from("basic_onboarding_applications").select("status").eq("user_id", user.id).eq("status", "approved").maybeSingle();
    if (!row || !membership) throw new HttpError(403, "An approved membership and your unpublished request are required.");
    if (request.headers.get("x-image-rights") !== "confirmed") throw new HttpError(400, "Confirm permission to share this product image.");
    const type = request.headers.get("content-type") || "";
    const extension = ({ "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<string, string>)[type];
    if (!extension) throw new HttpError(415, "Use JPEG, PNG or WebP.");
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "Image required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new HttpError(413, "Images must be at most 5 MiB."); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const clean = await scanOnboardingImage(bytes, type, { url: Deno.env.get("ONBOARDING_SCANNER_URL"), secret: Deno.env.get("ONBOARDING_SCANNER_SECRET"), googleCredentials: Deno.env.get("ONBOARDING_SCANNER_GOOGLE_CREDENTIALS_JSON"), local: Deno.env.get("ONBOARDING_SCANNER_LOCAL") === "true" && new URL(requiredEnv("SUPABASE_URL")).hostname === "kong", allowWebp: true });
    const path = `${id}/${crypto.randomUUID()}.${extension}`;
    const { error: queueError } = await client.from("equipment_wishlist_image_cleanup").insert({ object_path: path, queued_at: new Date(Date.now() + 3600000).toISOString() });
    if (queueError) throw new Error("Image cleanup unavailable");
    const { error: uploadError } = await client.storage.from(bucket).upload(path, clean, { contentType: type, cacheControl: "0" });
    if (uploadError) throw new Error("Image upload failed");
    const { error: saveError } = await client.rpc("finish_equipment_wish_image", { p_request_id: id, p_user_id: user.id, p_path: path, p_type: type });
    if (saveError) throw new HttpError(409, "The request changed during upload. Refresh before retrying.");
    return json(request, { saved: true }, 201);
  } catch (error) {
    return json(request, { error: error instanceof HttpError ? error.message : "Image request failed." }, error instanceof HttpError ? error.status : 500);
  }
});
