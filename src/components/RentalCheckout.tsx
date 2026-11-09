import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { accountMembershipLevelsEnabled, useAccount } from "../context/AccountContext";
import { loadRazorpayCheckout, type CheckoutInstance } from "../lib/razorpay-checkout";
import { rentalLabel, rentalMode, rentalMoney, rentalRequest as invokeRental, type RentalProduct, type RentalQuote } from "../lib/rental-checkout";
import { BookingSteps } from "./BookingSteps";
import { PageHeader, Section } from "./Primitives";

const ist = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";

// Refundable deposits are liabilities: their receipts stay separate from rent invoices and carry no GST.
export function DepositReceipts({ quote }: { quote: RentalQuote }) {
  if (!quote.depositReceipts?.length) return null;
  return <div data-private="true">
    {quote.depositReceipts.map(receipt => <section key={receipt.receiptNumber} aria-label={"Deposit receipt " + receipt.receiptNumber}>
      <h5>{receipt.direction === "received" ? "Security deposit receipt" : "Security deposit refund receipt"}{quote.testFixture ? " · Test specimen, no money moved" : ""}</h5>
      <p>Refundable security deposit, recorded separately from rent. It is not rent or income and carries no GST.</p>
      <dl style={{ overflowWrap: "anywhere" }}><dt>Receipt number</dt><dd>{receipt.receiptNumber}</dd>
        <dt>{receipt.direction === "received" ? "Deposit received" : "Deposit returned"}</dt><dd>{rentalMoney(receipt.amountPaise)}</dd>
        <dt>Bank transfer reference</dt><dd>{receipt.reference}</dd>
        {receipt.refundAccountLast4 && <><dt>Returned to account</dt><dd>Ending {receipt.refundAccountLast4}</dd></>}
        <dt>Agreement reference</dt><dd>{quote.quoteId}</dd><dt>Recorded</dt><dd>{ist(receipt.recordedAt)}</dd></dl>
    </section>)}
    <button type="button" className="button secondary" onClick={() => window.print()}>Print deposit receipts</button>
  </div>;
}

export default function RentalCheckoutPage() {
  return <><PageHeader meta={rentalMode === "test" ? "Test bookings · no real rental" : "Cabins and equipment"}
    title="Choose your space or kit." description="Choose dates, review and sign your agreement, transfer the deposit by bank and pay rent through Razorpay after staff review." />
    <RentalBooking /></>;
}

// The rental checkout with its sign-in gate, without a page header, so the bookings page can embed it with a product already chosen.
export function RentalBooking({ initialProduct }: { initialProduct?: string }) {
  const { account, signedIn } = useAccount();
  const { pathname, search } = useLocation();
  const verified = accountMembershipLevelsEnabled(account) && ["verified", "premium"].includes(account?.membership_level ?? "");
  return signedIn && account?.user_id ? <RentalCheckout key={account.user_id} memberId={account.user_id} canBook={verified} initialProduct={initialProduct} />
    : <Section number="01" title="Sign in first"><Link to={"/auth?next=" + encodeURIComponent(pathname + search)} className="button">Sign in</Link></Section>;
}
const rentalSteps = ["Choose product and dates", "Review the draft and request corrections", "Customer signs, then Armature countersigns",
  "Staff reviews the signed agreement", "Transfer the deposit; staff verifies bank receipt", "Pay rent through Razorpay and receive confirmation"];

function RentalCheckout({ canBook, memberId, initialProduct }: { canBook: boolean; memberId: string; initialProduct?: string }) {
  const rentalRequest = <T,>(body: object) => invokeRental<T>(body, memberId);
  const { refresh } = useAccount();
  const [testFixture, setTestFixture] = useState(false);
  const [editingRefundAccount, setEditingRefundAccount] = useState(false);
  const [products, setProducts] = useState<RentalProduct[] | null>(null);
  const [product, setProduct] = useState("");
  const item = products?.find(entry => entry.product === product);
  const [quote, setQuote] = useState<RentalQuote | null>(null);
  const [recent, setRecent] = useState<RentalQuote[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false), [checkoutOpen, setCheckoutOpen] = useState(false);
  const active = useRef(true), working = useRef(false), checkout = useRef<CheckoutInstance | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; checkout.current?.close(); }; }, []);
  useEffect(() => {
    invokeRental<{ products: RentalProduct[] }>({ action: "availability" }, memberId).then(result => {
      if (!active.current) return;
      setProducts(result.products);
      const available = result.products.filter(entry => entry.status === "available");
      setProduct((available.find(entry => entry.product === initialProduct) ?? available[0])?.product ?? "");
    }).catch(() => { if (active.current) setProducts([]); });
  }, [memberId, initialProduct]);
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
      name: "Armature AI Labs", description: (q.testFixture ? "TEST SPECIMEN · " : "") + rentalLabel(q) + (q.depositMethod === "bank_transfer" && q.depositPaise > 0 ? " rent only" : ""),
      handler: callback => {
        if (!active.current) return;
        setCheckoutOpen(false); checkout.current = null;
        void run(async () => { const result = await rentalRequest<RentalQuote>({ action: "verify", quoteId: q.quoteId, ...callback });
          if (active.current) { setQuote(result); await refresh(); } });
      }, modal: { ondismiss: () => { checkout.current = null; if (active.current) setCheckoutOpen(false); } } });
    modal.on("payment.failed", () => { if (active.current) setError("Payment attempt failed. Check status before trying again."); });
    checkout.current = modal; setCheckoutOpen(true); modal.open();
  }
  const hasDeposit = quote ? quote.depositMethod === "bank_transfer" && quote.depositPaise > 0 : item?.depositPaise !== 0;
  const step = !quote ? 0 : ({ awaiting_staff: 1, awaiting_signatures: 2, awaiting_deposit: 4, approved: 5, awaiting_payment: 5, confirmed: 6, returned: 6 } as Record<string, number>)[quote.status]
    ?? (quote.agreementSigned ? 5 : 1);
  return <Section number="01" title="Your booking">
    <BookingSteps label="Rental booking steps" steps={hasDeposit ? rentalSteps : rentalSteps.filter((_, i) => i !== 4)} current={hasDeposit || step < 4 ? step : step - 1} />
    {!canBook && <p>Verified membership is required. <Link to="/onboarding">Complete verification</Link>.</p>}
    <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => void run(async () => {
      const result = await rentalRequest<{ quotes: RentalQuote[] }>({ action: "list_own" }); if (active.current) setRecent(result.quotes);
    })}>Find my existing requests</button>
    {recent.map(item => <button key={item.quoteId} className="button secondary" disabled={busy || checkoutOpen}
      onClick={() => void run(() => status(item.quoteId))}>{rentalLabel(item)} · {item.start}{item.status ? " · " + item.status : ""}</button>)}
    {!quote ? <form className="ol-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget);
      void run(async () => { const selection = { product, start: fields.get("start"), end: fields.get("end"), unit: fields.get("unit"), partyType: fields.get("partyType"), ...(rentalMode === "test" && testFixture ? { testFixture: true } : {}) };
        const available = await rentalRequest<{ available: boolean }>({ action: "availability", ...selection });
        if (!active.current) return;
        if (available.available !== true) throw new Error("Those dates cannot be booked. Choose another period or ask Armature to confirm availability.");
        const result = await rentalRequest<RentalQuote>({ action: "quote", ...selection }); if (active.current) setQuote(result); }); }}>
      {products?.length === 0 && <p>Cabin and equipment options could not be loaded. Contact Armature to book.</p>}
      <label>What would you like?<select value={product} disabled={busy || !products?.length} onChange={event => setProduct(event.target.value)}>
        {products?.map(entry => <option key={entry.product} value={entry.product} disabled={entry.status !== "available"}>
          {entry.name}{entry.floor ? " · " + entry.floor : entry.kind === "equipment" ? " · Lab-only" : ""}{entry.status === "occupied" ? " · Occupied" : entry.status !== "available" ? " · Coming soon" : ""}</option>)}</select></label>
      {rentalMode === "test" && <label><input type="checkbox" checked={testFixture} disabled={busy} onChange={event => setTestFixture(event.target.checked)} /> Use the staging specimen: ₹50 rent and ₹100 simulated bank deposit. No real rental or transfer.</label>}
      {testFixture && rentalMode === "test" ? <p>These reduced amounts apply only to an authorised synthetic staging account. Normal rental prices are unchanged.</p>
        : item?.kind === "cabin" ? <p>Requests from {item.availableFrom ? new Date(item.availableFrom + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : "the release date"}. Full calendar months only, {rentalMoney(item.monthlyRentPaise ?? 0)} monthly rent plus {rentalMoney(item.depositPaise ?? 0)} refundable bank-transfer deposit.{item.billableSeats ? ` ${item.billableSeats} billable seats, up to ${item.billableSeats + item.extraSeats} people.` : ""} Capacity, access hours and availability need staff confirmation.</p>
        : item ? <p>{item.quantity === 1 ? "One unit." : `${item.quantity} units.`} Active workspace access is required throughout the rental. {item.depositPaise ? `${rentalMoney(item.depositPaise)} bank-transfer deposit` : "No deposit"}; no GST added.</p> : null}
      {item?.kind === "equipment" && <label>Rental period<select name="unit" disabled={busy}>
        {item.weekRentPaise && <option value="week">{testFixture ? "7 days · Test specimen" : "7 days · " + rentalMoney(item.weekRentPaise) + " rent"}</option>}
        {item.monthRentPaise && <option value="month">{testFixture ? "30 days · Test specimen" : "30 days · " + rentalMoney(item.monthRentPaise) + " rent"}</option>}</select></label>}
      <label>Start date<input name="start" type="date" min={item?.kind === "cabin" ? item.availableFrom ?? undefined : undefined} required disabled={busy} /></label>
      {item?.kind === "cabin" && <label>Last day of the final month<input name="end" type="date" required disabled={busy} /></label>}
      <label>Contracting party<select name="partyType" disabled={busy}><option value="individual">Individual</option><option value="company">Company</option></select></label>
      <p>A request does not reserve inventory. Staff confirms the draft and any stamping requirements before signing.</p>
      <button className="button" disabled={busy || !canBook || !item}>Request agreement</button>
    </form> : <div aria-live="polite">
      <h3>{rentalLabel(quote)}</h3><p>{quote.start} to {quote.end}</p>
      {quote.testFixture && <p role="status">TEST SPECIMEN: ₹50 simulated rent payment and ₹100 simulated bank deposit. No real rental, bank transfer or charge.</p>}
      <dl><dt>Rent collected now</dt><dd>{rentalMoney(quote.rentPaise)}</dd><dt>{quote.depositMethod === "bank_transfer" && quote.depositPaise > 0 ? "Security deposit by bank transfer" : "Security deposit"}</dt><dd>{quote.depositPaise > 0 ? rentalMoney(quote.depositPaise) : "None"}</dd>
        <dt>GST</dt><dd>Not added</dd><dt>Total across payment methods</dt><dd>{rentalMoney(quote.amountPaise)}</dd>{quote.depositMethod === "bank_transfer" && quote.depositPaise > 0 && <><dt>Pay through Razorpay</dt><dd>{rentalMoney(quote.paymentAmountPaise ?? quote.rentPaise)} rent only</dd></>}</dl>
      <p>Agreement reference: <code style={{ overflowWrap: "anywhere" }}>{quote.quoteId}</code></p><p>Status: <strong>{({ confirmed: "Reservation confirmed", refunded: "Payment refunded", needs_review: "Staff review needed", approved: "Ready for payment", awaiting_signatures: "Ready for customer and Armature signatures", awaiting_staff: "Awaiting draft preparation", awaiting_payment: "Payment pending; check payment status", awaiting_deposit: "Awaiting bank deposit verification", superseded: "Replaced by a revised quote", returned: "Rental returned", cancelled: "Reservation cancelled" } as Record<string, string>)[quote.status] ?? "Awaiting staff confirmation"}</strong></p>
      {!quote.agreementSigned && <><h4>Review and signing</h4><p>Armature prepares your draft in PandaDoc. Confirm your legal name, PAN, address and any company authority privately. Request corrections before signing. Armature then countersigns and an independent staff reviewer checks the completed document.</p>
        <p>For cabins, manual stamping where required happens after draft approval and before signing. Equipment rentals do not require stamping under this release.</p>
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
        {quote.depositStatus === "verified" ? <><p>Staff verified the bank deposit. It is recorded separately from rent.</p><DepositReceipts quote={quote} /></>
          : quote.depositStatus === "refunded" || quote.depositStatus === "partially_refunded" ? <><p>Bank deposit returned: {rentalMoney(quote.bankDepositRefundedPaise ?? 0)}.</p><DepositReceipts quote={quote} /></>
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
