import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MfaPanel } from "../pages/MemberPages";
import { DepositReceipts } from "./RentalCheckout";

import { rentalMode, rentalMoney, type RentalQuote, type RentalRefundAccount } from "../lib/rental-checkout";

const providerName = (review: { particulars?: Record<string, unknown> }) => review.particulars?.signingProvider === "docusign" ? "DocuSign" : "PandaDoc";
type Review = RentalQuote & { particulars?: Record<string, unknown>; bookingId?: string | null; parentQuoteId?: string | null;
  operations?: { handed_over_at?: string | null; returned_at?: string | null } | null };
const statusLabels: Record<string, string> = { awaiting_staff: "Awaiting staff review", awaiting_signatures: "Awaiting signatures", approved: "Approved for payment", awaiting_payment: "Awaiting payment", awaiting_deposit: "Awaiting bank deposit verification", confirmed: "Booking confirmed", refunded: "Fully refunded", needs_review: "Payment needs staff review" };
const reference = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

export function RentalAgreementReview({ client, actorId, memberId, blocked, onBusyChange }: {
  client: SupabaseClient; actorId: string; memberId: string; blocked?: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [requests, setRequests] = useState<(Review & { memberId: string })[]>([]), [queueLoaded, setQueueLoaded] = useState(false);
  const [offset, setOffset] = useState(0), [moreRequests, setMoreRequests] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [privateRefundAccount, setPrivateRefundAccount] = useState<(RentalRefundAccount & { accountName: string; ifsc: string; accountNumber: string }) | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(false), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; if (working.current) onBusyChange(false); }; }, [onBusyChange]);
  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    if (working.current || blocked || actorId === memberId) return;
    const fields = new FormData(event.currentTarget);
    working.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      const [session, assurance] = await Promise.all([client.auth.getSession(), client.auth.mfa.getAuthenticatorAssuranceLevel()]);
      if (!active.current) return;
      if (session.error || session.data.session?.user.id !== actorId || !session.data.session.access_token
        || assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("Verify the current Admin session with MFA, then reopen this member.");
      const quoteId = String(fields.get("quoteId") ?? review?.quoteId ?? "").trim().toLowerCase();
      let body: object | FormData = action === "staff_queue" ? { action, offset: Number(fields.get("offset") ?? 0) } : { action, memberId, quoteId };
      if (action === "prepare" && review) {
        const cabin = review.product === "cabin101";
        const particulars = { termsVersion: review.policyVersion, availabilityConfirmed: fields.get("available") === "on",
          signingProvider: fields.get("signingProvider") === "docusign" ? "docusign" : "pandadoc",
          stampRequired: cabin && fields.get("stampRequired") === "yes", stampDecisionReason: String(fields.get("stampReason") ?? "").trim(),
          recordsPolicyReference: String(fields.get("recordsPolicyReference") ?? "").trim(),
          ...(!cabin ? { unusedDepositTerms: String(fields.get("unusedDepositTerms") ?? "").trim() } : {}),
          ...(cabin ? { capacity: Number(fields.get("capacity")), accessStart: fields.get("accessStart"), accessEnd: fields.get("accessEnd"),
            includedFacilities: String(fields.get("facilities") ?? "").trim(),
            permittedUsers: String(fields.get("users") ?? "").split("\n").map(value => value.trim()).filter(Boolean),
            stampReference: String(fields.get("stampReference") ?? "").trim() } : {}) };
        body = { ...body, particulars };
      } else if (action === "approve_manual" && review) {
        const pdf = fields.get("completedPdf");
        if (!(pdf instanceof File) || pdf.size < 5 || pdf.size > 20 * 1024 * 1024 || await pdf.slice(0, 5).text() !== "%PDF-") {
          throw new Error("Choose the completed " + providerName(review) + " PDF with both signatures and certificate, up to 20 MB.");
        }
        if (fields.get("confirmed") !== "on" || fields.get("agreementHash") !== review.agreementHash) throw new Error("Confirm both signers and match the signed booking fingerprint exactly.");
        const upload = new FormData();
        upload.set("metadata", JSON.stringify({ ...body, documentId: String(fields.get("documentId") ?? "").trim(), agreementHash: review.agreementHash, confirmed: true }));
        upload.set("completedPdf", pdf); body = upload;
      } else if (action === "recover_order") body = { ...body, orderId: String(fields.get("orderId") ?? "").trim() };
      else if (action === "handover" || action === "return") body = { ...body, evidence: String(fields.get("evidence") ?? "").trim() };
      else if (action === "renewal_quote") {
        if (fields.get("unchanged") !== "on") throw new Error("Confirm the original agreement terms are unchanged.");
        body = { ...body, parentQuoteId: quoteId, start: fields.get("start"), confirmed: true };
      } else if (action === "verify_refund_account") {
        if (!privateRefundAccount || fields.get("confirmed") !== "on") throw new Error("Open and check the current refund account before verifying it.");
        body = { ...body, version: privateRefundAccount.version, confirmed: true, evidence: String(fields.get("evidence") ?? "").trim() };
      } else if (action === "verify_bank_deposit" || action === "record_bank_deposit_refund") {
        if (fields.get("confirmed") !== "on") throw new Error("Confirm the bank statement check before recording the transfer.");
        body = { ...body, reference: String(fields.get("reference") ?? "").trim(), evidence: String(fields.get("evidence") ?? "").trim(), confirmed: true,
          ...(action === "record_bank_deposit_refund" ? { amountPaise: Math.round(Number(fields.get("amount")) * 100), refundAccountVersion: review?.refundAccount?.version } : {}) };
      } else if (action === "allocate_refund") {
        const rentPaise = Math.round(Number(fields.get("rent")) * 100), depositPaise = Math.round(Number(fields.get("deposit") ?? 0) * 100);
        if (![rentPaise, depositPaise].every(value => Number.isSafeInteger(value) && value >= 0) || rentPaise + depositPaise <= 0) throw new Error("Enter the positive processed refund split in rupees.");
        body = { ...body, refundId: String(fields.get("refundId") ?? "").trim(), rentPaise, depositPaise, reason: String(fields.get("reason") ?? "").trim() };
      }
      const { data, error: failure } = await client.functions.invoke(rentalMode === "test" ? "test-rental-checkout" : "rental-checkout", {
        body, headers: { Authorization: `Bearer ${session.data.session.access_token}` },
      });
      if (!active.current) return;
      if (action === "staff_queue") {
        if (failure || data?.mode !== rentalMode || !Array.isArray(data.quotes)) throw new Error("Rental requests could not be loaded.");
        setRequests(data.quotes.filter((item: { memberId?: string }) => item.memberId === memberId));
        setOffset(Number(fields.get("offset") ?? 0)); setMoreRequests(data.quotes.length === 50); setQueueLoaded(true); return;
      }
      if (failure || data?.mode !== rentalMode || (action !== "renewal_quote" && data?.quoteId !== quoteId) || (action === "renewal_quote" && (!data?.quoteId || data.quoteId === quoteId))) throw new Error("The action could not be confirmed. Refresh the agreement status before retrying.");
      if (action === "get_refund_account") {
        if (!data.refundAccount?.accountNumber || !Number.isSafeInteger(data.refundAccount.version)) throw new Error("The private refund account could not be loaded.");
        setPrivateRefundAccount(data.refundAccount); return;
      }
      setPrivateRefundAccount(null);
      if (action === "approve_manual" && !data.agreementSigned) throw new Error("Approval was not confirmed. Refresh the agreement status.");
      setReview(current => action === "renewal_quote" ? { ...data, customerEmail: current?.customerEmail, staffEmail: current?.staffEmail } : current?.quoteId === data.quoteId ? { ...current, ...data } : data);
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "The action could not be completed."); }
    finally { working.current = false; if (active.current) { setBusy(false); onBusyChange(false); } }
  }
  const disabled = busy || blocked || actorId === memberId;
  return <details className="member-confirm"><summary>Review a cabin or equipment agreement</summary>
    <p>Use a separate Admin account and verify this session before reviewing the customer's agreement.</p><MfaPanel mode="supabase" />
    {actorId === memberId && <p role="status">Another Admin must review your own booking.</p>}
    <form onSubmit={event => void submit(event, "staff_queue")}><input name="offset" type="hidden" value="0" /><button className="button secondary" disabled={disabled}>Load this member's rental requests</button></form>
    {queueLoaded && <div aria-label="Member rental requests">
      {requests.length === 0 && <p>No requests for this member in this batch. Use the next batch if available, or look up a reference.</p>}
      {requests.map(item => <form key={item.quoteId} onSubmit={event => void submit(event, "manual_review")}><input name="quoteId" type="hidden" value={item.quoteId} />
        <button className="button secondary" disabled={disabled}>{item.product === "cabin101" ? "Cabin 101" : "Hiwonder kit"} · {item.start} · {statusLabels[item.status] ?? "Review required"}</button></form>)}
      {offset > 0 && <form onSubmit={event => void submit(event, "staff_queue")}><input name="offset" type="hidden" value={Math.max(0, offset - 50)} /><button className="button secondary" disabled={disabled}>Previous request batch</button></form>}
      {moreRequests && <form onSubmit={event => void submit(event, "staff_queue")}><input name="offset" type="hidden" value={offset + 50} /><button className="button secondary" disabled={disabled}>Next request batch</button></form>}
    </div>}
    {!review ? <form className="ol-form" onSubmit={event => void submit(event, "manual_review")}>
      <label>Rental agreement reference<input name="quoteId" required pattern={reference} disabled={disabled} /></label>
      <button className="button secondary" disabled={disabled}>Find rental agreement</button>
    </form> : <>
      <h3>{review.product === "cabin101" ? "Cabin 101" : "Hiwonder kit"}</h3><p>{review.start} to {review.end}</p>
      {review.testFixture && <p role="status">TEST SPECIMEN: ₹50 rent and ₹100 simulated bank deposit. No real transfer or rental.</p>}
      <p>Rent {rentalMoney(review.rentPaise)} · Deposit {rentalMoney(review.depositPaise)} · Total {rentalMoney(review.amountPaise)}. No GST added.</p>
      {review.depositMethod === "bank_transfer" && <p>Razorpay collects {rentalMoney(review.paymentAmountPaise ?? review.rentPaise)} rent only. The deposit is recorded separately as a refundable bank-transfer liability.</p>}
      <p>Customer: {review.customerEmail}. Armature signer: {review.staffEmail}.</p><p>Status: <strong>{statusLabels[review.status] ?? "Review required"}</strong></p>
      <p>Quote fingerprint: <code style={{ overflowWrap: "anywhere" }}>{review.agreementHash}</code></p>
      {!review.agreementSigned && !review.hasOrder && !review.orderPending && <>
        <h4>1. Confirm the final draft and particulars</h4>
        <p>Resolve corrections with the customer first. Complete any required stamping before signing. Changing these particulars changes the fingerprint and requires a fresh final draft.</p>
        <form key={review.agreementHash} className="ol-form" onSubmit={event => void submit(event, "prepare")}>
          <label><input name="available" type="checkbox" required disabled={disabled} /> I confirmed availability and the final terms with the customer.</label>
          {review.product === "cabin101" && <>
            <label>Confirmed maximum occupants<input name="capacity" type="number" min="1" max="100" required disabled={disabled} defaultValue={String(review.particulars?.capacity ?? "")} /></label>
            <label>Daily access starts<input name="accessStart" type="time" required disabled={disabled} defaultValue={String(review.particulars?.accessStart ?? "")} /></label>
            <label>Daily access ends<input name="accessEnd" type="time" required disabled={disabled} defaultValue={String(review.particulars?.accessEnd ?? "")} /></label>
            <label>Included facilities and keys<textarea name="facilities" minLength={3} required disabled={disabled} defaultValue={String(review.particulars?.includedFacilities ?? "")} /></label>
            <label>Permitted users, one name per line<textarea name="users" required disabled={disabled} defaultValue={Array.isArray(review.particulars?.permittedUsers) ? review.particulars.permittedUsers.join("\n") : ""} /></label>
            <p>Named users do not automatically receive paid membership or access.</p>
            <label>Stamping decision<select name="stampRequired" required disabled={disabled} defaultValue=""><option value="" disabled>Choose reviewed treatment</option><option value="yes">Required, completed manually</option><option value="no">Not required under reviewed treatment</option></select></label>
            <label>Stamp-paper reference, if required<input name="stampReference" disabled={disabled} /></label>
          </>}
          {review.product === "hiwonder" && <><p>The current kit uses the approved no-stamping exception. Confirm its condition, contents and the customer's paid workspace coverage.</p>
            <label>Reviewed unused-deposit terms<textarea name="unusedDepositTerms" required minLength={10} maxLength={1000} disabled={disabled} defaultValue={String(review.particulars?.unusedDepositTerms ?? "")} /></label>
            <p>Record the manually reviewed decision if the kit is never handed over. Do not assume an automatic refund or forfeiture. Confirm these terms with the customer before the final signing version.</p></>}
          <label>Executed-agreement records policy reference<textarea name="recordsPolicyReference" required minLength={10} maxLength={1000} disabled={disabled} defaultValue={String(review.particulars?.recordsPolicyReference ?? "")} /></label>
          <p>The agreement includes PAN during the contract. Reference the reviewed storage, access and post-contract retention decision; do not invent a retention period.</p>
          <label>Signing provider<select name="signingProvider" required disabled={disabled} defaultValue={review.particulars?.signingProvider === "docusign" ? "docusign" : "pandadoc"}>
            <option value="pandadoc">PandaDoc</option><option value="docusign">DocuSign</option></select></label>
          <p>Either provider follows the same steps: correct the draft, stamp manually where required, customer signs, Armature countersigns, then an independent MFA Admin checks the completed document and audit certificate.</p>
          <label>Stamping decision reason<textarea name="stampReason" minLength={10} maxLength={1000} required disabled={disabled} /></label>
          <button className="button secondary" disabled={disabled}>Save final particulars</button>
        </form>
        {review.preparedAt && <><h4>2. Review both completed signatures</h4><p>Include the fingerprint above in the final {providerName(review)} document. Upload the completed PDF and certificate after both signers select Finish. The file is stored privately.</p>
          <form className="ol-form" onSubmit={event => void submit(event, "approve_manual")}>
            {review.particulars?.signingProvider === "docusign"
              ? <label>DocuSign envelope ID<input name="documentId" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" disabled={disabled} /></label>
              : <label>PandaDoc document ID<input name="documentId" required pattern="[A-Za-z0-9_-]{8,80}" disabled={disabled} /></label>}
            <label>Fingerprint from the signed agreement<input name="agreementHash" required pattern="[0-9a-f]{64}" disabled={disabled} /></label>
            <label>Completed rental PDF with signature certificate<input name="completedPdf" type="file" accept="application/pdf,.pdf" required disabled={disabled} /></label>
            <label><input name="confirmed" type="checkbox" required disabled={disabled} /> I checked both signers, final terms, any stamp evidence and the exact quote.</label>
            <button className="button" disabled={disabled}>Approve rental agreement</button>
          </form></>}
      </>}
      {review.orderPending && <form className="ol-form" onSubmit={event => void submit(event, "recover_order")}><h4>Recover the existing order</h4>
        <p>Find the matching receipt in Razorpay. This links the existing order without charging again.</p>
        <label>Existing rental order ID<input name="orderId" required pattern="order_[A-Za-z0-9]+" disabled={disabled} /></label><button className="button" disabled={disabled}>Link existing rental order</button></form>}
      {review.agreementSigned && !review.bookingId && <p>Both signatures are approved. {review.depositMethod === "bank_transfer" ? "Verify the deposit in the bank statement before asking the customer to pay rent. The 30-minute payment window starts after both agreement approval and deposit verification." : "Ask the customer to check their booking status and complete payment within the approved window."}</p>}
      {review.agreementSigned && review.depositMethod === "bank_transfer" && review.depositPaise > 0 && <>
        <h4>Refund account review</h4>
        {review.refundAccount ? <><p>{review.refundAccount.bankName} · Account ending {review.refundAccount.last4}.</p>
          <p>{review.refundAccount.verifiedAt ? "Current refund account verified." : "The current account needs staff verification before a deposit refund."}</p>
          <form onSubmit={event => void submit(event, "get_refund_account")}><button className="button secondary" disabled={disabled}>View private refund bank details</button></form>
          {privateRefundAccount && <div data-private="true"><dl style={{ overflowWrap: "anywhere" }}><dt>Refund account holder</dt><dd>{privateRefundAccount.accountName}</dd>
            <dt>Refund bank</dt><dd>{privateRefundAccount.bankName}</dd><dt>Full refund account number</dt><dd>{privateRefundAccount.accountNumber}</dd>
            <dt>Refund IFSC</dt><dd>{privateRefundAccount.ifsc}</dd><dt>Account version</dt><dd>{privateRefundAccount.version}</dd></dl>
            <button className="button secondary" disabled={disabled} onClick={() => setPrivateRefundAccount(null)}>Hide private bank details</button>
            <form className="ol-form" onSubmit={event => void submit(event, "verify_refund_account")}>
              <label>Refund account verification evidence<textarea name="evidence" minLength={10} maxLength={1000} required disabled={disabled} /></label>
              <label><input name="confirmed" type="checkbox" required disabled={disabled} /> I verified this account belongs to the contracting person or company and checked the account number and IFSC.</label>
              <button className="button secondary" disabled={disabled}>Verify this refund account version</button>
            </form></div>}
        </> : <p>The customer must provide a refund bank account in their signed-in booking flow.</p>}
        <h4>Bank deposit verification</h4>
        <p>Deposit status: {review.depositStatus ?? "pending"}. {review.depositReference ? "Customer reference: " + review.depositReference : "No customer reference submitted."}</p>
        {review.depositStatus === "verified" || review.depositStatus === "partially_refunded" || review.depositStatus === "refunded"
          ? <><p>Receipt verified{review.depositVerifiedAt ? " on " + new Date(review.depositVerifiedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : ""}. Bank deposit returned: {rentalMoney(review.bankDepositRefundedPaise ?? 0)}.</p><DepositReceipts quote={review} /></>
          : <form className="ol-form" onSubmit={event => void submit(event, "verify_bank_deposit")}>
            <p>Check the actual bank credit for {rentalMoney(review.depositPaise)} and this agreement. A customer screenshot alone is not sufficient.</p>
            {review.testFixture && <p>This staging specimen uses simulated bank evidence only. Do not transfer real money.</p>}
            <label>Verified incoming bank reference<input name="reference" required minLength={6} maxLength={80} disabled={disabled} defaultValue={review.depositReference ?? ""} /></label>
            <label>Bank credit evidence reference<textarea name="evidence" required minLength={10} maxLength={1000} disabled={disabled} /></label>
            <label><input name="confirmed" type="checkbox" required disabled={disabled} /> {review.testFixture ? "I checked the simulated staging bank credit and exact deposit amount." : "I checked the bank statement, payer, exact deposit amount and agreement reference."}</label>
            <button className="button" disabled={disabled}>Verify bank deposit receipt</button>
          </form>}
        {review.depositVerifiedAt && <details><summary>Record a bank deposit refund</summary>
          <p>This records an already completed bank transfer. It does not send money. Confirm the customer account privately and review any documented deductions first.</p>
          <form className="ol-form" onSubmit={event => void submit(event, "record_bank_deposit_refund")}>
            <label>Outgoing bank transfer reference<input name="reference" required minLength={6} maxLength={80} disabled={disabled} /></label>
            <label>Deposit returned, rupees<input name="amount" type="number" required min="0.01" step="0.01" max={(review.depositPaise - (review.bankDepositRefundedPaise ?? 0)) / 100} disabled={disabled} /></label>
            <label>Bank refund evidence and reviewed deductions<textarea name="evidence" required minLength={10} maxLength={1000} disabled={disabled} /></label>
            <label><input name="confirmed" type="checkbox" required disabled={disabled} /> I verified the completed outgoing bank transfer and reviewed settlement.</label>
            {!review.refundAccount?.verifiedAt && <p>Verify the customer's current refund account before recording a bank deposit refund.</p>}
            <button className="button secondary" disabled={disabled || review.depositStatus === "refunded" || !review.refundAccount?.verifiedAt}>Record completed bank deposit refund</button>
          </form>
        </details>}
      </>}
      {review.bookingId && review.product === "cabin101" && !review.parentQuoteId && review.status === "confirmed" && <form className="ol-form" onSubmit={event => void submit(event, "renewal_quote")}>
        <h4>Next calendar month's rent</h4><p>Use the original signed terms. This creates a ₹40,000 rent request with no additional deposit or automatic debit. A changed contract needs a fresh agreement.</p>
        <label>Next unpaid month's first date<input name="start" type="date" required disabled={disabled} /></label>
        <label><input name="unchanged" type="checkbox" required disabled={disabled} /> The original agreement terms and approved users are unchanged.</label>
        <button className="button secondary" disabled={disabled}>Prepare next month's rent</button>
      </form>}
      {review.bookingId && !review.parentQuoteId && <><h4>3. Handover, return and refund records</h4>
        <form className="ol-form" onSubmit={event => void submit(event, review.operations?.handed_over_at ? "return" : "handover")}>
          <label>Condition and handover evidence reference<textarea name="evidence" required minLength={10} maxLength={1000} disabled={disabled || Boolean(review.operations?.returned_at)} /></label>
          <button className="button secondary" disabled={disabled || Boolean(review.operations?.returned_at)}>{review.operations?.handed_over_at ? "Record return" : "Record handover"}</button>
        </form>
        <details><summary>Allocate an already processed refund</summary><p>This records a verified Razorpay refund; it does not send money or approve a new refund. Bank-transfer deposits are reconciled separately.</p>
          <form className="ol-form" onSubmit={event => void submit(event, "allocate_refund")}>
            <label>Processed refund ID<input name="refundId" required pattern="rfnd_[A-Za-z0-9]+" disabled={disabled} /></label>
            <label>Rent refunded, rupees<input name="rent" type="number" min="0" step="0.01" required disabled={disabled} /></label>
            {review.depositMethod !== "bank_transfer" && <label>Deposit refunded, rupees<input name="deposit" type="number" min="0" step="0.01" required disabled={disabled} /></label>}
            <label>Refund allocation reason<textarea name="reason" minLength={10} maxLength={1000} required disabled={disabled} /></label>
            <button className="button secondary" disabled={disabled}>Record processed refund split</button>
          </form></details></>}
      <form onSubmit={event => void submit(event, "manual_review")}><button className="button secondary" disabled={disabled}>Refresh rental status</button></form>
      <button type="button" className="button secondary" disabled={disabled} onClick={() => { setReview(null); setPrivateRefundAccount(null); setError(""); }}>Find another rental</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
