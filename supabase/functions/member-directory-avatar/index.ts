import { adminClient } from "../_shared/supabase.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, errorResponse } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const headers = { ...corsHeaders(request), "cache-control": "no-store, max-age=0", "x-content-type-options": "nosniff" };
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed.");
    const id = new URL(request.url).searchParams.get("profile_id");
    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(404, "Photo unavailable.");
    const client = adminClient();
    const { data, error } = await client.rpc("read_public_directory_avatar", { p_id: id });
    if (error || !data) throw new HttpError(404, "Photo unavailable.");
    const { data: image, error: failed } = await client.storage.from("member-avatars").download(data.object_path);
    if (failed || !image) throw new HttpError(404, "Photo unavailable.");
    const { data: current, error: currentError } = await client.rpc("read_public_directory_avatar", { p_id: id });
    if (currentError || current?.object_path !== data.object_path) throw new HttpError(404, "Photo unavailable.");
    return new Response(image, { headers: { ...headers, "content-type": data.content_type } });
  } catch (error) { return errorResponse(request, error); }
});
