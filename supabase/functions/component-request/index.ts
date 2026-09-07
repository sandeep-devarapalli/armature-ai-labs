import { sha256Hex } from "../_shared/crypto.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { requiredEnv } from "../_shared/env.ts";
import {
  errorResponse,
  HttpError,
  json,
  parseJson,
} from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

interface SubmitBody {
  action: "submit";
  componentName: string;
  vendorUrl?: string;
  projectUseCase: string;
  quantity: number;
  urgency: "routine" | "soon" | "blocking";
  budgetBand: string;
  notes?: string;
  email: string;
  turnstileToken: string;
}

interface VerifyBody {
  action: "verify";
  requestId: string;
  token: string;
}

type RequestBody = SubmitBody | VerifyBody;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

function clean(value: string | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength);
}

function urgency(value: SubmitBody["urgency"]) {
  return {
    routine: "nice_to_have",
    soon: "soon",
    blocking: "project_blocking",
  }[value];
}

function budget(value: string) {
  if (value === "Under Rs 10,000") return "2500_to_10000";
  if (value === "Rs 10,000 - Rs 50,000") return "10000_to_50000";
  if (
    value === "Rs 50,000 - Rs 1,00,000" ||
    value === "Rs 1,00,000 - Rs 3,00,000" ||
    value === "Above Rs 3,00,000"
  ) {
    return "over_50000";
  }
  return "unknown";
}

async function verifyTurnstile(token: string, remoteIp: string) {
  if (!token) {
    throw new HttpError(400, "Complete the verification challenge.", "turnstile_required");
  }
  const body = new FormData();
  body.set("secret", requiredEnv("TURNSTILE_SECRET_KEY"));
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  const result = await response.json() as { success?: boolean };
  if (!response.ok || !result.success) {
    throw new HttpError(400, "Verification challenge failed.", "turnstile_failed");
  }
}

async function sendVerificationEmail(
  email: string,
  requestId: string,
  token: string,
) {
  const appOrigin = requiredEnv("APP_ORIGIN").replace(/\/+$/u, "");
  const url = new URL("/components/request", appOrigin);
  url.searchParams.set("request", requestId);
  url.searchParams.set("verify", token);
  const from = requiredEnv("COMPONENT_REQUEST_FROM_EMAIL");
  const subject = "Verify your Armature AI Labs component request";
  const text =
    `Open this one-use link within 24 hours to publish your component request:\n\n${url.toString()}`;
  const html =
    `<p>Open this one-use link within 24 hours to publish your Armature AI Labs component request.</p><p><a href="${url.toString()}">Verify component request</a></p>`;

  const provider = (
    Deno.env.get("COMPONENT_REQUEST_EMAIL_PROVIDER") ??
      (Deno.env.get("RESEND_API_KEY") ? "resend" : "postmark")
  ).toLowerCase();

  if (provider === "resend") {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [email], subject, text, html }),
    });
    if (!response.ok) {
      throw new Error(`Resend rejected verification email: ${response.status}`);
    }
    return;
  }

  if (provider === "postmark") {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "x-postmark-server-token": requiredEnv("POSTMARK_SERVER_TOKEN"),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        From: from,
        To: email,
        Subject: subject,
        TextBody: text,
        HtmlBody: html,
        MessageStream: "outbound",
      }),
    });
    if (!response.ok) {
      throw new Error(`Postmark rejected verification email: ${response.status}`);
    }
    return;
  }

  throw new Error(`Unsupported component request email provider: ${provider}`);
}

async function submit(request: Request, body: SubmitBody) {
  const email = clean(body.email, 320).toLowerCase();
  const componentName = clean(body.componentName, 160);
  const projectUseCase = clean(body.projectUseCase, 2000);
  const vendorUrl = clean(body.vendorUrl, 1000);
  const notes = clean(body.notes, 2000);
  const quantity = Number(body.quantity);

  if (!emailPattern.test(email)) {
    throw new HttpError(400, "Enter a valid email address.", "invalid_email");
  }
  if (componentName.length < 2 || projectUseCase.length < 10) {
    throw new HttpError(400, "Component name and use case are required.", "invalid_request");
  }
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
    throw new HttpError(400, "Quantity must be between 1 and 1000.", "invalid_quantity");
  }
  if (vendorUrl && !vendorUrl.startsWith("https://")) {
    throw new HttpError(400, "Vendor URL must use HTTPS.", "invalid_vendor_url");
  }

  const remoteIp = (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0] ??
    ""
  ).trim();
  await verifyTurnstile(body.turnstileToken, remoteIp);

  const client = adminClient();
  const keyHash = await sha256Hex(`${remoteIp || "unknown"}|${email}`);
  const { data: allowed, error: rateError } = await client.rpc(
    "consume_component_request_rate_limit",
    {
      p_key_hash: keyHash,
      p_limit: Number(Deno.env.get("COMPONENT_REQUEST_RATE_LIMIT") ?? "5"),
      p_window_seconds: 3600,
    },
  );
  if (rateError) throw rateError;
  if (!allowed) {
    throw new HttpError(429, "Too many requests. Try again later.", "rate_limited");
  }

  const { data, error } = await client.rpc("create_public_component_request", {
    p_requester_email: email,
    p_component_name: componentName,
    p_vendor_url: vendorUrl || null,
    p_project_use_case: projectUseCase,
    p_requested_quantity: quantity,
    p_urgency: urgency(body.urgency),
    p_budget_band: budget(body.budgetBand),
    p_notes: notes || null,
    p_requester_user_id: null,
  });
  if (error) throw error;
  const result = data as {
    request_id?: string;
    verification_token?: string;
  };
  if (!result.request_id || !result.verification_token) {
    throw new Error("Component request RPC returned an incomplete response.");
  }

  await sendVerificationEmail(email, result.request_id, result.verification_token);
  return json(request, { submitted: true }, 202);
}

async function verify(request: Request, body: VerifyBody) {
  const requestId = clean(body.requestId, 64);
  const token = clean(body.token, 256);
  if (!requestId || !token) {
    throw new HttpError(400, "Verification link is incomplete.", "invalid_verification");
  }
  const { error } = await adminClient().rpc("verify_component_request", {
    p_request_id: requestId,
    p_verification_token: token,
  });
  if (error) {
    throw new HttpError(
      400,
      "This verification link is expired, invalid, or already used.",
      "invalid_verification",
    );
  }
  return json(request, { verified: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(request),
    });
  }
  if (request.method !== "POST") {
    return json(request, { error: "method_not_allowed" }, 405);
  }
  try {
    const body = await parseJson<RequestBody>(await request.text());
    if (body.action === "submit") return await submit(request, body);
    if (body.action === "verify") return await verify(request, body);
    throw new HttpError(400, "Unknown component request action.", "invalid_action");
  } catch (error) {
    return errorResponse(request, error);
  }
});
