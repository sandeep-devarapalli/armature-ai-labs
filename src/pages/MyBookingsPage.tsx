import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { BookingStatusCard, bookingDates, shortReference } from "../components/BookingStatusCard";
import { PageHeader } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { legalEntity } from "../data/legalEntity";
import { supabase } from "../lib/supabase";

export type BookingRecord = {
  quoteId: string;
  kind: string;
  title: string;
  chair?: string | null;
  start: string | null;
  end: string | null;
  status: string;
  amountPaise?: number | null;
  depositPaise?: number | null;
  depositRefundedPaise?: number | null;
  refundedPaise?: number | null;
  paidAt?: string | null;
  depositPaidAt?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  fallback?: string | null;
};
type History = { bookings: BookingRecord[]; nextOffset: number | null };
type LoadHistory = (offset: number, quoteId?: string) => Promise<History>;
const labels: Record<string, string> = {
  confirmed: "Confirmed", active: "Active", approved: "Approved", completed: "Completed",
  cancelled: "Cancelled", refunded: "Refunded", no_show: "No-show", needs_review: "In review",
  expired: "Expired", alternate: "Alternate date proposed", checked_in: "Checked in",
  pending: "Pending approval", declined: "Declined", payment_due: "Payment due", awaiting_payment: "Awaiting payment", tentative: "Tentative",
};
const kinds: Record<string, string> = {
  day: "Day Pass", week: "Week Pass", month: "Month Pass", cabin: "Cabin rental",
  equipment: "Equipment rental", event: "Event booking", guest: "Guest Pass", golden: "Golden Pass",
};
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const ist = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const istTime = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
const hours = (booking: BookingRecord) => booking.startsAt && booking.endsAt
  ? `${istTime.format(new Date(booking.startsAt))}–${istTime.format(new Date(booking.endsAt))} IST`
  : null;
const seat = (chair: string) => /^S0?\d+$/.test(chair) ? chair.replace(/^S0/, "S") + " · Ground floor" : chair;
const dates = (booking: BookingRecord) => booking.start ? bookingDates(booking.start, booking.end) : "Dates to be confirmed";
const kindLabel = (booking: BookingRecord) => kinds[booking.kind] ?? "Booking";
const goodStatus = (status: string) => ["confirmed", "approved", "active", "checked_in"].includes(status);
const paidDate = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" });
const amount = (value: number) => money.format(value / 100);

async function loadHistory(offset: number, quoteId?: string): Promise<History> {
  if (!supabase) throw new Error("Bookings unavailable");
  const { data, error } = await supabase.functions.invoke("desk-checkout", {
    body: { action: "booking_history", offset, ...(quoteId ? { quoteId } : {}) },
  });
  if (error || !Array.isArray(data?.bookings)) throw new Error("Bookings unavailable");
  return data;
}

export function MyBookingsView({ load }: { load: LoadHistory }) {
  const { quoteId } = useParams();
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void load(0, quoteId).then(result => { if (active) setHistory(result); },
      () => { if (active) setError(true); });
    return () => { active = false; };
  }, [load, quoteId, retry]);

  async function loadMore(offset: number) {
    setBusy(true);
    setError(false);
    try {
      const result = await load(offset);
      setHistory(current => {
        const previous = current?.bookings ?? [];
        const seen = new Set(previous.map(item => item.quoteId));
        return { ...result, bookings: [...previous, ...result.bookings.filter(item => !seen.has(item.quoteId))] };
      });
    } catch { setError(true); }
    finally { setBusy(false); }
  }

  const today = ist.format(new Date());
  const now = Date.now();
  const records = history?.bookings ?? [];
  const upcoming = records.filter(item => goodStatus(item.status) &&
    (item.endsAt ? Date.parse(item.endsAt) > now : (item.end ?? item.start ?? "") >= today));
  const inProgress = records.filter(item => ["pending", "needs_review", "payment_due", "awaiting_payment", "tentative", "alternate"].includes(item.status));
  const openIds = new Set([...upcoming, ...inProgress].map(item => item.quoteId));
  const past = records.filter(item => !openIds.has(item.quoteId));
  const receipt = records[0];
  const groups = [
    { title: "Upcoming and active", empty: "You have no upcoming bookings or active passes.", items: [...upcoming].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")) },
    { title: "In progress", items: inProgress },
    { title: "Past and closed", empty: "You have no past or closed bookings.", items: past },
  ];
  return <>
    <PageHeader title={quoteId ? "Booking details." : "My bookings."}
      description={quoteId ? "View the booking status and recorded payments." : "See your upcoming and past bookings, payments and refunds in one place."}
      actions={<Link className="button secondary" to={quoteId ? "/my-bookings" : "/bookings/"}>{quoteId ? "Back to My Bookings" : "Explore bookings"}</Link>} />
    <div className="wrap my-bookings-content">
      {!history && !error && <p role="status">Loading your bookings…</p>}
      {error && <p role="alert">Couldn’t load bookings. {!history && <button className="text-link" onClick={() => { setError(false); setRetry(value => value + 1); }}>Try again</button>}</p>}
      {quoteId && history && (receipt ? <BookingStatusCard kicker={kindLabel(receipt)} title={receipt.title}
        status={labels[receipt.status] ?? "Booking on record"} tone={goodStatus(receipt.status) ? "done" : "neutral"} reference={receipt.quoteId}
        rows={[
          { label: "Dates", value: <>{dates(receipt)}{hours(receipt) && <><br />{hours(receipt)}</>}</> },
          ...(receipt.chair ? [{ label: "Reserved seat", value: seat(receipt.chair) }] : []),
          ...(receipt.fallback ? [{ label: "Relocated seat", value: receipt.fallback + " · First floor" }] : []),
          { label: "Location", value: legalEntity.labAddress.formatted },
          ...(typeof receipt.amountPaise === "number" ? [{ label: receipt.kind === "guest" ? "Pass cost" : "Payment recorded", value: receipt.kind === "guest" ? "Free" : amount(receipt.amountPaise), money: true }] : []),
          ...(receipt.paidAt ? [{ label: "Payment date", value: paidDate.format(new Date(receipt.paidAt)) }] : []),
          ...(receipt.depositPaise ? [{ label: "Bank deposit received", value: amount(receipt.depositPaise), money: true }] : []),
          ...(receipt.refundedPaise ? [{ label: "Payment refunded", value: amount(receipt.refundedPaise), money: true }] : []),
          ...(receipt.depositPaidAt ? [{ label: "Deposit verified", value: paidDate.format(new Date(receipt.depositPaidAt)) }] : []),
          ...(receipt.depositRefundedPaise ? [{ label: "Bank deposit refunded", value: amount(receipt.depositRefundedPaise), money: true }] : []),
        ]} /> : <p>We couldn’t find this booking in your account.</p>)}
      {!quoteId && history && <>
        {groups.filter(group => group.empty || group.items.length).map(group =>
          <section key={group.title} className="my-bookings-group">
            <h2>{group.title}</h2>
            {group.items.length ? <ul>{group.items.map(item => <li key={item.quoteId}>
              <div><strong>{item.title}</strong><span>{dates(item)}{item.chair && ` · ${seat(item.chair)}`}</span></div>
              <div className="my-bookings-payment">
                <span className={"booking-chip is-" + (goodStatus(item.status) ? "done" : "neutral")}>{labels[item.status] ?? "Booking on record"}</span>
                {item.kind === "guest" ? <span>Free</span> : typeof item.amountPaise === "number" && <span>{amount(item.amountPaise)} paid</span>}
                {!!item.depositPaise && <span>{amount(item.depositPaise)} bank deposit</span>}
                {!!(item.refundedPaise || item.depositRefundedPaise) && <span>{amount((item.refundedPaise ?? 0) + (item.depositRefundedPaise ?? 0))} refunded</span>}
              </div>
              <Link className="text-link" to={`/my-bookings/${item.quoteId}`} aria-label={`Open ${item.title} booking ${shortReference(item.quoteId)}`}>{typeof item.amountPaise === "number" && item.kind !== "guest" ? "Open receipt" : "View booking"}</Link>
            </li>)}</ul> : <p>{group.empty}</p>}
          </section>)}
        {history.nextOffset !== null && <button className="button secondary" disabled={busy}
          onClick={() => void loadMore(history.nextOffset!)}>{busy ? "Loading…" : "Load more bookings"}</button>}
      </>}
    </div>
  </>;
}

export default function MyBookingsPage() {
  const { account, signedIn, loading, error, refresh } = useAccount();
  const { pathname } = useLocation();
  const { quoteId } = useParams();
  if (loading) return <div className="wrap" role="status">Checking your account…</div>;
  if (error) return <div className="wrap"><p role="alert">{error}</p><button className="button secondary" onClick={() => void refresh()}>Try again</button></div>;
  if (!signedIn || !account?.user_id) return <PageHeader title="My bookings." description="Sign in to view your bookings and payments."
    actions={<Link className="button button-primary" to={"/auth?next=" + encodeURIComponent(pathname)}>Sign in</Link>} />;
  return <MyBookingsView key={account.user_id + (quoteId ?? "")} load={loadHistory} />;
}
