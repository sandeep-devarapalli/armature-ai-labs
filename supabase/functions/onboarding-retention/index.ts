import { assertJobSecret } from "../_shared/env.ts";
import { HttpError, json } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(request, { error: "method_not_allowed" }, 405);
  try {
    assertJobSecret(request, "ONBOARDING_RETENTION_JOB_SECRET");
    if (Deno.env.get("ONBOARDING_RETENTION_ENABLED") !== "true") return json(request, { error: "retention_disabled" }, 503);
    const client = adminClient();
    const { data: documents, error } = await client.rpc("list_due_onboarding_documents", { p_limit: 100 });
    if (error) throw new Error("Retention lookup failed");
    let deleted = 0;
    let failed = 0;
    for (const document of documents ?? []) {
      const { error: removeError } = await client.storage.from("onboarding-documents").remove([document.object_path]);
      if (removeError) { failed++; continue; }
      const { error: markError } = await client.rpc("mark_onboarding_document_deleted", { p_document_id: document.id });
      if (markError) { failed++; continue; }
      deleted++;
    }
    return json(request, { examined: documents?.length ?? 0, deleted, failed }, failed ? 503 : 200);
  } catch (error) {
    return json(request, { error: error instanceof HttpError ? error.message : "Retention run failed." }, error instanceof HttpError ? error.status : 500);
  }
});
