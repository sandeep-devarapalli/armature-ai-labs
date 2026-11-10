import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { accountMembershipLevelsEnabled, useAccount } from "../context/AccountContext";
import { loadRazorpayCheckout, type CheckoutInstance } from "../lib/razorpay-checkout";
import { eventMode, eventRequest as invokeEvent, type EventAvailability, type EventQuote } from "../lib/event-checkout";
import { rentalMoney as money } from "../lib/rental-checkout";
import { BookingSteps } from "./BookingSteps";

const eventSteps = ["Choose date, time and guests", "Armature reviews your request and prepares the agreement",
  "You sign, then Armature countersigns", "Pay through Razorpay and receive confirmation"];
const stepFor: Record<string, number> = { awaiting_staff: 1, awaiting_signatures: 2, approved: 3, awaiting_payment: 3, confirmed: 4, completed: 4 };
const statusText: Record<string, string> = { awaiting_staff: "Awaiting Armature review", awaiting_signatures: "Ready for your signature, then Armature's",
  approved: "Ready for payment", awaiting_payment: "Payment pending; check payment status", confirmed: "Event confirmed", completed: "Event completed",
  needs_review: "Staff review needed", declined: "Request declined", cancelled: "Event cancelled", refunded: "Payment refunded" };
const hours = Array.from({ length: 15 }, (_, i) => String(i + 8).padStart(2, "0") + ":00");
const tomorrow = () => new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

// The event checkout with its sign-in gate, for the bookings page.
export function EventBooking() {
  const { account, signedIn } = useAccount();
  const { pathname, search } = useLocation();
  const verified = accountMembershipLevelsEnabled(account) && ["verified", "premium"].includes(account?.membership_level ?? "");
  return signedIn && account?.user_id ? <EventCheckout key={account.user_id} memberId={account.user_id} canBook={verified} />
    : <p><Link to={"/auth?next=" + encodeURIComponent(pathname + search)} className="button button-primary">Sign in to book the event space</Link></p>;
}

function EventCheckout({ canBook, memberId }: { canBook: boolean; memberId: string }) {
  const request = <T,>(body: object) => invokeEvent<T>(body, memberId);
  const { refresh } = useAccount();
  const [day, setDay] = useState(""), [slots, setSlots] = useState<EventAvailability | null>(null);
  const [start, setStart] = useState("10:00");
  const [quote, setQuote] = useState<EventQuote | null>(null), [recent, setRecent] = useState<EventQuote[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [consent, setConsent] = useState(false), [checkoutOpen, setCheckoutOpen] = useState(false);
  const active = useRef(true), working = useRef(false), checkout = useRef<CheckoutInstance | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; checkout.current?.close(); }; }, []);
  useEffect(() => {
    setSlots(null);
    if (!day) return;
    let current = true;
    invokeEvent<EventAvailability>({ action: "availability", date: day }, memberId).then(result => { if (current && active.current) setSlots(result); })
      .catch(reason => { if (current && active.current) setError(reason instanceof Error ? reason.message : "Availability could not be loaded."); });
    return () => { current = false; };
  }, [day, memberId]);
  async function run(action: () => Promise<void>) {
    if (!active.current || working.current) return;
    working.current = true; setBusy(true); setError("");
    try { await action(); } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Booking could not be completed."); }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  async function status(reference: string) {
    const result = await request<EventQuote>({ action: "status", quoteId: reference });
    if (!active.current) return;
    setQuote(result); setConsent(false);
    if (result.status === "confirmed") await refresh();
  }
  async function pay(q: EventQuote) {
    const order = await request<{ keyId: string; orderId: string; amountPaise: number; currency: string }>({ action: "order",
      quoteId: q.quoteId, acceptedPolicies: true, policyVersion: q.policyVersion });
    if (!active.current) return;
    if (!new RegExp("^rzp_" + eventMode + "_[A-Za-z0-9]+$").test(order.keyId) || !/^order_[A-Za-z0-9]+$/.test(order.orderId)
      || order.currency !== "INR" || order.amountPaise !== q.amountPaise) throw new Error("Payment order does not match the approved agreement.");
    const Razorpay = await loadRazorpayCheckout();
    if (!active.current) return;
    const modal = new Razorpay({ key: order.keyId, order_id: order.orderId, amount: order.amountPaise, currency: "INR",
      name: "Armature AI Labs", description: `Event space, ${q.date}, ${q.hours} hour${q.hours > 1 ? "s" : ""}`,
      handler: callback => {
        if (!active.current) return;
        setCheckoutOpen(false); checkout.current = null;
        void run(async () => { const result = await request<EventQuote>({ action: "verify", quoteId: q.quoteId, ...callback });
          if (active.current) { setQuote(result); await refresh(); } });
      }, modal: { ondismiss: () => { checkout.current = null; if (active.current) setCheckoutOpen(false); } } });
    modal.on("payment.failed", () => { if (active.current) setError("Payment attempt failed. Check status before trying again."); });
    checkout.current = modal; setCheckoutOpen(true); modal.open();
  }
  const latest = slots ? 23 - Number(start.slice(0, 2)) : 1;
  const locked = busy || checkoutOpen;
  return <div className="event-checkout booking-flow">
    <BookingSteps label="Event booking steps" steps={eventSteps} current={quote ? stepFor[quote.status] ?? 1 : 0} />
    {eventMode === "test" && <p className="booking-notice" role="status">Test bookings · no real event or charge.</p>}
    {!canBook && <p>Verified membership is required. <Link to="/onboarding">Complete verification</Link>.</p>}
    <button className="button secondary" disabled={locked} onClick={() => void run(async () => {
      const result = await request<{ quotes: EventQuote[] }>({ action: "list_own" }); if (active.current) setRecent(result.quotes);
    })}>Find my event requests</button>
    {recent.map(item => <button key={item.quoteId} className="button secondary" disabled={locked}
      onClick={() => void run(() => status(item.quoteId))}>{item.date} · {item.startTime} · {statusText[item.status] ?? item.status}</button>)}
    {!quote ? <form className="ol-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget);
      void run(async () => { const result = await request<EventQuote>({ action: "quote", date: day, startTime: start,
        hours: Number(fields.get("hours")), attendees: Number(fields.get("attendees")), purpose: String(fields.get("purpose") ?? "").trim() });
        if (active.current) setQuote(result); }); }}>
      <label>Event date<input type="date" min={tomorrow()} value={day} required disabled={busy} onChange={event => setDay(event.target.value)} /></label>
      {slots && (slots.closed ? <p>The lab is closed on this date. Choose another day.</p>
        : <p>Open {slots.opens} to {slots.closes}. {money(slots.ratePaise)} an hour, no deposit, no GST added.
          {slots.busy.length ? ` Already booked: ${slots.busy.map(b => b.start + "–" + b.end).join(", ")}. Allow ${slots.bufferMinutes} minutes between events.` : " Nothing booked yet."}</p>)}
      <label>Start time<select value={start} disabled={busy || !slots || slots.closed} onChange={event => setStart(event.target.value)}>
        {hours.map(h => <option key={h} value={h}>{h}</option>)}</select></label>
      <label>Hours<select name="hours" disabled={busy || !slots || slots.closed}>
        {Array.from({ length: latest }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n} hour{n > 1 ? "s" : ""}{slots ? " · " + money(n * slots.ratePaise) : ""}</option>)}</select></label>
      <label>Guests<input name="attendees" type="number" min={1} max={slots?.maxAttendees ?? 35} defaultValue={10} required disabled={busy || !slots || slots.closed} /></label>
      <label>What is the event?<textarea name="purpose" minLength={10} maxLength={1000} required disabled={busy || !slots || slots.closed}
        placeholder="For example: a robotics meetup with two short talks and live arm demos" /></label>
      <p>A request does not hold the time. Armature reviews it and prepares the agreement before anything is charged.</p>
      <button className="button" disabled={busy || !canBook || !slots || slots.closed}>Request the event space</button>
    </form> : <div aria-live="polite">
      <h3>Event space · {quote.date}</h3>
      <dl><dt>Time</dt><dd>{quote.startTime}, {quote.hours} hour{quote.hours > 1 ? "s" : ""}</dd><dt>Guests</dt><dd>{quote.attendees}</dd>
        <dt>Event</dt><dd>{quote.purpose}</dd><dt>Hire charge</dt><dd>{money(quote.amountPaise)}</dd><dt>GST</dt><dd>Not added</dd></dl>
      <p>Agreement reference: <code style={{ overflowWrap: "anywhere" }}>{quote.quoteId}</code></p>
      <p>Status: <strong>{statusText[quote.status] ?? "Awaiting Armature review"}</strong></p>
      {quote.status === "declined" && quote.declineReason && <p>Reason: {quote.declineReason}</p>}
      {(quote.status === "awaiting_staff" || quote.status === "awaiting_signatures") && <p>Armature checks the date and setup, then sends the agreement through PandaDoc. You sign first and Armature countersigns. Payment opens for 30 minutes after staff approve the signed agreement. <a href="mailto:hello@armatureailabs.com">Contact Armature about this request</a>.</p>}
      {(quote.status === "approved" || quote.status === "awaiting_payment") && <>
        <h4>Payment</h4>
        <p>Both signatures were reviewed. Payment is available for 30 minutes after staff approval.</p>
        <label><input type="checkbox" checked={consent} disabled={locked} onChange={event => setConsent(event.target.checked)} /> I accept the <Link to="/terms">terms</Link> and <Link to="/refund-policy">refund policy</Link> for this event.</label>
        <button className="button" disabled={locked || !consent || !canBook} onClick={() => void run(() => pay(quote))}>Pay with Razorpay{eventMode === "test" ? " Test Mode" : ""}</button></>}
      {quote.status === "needs_review" && <p>Staff must reconcile this booking. Do not make another payment.</p>}
      {quote.status === "cancelled" && quote.refundDuePaise !== null && <p>Refund due: {money(quote.refundDuePaise)}. Armature issues it to the original payment method.</p>}
      {["awaiting_staff", "awaiting_signatures", "approved", "confirmed"].includes(quote.status) && !quote.orderPending && <details>
        <summary>Cancel this event</summary>
        <p>{quote.status === "confirmed" ? "Cancelling 48 hours or more before the event refunds 50%. Later cancellations are not refunded." : "Nothing has been charged yet."}</p>
        <form className="ol-form" onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget);
          void run(async () => { const result = await request<EventQuote>({ action: "cancel", quoteId: quote.quoteId, confirmed: true, reason: String(fields.get("reason") ?? "").trim() });
            if (active.current) setQuote(result); }); }}>
          <label>Reason<textarea name="reason" minLength={10} maxLength={1000} required disabled={locked} /></label>
          <button className="button secondary" disabled={locked}>Cancel event</button>
        </form>
      </details>}
      <button className="button secondary" disabled={locked} onClick={() => void run(() => status(quote.quoteId))}>Check agreement or payment status</button>
      {!quote.hasOrder && !quote.orderPending && <button className="button secondary" disabled={locked} onClick={() => { setQuote(null); setConsent(false); }}>Request another event</button>}
    </div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
