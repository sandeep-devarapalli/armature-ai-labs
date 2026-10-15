import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requiredEnv } from "../_shared/env.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { HttpError, json } from "../_shared/http.ts";
import { adminClient, authenticatedUser, bearerToken } from "../_shared/supabase.ts";

import { scannerIdentityToken } from "../_shared/scanner-identity.ts";

const limit = 50 * 1024 * 1024;
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders(request), "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-conversation-id, x-file-name" } });
  try {
    if (Deno.env.get("MARKET_FILES_ENABLED") !== "true") throw new HttpError(503, "File sharing is not available yet.");
    await authenticatedUser(request);
    const scoped = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: `Bearer ${bearerToken(request)}` } }, auth: { persistSession: false } });
    const admin = adminClient();
    if (request.method === "GET") {
      const attachment = new URL(request.url).searchParams.get("attachment_id");
      const { data, error } = await scoped.rpc("market_attachment_access", { attachment_id: attachment });
      if (error || !data) throw new HttpError(403, "File unavailable or still quarantined.");
      if (new URL(request.url).searchParams.get("preview") === "true") {
        if (!["image/png", "image/jpeg", "image/webp", "application/pdf"].includes(data.content_type)) throw new HttpError(415, "This file is download-only.");
        const { data: file, error: failed } = await admin.storage.from("market-files").download(data.object_path);
        if (failed || !file) throw new HttpError(503, "Preview unavailable.");
        return new Response(file, { headers: { ...corsHeaders(request), "content-type": data.content_type, "content-disposition": "inline", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": "sandbox; default-src 'none'" } });
      }
      const { data: signed, error: failed } = await admin.storage.from("market-files").createSignedUrl(data.object_path, 60, { download: data.filename });
      if (failed || !signed) throw new HttpError(503, "Download unavailable.");
      return json(request, { url: signed.signedUrl, filename: data.filename, content_type: data.content_type, expires_in: 60 });
    }
    if (request.method !== "POST") throw new HttpError(405, "Method not allowed.");
    // Raw file body avoids buffering multipart overhead; size is checked while streaming.
    const conversation = request.headers.get("x-conversation-id");
    let filename: string;
    try { filename = decodeURIComponent(request.headers.get("x-file-name") || ""); }
    catch { throw new HttpError(400, "Invalid filename."); }
    const { data: thread, error: threadError } = await scoped.rpc("market_thread", { conversation_id: conversation });
    if (threadError || thread?.conversation?.status !== "active") throw new HttpError(403, "Accepted conversation required.");
    const contentType = request.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    const declared = Number(request.headers.get("content-length"));
    if (declared > limit) throw new HttpError(413, "Maximum file size is 50 MB.");
    const reader = request.body?.getReader();
    if (!reader) throw new HttpError(400, "File required.");
    const chunks: Uint8Array[] = []; let size = 0;
    let expired = false;
    const deadline = setTimeout(() => { expired = true; void reader.cancel(); }, 105_000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (expired) throw new HttpError(408, "Upload timed out. Retry the file.");
        if (done) break;
        size += value.length;
        if (size > limit) throw new HttpError(413, "Maximum file size is 50 MB.");
        chunks.push(value);
      }
    } finally { clearTimeout(deadline); void reader.cancel(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    chunks.length = 0;
    const { data: record, error } = await scoped.rpc("market_prepare_attachment", { conversation_id: conversation, filename, content_type: contentType, byte_size: size });
    if (error || !record) throw new HttpError(400, "File type or conversation not allowed.");
    const { error: uploadError } = await admin.storage.from("market-files").upload(record.object_path, bytes, { contentType, upsert: false });
    if (uploadError) {
      await admin.rpc("market_attachment_scan_result", { attachment_id: record.id, clean: false });
      throw new HttpError(503, "Upload failed. Retry the file.");
    }
    const scanner = Deno.env.get("MARKET_FILE_SCANNER_URL");
    const secret = Deno.env.get("MARKET_FILE_SCANNER_SECRET");
    if (!scanner || !secret) return json(request, { ...record, message: "Quarantined: security scanning is not configured." }, 202);
    const endpoint = new URL(scanner);
    if (endpoint.protocol !== "https:") return json(request, { ...record, message: "Quarantined: scanner unavailable." }, 202);
    try {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map(v => v.toString(16).padStart(2, "0")).join("");
      const headers: Record<string,string> = { authorization: `Bearer ${secret}`, "content-type": contentType, "x-file-name": encodeURIComponent(filename), "x-content-sha256": digest };
      if (endpoint.hostname.endsWith(".run.app")) {
        const credentials = Deno.env.get("MARKET_FILE_SCANNER_GOOGLE_CREDENTIALS_JSON") || Deno.env.get("ONBOARDING_SCANNER_GOOGLE_CREDENTIALS_JSON");
        if (!credentials) throw new Error("Scanner identity unavailable");
        headers["X-Serverless-Authorization"] = `Bearer ${await scannerIdentityToken(credentials,endpoint)}`;
      }
      const response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(120000), headers, body: bytes });
      if (!response.ok) throw new Error("Scanner unavailable");
      const stream = response.body?.getReader();
      if (!stream) throw new Error("Missing scan result");
      const parts: Uint8Array[] = []; let length = 0;
      try { for (;;) { const { value, done } = await stream.read(); if (done) break; length += value.length; if (length > 2048) throw new Error("Invalid scan result"); parts.push(value); } }
      finally { void stream.cancel(); }
      const payload = new Uint8Array(length); let position = 0;
      for (const part of parts) { payload.set(part, position); position += part.length; }
      const verdict = JSON.parse(new TextDecoder().decode(payload));
      if (verdict.sha256 !== digest || !["clean", "rejected"].includes(verdict.status)) throw new Error("Invalid scan result");
      const clean = verdict.status === "clean";
      const { error: updateError } = await admin.rpc("market_attachment_scan_result", { attachment_id: record.id, clean });
      if (updateError) throw new Error("Scan result unavailable");
      return json(request, { id: record.id, status: clean ? "clean" : "rejected" });
    } catch { return json(request, { id: record.id, status: "quarantined", message: "Security scan pending; download remains disabled." }, 202); }
  } catch (error) {
    return json(request, { error: error instanceof HttpError ? error.message : "File service unavailable." }, error instanceof HttpError ? error.status : 503);
  }
});
