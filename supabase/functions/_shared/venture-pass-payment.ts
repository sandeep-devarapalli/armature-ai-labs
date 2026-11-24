import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requiredEnv } from "./env.ts";
import { adminClient, authenticatedUser, bearerToken } from "./supabase.ts";
import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { orderIdPattern, paymentIdPattern, productionBackend, type LiveRazorpay, type Payment } from "./live-desk-payment.ts";
import { rentalProvider, rentalStagingBackend } from "./rental-payment.ts";

const amount = 50000000;
const currency = "INR";
const purpose = "armature_venture_partner_pass";
const route = "/venture-partner-pass";
const minimumLinkWindowMs = 15 * 60 * 1000;
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const linkIdPattern = /^plink_[A-Za-z0-9]{1,80}$/;
const urlPattern = /^https:\/\/rzp\.io\/(?:i\/|l\/|rzp\/)?[A-Za-z0-9_-]{1,128}$/;

type Application = {
  id: string;
  firm_name: string;
  firm_type: string;
  website?: string | null;
  contact_name: string;
  details: string;
  email: string;
  status: string;
  created_at: string;
  payment_claimed_at?: string | null;
  payment_expires_at?: string | null;
  payment_link_id?: string | null;
  payment_url?: string | null;
  confirmed_at?: string | null;
  ends_at?: string | null;
  claimed?: boolean;
};

type PaymentLink = {
  id: string;
  reference_id: string;
  amount: number;
  currency: string;
  amount_paid: number;
  accept_partial: boolean;
  expire_by: number;
  short_url: string;
  status: string;
  updated_at?: number;
  order_id?: string;
  notes?: { purpose?: string };
  payments?: { payment_id: string; amount: number; status: string }[];
};

type Settings = { provider: LiveRazorpay; secret: string; accountId: string };
type Dependencies = {
  origin: () => string | null;
  settings: () => Settings | null;
  authenticate: (request: Request) => Promise<{ id: string; claims: { aal?: string } }>;
  review: (request: Request, id: string) => Promise<Application>;
  operate: (action: "lookup" | "prepare_link" | "accept_terms" | "attach" | "confirm" | "expire" | "release_unattempted", user: string | null, input: object) => Promise<Application | null>;
  now: () => number;
};

function backendMode(env: (key: string) => string | undefined) {
  const backend = env("SUPABASE_URL");
  return backend === productionBackend ? "live" : backend === rentalStagingBackend ? "test" : null;
}

export function venturePaymentSettings(env = (key: string) => Deno.env.get(key), fetcher = fetch): Settings | null {
  const mode = backendMode(env);
  if (!mode || env(mode === "live" ? "VENTURE_PASS_CHECKOUT_ENABLED" : "VENTURE_PASS_TEST_CHECKOUT_ENABLED") !== "true") return null;
  const provider = rentalProvider(mode, env, fetcher);
  const secret = env("VENTURE_PASS_WEBHOOK_SECRET") ?? "";
  const accountId = env("VENTURE_PASS_RAZORPAY_ACCOUNT_ID") ?? "";
  if (!provider || secret.length < 32 || secret === provider.keySecret || !/^acc_[A-Za-z0-9]{1,80}$/.test(accountId)) return null;
  return { provider, secret, accountId };
}

const defaults: Dependencies = {
  origin: () => {
    const mode = backendMode(name => Deno.env.get(name));
    return mode === "live" ? "https://armatureailabs.com" : mode === "test" ? "https://booking-staging.armature-lab.pages.dev" : null;
  },
  settings: venturePaymentSettings,
  authenticate: authenticatedUser,
  review: async (request, id) => {
    const userClient = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + bearerToken(request) } },
    });
    const { data, error } = await userClient.rpc("staff_review_venture_pass_application", {
      p_id: id, p_action: "approve",
    }).abortSignal(AbortSignal.timeout(10000));
    if (error?.code === "42501") throw new RazorpayRequestError(403, "staff_role_required");
    if (error && ["P0002", "22023", "23505"].includes(error.code)) throw new RazorpayRequestError(409, "venture_pass_state_rejected");
    if (error) throw new RazorpayRequestError(503, "venture_pass_state_unavailable");
    return mustHaveApplication(data as Application | null);
  },
  now: Date.now,
  operate: async (action, user, input) => {
    const { data, error } = await adminClient().rpc("venture_pass_payment", {
      p_action: action, p_user: user, p_input: input,
    }).abortSignal(AbortSignal.timeout(10000));
    if (error?.code === "42501") throw new RazorpayRequestError(403, "venture_pass_not_eligible");
    if (error && ["P0002", "22023", "23505"].includes(error.code)) throw new RazorpayRequestError(409, "venture_pass_state_rejected");
    if (error) throw new RazorpayRequestError(503, "venture_pass_state_unavailable");
    return data as Application | null;
  },
};

function mustHaveApplication(application: Application | null): Application {
  if (!application || !uuid.test(application.id)) throw new RazorpayRequestError(409, "venture_pass_application_unavailable");
  return application;
}

function expiry(application: Application) {
  const epochSeconds = Date.parse(application.payment_expires_at ?? "") / 1000;
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds <= 0) throw new RazorpayRequestError(409, "invalid_venture_pass_deadline");
  return epochSeconds;
}

async function parseJson(request: Request, limit: number) {
  const bytes = await bodyBytes(request, limit);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RazorpayRequestError(400, "invalid_payload");
  }
}

function checkedLink(link: PaymentLink, application: Application) {
  if (!link || !linkIdPattern.test(link.id) || link.reference_id !== application.id
    || (application.payment_link_id && link.id !== application.payment_link_id)
    || link.amount !== amount || link.currency !== currency || link.accept_partial !== false
    || link.expire_by !== expiry(application) || link.notes?.purpose !== purpose || !urlPattern.test(link.short_url)) {
    throw new RazorpayRequestError(409, "venture_pass_payment_link_mismatch");
  }
  return link;
}

async function recoverLink(provider: LiveRazorpay, application: Application) {
  const result = await provider.request<{ payment_links: PaymentLink[] }>(
    "/payment_links?reference_id=" + encodeURIComponent(application.id) + "&count=2",
  );
  if (!Array.isArray(result?.payment_links) || result.payment_links.length > 1) {
    throw new RazorpayRequestError(503, "venture_pass_link_recovery_required");
  }
  return result.payment_links[0] ?? null;
}

async function bindLink(deps: Dependencies, user: string | null, application: Application, link: PaymentLink) {
  checkedLink(link, application);
  if (application.payment_link_id) return application;
  return mustHaveApplication(await deps.operate("attach", user, {
    id: application.id, linkId: link.id, paymentUrl: link.short_url,
  }));
}

async function prepareLink(deps: Dependencies, provider: LiveRazorpay, origin: string, id: string) {
  let application = mustHaveApplication(await deps.operate("lookup", null, { id }));
  if (application.payment_link_id) return application;

  let link: PaymentLink | null;
  if (application.payment_claimed_at) {
    link = await recoverLink(provider, application);
  } else {
    if (expiry(application) * 1000 - deps.now() <= minimumLinkWindowMs) {
      throw new RazorpayRequestError(409, "venture_pass_link_window_too_short");
    }
    application = mustHaveApplication(await deps.operate("prepare_link", null, { id }));
    if (application.payment_link_id) return application;
    if (!application.claimed) {
      link = await recoverLink(provider, application);
    } else {
      if (expiry(application) * 1000 - deps.now() <= minimumLinkWindowMs) {
        await deps.operate("release_unattempted", null, { id, claimedAt: application.payment_claimed_at });
        throw new RazorpayRequestError(409, "venture_pass_link_window_too_short");
      }
      link = await provider.request<PaymentLink>("/payment_links", {
        amount, currency, accept_partial: false, expire_by: expiry(application),
        reference_id: application.id, description: "Armature AI Labs Venture Partner Pass",
        notify: { email: false, sms: false }, reminder_enable: false,
        notes: { purpose }, callback_url: origin + route + "?payment=return", callback_method: "get",
      });
    }
  }
  if (!link) throw new RazorpayRequestError(503, "venture_pass_link_recovery_pending");
  const bound = await bindLink(deps, null, application, link);
  return (await reconcile(deps, provider, bound, link, null)).application;
}

async function reconcile(
  deps: Dependencies, provider: LiveRazorpay, application: Application, link: PaymentLink,
  user: string | null, paidSnapshot?: { id: string; at: number },
) {
  checkedLink(link, application);
  if (link.status === "paid") {
    if (link.amount_paid !== amount || !link.order_id || !orderIdPattern.test(link.order_id)) {
      throw new RazorpayRequestError(409, "venture_pass_payment_mismatch");
    }
    const recorded = (Array.isArray(link.payments) ? link.payments : []).filter(p => p.status === "captured");
    const paymentId = paidSnapshot?.id ?? recorded[0]?.payment_id;
    if (recorded.length > 1 || (recorded.length === 1 && (recorded[0].payment_id !== paymentId || recorded[0].amount !== amount))) {
      throw new RazorpayRequestError(409, "venture_pass_payment_mismatch");
    }
    if (!paymentId || !paymentIdPattern.test(paymentId)) return { application, confirmationPending: true };
    const payment = await provider.request<Payment & { created_at?: number }>("/payments/" + paymentId);
    if (payment.id !== paymentId || payment.order_id !== link.order_id || payment.amount !== amount || payment.currency !== currency) {
      throw new RazorpayRequestError(409, "venture_pass_payment_mismatch");
    }
    if (payment.status === "authorized" && payment.captured !== true) {
      return { application, confirmationPending: true };
    }
    if (payment.status !== "captured" || payment.captured !== true || payment.amount_refunded !== 0) {
      throw new RazorpayRequestError(409, "venture_pass_payment_requires_review");
    }
    // Paid link updated_at records the paid transition; the signed paid event
    // preserves that timestamp even if the webhook is delivered after expiry.
    const paidAt = paidSnapshot?.at ?? link.updated_at;
    if (typeof paidAt !== "number" || !Number.isSafeInteger(paidAt) || paidAt < 1 || paidAt * 1000 > deps.now()
      || paidAt >= expiry(application) || (payment.created_at ?? 0) > paidAt) {
      throw new RazorpayRequestError(409, "venture_pass_payment_time_requires_review");
    }
    application = mustHaveApplication(await deps.operate("confirm", user, {
      id: application.id, linkId: link.id, paymentId, amount, currency, paidAt: new Date(paidAt * 1000).toISOString(),
    }));
  } else if (["expired", "cancelled"].includes(link.status) && link.amount_paid === 0 && deps.now() >= expiry(application) * 1000) {
    application = mustHaveApplication(await deps.operate("expire", user, { id: application.id, linkId: link.id }));
  }
  return { application, confirmationPending: false };
}

function publicApplication(row: Application | null) {
  if (!row) return null;
  return {
    id: row.id, firm_name: row.firm_name, firm_type: row.firm_type, website: row.website,
    contact_name: row.contact_name, details: row.details, email: row.email, status: row.status,
    created_at: row.created_at, payment_expires_at: row.payment_expires_at,
    confirmed_at: row.confirmed_at, ends_at: row.ends_at,
  };
}

function failure(error: unknown, reply: (body: object, status?: number) => Response, fallback: string) {
  if (error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
  const status = (error as { status?: number } | null)?.status;
  if (status === 401 || status === 403) return reply({ error: "checkout_account_required" }, status);
  return reply({ error: fallback }, 503);
}

export function createVentureCheckout(deps = defaults) {
  return async (request: Request) => {
    const origin = deps.origin();
    const headers = {
      "Cache-Control": "no-store",
      "Vary": "Origin",
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
    const reply = (body: object, status = 200) => Response.json(body, { status, headers });
    if (!origin || request.headers.get("origin") !== origin) return reply({ error: "checkout_origin_required" }, 403);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
    try {
      const user = await deps.authenticate(request);
      const input = await parseJson(request, 4096);
      if (!input || !["checkout", "refresh", "staff_approve"].includes(input.action)) return reply({ error: "invalid_request" }, 400);

      const settings = deps.settings();
      if (input.action === "staff_approve") {
        if (user.claims.aal !== "aal2") return reply({ error: "staff_mfa_required" }, 403);
        const id = input.applicationId;
        if (typeof id !== "string" || !uuid.test(id)) return reply({ error: "invalid_request" }, 400);
        if (!settings) return reply({ error: "venture_pass_checkout_disabled" }, 503);
        const approved = await deps.review(request, id);
        if (approved.id !== id) return reply({ error: "venture_pass_state_rejected" }, 409);
        const prepared = await prepareLink(deps, settings.provider, origin, id);
        return reply({ application: { ...publicApplication(prepared), preparing: !prepared.payment_link_id } });
      }

      let application = await deps.operate("lookup", user.id, {});
      const present = (confirmationPending = false, checkoutUrl?: string) => reply({
        application: publicApplication(application),
        checkoutAvailable: Boolean(settings && !confirmationPending && application?.status === "approved" &&
          application.payment_link_id && deps.now() < expiry(application) * 1000),
        confirmationPending,
        ...(checkoutUrl ? { checkoutUrl } : {}),
      });
      const checkout = input.action === "checkout";
      if (checkout && !settings) return reply({ error: "venture_pass_checkout_disabled" }, 503);
      if (checkout && input.acceptedTerms !== true) return reply({ error: "accepted_terms_required" }, 400);
      if (!settings || !application || application.status !== "approved") return present();

      const { provider } = settings;
      if (!application.payment_link_id) {
        application = { ...application, status: deps.now() < expiry(application) * 1000 ? "pending" : "expired" };
        return present();
      }
      if (!linkIdPattern.test(application.payment_link_id)) return reply({ error: "invalid_venture_pass_payment_link" }, 409);
      const link = await provider.request<PaymentLink>("/payment_links/" + application.payment_link_id);
      const result = await reconcile(deps, provider, application, link, user.id);
      application = result.application;
      if (checkout && link.status === "created" && application.status === "approved" && deps.now() < expiry(application) * 1000) {
        application = mustHaveApplication(await deps.operate("accept_terms", user.id, { id: application.id, acceptedTerms: true }));
        return present(false, deps.now() < expiry(application) * 1000 ? link.short_url : undefined);
      }
      return present(result.confirmationPending);
    } catch (error) {
      return failure(error, reply, "venture_pass_checkout_unavailable");
    }
  };
}

export function createVentureWebhook(deps = defaults) {
  return async (request: Request) => {
    const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
    const settings = deps.settings();
    if (!settings) return reply({ error: "webhook_not_configured" }, 503);
    try {
      const raw = await bodyBytes(request);
      if (!await validHmac(settings.secret, raw, request.headers.get("x-razorpay-signature"))) {
        return reply({ error: "invalid_signature" }, 401);
      }
      let event;
      try { event = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)); }
      catch { return reply({ error: "invalid_payload" }, 400); }
      if (event?.entity !== "event" || event.account_id !== settings.accountId) return reply({ error: "invalid_event_account" }, 403);
      if (!["payment_link.paid", "payment_link.expired", "payment_link.cancelled"].includes(event.event)) return reply({ received: true });
      const snapshot = event.payload?.payment_link?.entity;
      if (snapshot?.notes?.purpose !== purpose) return reply({ received: true });
      if (typeof snapshot.reference_id !== "string" || !uuid.test(snapshot.reference_id)
        || typeof snapshot.id !== "string" || !linkIdPattern.test(snapshot.id)) return reply({ error: "invalid_event_payment_link" }, 400);

      let application = await deps.operate("lookup", null, { id: snapshot.reference_id });
      if (!application) return reply({ received: true });
      const link = await settings.provider.request<PaymentLink>("/payment_links/" + snapshot.id);
      if (link?.id !== snapshot.id) return reply({ error: "venture_pass_payment_link_mismatch" }, 409);
      const paidEvent = event.event === "payment_link.paid";
      const paymentId = event.payload?.payment?.entity?.id;
      if (paidEvent && (typeof paymentId !== "string" || !paymentIdPattern.test(paymentId)
        || snapshot.status !== "paid" || !Number.isSafeInteger(snapshot.updated_at))) {
        return reply({ error: "invalid_event_payment" }, 400);
      }
      if (paidEvent && link.status !== "paid") return reply({ error: "venture_pass_payment_reconciliation_pending" }, 503);
      application = await bindLink(deps, null, application, link);
      const result = await reconcile(deps, settings.provider, application, link, null,
        paidEvent ? { id: paymentId, at: snapshot.updated_at } : undefined);
      if (result.confirmationPending) return reply({ error: "venture_pass_payment_reconciliation_pending" }, 503);
      return reply({ received: true });
    } catch (error) {
      return failure(error, reply, "webhook_reconciliation_unavailable");
    }
  };
}
