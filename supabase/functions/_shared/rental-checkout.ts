import { adminClient, authenticatedUser, requireStaff } from "./supabase.ts";
import { bodyBytes, RazorpayRequestError, validHmac } from "./razorpay-signature.ts";
import { liveWebhookSettings, orderIdPattern, paymentIdPattern, refundIdPattern, reconcileLivePayment, type Payment } from "./live-desk-payment.ts";
import { rentalProvider, rentalStagingBackend } from "./rental-payment.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const date = /^\d{4}-\d{2}-\d{2}$/;
const productCode = /^[a-z0-9-]{2,40}$/;
type Quote = {
  id: string; parent_quote_id?: string | null; product: string; kind?: string; productName?: string; unit: string; starts_on: string; ends_on: string;
  rent_paise: number; deposit_paise: number; amount_paise: number; agreement_hash: string;
  refund_account?: object; deposit_receipts?: object[];
  deposit_method?: "bank_transfer" | "razorpay"; payment_amount_paise?: number; deposit_status?: string;
  deposit_reference?: string; deposit_verified_reference?: string; deposit_verified_at?: string; payment_window_at?: string; bank_deposit_refunded_paise?: number; test_fixture?: boolean;
  prepared_at?: string | null; particulars?: object; operations?: object; bookingId?: string; rent_refunded?: number; deposit_refunded?: number; refunded_amount?: number; refund_allocation_pending?: boolean; policy_version: string; order_id: string | null; order_claimed_at: string | null;
  payment_id?: string | null; approved_at: string | null; document_id: string | null; status: string; review_reason?: string;
};
type BankInstructions = { bankName: string; accountName: string; accountNumber: string; ifsc: string; accountType?: string };
function bankInstructions(prefix: string): BankInstructions | null {
  try {
    const value = JSON.parse(Deno.env.get(prefix + "BANK_INSTRUCTIONS") ?? "null");
    if (!value || typeof value !== "object" || value.confirmedCompanyAccount !== true || typeof value.bankName !== "string" || value.bankName.length < 2 || value.bankName.length > 120
      || typeof value.accountName !== "string" || value.accountName.length < 2 || value.accountName.length > 160
      || typeof value.accountNumber !== "string" || !/^[0-9]{6,24}$/.test(value.accountNumber)
      || typeof value.ifsc !== "string" || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(value.ifsc)
      || (value.accountType !== undefined && !["Current", "Savings"].includes(value.accountType))) return null;
    return { bankName: value.bankName, accountName: value.accountName, accountNumber: value.accountNumber, ifsc: value.ifsc,
      ...(value.accountType ? { accountType: value.accountType } : {}) };
  } catch { return null; }
}
// DocuSign envelope IDs are UUIDs; PandaDoc document IDs keep the original pattern.
function documentIdPattern(q: Quote) {
  return (q.particulars as { signingProvider?: string } | undefined)?.signingProvider === "docusign"
    ? /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/ : /^[A-Za-z0-9_-]{8,80}$/;
}
// Reconciliation returns the raw RPC row; keep only presented fields.
function reconciled(q: Quote, result: unknown): Quote {
  return result && typeof result === "object" && "id" in result ? result as Quote : q;
}
class Rejected extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
// bankPrefix is set only for the member; staff responses never carry company bank details.
function present(q: Quote, bankPrefix: string | null = null) {
  return { quoteId: q.id, parentQuoteId: q.parent_quote_id, product: q.product, kind: q.kind, productName: q.productName, unit: q.unit, start: q.starts_on, end: q.ends_on,
    refundAccount: q.refund_account, depositReceipts: q.deposit_receipts ?? [],
    depositMethod: q.deposit_method ?? "razorpay", depositStatus: q.deposit_status,
    depositReference: q.deposit_reference, depositVerifiedReference: q.deposit_verified_reference, depositVerifiedAt: q.deposit_verified_at, paymentWindowAt: q.payment_window_at ?? q.approved_at,
    bankDepositRefundedPaise: q.bank_deposit_refunded_paise ?? 0, paymentAmountPaise: q.payment_amount_paise ?? q.amount_paise, testFixture: q.test_fixture === true,
    bankInstructions: bankPrefix && q.deposit_method === "bank_transfer" && !q.test_fixture && q.approved_at && q.document_id
      && !q.deposit_verified_at ? bankInstructions(bankPrefix) : null,
    rentPaise: q.rent_paise, depositPaise: q.deposit_paise, amountPaise: q.amount_paise,
    agreementHash: q.agreement_hash, policyVersion: q.policy_version, approvedAt: q.approved_at, preparedAt: q.prepared_at,
    hasAgreement: Boolean(q.document_id), agreementSigned: Boolean(q.approved_at && q.document_id),
    hasOrder: Boolean(q.order_id), orderPending: Boolean(q.order_claimed_at && !q.order_id),
    status: q.status, reviewReason: q.review_reason, bookingId: q.bookingId, rentRefunded: q.rent_refunded, depositRefunded: q.deposit_refunded, refundedAmount: q.refunded_amount, refundAllocationPending: q.refund_allocation_pending };
}
export async function handleRentalCheckout(request: Request, mode: "test" | "live"): Promise<Response> {
  const origin = mode === "live" ? "https://armatureailabs.com" : "https://booking-staging.armature-lab.pages.dev";
  const prefix = mode === "live" ? "LIVE_RENTAL_" : "RENTAL_TEST_";
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const reply = (value: object, status = 200) => Response.json(value, { status, headers });
  if (request.headers.get("origin") !== origin) return reply({ error: "checkout_origin_required" }, 403);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "method_not_allowed" }, 405);
  const provider = rentalProvider(mode);
  const signer = Deno.env.get(prefix + "PANDADOC_SIGNER")?.trim().toLowerCase() ?? "";
  const policyVersion = Deno.env.get(prefix + "POLICY_VERSION") ?? "";
  if (!provider || !signer || !/^[A-Za-z0-9._-]{4,80}$/.test(policyVersion)
    || (mode === "live" && !liveWebhookSettings(provider))) return reply({ error: "rental_not_configured" }, 503);
  try {
    const user = await authenticatedUser(request);
    let input;
    let completedPdf: File | null = null;
    try {
      if (request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
        const raw = await bodyBytes(request, 20 * 1024 * 1024 + 16384);
        const form = await new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: new Uint8Array(raw).buffer }).formData();
        const metadata = form.get("metadata");
        if (typeof metadata !== "string" || metadata.length > 8192) throw new Error("Invalid metadata");
        input = JSON.parse(metadata);
        const pdf = form.get("completedPdf");
        if (!pdf || typeof pdf === "string") throw new Error("Missing completed PDF");
        completedPdf = pdf;
      } else input = JSON.parse(new TextDecoder().decode(await bodyBytes(request, 8192)));
    }
    catch { throw new Rejected(400, "invalid_request"); }
    if (!input || typeof input !== "object" || typeof input.action !== "string") throw new Rejected(400, "invalid_request");
    const action = input.action;
    const recoveryActions = ["status", "verify", "list_own", "staff_queue", "manual_review", "recover_order", "handover", "return", "allocate_refund", "submit_deposit_reference", "verify_bank_deposit", "record_bank_deposit_refund", "save_refund_account", "get_refund_account", "verify_refund_account"];
    if (Deno.env.get(prefix + "CHECKOUT_ENABLED") !== "true" && !recoveryActions.includes(action)) throw new Rejected(503, "checkout_disabled");
    const client = adminClient();
    let member = user.id;
    const staff = ["staff_queue", "manual_review", "prepare", "renewal_quote", "approve_manual", "recover_order", "handover", "return", "allocate_refund", "verify_bank_deposit", "record_bank_deposit_refund", "get_refund_account", "verify_refund_account"].includes(action);
    if (staff) {
      if (user.claims.aal !== "aal2") throw new Rejected(403, "staff_mfa_required");
      await requireStaff(user.id, ["admin", "super_admin"]);
      if (action !== "staff_queue") {
        if (!uuid.test(input.memberId ?? "") || input.memberId === user.id) throw new Rejected(403, "independent_reviewer_required");
        member = input.memberId;
      }
    }
    const show = (q: Quote) => present(q, staff ? null : prefix);
    async function operation<T>(name: string, payload: object): Promise<T> {
      const { data, error } = await client.rpc("rental_checkout", { p_action: name, p_member: member, p_input: payload })
        .abortSignal(AbortSignal.timeout(10000));
      if (error?.code === "42501") throw new Rejected(403, "rental_state_rejected");
      if (["22023", "P0002", "23505", "23P01"].includes(error?.code ?? "")) throw new Rejected(409, "rental_state_rejected");
      if (error || !data) throw new Rejected(503, "rental_state_unavailable");
      return data as T;
    }
    if (action === "list_own" || action === "staff_queue") {
      const offset = input.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > 10000) throw new Rejected(400, "invalid_offset");
      const result = await operation<{ quotes: (Quote & { member_id: string })[] }>(action, { offset, ...(staff ? { reviewerId: user.id, reviewerAal: "aal2" } : {}) });
      return reply({ mode, quotes: result.quotes.map(q => ({ ...show(q), ...(staff ? { memberId: q.member_id } : {}) })) });
    }
    if (action === "availability" && input.product === undefined && input.start === undefined) return reply({ mode, ...await operation<object>("availability", {}) });
    if (action === "availability" || action === "quote") {
      // The catalogue decides which products exist and whether each needs an end date (cabins) or a unit (equipment).
      if (typeof input.product !== "string" || !productCode.test(input.product) || !date.test(input.start ?? "")
        || (input.end !== undefined && !date.test(input.end)) || (input.unit !== undefined && !["day", "week", "month"].includes(input.unit))
        || (input.end === undefined && input.unit === undefined)) throw new Rejected(400, "invalid_selection");
      const testFixture = input.testFixture === true;
      if (testFixture && (mode !== "test" || Deno.env.get("SUPABASE_URL") !== rentalStagingBackend
        || Deno.env.get("RENTAL_TEST_FIXTURE_ENABLED") !== "true" || Deno.env.get("RENTAL_TEST_FIXTURE_BUYER") !== user.id)) throw new Rejected(403, "test_fixture_not_allowed");
      const result = await operation<Quote>(action, { testFixture, product: input.product, unit: input.unit, start: input.start, end: input.end, partyType: input.partyType, policyVersion });
      return reply({ mode, ...(action === "quote" ? show(result) : result) });
    }
    if (action === "renewal_quote") {
      if (!uuid.test(input.parentQuoteId ?? "") || !date.test(input.start ?? "")) throw new Rejected(400, "invalid_renewal");
      return reply({ mode, ...show(await operation<Quote>("renewal_quote", { parentQuoteId: input.parentQuoteId,
        start: input.start, reviewerId: user.id, reviewerAal: "aal2", policyVersion })) });
    }
    if (!uuid.test(input.quoteId ?? "")) throw new Rejected(400, "invalid_quote");
    const q = await operation<Quote>("status", { quoteId: input.quoteId });
    if (q.test_fixture && (mode !== "test" || Deno.env.get("SUPABASE_URL") !== rentalStagingBackend
        || Deno.env.get("RENTAL_TEST_FIXTURE_ENABLED") !== "true" || Deno.env.get("RENTAL_TEST_FIXTURE_BUYER") !== member)) throw new Rejected(403, "test_fixture_not_allowed");
    const customer = staff ? (await client.auth.admin.getUserById(member)).data.user?.email : user.email;
    if (!customer || customer.toLowerCase() === signer) throw new Rejected(409, "separate_signers_required");
    if (["prepare", "approve_manual", "order"].includes(action) && q.policy_version !== policyVersion) throw new Rejected(409, "policy_version_changed");
    if (action === "manual_review") return reply({ mode, ...show(q), particulars: q.particulars, operations: q.operations, customerEmail: customer, staffEmail: signer });
    if (action === "prepare") {
      if (!input.particulars || typeof input.particulars !== "object" || Array.isArray(input.particulars)
        || ![undefined, "pandadoc", "docusign"].includes(input.particulars.signingProvider)) throw new Rejected(400, "invalid_particulars");
      const prepared = await operation<Quote>("prepare", { quoteId: q.id, reviewerId: user.id, reviewerAal: "aal2", particulars: input.particulars });
      return reply({ mode, ...show(prepared), particulars: prepared.particulars, operations: prepared.operations, customerEmail: customer, staffEmail: signer });
    }
    if (action === "approve_manual") {
      if (input.confirmed !== true || input.agreementHash !== q.agreement_hash
        || !documentIdPattern(q).test(input.documentId ?? "") || !completedPdf
        || completedPdf.type !== "application/pdf" || completedPdf.size < 5 || completedPdf.size > 20 * 1024 * 1024
        || await completedPdf.slice(0, 5).text() !== "%PDF-") throw new Rejected(400, "invalid_agreement_evidence");
      const bytes = await completedPdf.arrayBuffer();
      const evidenceSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
      const evidencePath = q.id + "/" + evidenceSha256 + ".pdf";
      const upload = await client.storage.from("rental-agreements").upload(evidencePath, bytes, { contentType: "application/pdf", upsert: false, cacheControl: "0" });
      if (upload.error && String((upload.error as { statusCode?: string }).statusCode) !== "409") throw new Rejected(503, "agreement_storage_unavailable");
      const result = await operation<Quote>("approve_manual", { quoteId: q.id, reviewerId: user.id, reviewerAal: "aal2",
        documentId: input.documentId, agreementHash: input.agreementHash, evidenceSha256, evidencePath,
        confirmedBothSigners: true });
      return reply({ mode, ...show(result) });
    }
    if (["save_refund_account", "get_refund_account", "verify_refund_account"].includes(action)) {
      if (q.deposit_method !== "bank_transfer") throw new Rejected(409, "bank_deposit_required");
      if (action === "save_refund_account") {
        if (input.ownershipConfirmed !== true || typeof input.accountName !== "string" || input.accountName.trim().length < 2 || input.accountName.trim().length > 160
          || typeof input.bankName !== "string" || input.bankName.trim().length < 2 || input.bankName.trim().length > 120
          || typeof input.accountNumber !== "string" || !/^[0-9]{6,24}$/.test(input.accountNumber)
          || typeof input.ifsc !== "string" || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(input.ifsc)) throw new Rejected(400, "invalid_refund_account");
      }
      if (action === "verify_refund_account" && (input.confirmed !== true || !Number.isSafeInteger(input.version) || input.version < 1
        || typeof input.evidence !== "string" || input.evidence.trim().length < 10 || input.evidence.trim().length > 1000)) throw new Rejected(400, "refund_account_review_required");
      const updated = await operation<Quote>(action, { quoteId: q.id,
        ...(action === "save_refund_account" ? { accountName: input.accountName.trim(), bankName: input.bankName.trim(),
          accountNumber: input.accountNumber, ifsc: input.ifsc, ownershipConfirmed: true } : { reviewerId: user.id, reviewerAal: "aal2" }),
        ...(action === "verify_refund_account" ? { version: input.version, confirmed: true, evidence: input.evidence.trim() } : {}) });
      return reply({ mode, ...show(updated) });
    }
    if (["submit_deposit_reference", "verify_bank_deposit", "record_bank_deposit_refund"].includes(action)) {
      if (q.deposit_method !== "bank_transfer" || typeof input.reference !== "string"
        || !/^[A-Za-z0-9._/-]{6,80}$/.test(input.reference)) throw new Rejected(400, "invalid_bank_reference");
      if (action !== "record_bank_deposit_refund" && !q.test_fixture && !bankInstructions(prefix)) throw new Rejected(503, "bank_instructions_not_configured");
      if (staff && (input.confirmed !== true || typeof input.evidence !== "string" || input.evidence.trim().length < 10
        || input.evidence.trim().length > 1000)) throw new Rejected(400, "bank_evidence_required");
      if (action === "record_bank_deposit_refund" && (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0 || !Number.isSafeInteger(input.refundAccountVersion) || input.refundAccountVersion < 1)) throw new Rejected(400, "invalid_bank_refund_amount");
      const updated = await operation<Quote>(action, { quoteId: q.id, reference: input.reference.toUpperCase(),
        ...(staff ? { reviewerId: user.id, reviewerAal: "aal2", confirmed: true, evidence: input.evidence.trim() } : {}),
        ...(action === "record_bank_deposit_refund" ? { amountPaise: input.amountPaise, refundAccountVersion: input.refundAccountVersion } : {}) });
      return reply({ mode, ...show(updated) });
    }
    if (action === "handover" || action === "return") {
      if (typeof input.evidence !== "string" || input.evidence.trim().length < 10 || input.evidence.length > 4000) throw new Rejected(400, "condition_evidence_required");
      const updated = await operation<Quote>(action, { quoteId: q.id, reviewerId: user.id, reviewerAal: "aal2", evidence: input.evidence.trim() });
      return reply({ mode, ...show(updated), particulars: updated.particulars, operations: updated.operations, customerEmail: customer, staffEmail: signer });
    }
    if (action === "allocate_refund") {
      if ((q.deposit_method === "bank_transfer" && input.depositPaise !== 0) || !q.payment_id || !refundIdPattern.test(input.refundId ?? "") || !Number.isSafeInteger(input.rentPaise)
        || !Number.isSafeInteger(input.depositPaise) || input.rentPaise < 0 || input.depositPaise < 0
        || input.rentPaise + input.depositPaise <= 0 || typeof input.reason !== "string" || input.reason.trim().length < 10 || input.reason.length > 1000) throw new Rejected(400, "invalid_refund_allocation");
      const refund = await provider.request<{ id: string; payment_id: string; amount: number; currency: string; status: string }>("/refunds/" + input.refundId);
      if (refund.id !== input.refundId || refund.payment_id !== q.payment_id || refund.currency !== "INR"
        || refund.status !== "processed" || refund.amount !== input.rentPaise + input.depositPaise) throw new Rejected(409, "refund_mismatch");
      const payment = await provider.request<Payment>("/payments/" + q.payment_id);
      if (payment.id !== q.payment_id) throw new Rejected(409, "payment_mismatch");
      await reconcileLivePayment(provider, payment, q, operation, refund.id);
      return reply({ mode, ...show(await operation<Quote>("allocate_refund", { quoteId: q.id, reviewerId: user.id,
        reviewerAal: "aal2", refundId: refund.id, rentPaise: input.rentPaise, depositPaise: input.depositPaise, reason: input.reason.trim() })) });
    }
    if (action === "recover_order") {
      if (!q.order_claimed_at || !q.approved_at || !q.document_id || !orderIdPattern.test(input.orderId ?? "")
        || (q.order_id && q.order_id !== input.orderId)) throw new Rejected(409, "order_recovery_unavailable");
      const order = await provider.request<{ id: string; receipt: string; amount: number; currency: string }>("/orders/" + input.orderId);
      if (order.id !== input.orderId || order.receipt !== q.id || order.amount !== (q.payment_amount_paise ?? q.amount_paise) || order.currency !== "INR") throw new Rejected(409, "provider_order_mismatch");
      return reply({ mode, ...show(await operation<Quote>("bind_order", { quoteId: q.id, orderId: order.id })), recovered: true });
    }
    if (action === "verify") {
      if (!q.order_id || input.razorpay_order_id !== q.order_id || !paymentIdPattern.test(input.razorpay_payment_id ?? "")
        || !await validHmac(provider.keySecret, new TextEncoder().encode(q.order_id + "|" + input.razorpay_payment_id), input.razorpay_signature)) throw new Rejected(400, "invalid_callback");
      const payment = await provider.request<Payment>("/payments/" + input.razorpay_payment_id);
      if (payment.id !== input.razorpay_payment_id) throw new Rejected(409, "payment_mismatch");
      return reply({ mode, ...show(reconciled(q, await reconcileLivePayment(provider, payment, q, operation))) });
    }
    if (action === "status") {
      if (q.order_id) {
        const payments = await provider.request<{ items: Payment[] }>("/orders/" + q.order_id + "/payments");
        if (!Array.isArray(payments.items)) throw new Rejected(502, "invalid_payments");
        const captured = payments.items.filter(p => p.captured && ["captured", "refunded"].includes(p.status));
        if (captured.length > 1) throw new Rejected(409, "multiple_payments_require_review");
        if (captured[0]) return reply({ mode, ...show(reconciled(q, await reconcileLivePayment(provider, captured[0], q, operation))) });
      }
      return reply({ mode, ...show(q) });
    }
    if (action !== "order" || input.acceptedPolicies !== true || input.policyVersion !== policyVersion || !q.approved_at || !q.document_id) throw new Rejected(409, "approved_agreement_required");
    if (["confirmed", "refunded", "needs_review", "superseded"].includes(q.status)) throw new Rejected(409, "checkout_already_resolved");
    if (q.deposit_method === "bank_transfer" && q.deposit_paise > 0
      && (!q.deposit_verified_at || (q.bank_deposit_refunded_paise ?? 0) > 0)) throw new Rejected(409, "bank_deposit_verification_required");
    const approved = Date.parse(q.payment_window_at ?? q.approved_at);
    if (!Number.isFinite(approved) || approved > Date.now() || Date.now() >= approved + 30 * 60_000) throw new Rejected(409, "signed_payment_window_expired");
    if (q.order_id) return reply({ mode, orderId: q.order_id, keyId: provider.keyId, amountPaise: q.payment_amount_paise ?? q.amount_paise, currency: "INR" });
    const claimed = await operation<Quote & { claimed: boolean }>("claim_order", { quoteId: q.id, policyVersion });
    if (claimed.claimed !== true) {
      if (claimed.order_id) return reply({ mode, orderId: claimed.order_id, keyId: provider.keyId, amountPaise: claimed.payment_amount_paise ?? claimed.amount_paise, currency: "INR" });
      throw new Rejected(409, "order_pending_staff_recovery");
    }
    const order = await provider.request<{ id: string; receipt: string; amount: number; currency: string }>("/orders", {
      amount: q.payment_amount_paise ?? q.amount_paise, currency: "INR", receipt: q.id, notes: { purpose: "armature_rental_" + mode, product: q.product },
    });
    if (!orderIdPattern.test(order.id) || order.receipt !== q.id || order.amount !== (q.payment_amount_paise ?? q.amount_paise) || order.currency !== "INR") throw new Rejected(502, "provider_order_mismatch");
    await operation<Quote>("bind_order", { quoteId: q.id, orderId: order.id });
    return reply({ mode, orderId: order.id, keyId: provider.keyId, amountPaise: q.payment_amount_paise ?? q.amount_paise, currency: "INR" });
  } catch (error) {
    if (error instanceof Rejected || error instanceof RazorpayRequestError) return reply({ error: error.code }, error.status);
    const status = (error as { status?: number })?.status;
    return reply({ error: status === 401 || status === 403 ? "checkout_account_required" : "rental_checkout_unavailable" }, status === 401 || status === 403 ? status : 503);
  }
}
