import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/Primitives";
import { catalogue, formatPaise, taxNote, type Bookable } from "../bookings/catalogue";
import { cabinRent, cabins, statusLabel } from "../bookings/cabins";
import { choiceSummary, quoteFor, useMockBooking } from "./mockBooking";
import { QuoteTable, StepBody, TermsList } from "./StepBody";

const fromPrice = (item: Bookable) => item.options.reduce((low, o) => (o.paise < low.paise ? o : low));

export function OptionALanding({ base }: { base: string }) {
  return <>
    <PageHeader meta="Workspace bookings" title="Book the lab." description="Desks, team cabins, robot arms and cameras, and the event space. Every price and rule is on this page; nothing is charged until you pay in the last step." />
    <section className="section">
      <div className="wrap">
        <div className="bpa-grid">
          {catalogue.map(item => {
            const low = fromPrice(item);
            return <article key={item.id} className="bpa-card">
              <header>
                <span className="mono bp-kicker">{item.kind === "desk" ? "Workspace" : item.kind === "rental" ? "Rental" : "Event"}</span>
                <h2>{item.name}</h2>
                <p>{item.summary}</p>
              </header>
              <p className="bpa-price">{item.options.length > 1 && <small>From </small>}<strong>{formatPaise(low.paise)}</strong><small> / {low.per}</small></p>
              <dl className="bpa-facts">
                <div><dt>Deposit</dt><dd>{item.depositLabel ?? (item.depositPaise ? `${formatPaise(item.depositPaise)}, refundable` : "None")}</dd></div>
                <div><dt>Minimum</dt><dd>{item.minimum}</dd></div>
                <div><dt>Who can book</dt><dd>{item.eligibility}</dd></div>
                <div><dt>Cancel</dt><dd>{item.cancellation[0]}</dd></div>
              </dl>
              <ul className="bpa-includes">{item.includes.map(line => <li key={line}>{line}</li>)}</ul>
              {item.id === "cabin" && <ul className="bpa-cabins">{cabins.map(c => <li key={c.code}><strong>{c.name}</strong><span>{c.billable} + {c.extra} seats · {formatPaise(cabinRent(c))}/mo</span><span className={`bpc-status is-${c.status}`}>{statusLabel[c.status]}</span></li>)}</ul>}
              <Link className="button button-primary" to={`${base}/${item.browse ?? item.id}`}>{item.browse ? "Browse equipment" : "Start booking"}</Link>
            </article>;
          })}
        </div>
        <p className="bp-note">{taxNote} Questions: <a href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a>.</p>
        <details className="bp-resume"><summary>Resume an existing booking</summary><p>Your open requests and agreement references appear here once you sign in.</p></details>
      </div>
    </section>
  </>;
}

export function OptionAFlow({ item, base, signedIn }: { item: Bookable; base: string; signedIn: boolean }) {
  const booking = useMockBooking(item);
  const { flow } = booking;
  const quote = quoteFor(item, flow.choice);
  const main = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    main.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [flow.stepIndex]);
  return <>
    <header className="bpa-flow-head">
      <div className="wrap">
        <Link className="mono bp-back" to={item.browse ? `${base}/${item.browse}` : base}>{item.browse ? "← All equipment" : "← All bookings"}</Link>
        <h1>{item.name}</h1>
        <p>{item.summary}</p>
        <ol className="bpa-stepper" aria-label="Booking steps">
          {item.steps.map((s, i) => <li key={s.id} className={i < flow.stepIndex ? "is-done" : i === flow.stepIndex ? "is-current" : ""} aria-current={i === flow.stepIndex ? "step" : undefined}>
            <button type="button" disabled={i > flow.stepIndex} onClick={() => booking.goTo(i)}><span className="mono">{String(i + 1).padStart(2, "0")}</span>{s.title}</button>
          </li>)}
        </ol>
      </div>
    </header>
    <section className="section">
      <div className="wrap bpa-flow">
        <div className="bpa-main" ref={main}>
          <span className="mono bp-kicker">Step {flow.stepIndex + 1} of {item.steps.length}</span>
          <h2>{booking.step.title}</h2>
          <p className="bp-lede">{booking.step.detail}</p>
          <StepBody item={item} booking={booking} signedIn={signedIn} />
        </div>
        <aside className="bpa-summary" aria-label="Booking summary">
          <h3>Your booking</h3>
          <p className="bp-summary-line">{choiceSummary(item, flow.choice) || "Nothing chosen yet"}</p>
          {item.id === "cabin" && !item.cabin ? <p className="bpa-total"><small>From </small>{formatPaise(item.options[0].paise)}<small> a seat each month</small></p> : flow.stepIndex === 0 ? <p className="bpa-total">{formatPaise(quote.payNowPaise)}{quote.depositPaise > 0 && <small> + {formatPaise(quote.depositPaise)} deposit</small>}</p> : <QuoteTable item={item} booking={booking} />}
          <h4>Cancellation</h4>
          <TermsList item={item} />
          <h4>Before you pay</h4>
          <p>{item.approval}. {item.depositNote ?? "No deposit."}</p>
        </aside>
      </div>
    </section>
  </>;
}
