import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { accountMembershipLevelsEnabled, useAccount } from "../context/AccountContext";
import { useApp } from "../context/AppContext";
import { memberPlatformAvailable, rentalCheckoutAvailable } from "../config/release";
import { loadRazorpayCheckout, type CheckoutInstance, type CheckoutResult } from "../lib/razorpay-checkout";
import { supabase } from "../lib/supabase";
import { BookingSteps } from "./BookingSteps";
import { Field, PageHeader, Section } from "./Primitives";

const terms = { day: "Day pass", week: "Week pass", month: "Monthly desk" };
type Term = keyof typeof terms;
type Availability = { chairs: string[]; dates: { booking_date: string; available: boolean }[] };
type Quote = {
  policyStale?: boolean; expiredOrder?: boolean; canRequestReplacement?: boolean;
  quoteId: string; amountPaise?: number; policyVersion?: string; hasAgreement?: boolean; manualAgreement?: boolean;
  chair?: string; unit?: Term; start?: string; end?: string;
  approvedAt?: string; customerSigned?: boolean; agreementSigned?: boolean; hasOrder?: boolean; orderPending?: boolean;
  status?: "confirmed" | "refunded" | "cancelled" | "needs_review"; bookingId?: string; membership?: string; reviewReason?: string;
};
type Order = { keyId: string; orderId: string; amountPaise: number; currency: string };

const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const dateLabel = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" });
const formatDate = (date: string) => dateLabel.format(new Date(date));
const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
function todayInBengaluru() {
  const parts = dateKey.formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
const errors: Record<string, string> = {
  checkout_disabled: "Online desk checkout is currently unavailable.",
  checkout_state_rejected: "The desk or quote is no longer available. Check the latest status before trying again.",
  signed_payment_window_expired: "The payment window has expired. Contact Armature for a fresh agreement.",
  policy_version_changed: "The checkout policies have changed. Check agreement or payment status and review the current policies before paying.",
  agreement_binding_mismatch: "Armature needs to review this agreement before you can continue.",
};

async function request<T>(body: object): Promise<T> {
  if (!supabase) throw new Error(errors.checkout_disabled);
  const { data, error } = await supabase.functions.invoke("desk-checkout", { body });
  if (error || data?.mode !== "live") {
    let code = data?.error;
    if (error?.context instanceof Response) {
      try { code = (await error.context.clone().json()).error; } catch { /* Keep unexpected errors generic. */ }
    }
    throw new Error(errors[code] ?? "The request could not be completed. Check the status before trying again.");
  }
  return data as T;
}

const deskSteps = ["Choose your pass, chair and dates", "Review your draft and request any corrections",
  "Sign in PandaDoc; Armature countersigns and reviews", "Pay securely, then receive your confirmed reservation"];

function readReference(key: string) {
  try {
    const value = localStorage.getItem(key);
    if (value && /^[0-9a-f-]{36}$/.test(value)) return value;
  } catch { /* A blocked storage API cannot prevent a booking. */ }
  return "";
}

export default function DeskCheckoutPage() {
  return <>
    <PageHeader meta="Workspace bookings" title="Book a desk." description="Choose a desk pass and an available start date. Review the agreement, sign it and pay through Razorpay once Armature has countersigned." />
    {rentalCheckoutAvailable && <p><Link className="button secondary" to="/bookings?item=cabin">Book a cabin or Hiwonder kit</Link></p>}
    <DeskBooking />
  </>;
}

// The desk checkout with its sign-in and verification gate, without a page header, so the bookings page can embed it.
export function DeskBooking() {
  const { account, signedIn, loading, error, refresh } = useAccount();
  const { pathname, search } = useLocation();
  const verified = accountMembershipLevelsEnabled(account)
    && (account?.membership_level === "verified" || account?.membership_level === "premium");
  return signedIn && account?.user_id ? <DeskCheckout key={account.user_id} memberId={account.user_id} canBook={verified} /> : <Section number="01" title="Sign in and verify">
    {loading ? <p role="status">Checking your account…</p>
      : error ? <><p role="alert">{error}</p><button type="button" className="button button-quiet" onClick={() => void refresh()}>Check account status</button></>
      : !signedIn ? <Link className="button button-primary" to={"/auth?next=" + encodeURIComponent(pathname + search)}>Sign in to book</Link>
      : <><p>Desk passes require Verified membership.</p><Link className="button button-primary" to="/onboarding">View membership</Link></>}
  </Section>;
}

function DeskCheckout({ memberId, canBook }: { memberId: string; canBook: boolean }) {
  const { refresh: refreshMembership } = useAccount();
  const { refresh: refreshBookings } = useApp();
  const storageKey = "armature-desk-quote-v1:" + memberId;
  const [reference, setReference] = useState(() => readReference(storageKey));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [unit, setUnit] = useState<Term>("day");
  const [chair, setChair] = useState("");
  const [start, setStart] = useState("");
  const today = todayInBengaluru();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [available, setAvailable] = useState<Availability | null>(null);
  const [calendarError, setCalendarError] = useState("");
  const [calendarRetry, retryCalendar] = useState(0);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState("");
  const [signingUrl, setSigningUrl] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [recent, setRecent] = useState<Quote[]>([]);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const modal = useRef<CheckoutInstance | null>(null);
  const choosing = !reference;

  useEffect(() => {
    if (!choosing || !canBook) return;
    let active = true;
    setAvailable(null);
    setCalendarError("");
    const first = month + "-01";
    const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
    void request<Availability>(chair ? { action: "availability", chair, unit, from: first < today ? today : first, to: last } : { action: "availability" })
      .then(result => { if (active) setAvailable(result); })
      .catch(reason => { if (active) setCalendarError(reason.message); });
    return () => { active = false; };
  }, [calendarRetry, canBook, chair, choosing, month, today, unit]);

  useEffect(() => () => modal.current?.close(), []);

  async function run(action: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The request could not be completed."); }
    finally { working.current = false; setBusy(false); }
  }

  async function showStatus(result: Quote) {
    setQuote(current => ({ ...current, expiredOrder: false, canRequestReplacement: false, ...result }));
    if (result.status === "confirmed" || result.status === "refunded") {
      await Promise.allSettled([refreshMembership(), ...(memberPlatformAvailable ? [refreshBookings()] : [])]);
    }
  }

  function saveReference(value: string) {
    setReference(value);
    try {
      if (value) localStorage.setItem(storageKey, value);
      else localStorage.removeItem(storageKey);
    } catch { /* The reference stays available in this tab. */ }
  }

  async function pay(current: Quote) {
    if (!current.policyVersion || consent !== current.policyVersion) return;
    const order = await request<Order>({ action: "order", quoteId: current.quoteId, acceptedPolicies: true, policyVersion: consent });
    if (!/^rzp_live_[A-Za-z0-9]+$/.test(order.keyId) || !/^order_[A-Za-z0-9]+$/.test(order.orderId)
      || !Number.isSafeInteger(order.amountPaise) || order.amountPaise < 100 || order.amountPaise !== current.amountPaise || order.currency !== "INR") {
      throw new Error("The payment order did not match your approved quote.");
    }
    setQuote(previous => previous && { ...previous, hasOrder: true });
    const Razorpay = await loadRazorpayCheckout();
    function verify(callback: CheckoutResult) {
      modal.current = null;
      setModalOpen(false);
      void run(async () => showStatus(await request<Quote>({ action: "verify", quoteId: current.quoteId, ...callback })));
    }
    const checkout = new Razorpay({
      key: order.keyId, order_id: order.orderId, amount: order.amountPaise, currency: "INR",
      name: "Armature AI Labs", description: "Desk pass", handler: verify,
      modal: { ondismiss: () => { modal.current = null; setModalOpen(false); } },
    });
    checkout.on("payment.failed", () => setError("Razorpay reported a failed attempt. Check the payment status before trying again."));
    modal.current = checkout;
    setModalOpen(true);
    try { checkout.open(); }
    catch (reason) { modal.current = null; setModalOpen(false); throw reason; }
  }

  async function restore(value: string) {
    const result = await request<Quote>({ action: "status", quoteId: value });
    if (result.quoteId !== value) throw new Error("The booking reference did not match.");
    saveReference(value);
    setConsent("");
    setSigningUrl("");
    await showStatus(result);
  }

  const approvalExpired = Boolean(quote?.approvedAt && !quote.hasOrder && !quote.orderPending
    && Date.parse(quote.approvedAt) + 30 * 60 * 1000 <= Date.now());
  const staleUnclaimed = Boolean(quote?.policyStale && !quote.hasOrder && !quote.orderPending);
  const expiredBoundOrder = Boolean(quote?.hasOrder && (quote.expiredOrder ||
    (quote.approvedAt && Date.parse(quote.approvedAt) + 30 * 60 * 1000 <= Date.now())));
  const terminal = quote?.status === "confirmed" || quote?.status === "refunded" || quote?.status === "cancelled";
  const step = choosing ? 0 : quote?.status === "confirmed" ? 4 : quote?.agreementSigned ? 3 : quote?.hasAgreement && !quote.manualAgreement ? 2 : 1;
  return <Section number="01" title="Book a desk pass">
    <BookingSteps steps={deskSteps} current={step} />
    <p>A request does not reserve a desk. Availability is checked again before payment. Do not make a second payment while an earlier attempt is pending.</p>
    {choosing && <details className="member-confirm">
      <summary>Resume an existing booking</summary>
      <button className="button button-quiet" type="button" disabled={busy} onClick={() => void run(async () => {
        const result = await request<{ quotes: Quote[] }>({ action: "list_own" });
        setRecent(result.quotes); setRecentLoaded(true);
      })}>Load my recent requests</button>
      {recentLoaded && !recent.length && <p>No recent booking requests found.</p>}
      <ul>{recent.map(item => <li key={item.quoteId}>
        <button className="button button-quiet" type="button" disabled={busy} onClick={() => void run(() => restore(item.quoteId))}>
          {item.chair} · {item.unit ? terms[item.unit] : "Desk pass"} · {item.start ? formatDate(item.start) : item.quoteId}
          {item.status ? ` · ${item.status.replaceAll("_", " ")}` : " · In progress"}
        </button>
      </li>)}</ul>
      <form onSubmit={event => {
        event.preventDefault();
        const value = String(new FormData(event.currentTarget).get("reference")).trim().toLowerCase();
        void run(() => restore(value));
      }}>
        <Field label="Existing agreement reference"><input name="reference" required pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}" maxLength={36} disabled={busy} /></Field>
        <button className="button button-quiet" disabled={busy}>Resume booking</button>
      </form>
    </details>}
    {choosing && !canBook ? <><p>Desk passes require Verified membership.</p><Link className="button button-primary" to="/onboarding">View membership</Link></> : choosing ? <form className="booking-form" onSubmit={event => {
      event.preventDefault();
      if (!available?.dates.some(row => row.available && row.booking_date === start)) return;
      void run(async () => {
        const result = await request<Quote>({ action: "quote", chair, unit, start });
        if (!/^[0-9a-f-]{36}$/.test(result.quoteId)) throw new Error("The agreement reference was invalid.");
        saveReference(result.quoteId);
        setQuote(result);
      });
    }}>
      <Field label="Desk pass"><select value={unit} disabled={busy} onChange={event => { setUnit(event.target.value as Term); setStart(""); }}>
        {Object.entries(terms).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></Field>
      <Field label="Chair"><select value={chair} disabled={busy || (!available && !chair)} onChange={event => { setChair(event.target.value); setStart(""); }}>
        <option value="">Choose a chair</option>
        {(available?.chairs ?? (chair ? [chair] : [])).map(code => <option key={code}>{code}</option>)}
      </select></Field>
      {chair && <>
        <Field label="Month"><input type="month" value={month} min={today.slice(0, 7)} disabled={busy} onChange={event => {
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.value >= today.slice(0, 7)) {
            setMonth(event.target.value);
            setStart("");
          }
        }} /></Field>
        <Field label="Start date" hint="Availability is shown in Bengaluru time.">
          <select value={start} disabled={busy || !available} onChange={event => setStart(event.target.value)}>
            <option value="">Choose a date</option>
            {available?.dates.map(row => <option key={row.booking_date} value={row.booking_date} disabled={!row.available}>
              {formatDate(row.booking_date)}{row.available ? "" : " · Unavailable"}
            </option>)}
          </select>
        </Field>
      </>}
      {!available && !calendarError && <p role="status">Checking desk availability…</p>}
      {available && !available.chairs.length && <p role="status">No chairs are available for online booking.</p>}
      {available && chair && !available.dates.some(row => row.available) && <p role="status">There are no available start dates for this selection.</p>}
      {calendarError && <><p role="alert" className="form-error">{calendarError}</p>
        <button type="button" className="button button-quiet" onClick={() => retryCalendar(value => value + 1)}>Retry availability</button></>}
      <button className="button button-primary" disabled={busy || !start || !available} type="submit">Request agreement</button>
    </form> : <div className="booking-form">
      <p>Agreement reference <strong>{reference}</strong></p>
      {quote?.chair && quote.unit && quote.start && <p>{terms[quote.unit]} · Chair {quote.chair} · {formatDate(quote.start)}{quote.end && quote.end !== quote.start && <> to {formatDate(quote.end)}</>}</p>}
      {typeof quote?.amountPaise === "number" && <p>Total <strong>{money.format(quote.amountPaise / 100)}</strong></p>}
      {quote?.status === "confirmed" ? <div role="status">
        <p>Desk booking confirmed. {memberPlatformAvailable && quote.bookingId && <Link to={`/bookings/${quote.bookingId}`}>Open reservation</Link>} {quote.membership === "premium" && "Membership: Premium."}</p>
        {quote.reviewReason === "partial_refund" && <p>A partial refund was recorded. Contact Armature if you need details.</p>}
      </div>
        : quote?.status === "refunded" ? <p role="status">This payment has been refunded.</p>
        : quote?.status === "cancelled" ? <p role="status">This desk booking was cancelled.</p>
        : quote?.status === "needs_review" || quote?.orderPending ? <p role="status">Armature needs to reconcile this payment. Contact support before trying again.</p>
        : staleUnclaimed ? <p role="status">The policies for this unpaid request have changed. Choose a fresh desk pass and review the updated agreement before paying.</p>
        : expiredBoundOrder ? <p role="status">This payment window has expired. {quote?.canRequestReplacement
          ? "Razorpay reports no successful or pending payment. Close any old checkout tabs, then request a fresh agreement. Ask staff to recheck the old payment before approving the replacement."
          : "Check payment status before doing anything else. If a payment is pending or its outcome is unclear, contact Armature for review. Do not pay again."}</p>
        : approvalExpired ? <p role="status">This agreement’s payment window expired. Start a fresh request so Armature can check availability and prepare a new agreement.</p>
        : quote?.manualAgreement && !quote.agreementSigned ? <p role="status">Armature will prepare your PandaDoc agreement and email you when it is ready. Check your details and request corrections before signing. After both signatures, staff will review the completed agreement. Check the status here to continue.</p>
        : quote && (!quote.hasAgreement && !quote.agreementSigned) ? <p role="status">Armature is preparing your agreement.</p>
        : quote && !quote.agreementSigned ? <>
          <p>{quote.customerSigned ? "Waiting for Armature to countersign." : "Review and sign your agreement in PandaDoc. Select Finish when you are done."}</p>
          {!quote.customerSigned && <button className="button button-quiet" type="button" disabled={busy} onClick={() => void run(async () => {
            const result = await request<{ signingUrl: string }>({ action: "sign", quoteId: reference });
            const url = new URL(result.signingUrl);
            if (url.origin !== "https://app.pandadoc.com" || !/^\/s\/[A-Za-z0-9_-]+\/$/.test(url.pathname)) throw new Error("The signing link was invalid.");
            setSigningUrl(url.href);
          })}>Get signing link</button>}
          {!quote.customerSigned && signingUrl && <a href={signingUrl} target="_blank" rel="noreferrer">Open PandaDoc agreement in a new tab</a>}
        </> : quote?.agreementSigned && !canBook ? <p>Verified membership is required before starting a payment. You can still check an existing payment below.</p> : quote?.agreementSigned && <>
          <p>Both signatures are verified. Payment must start within 30 minutes of staff approval. Confirm the policies before opening Razorpay.</p>
          <label><input type="checkbox" checked={Boolean(quote.policyVersion && consent === quote.policyVersion)}
            disabled={!quote.policyVersion || busy || modalOpen} onChange={event => setConsent(event.target.checked ? quote.policyVersion ?? "" : "")} />
            {" "}I accept the <a href="/terms/" target="_blank" rel="noreferrer">terms</a>, <a href="/privacy/" target="_blank" rel="noreferrer">privacy notice</a> and <a href="/refund-policy/" target="_blank" rel="noreferrer">refund and cancellation policy</a>. I consent to sharing the information described in the privacy notice with Razorpay and its partners to process and reconcile my payment, prevent fraud and comply with regulatory requirements.
          </label>
          <button className="button button-primary" type="button" disabled={busy || modalOpen || !quote.policyVersion || consent !== quote.policyVersion}
            onClick={() => void run(() => pay(quote))}>Pay with Razorpay</button>
        </>}
      {!terminal && <button className="button button-quiet" type="button" disabled={busy || modalOpen}
        onClick={() => void run(async () => showStatus(await request<Quote>({ action: "status", quoteId: reference })))}>Check agreement or payment status</button>}
      {(terminal || approvalExpired || staleUnclaimed || (expiredBoundOrder && quote?.canRequestReplacement && !quote.status) || (quote && !quote.hasAgreement && !quote.hasOrder && !quote.orderPending && !quote.status)) &&
        <button className="button button-quiet" type="button" disabled={busy} onClick={() => {
          saveReference(""); setQuote(null); setStart(""); setConsent(""); setSigningUrl(""); setError("");
        }}>Choose another desk pass</button>}
    </div>}
    <p>Need a draft correction or help with a payment? Email <a href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a> with your agreement reference. Do not send identity copies or payment credentials.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
  </Section>;
}
