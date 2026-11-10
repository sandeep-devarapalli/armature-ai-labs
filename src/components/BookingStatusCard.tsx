import { useState, type ReactNode } from "react";

export type BookingTone = "neutral" | "ready" | "done" | "attention";
export type BookingRow = { label: ReactNode; value: ReactNode; money?: boolean; total?: boolean };

const day = (value: string) => new Date(value + "T00:00:00");
// "1–7 Feb 2027", "28 Feb – 6 Mar 2027", or one date when start and end match.
export function bookingDates(start: string, end?: string | null) {
  const a = day(start), b = day(end ?? start);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return end ? `${start} to ${end}` : start;
  const full = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (a.getTime() === b.getTime()) return a.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (a.getFullYear() !== b.getFullYear()) return `${full(a)} – ${full(b)}`;
  if (a.getMonth() !== b.getMonth()) return `${a.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${full(b)}`;
  return `${a.getDate()}–${full(b)}`;
}
export const shortReference = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

// One booking at a glance: what, when, where it stands, what to do next, what it costs.
export function BookingStatusCard({ kicker, title, when, status, tone, next, rows, reference, details, actions, children }: {
  kicker: string; title: ReactNode; when?: ReactNode; status: string; tone: BookingTone; next?: ReactNode; rows?: BookingRow[];
  reference?: string; details?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return <article className="booking-card">
    <header className="booking-card-head">
      <span className="eq-kicker">{kicker}</span>
      <h3 className="booking-card-title">{title}</h3>
      {when && <p className="booking-card-when">{when}</p>}
      <span className={"booking-chip is-" + tone}>{status}</span>
    </header>
    {next && <div className="booking-next"><strong>Next</strong>{next}</div>}
    {rows && <dl className="booking-summary">{rows.map((row, index) => <div key={index} className={row.total ? "is-total" : undefined}>
      <dt>{row.label}</dt><dd className={row.money ? "is-money" : undefined}>{row.value}</dd></div>)}</dl>}
    {children}
    {reference && <p className="booking-ref">Reference <code title={reference}>{shortReference(reference)}</code>
      <button type="button" className="text-link" onClick={() => void navigator.clipboard?.writeText(reference).then(() => setCopied(true), () => undefined)}>
        {copied ? "Copied" : "Copy full reference"}</button></p>}
    {details && <details><summary>How this works</summary>{details}</details>}
    {actions && <div className="booking-card-actions">{actions}</div>}
  </article>;
}
