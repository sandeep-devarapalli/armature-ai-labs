import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/Primitives";
import { catalogue, formatPaise, taxNote, type Bookable } from "../bookings/catalogue";
import { cabins, statusLabel } from "../bookings/cabins";
import { choiceSummary, quoteFor, useMockBooking } from "./mockBooking";
import { StepBody } from "./StepBody";

function Steps({ item, signedIn }: { item: Bookable; signedIn: boolean }) {
  const booking = useMockBooking(item);
  const { flow } = booking;
  const list = useRef<HTMLOListElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    list.current?.querySelector(".is-current")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [flow.stepIndex]);
  const doneSummary = (id: string) => {
    if (id === "choose") return choiceSummary(item, flow.choice);
    if (id === "review") return `Accepted · ${formatPaise(quoteFor(item, flow.choice).payNowPaise)}`;
    if (id === "approval") return "Approved";
    if (id === "agreement") return "Signed by both parties";
    if (id === "deposit") return `Deposit received · ${formatPaise(item.depositPaise ?? 0)}`;
    if (id === "pay") return "Paid";
    return "";
  };
  return <ol className="bpb-steps" ref={list}>
    {item.steps.map((s, i) => {
      const state = i < flow.stepIndex ? "is-done" : i === flow.stepIndex ? "is-current" : "is-next";
      return <li key={s.id} className={state} aria-current={i === flow.stepIndex ? "step" : undefined}>
        <div className="bpb-step-head">
          <span className="bpb-dot mono">{i < flow.stepIndex ? "✓" : String(i + 1)}</span>
          <div>
            <h3>{s.title}</h3>
            {state === "is-done" ? <p className="bpb-done">{doneSummary(s.id)}</p> : state === "is-next" ? <p>{s.detail}</p> : null}
          </div>
          {state === "is-done" && s.id === "choose" && flow.stepIndex < 2 && <button type="button" className="button button-quiet" onClick={() => booking.goTo(i)}>Change</button>}
        </div>
        {state === "is-current" && <div className="bpb-step-open"><p className="bp-lede">{s.detail}</p><StepBody item={item} booking={booking} signedIn={signedIn} /></div>}
      </li>;
    })}
  </ol>;
}

export function OptionBPage({ signedIn, base, initial }: { signedIn: boolean; base: string; initial?: Bookable }) {
  const [item, setItem] = useState<Bookable | undefined>(initial);
  const selected = item?.id ?? "";
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { if (initial) setTimeout(() => document.getElementById("steps")?.scrollIntoView({ block: "start" }), 300); }, [initial]);
  return <>
    <PageHeader meta="Workspace bookings" title="Book the lab." description="Compare everything you can book, pick one, and follow the steps below. Nothing is charged until the payment step." />
    <section className="section">
      <div className="wrap">
        <div className="bpb-table-wrap">
          <table className="bpb-table bpb-compare">
            <caption className="mono">What you can book</caption>
            <thead><tr><th scope="col">Booking</th><th scope="col">Price</th><th scope="col">Deposit</th><th scope="col">Minimum</th><th scope="col">Cancellation</th><th scope="col"><span className="sr-only">Choose</span></th></tr></thead>
            <tbody>
              {catalogue.map(row => <tr key={row.id} className={row.id === selected ? "is-selected" : ""}>
                <th scope="row"><strong>{row.name}</strong><small>{row.summary}</small>{row.id === "cabin" && <small>{cabins.map(c => `${c.name.replace("Cabin ", "")} ${statusLabel[c.status].toLowerCase()}`).join(" · ")}</small>}</th>
                <td data-label="Price">{row.browse && <small>From</small>}{row.options.map(o => <span key={o.id} className="bpb-price">{formatPaise(o.paise)} <small>/ {o.per}</small></span>)}</td>
                <td data-label="Deposit">{row.depositLabel ?? (row.depositPaise ? <>{formatPaise(row.depositPaise)}<small>refundable</small></> : "None")}</td>
                <td data-label="Minimum">{row.minimum}</td>
                <td data-label="Cancellation"><small>{row.cancellation[0]}</small></td>
                <td>{row.browse ? <Link className={row.id === selected ? "button button-primary" : "button button-quiet"} to={`${base}/${row.browse}`}>{row.id === selected ? "Change item" : "Browse"}</Link>
                  : <button type="button" className={row.id === selected ? "button button-primary" : "button button-quiet"} aria-pressed={row.id === selected} onClick={() => { if (row.id === "cabin") { navigate({ pathname: `${base}/cabin`, search: location.search }); return; } setItem(row); requestAnimationFrame(() => document.getElementById("steps")?.scrollIntoView({ behavior: "smooth", block: "start" })); }}>{row.id === selected ? "Selected" : "Choose"}</button>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="bp-note">{taxNote}</p>
      </div>
    </section>
    {item && <section className="section" id="steps">
      <div className="wrap bpb-flow">
        <div className="bpb-flow-head">
          <span className="mono bp-kicker">{item.steps.length} steps</span>
          <h2>{item.name}</h2>
          <ul className="bpb-facts">
            <li><span className="mono">Who</span>{item.eligibility}</li>
            <li><span className="mono">Approval</span>{item.approval}</li>
            <li><span className="mono">Deposit</span>{item.depositNote ?? "None"}</li>
          </ul>
        </div>
        <Steps key={item.id + item.name} item={item} signedIn={signedIn} />
      </div>
    </section>}
  </>;
}
