import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { accountMembershipLevelsEnabled, useAccount } from "../context/AccountContext";
import { loadRazorpayCheckout, type CheckoutInstance } from "../lib/razorpay-checkout";
import { rentalMode, rentalMoney, rentalRequest as invokeRental, type RentalQuote } from "../lib/rental-checkout";
import { PageHeader, Section } from "./Primitives";

export default function RentalCheckoutPage() {
  const { account, signedIn } = useAccount();
  const verified = accountMembershipLevelsEnabled(account) && ["verified", "premium"].includes(account?.membership_level ?? "");
  return <><PageHeader meta={rentalMode === "test" ? "Test bookings · no real rental" : "Cabins and equipment"}
    title="Choose your space or kit." description="Choose dates, review and sign your agreement, transfer the deposit by bank and pay rent through Razorpay after staff review." />
    {signedIn && account?.user_id ? <RentalCheckout key={account.user_id} memberId={account.user_id} canBook={verified} />
      : <Section number="01" title="Sign in first"><Link to="/auth?next=%2Fbookings%2Frentals" className="button">Sign in</Link></Section>}</>;
}
function RentalCheckout({ canBook, memberId }: { canBook: boolean; memberId: string }) {
  const rentalRequest = <T,>(body: object) => invokeRental<T>(body, memberId);
  const { refresh } = useAccount();
  const [testFixture, setTestFixture] = useState(false);
  const [editingRefundAccount, setEditingRefundAccount] = useState(false);
  const [product, setProduct] = useState<"cabin101" | "hiwonder">("cabin101");
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [recent, setRecent] = useState<RentalQuote[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false), [checkoutOpen, setCheckoutOpen] = useState(false);
  const active = useRef(true), working = useRef(false), checkout = useRef<CheckoutInstance | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; checkout.current?.close(); }; }, []);
  async function run(action: () => Promise<void>) {
    if (!active.current || working.current) return;
    working.current = true; setBusy(true); setError("");
    try { await action(); } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Booking could not be completed."); }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  async function status(reference: string) {
    const result = await rentalRequest<RentalQuote>({ action: "status", quoteId: reference });
    if (!active.current) return;
    setQuote(result); setConsent(false); setEditingRefundAccount(false);
    if (result.status === "confirmed" || result.status === "refunded") await refresh();
  }
  async function pay(q: RentalQuote) {
    const order = await rentalRequest<{ keyId: string; orderId: string; amountPaise: number; currency: string }>({ action: "order",
      quoteId: q.quoteId, acceptedPolicies: true, policyVersion: q.policyVersion });
    if (!active.current) return;
    if (!new RegExp("^rzp_" + rentalMode + "_[A-Za-z0-9]+$").test(order.keyId) || !/^order_[A-Za-z0-9]+$/.test(order.orderId)
      || order.currency !== "INR" || order.amountPaise !== (q.depositMethod === "bank_transfer" ? q.rentPaise : q.amountPaise)) throw new Error("Payment order does not match the approved agreement.");
    const Razorpay = await loadRazorpayCheckout();
    if (!active.current) return;
    const modal = new Razorpay({ key: order.keyId, order_id: order.orderId, amount: order.amountPaise, currency: "INR",
      name: "Armature AI Labs", description: (q.testFixture ? "TEST SPECIMEN · " : "") + (q.product === "cabin101" ? "Cabin 101" : "Hiwonder kit") + (q.depositMethod === "bank_transfer" ? " rent only" : ""),
      handler: callback => {
        if (!active.current) return;
        setCheckoutOpen(false); checkout.current = null;
        void run(async () => { const result = await rentalRequest<RentalQuote>({ action: "verify", quoteId: q.quoteId, ...callback });
          if (active.current) { setQuote(result); await refresh(); } });
      }, modal: { ondismiss: () => { checkout.current = null; if (active.current) setCheckoutOpen(false); } } });
    modal.on("payment.failed", () => { if (active.current) setError("Payment attempt failed. Check status before trying again."); });
    checkout.current = modal; setCheckoutOpen(true); modal.open();
  }
  return <Section number="01" title="Your booking">
    <ol aria-label="Rental booking steps"><li>Choose product and dates</li><li>Review the draft and request corrections</li>
      <li>Customer signs, then Armature countersigns</li><li>Staff reviews the signed agreement</li><li>Transfer the deposit; staff verifies bank receipt</li><li>Pay rent through Razorpay and receive confirmation</li></ol>
    {!canBook && <p>Verified membership is required. <Link to="/onboarding">Complete verification</Link>.</p>}
    <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => void run(async () => {
      const result = await rentalRequest<{ quotes: RentalQuote[] }>({ action: "list_own" }); if (active.current) setRecent(result.quotes);
    })}>Find my existing requests</button>
    {recent.map(item => <button key={item.quoteId} className="button secondary" disabled={busy || checkoutOpen}
      onClick={() => void run(() => status(item.quoteId))}>{item.product === "cabin101" ? "Cabin 101" : "Hiwonder kit"} · {item.start}{item.status ? " · " + item.status : ""}</button>)}
    {!quote ? <form className="ol-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget);
      void run(async () => { const selection = { product, start: fields.get("start"), end: fields.get("end"), unit: fields.get("unit"), partyType: fields.get("partyType"), ...(rentalMode === "test" && testFixture ? { testFixture: true } : {}) };
        const available = await rentalRequest<{ available: boolean }>({ action: "availability", ...selection });
        if (!active.current) return;
        if (available.available !== true) throw new Error("Those dates cannot be booked. Choose another period or ask Armature to confirm availability.");
        const result = await rentalRequest<RentalQuote>({ action: "quote", ...selection }); if (active.current) setQuote(result); }); }}>
      <label>What would you like?<select value={product} disabled={busy} onChange={event => setProduct(event.target.value as typeof product)}>
        <option value="cabin101">Cabin 101 · Ground floor</option><option value="hiwonder">Hiwonder Advanced Kit · Lab-only</option></select></label>
      {rentalMode === "test" && <label><input type="checkbox" checked={testFixture} disabled={busy} onChange={event => setTestFixture(event.target.checked)} /> Use the staging specimen: ₹50 rent and ₹100 simulated bank deposit. No real rental or transfer.</label>}
      {testFixture && rentalMode === "test" ? <p>These reduced amounts apply only to an authorised synthetic staging account. Normal rental prices are unchanged.</p> : product === "cabin101" ? <p>Requests from 1 February 2027. Full calendar months only, ₹40,000 monthly rent plus ₹80,000 refundable bank-transfer deposit. Capacity, access hours and availability need staff confirmation.</p>
        : <p>One kit. Active workspace access is required throughout the rental. ₹25,000 bank-transfer deposit; no GST added.</p>}
      {product === "hiwonder" && <label>Rental period<select name="unit" disabled={busy}><option value="week">{testFixture ? "7 days · Test specimen" : "7 days · ₹1,050 rent"}</option><option value="month">{testFixture ? "30 days · Test specimen" : "30 days · ₹3,900 rent"}</option></select></label>}
      <label>Start date<input name="start" type="date" min={product === "cabin101" ? "2027-02-01" : undefined} required disabled={busy} /></label>
      {product === "cabin101" && <label>Last day of the final month<input name="end" type="date" min="2027-02-28" required disabled={busy} /></label>}
      <label>Contracting party<select name="partyType" disabled={busy}><option value="individual">Individual</option><option value="company">Company</option></select></label>
      <p>A request does not reserve inventory. Staff confirms the draft and any stamping requirements before signing.</p>
      <button className="button" disabled={busy || !canBook}>Request agreement</button>
    </form> : <div aria-live="polite">
      <h3>{quote.product === "cabin101" ? "Cabin 101" : "Hiwonder kit"}</h3><p>{quote.start} to {quote.end}</p>
      {quote.testFixture && <p role="status">TEST SPECIMEN: ₹50 simulated rent payment and ₹100 simulated bank deposit. No real rental, bank transfer or charge.</p>}
      <dl><dt>Rent collected now</dt><dd>{rentalMoney(quote.rentPaise)}</dd><dt>{quote.depositMethod === "bank_transfer" ? "Security deposit by bank transfer" : "Security deposit"}</dt><dd>{rentalMoney(quote.depositPaise)}</dd>
        <dt>GST</dt><dd>Not added</dd><dt>Total across payment methods</dt><dd>{rentalMoney(quote.amountPaise)}</dd>{quote.depositMethod === "bank_transfer" && <><dt>Pay through Razorpay</dt><dd>{rentalMoney(quote.paymentAmountPaise ?? quote.rentPaise)} rent only</dd></>}</dl>
      <p>Agreement reference: <code style={{ overflowWrap: "anywhere" }}>{quote.quoteId}</code></p><p>Status: <strong>{({ confirmed: "Reservation confirmed", refunded: "Payment refunded", needs_review: "Staff review needed", approved: "Ready for payment", awaiting_signatures: "Ready for customer and Armature signatures", awaiting_staff: "Awaiting draft preparation", awaiting_payment: "Payment pending; check payment status", awaiting_deposit: "Awaiting bank deposit verification", superseded: "Replaced by a revised quote", returned: "Rental returned", cancelled: "Reservation cancelled" } as Record<string, string>)[quote.status] ?? "Awaiting staff confirmation"}</strong></p>
      {!quote.agreementSigned && <><h4>Review and signing</h4><p>Armature prepares your draft in PandaDoc. Confirm your legal name, PAN, address and any company authority privately. Request corrections before signing. Armature then countersigns and an independent staff reviewer checks the completed document.</p>
        <p>For Cabin 101, manual stamping where required happens after draft approval and before signing. The current Hiwonder kit does not require stamping under this release.</p>
        <a href="mailto:hello@armatureailabs.com">Contact Armature about this agreement</a></>}
      {quote.depositMethod === "bank_transfer" && quote.depositPaise > 0 && <div>
        <h4>Deposit refund account</h4>
        <p>Provide the contracting person's or company's bank account for returning the deposit. Staff reviews these details before any refund. Do not enter card details, passwords or OTPs.</p>
        {quote.testFixture && <p>Staging specimen: use synthetic bank details only, never a real account.</p>}
        {quote.refundAccount && <><dl style={{ overflowWrap: "anywhere" }}><dt>Refund bank</dt><dd>{quote.refundAccount.bankName}</dd><dt>Saved account</dt><dd>Ending {quote.refundAccount.last4}</dd><dt>Staff review</dt><dd>{quote.refundAccount.verifiedAt ? "Verified for deposit refund" : "Awaiting staff verification"}</dd></dl>
          <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => setEditingRefundAccount(value => !value)}>{editingRefundAccount ? "Cancel account change" : "Change refund account"}</button></>}
        {(!quote.refundAccount || editingRefundAccount) && <form className="ol-form" autoComplete="off" data-private="true" onSubmit={event => {
          event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form);
          void run(async () => {
            const accountNumber = String(fields.get("accountNumber") ?? "").trim();
            if (accountNumber !== String(fields.get("confirmAccountNumber") ?? "").trim()) throw new Error("The two account number entries do not match.");
            if (fields.get("ownershipConfirmed") !== "on") throw new Error("Confirm the account belongs to the contracting person or company.");
            const result = await rentalRequest<RentalQuote>({ action: "save_refund_account", quoteId: quote.quoteId,
              accountName: String(fields.get("accountName") ?? "").trim(), bankName: String(fields.get("bankName") ?? "").trim(),
              accountNumber, ifsc: String(fields.get("ifsc") ?? "").trim().toUpperCase(), ownershipConfirmed: true });
            if (active.current) { form.reset(); setQuote(result); setEditingRefundAccount(false); }
          });
        }}>
          {quote.refundAccount && <p>Changing the account requires a fresh staff review. A previous verification will no longer apply.</p>}
          <label>Account holder name<input name="accountName" minLength={2} maxLength={160} required autoComplete="off" disabled={busy || checkoutOpen} /></label>
          <label>Bank name<input name="bankName" minLength={2} maxLength={120} required autoComplete="off" disabled={busy || checkoutOpen} /></label>
          <label>Account number<input name="accountNumber" inputMode="numeric" pattern="[0-9]{6,24}" required autoComplete="off" disabled={busy || checkoutOpen} /></label>
          <label>Confirm account number<input name="confirmAccountNumber" inputMode="numeric" pattern="[0-9]{6,24}" required autoComplete="off" disabled={busy || checkoutOpen} /></label>
          <label>IFSC<input name="ifsc" pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" maxLength={11} required autoComplete="off" disabled={busy || checkoutOpen} /></label>
          <label><input name="ownershipConfirmed" type="checkbox" required disabled={busy || checkoutOpen} /> This account belongs to the person or company named in this agreement, and I authorise Armature to use it for the deposit refund.</label>
          <button className="button secondary" disabled={busy || checkoutOpen}>Save refund account securely</button>
        </form>}
        <h4>Bank-transfer deposit</h4>
        {quote.depositStatus === "verified" ? <><h5>Deposit receipt{quote.testFixture ? " · Test specimen" : ""}</h5>
            <p>Staff verified the bank deposit. It is recorded separately from rent.</p>
            <dl style={{ overflowWrap: "anywhere" }}><dt>Deposit received</dt><dd>{rentalMoney(quote.depositPaise)}</dd>
              <dt>Agreement reference</dt><dd>{quote.quoteId}</dd><dt>Verified transfer reference</dt><dd>{quote.depositVerifiedReference ?? "Contact Armature for the verified bank reference"}</dd>
              <dt>Receipt verified</dt><dd>{quote.depositVerifiedAt ? new Date(quote.depositVerifiedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST" : "Contact Armature for the verification record"}</dd></dl></>
          : quote.depositStatus === "refunded" || quote.depositStatus === "partially_refunded" ? <p>Bank deposit returned: {rentalMoney(quote.bankDepositRefundedPaise ?? 0)}. Contact Armature for the reviewed settlement.</p>
          : <><p>The deposit is a refundable liability, collected and returned by bank transfer. A transfer reference or screenshot alone does not confirm receipt.</p>
            {quote.agreementSigned ? <>
              {quote.testFixture ? <p>Staging only: enter a simulated bank reference. Do not transfer money to any bank account.</p>
                : quote.bankInstructions ? <dl style={{ overflowWrap: "anywhere" }}><dt>Account holder</dt><dd>{quote.bankInstructions.accountName}</dd>
                  <dt>Bank</dt><dd>{quote.bankInstructions.bankName}</dd><dt>Account number</dt><dd>{quote.bankInstructions.accountNumber}</dd>
                  <dt>IFSC</dt><dd>{quote.bankInstructions.ifsc}</dd>{quote.bankInstructions.accountType && <><dt>Account type</dt><dd>{quote.bankInstructions.accountType}</dd></>}
                  <dt>Transfer description</dt><dd>{quote.quoteId}</dd></dl>
                : <p>Bank instructions are not available yet. Contact Armature for verified company bank details before transferring.</p>}
              {quote.depositReference && <p>Submitted reference: <code style={{ overflowWrap: "anywhere" }}>{quote.depositReference}</code>. Staff must check the bank credit.</p>}
              {!quote.refundAccount && <p>Save your deposit refund account before submitting the transfer reference.</p>}
              {quote.refundAccount && (quote.testFixture || quote.bankInstructions) && <form className="ol-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget);
                void run(async () => { const result = await rentalRequest<RentalQuote>({ action: "submit_deposit_reference", quoteId: quote.quoteId, reference: String(fields.get("reference") ?? "").trim() }); if (active.current) setQuote(result); }); }}>
                <label>{quote.testFixture ? "Simulated bank transfer reference" : "Bank transfer reference"}<input name="reference" required minLength={6} maxLength={80} disabled={busy || checkoutOpen} /></label>
                <button className="button secondary" disabled={busy || checkoutOpen}>Submit deposit reference for review</button>
              </form>}
            </> : <p>Complete agreement review and signing before transferring the deposit.</p>}
          </>}
      </div>}
      {quote.agreementSigned && !["confirmed", "refunded", "needs_review", "cancelled", "returned", "superseded"].includes(quote.status) && <>
        <h4>{quote.depositMethod === "bank_transfer" ? "Rent payment" : "Payment"}</h4>
        <p>Both signatures were reviewed. {quote.depositMethod === "bank_transfer" ? "Rent payment opens after staff verifies the bank deposit. The payment window is 30 minutes from the later of agreement approval and deposit verification, subject to availability." : "Payment is available for 30 minutes after staff approval, subject to availability."}</p>
        <label><input type="checkbox" checked={consent} disabled={busy || checkoutOpen} onChange={event => setConsent(event.target.checked)} /> I accept the <Link to="/terms">terms</Link> and <Link to="/refund-policy">refund policy</Link> for this quote.</label>
        <button className="button" disabled={busy || checkoutOpen || !consent || !canBook || (quote.depositMethod === "bank_transfer" && quote.depositPaise > 0 && quote.depositStatus !== "verified")} onClick={() => void run(() => pay(quote))}>{quote.depositMethod === "bank_transfer" ? "Pay rent with Razorpay" : "Pay with Razorpay"}{rentalMode === "test" ? " Test Mode" : ""}</button></>}
      {quote.status === "needs_review" && <p>Staff must reconcile this booking. Do not make another payment.</p>}
      <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => void run(() => status(quote.quoteId))}>Check agreement or payment status</button>
      {!quote.hasOrder && !quote.orderPending && <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => { setQuote(null); setConsent(false); setEditingRefundAccount(false); }}>Choose another booking</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </Section>;
}
