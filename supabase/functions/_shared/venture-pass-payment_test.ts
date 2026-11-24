import { createVentureCheckout, createVentureWebhook, venturePaymentSettings } from "./venture-pass-payment.ts";
import { hmacHex } from "./razorpay-signature.ts";
import { productionBackend } from "./live-desk-payment.ts";
import { rentalStagingBackend } from "./rental-payment.ts";

const origin = "https://booking-staging.armature-lab.pages.dev";
const id = "a1111111-2222-3333-4444-555555555555";
const owner = "a3333333-2222-3333-4444-555555555555";
const reviewer = "a4444444-2222-3333-4444-555555555555";
const secret = "synthetic-venture-webhook-secret-32";
const accountId = "acc_Synthetic";
const amount = 50000000;
const approveTime = 1800000000;
const deadline = approveTime + 3600;
const linkId = "plink_Synthetic";
const shortUrl = "https://rzp.io/rzp/Synthetic";
const paymentId = "pay_Synthetic";
const orderId = "order_Synthetic";
const purpose = "armature_venture_partner_pass";
const iso = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();
const approve = { action: "staff_approve", applicationId: id };
const open = { action: "checkout", acceptedTerms: true, amount: 1000 };

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error("Unexpected result: " + JSON.stringify(actual));
}

function fixture() {
  let now = (approveTime + 35) * 1000;
  let enabled = true, anonymous = false, ambiguous = false, providerCreated = false, reviewerAllowed = true;
  let advanceOnClaim: number | null = null;
  let application = {
    id, email: "test@example.invalid", firm_name: "Test Ventures", contact_name: "Tester", created_at: iso(approveTime),
    firm_type: "independent_vc", details: "Application", status: "approved", payment_expires_at: iso(deadline),
    payment_link_id: null as string | null, payment_url: null as string | null, payment_claimed_at: null as string | null,
    confirmed_at: null as string | null, ends_at: null as string | null,
  };
  const link = {
    id: linkId, reference_id: id, amount, amount_paid: 0, currency: "INR", order_id: orderId, notes: { purpose },
    accept_partial: false, expire_by: deadline, short_url: shortUrl, status: "created", updated_at: approveTime + 5,
    payments: [] as { amount: number; payment_id: string; status: string }[],
  };
  const payment = { id: paymentId, amount, order_id: orderId, currency: "INR", status: "captured",
    captured: true, amount_refunded: 0, created_at: approveTime + 4 };
  const calls: { path: string; body?: object }[] = [];
  const operations: { action: string; user: string | null; input: object }[] = [];
  const reviews: string[] = [];
  const checkout = createVentureCheckout(deps());
  const webhook = createVentureWebhook(deps());

  function deps() {
    return {
      origin: () => origin,
      settings: () => enabled ? { secret, accountId, provider: {
        keyId: "rzp_test_Synthetic", keySecret: "synthetic-key-secret", request,
      } } : null,
      authenticate: (request: Request) => anonymous ? Promise.reject({ status: 401 }) : Promise.resolve(
        request.headers.get("X-Test-Actor") === "staff" ? { id: reviewer, claims: { aal: "aal2" } } : { id: owner, claims: { aal: "aal1" } },
      ),
      review: (_request: Request, applicationId: string) => {
        reviews.push(applicationId);
        if (!reviewerAllowed) return Promise.reject({ status: 403 });
        if (applicationId !== id) throw new Error("Wrong application");
        if (application.status === "pending") application = { ...application, status: "approved" };
        return Promise.resolve(application);
      },
      now: () => now,
      operate: (_action: string, user: string | null, input: object) => operate(_action, user, input as Record<string, unknown>),
    };
  }

  async function request<T>(path: string, body?: object): Promise<T> {
    calls.push({ path, body });
    if (path === "/payment_links") {
      if (providerCreated) throw new Error("Duplicate create");
      providerCreated = true;
      if (ambiguous) throw new Error("Timed out after create");
      return link as T;
    }
    if (path.startsWith("/payment_links?")) return { payment_links: providerCreated ? [link] : [] } as T;
    if (path === "/payment_links/" + linkId) return link as T;
    if (path === "/payments/" + paymentId) return payment as T;
    throw new Error("Unexpected provider request " + path);
  }

  async function operate(action: string, user: string | null, input: Record<string, unknown>) {
    operations.push({ action, user, input });
    await Promise.resolve();
    if (action === "lookup") return application;
    if (action === "prepare_link") {
      if (user !== null || input.id !== id) throw new Error("Unscoped link preparation");
      const claimed = !application.payment_claimed_at;
      application = { ...application, payment_claimed_at: application.payment_claimed_at ?? new Date(now).toISOString() };
      if (advanceOnClaim !== null) now = advanceOnClaim * 1000;
      return { ...application, claimed };
    }
    if (action === "accept_terms" && (input.acceptedTerms !== true || input.id !== id || user !== owner))
      throw new Error("Missing terms or ownership");
    if (action === "attach") application = { ...application, payment_link_id: linkId, payment_url: shortUrl };
    if (action === "confirm") {
      if (input.id !== id || input.linkId !== application.payment_link_id || input.paymentId !== paymentId) throw new Error("Invalid settlement");
      application = { ...application, status: "confirmed", confirmed_at: String(input.paidAt) };
    }
    if (action === "expire") application = { ...application, status: "expired" };
    if (action === "release_unattempted") application = { ...application,
      status: now >= deadline * 1000 ? "expired" : application.status, payment_claimed_at: null };
    return application;
  }

  function post(input: object, from = origin, actor = "buyer") {
    return checkout(new Request("https://edge.example/checkout", { method: "POST", headers: { Origin: from, "X-Test-Actor": actor }, body: JSON.stringify(input) }));
  }

  async function event(action: string, sign = true, account = accountId) {
    const body = JSON.stringify({ entity: "event", account_id: account, event: action,
      payload: { payment_link: { entity: link }, payment: { entity: { id: paymentId } } } });
    const signature = sign ? await hmacHex(secret, new TextEncoder().encode(body)) : "bad";
    return webhook(new Request("https://edge.example/webhook", { method: "POST",
      headers: { "x-razorpay-signature": signature }, body,
    }));
  }

  return { calls, operations, post, event, link, payment, reviews,
    approve: () => post(approve, origin, "staff"),
    setNow: (time: number) => { now = time * 1000; },
    setStatus: (status: string) => { application = { ...application, status }; },
    setAmbiguous: () => { ambiguous = true; },
    advanceOnClaim: (time: number) => { advanceOnClaim = time; },
    denyReviewer: () => { reviewerAllowed = false; },
    setAnonymous: () => { anonymous = true; },
    disable: () => { enabled = false; },
    paid: (time: number) => Object.assign(link, { status: "paid", amount_paid: amount, updated_at: time,
      payments: [{ amount, payment_id: paymentId, status: "captured" }] }),
  };
}

Deno.test("Venture checkout denies foreign origins, anonymous or unconsented requests and disabled or unapproved sales", async () => {
  const s = fixture();
  equal((await s.post(open, "https://foreign.example")).status, 403);
  equal((await s.post({ action: "checkout" })).status, 400);
  s.setStatus("pending");
  const pending = await (await s.post(open)).json();
  equal(pending.application.status, "pending");
  equal(pending.checkoutAvailable, false);
  s.disable();
  equal((await s.post(open)).status, 503);
  s.setAnonymous();
  equal((await s.post({ action: "refresh" })).status, 401);
  equal(s.calls, []);
});

Deno.test("Venture staff approval requires AAL2 and admin access before it reserves or prepares a link", async () => {
  const s = fixture();
  equal((await s.post(approve)).status, 403);
  equal(s.reviews, []);
  s.denyReviewer();
  equal((await s.approve()).status, 403);
  equal(s.reviews, [id]);
  equal(s.operations, []);
  equal(s.calls, []);
});

Deno.test("Venture staff approval prepares one fixed-expiry link and retries recover the same link", async () => {
  const s = fixture();
  s.setAmbiguous();
  equal((await s.approve()).status, 503);
  const second = await (await s.approve()).json();
  equal(second.application.status, "approved");
  equal(second.application.preparing, false);
  equal(second.checkoutUrl, undefined);
  equal(second.application.payment_url, undefined);
  equal(s.calls.filter(call => call.body).length, 1);
  equal(s.calls[0].body, {
    amount, currency: "INR", accept_partial: false, expire_by: deadline, reference_id: id,
    description: "Armature AI Labs Venture Partner Pass", notify: { email: false, sms: false }, reminder_enable: false,
    notes: { purpose }, callback_url: origin + "/venture-partner-pass?payment=return", callback_method: "get",
  });
  equal(s.calls[1].path, "/payment_links?reference_id=" + id + "&count=2");
  equal((await s.approve()).status, 200);
  equal(s.calls.length, 2);
  equal((await (await s.post(open)).json()).checkoutUrl, shortUrl);
  s.setNow(deadline);
  const expired = await (await s.post(open)).json();
  equal(expired.checkoutAvailable, false);
  equal(expired.checkoutUrl, undefined);
  equal(s.calls.filter(call => call.body).length, 1);
});

Deno.test("Venture buyer can start in the final 15 minutes with an already-prepared checkout and accepted terms", async () => {
  const s = fixture();
  const pending = await (await s.post(open)).json();
  equal(pending.application.status, "pending");
  equal(pending.checkoutAvailable, false);
  equal(pending.checkoutUrl, undefined);
  equal(s.calls, []);
  equal((await s.approve()).status, 200);
  s.setNow(deadline - 10);
  const ready = await (await s.post(open)).json();
  equal(ready.checkoutUrl, shortUrl);
  equal(ready.checkoutAvailable, true);
  equal(s.operations.find(call => call.action === "accept_terms"), {
    action: "accept_terms", user: owner, input: { id, acceptedTerms: true },
  });
  equal(s.calls.filter(call => call.body).length, 1);
});

Deno.test("Venture webhook reconciles a captured in-window payment even after delivery delay", async () => {
  const s = fixture();
  equal((await s.approve()).status, 200);
  equal((await s.post(open)).status, 200);
  s.paid(deadline - 1);
  s.setNow(deadline + 22);
  equal((await s.event("payment_link.paid", false)).status, 401);
  equal((await s.event("payment_link.paid", true, "acc_Other")).status, 403);
  equal(s.operations.some(call => call.action === "confirm"), false);
  equal((await s.event("payment_link.paid")).status, 200);
  equal(s.operations.find(call => call.action === "confirm"), {
    action: "confirm", user: null, input: { id, linkId, paymentId, amount, currency: "INR", paidAt: iso(deadline - 1) },
  });
  equal((await (await s.post({ action: "refresh" })).json()).application.status, "confirmed");
});

Deno.test("Venture webhook rejects a mismatched payment and one captured at the deadline", async () => {
  const s = fixture();
  await s.approve();
  await s.post(open);
  s.paid(deadline - 1);
  s.setNow(deadline + 5);
  s.payment.amount = 123;
  equal((await s.event("payment_link.paid")).status, 409);
  s.payment.amount = amount;
  s.paid(deadline);
  equal((await s.event("payment_link.paid")).status, 409);
  equal(s.operations.some(call => call.action === "confirm"), false);
});

Deno.test("Venture release requires provider-proven expiry of a recovered unpaid link", async () => {
  const s = fixture();
  s.setAmbiguous();
  equal((await s.approve()).status, 503);
  s.link.status = "expired";
  s.setNow(deadline + 22);
  const result = await (await s.approve()).json();
  equal(result.application.status, "expired");
  equal(result.checkoutUrl, undefined);
  equal(s.operations.filter(call => ["attach", "expire"].includes(call.action)).map(call => call.action), ["attach", "expire"]);
});

Deno.test("Venture Razorpay mode requires the project pin and its matching test/live gates and key", () => {
  const env: Record<string, string> = {
    SUPABASE_URL: rentalStagingBackend,
    VENTURE_PASS_TEST_CHECKOUT_ENABLED: "true",
    VENTURE_PASS_RAZORPAY_ACCOUNT_ID: accountId,
    VENTURE_PASS_WEBHOOK_SECRET: secret,
    RENTAL_TEST_RAZORPAY_KEY_ID: "rzp_test_synthetic",
    RENTAL_TEST_RAZORPAY_KEY_SECRET: "synthetic-key-secret",
  };
  const config = () => venturePaymentSettings(key => env[key]);
  equal(config()?.provider.keyId, "rzp_test_synthetic");
  env.SUPABASE_URL = productionBackend;
  equal(config(), null);
  env.SUPABASE_URL = "http://localhost:54321";
  equal(config(), null);
});

Deno.test("Venture return refresh confirms only provider-verified capture, ignoring callback claims", async () => {
  const s = fixture();
  await s.approve();
  await s.post(open);
  const forged = await (await s.post({ action: "refresh", paid: true, amount, paymentId })).json();
  equal(forged.application.status, "approved");
  equal(s.operations.some(call => call.action === "confirm"), false);
  s.paid(approveTime + 12);
  s.payment.captured = false;
  s.payment.status = "authorized";
  const pending = await (await s.post({ action: "refresh" })).json();
  equal(pending.confirmationPending, true);
  equal(pending.application.status, "approved");
  s.payment.captured = true;
  s.payment.status = "captured";
  equal((await (await s.post({ action: "refresh" })).json()).application.status, "confirmed");
});

Deno.test("Venture staff preparation frees an unattempted claim if the 15-minute threshold passes", async () => {
  const s = fixture();
  s.advanceOnClaim(deadline - 900);
  const response = await s.approve();
  equal(response.status, 409);
  equal(await response.json(), { error: "venture_pass_link_window_too_short" });
  equal(s.calls, []);
  equal(s.operations.find(call => call.action === "release_unattempted"), {
    action: "release_unattempted", user: null, input: { id, claimedAt: iso(approveTime + 35) },
  });
});
