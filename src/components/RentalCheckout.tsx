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
    title="Choose your space or kit." description="Choose dates, review your agreement, sign in PandaDoc and pay after Armature's independent review." />
    {signedIn && account?.user_id ? <RentalCheckout key={account.user_id} memberId={account.user_id} canBook={verified} />
      : <Section number="01" title="Sign in first"><Link to="/auth?next=%2Fbookings%2Frentals" className="button">Sign in</Link></Section>}</>;
}
function RentalCheckout({ canBook, memberId }: { canBook: boolean; memberId: string }) {
  const rentalRequest = <T,>(body: object) => invokeRental<T>(body, memberId);
  const { refresh } = useAccount();
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
    setQuote(result); setConsent(false);
    if (result.status === "confirmed" || result.status === "refunded") await refresh();
  }
  async function pay(q: RentalQuote) {
    const order = await rentalRequest<{ keyId: string; orderId: string; amountPaise: number; currency: string }>({ action: "order",
      quoteId: q.quoteId, acceptedPolicies: true, policyVersion: q.policyVersion });
    if (!active.current) return;
    if (!new RegExp("^rzp_" + rentalMode + "_[A-Za-z0-9]+$").test(order.keyId) || !/^order_[A-Za-z0-9]+$/.test(order.orderId)
      || order.currency !== "INR" || order.amountPaise !== q.amountPaise) throw new Error("Payment order does not match the approved agreement.");
    const Razorpay = await loadRazorpayCheckout();
    if (!active.current) return;
    const modal = new Razorpay({ key: order.keyId, order_id: order.orderId, amount: order.amountPaise, currency: "INR",
      name: "Armature AI Labs", description: q.product === "cabin101" ? "Cabin 101" : "Hiwonder kit",
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
      <li>Customer signs, then Armature countersigns</li><li>Staff approves, then pay and receive confirmation</li></ol>
    {!canBook && <p>Verified membership is required. <Link to="/onboarding">Complete verification</Link>.</p>}
    <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => void run(async () => {
      const result = await rentalRequest<{ quotes: RentalQuote[] }>({ action: "list_own" }); if (active.current) setRecent(result.quotes);
    })}>Find my existing requests</button>
    {recent.map(item => <button key={item.quoteId} className="button secondary" disabled={busy || checkoutOpen}
      onClick={() => void run(() => status(item.quoteId))}>{item.product === "cabin101" ? "Cabin 101" : "Hiwonder kit"} · {item.start} · {item.status}</button>)}
    {!quote ? <form className="ol-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget);
      void run(async () => { const selection = { product, start: fields.get("start"), end: fields.get("end"), unit: fields.get("unit"), partyType: fields.get("partyType") };
        const available = await rentalRequest<{ available: boolean }>({ action: "availability", ...selection });
        if (!active.current) return;
        if (available.available !== true) throw new Error("Those dates cannot be booked. Choose another period or ask Armature to confirm availability.");
        const result = await rentalRequest<RentalQuote>({ action: "quote", ...selection }); if (active.current) setQuote(result); }); }}>
      <label>What would you like?<select value={product} disabled={busy} onChange={event => setProduct(event.target.value as typeof product)}>
        <option value="cabin101">Cabin 101 · Ground floor</option><option value="hiwonder">Hiwonder Advanced Kit · Lab-only</option></select></label>
      {product === "cabin101" ? <p>Requests from 1 February 2027. Full calendar months only, ₹40,000 monthly rent plus ₹80,000 refundable deposit. Capacity, access hours and availability need staff confirmation.</p>
        : <><p>One kit. Active workspace access is required throughout the rental. ₹25,000 deposit; no GST added.</p>
          <label>Rental period<select name="unit" disabled={busy}><option value="week">7 days · ₹1,050 rent</option><option value="month">30 days · ₹3,900 rent</option></select></label></>}
      <label>Start date<input name="start" type="date" min={product === "cabin101" ? "2027-02-01" : undefined} required disabled={busy} /></label>
      {product === "cabin101" && <label>Last day of the final month<input name="end" type="date" min="2027-02-28" required disabled={busy} /></label>}
      <label>Contracting party<select name="partyType" disabled={busy}><option value="individual">Individual</option><option value="company">Company</option></select></label>
      <p>A request does not reserve inventory. Staff confirms the draft and any stamping requirements before signing.</p>
      <button className="button" disabled={busy || !canBook}>Request agreement</button>
    </form> : <div aria-live="polite">
      <h3>{quote.product === "cabin101" ? "Cabin 101" : "Hiwonder kit"}</h3><p>{quote.start} to {quote.end}</p>
      <dl><dt>Rent collected now</dt><dd>{rentalMoney(quote.rentPaise)}</dd><dt>Security deposit</dt><dd>{rentalMoney(quote.depositPaise)}</dd>
        <dt>GST</dt><dd>Not added</dd><dt>Total</dt><dd>{rentalMoney(quote.amountPaise)}</dd></dl>
      <p>Agreement reference: <code style={{ overflowWrap: "anywhere" }}>{quote.quoteId}</code></p><p>Status: <strong>{({ confirmed: "Reservation confirmed", refunded: "Payment refunded", needs_review: "Staff review needed", approved: "Ready for payment", awaiting_signatures: "Ready for customer and Armature signatures", awaiting_staff: "Awaiting draft preparation", awaiting_payment: "Payment pending; check payment status", superseded: "Replaced by a revised quote", returned: "Rental returned", cancelled: "Reservation cancelled" } as Record<string, string>)[quote.status] ?? "Awaiting staff confirmation"}</strong></p>
      {!quote.agreementSigned && <><h4>Review and signing</h4><p>Armature prepares your draft in PandaDoc. Confirm your legal name, PAN, address and any company authority privately. Request corrections before signing. Armature then countersigns and an independent staff reviewer checks the completed document.</p>
        <p>For Cabin 101, manual stamping where required happens after draft approval and before signing. The current Hiwonder kit does not require stamping under this release.</p>
        <a href="mailto:hello@armatureailabs.com">Contact Armature about this agreement</a></>}
      {quote.agreementSigned && !["confirmed", "refunded", "needs_review"].includes(quote.status) && <>
        <p>Both signatures were reviewed. Payment is available for 30 minutes after staff approval, subject to availability.</p>
        <label><input type="checkbox" checked={consent} disabled={busy || checkoutOpen} onChange={event => setConsent(event.target.checked)} /> I accept the <Link to="/terms">terms</Link> and <Link to="/refund-policy">refund policy</Link> for this quote.</label>
        <button className="button" disabled={busy || checkoutOpen || !consent || !canBook} onClick={() => void run(() => pay(quote))}>Pay with Razorpay{rentalMode === "test" ? " Test Mode" : ""}</button></>}
      {quote.status === "needs_review" && <p>Staff must reconcile this booking. Do not make another payment.</p>}
      <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => void run(() => status(quote.quoteId))}>Check agreement or payment status</button>
      {!quote.hasOrder && !quote.orderPending && <button className="button secondary" disabled={busy || checkoutOpen} onClick={() => { setQuote(null); setConsent(false); }}>Choose another booking</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </Section>;
}
