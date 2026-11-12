import { Link, useSearchParams } from "react-router-dom";
import { CabinMap } from "./CabinMap";
import { Field, Status } from "../../components/Primitives";
import { formatPaise, taxNote, type Bookable } from "../bookings/catalogue";
import {
  choiceReady, choiceSummary, dateLabel, eventEnd, eventStartTimes, mockCabinMonths, mockChairs, mockDates, monthLabel, quoteFor, type MockBooking
} from "./mockBooking";

const Simulate = ({ onClick, children }: { onClick: () => void; children: string }) =>
  <button type="button" className="button button-quiet bp-simulate" onClick={onClick}>Simulate: {children}</button>;

export function QuoteTable({ item, booking }: { item: Bookable; booking: MockBooking }) {
  const quote = quoteFor(item, booking.flow.choice);
  return <table className="bp-quote">
    <tbody>
      {quote.lines.map(line => <tr key={line.label}><th scope="row">{line.label}</th><td>{formatPaise(line.paise)}</td></tr>)}
      <tr><th scope="row">GST</th><td>Not added</td></tr>
    </tbody>
    <tfoot>
      <tr><th scope="row">{quote.depositPaise ? "Pay by Razorpay" : "Total"}</th><td>{formatPaise(quote.payNowPaise)}</td></tr>
      {quote.depositPaise > 0 && <tr><th scope="row">Pay by bank transfer</th><td>{formatPaise(quote.depositPaise)}</td></tr>}
    </tfoot>
  </table>;
}

export function TermsList({ item }: { item: Bookable }) {
  return <ul className="bp-terms">{item.cancellation.map(rule => <li key={rule}>{rule}</li>)}</ul>;
}

function ChooseStep({ item, booking, signedIn }: { item: Bookable; booking: MockBooking; signedIn: boolean }) {
  const { choice } = booking.flow;
  const set = booking.setChoice;
  const dates = mockDates(item.id === "event" ? 30 : 21);
  const [search, setSearch] = useSearchParams();
  if (!signedIn) return <div className="bp-step-body">
    <p>Sign in with a Verified membership to book. You can read every price and term without signing in.</p>
    <Link className="button button-primary" to="/auth?next=%2Fbookings%2F">Sign in to book</Link>
  </div>;

  return <form className="bp-step-body bp-form" onSubmit={event => { event.preventDefault(); if (choiceReady(item, choice)) booking.next(); }}>
    {item.options.length > 1 && <fieldset className="bp-options">
      <legend>{item.id === "desk" ? "Pass" : "Rental period"}</legend>
      {item.options.map(option => <label key={option.id} className={option.id === choice.optionId ? "bp-option is-selected" : "bp-option"}>
        <input type="radio" name="option" value={option.id} checked={option.id === choice.optionId} onChange={() => set({ optionId: option.id, start: "" })} />
        <span>{option.label}</span><strong>{formatPaise(option.paise)}</strong><small>per {option.per}</small>
      </label>)}
    </fieldset>}

    {item.id === "desk" && <Field label="Chair" hint="Chairs already taken for your dates are not listed.">
      <select value={choice.chair} onChange={e => set({ chair: e.target.value })}>
        <option value="">Choose a chair</option>
        {mockChairs.map(code => <option key={code}>{code}</option>)}
      </select>
    </Field>}

    {item.id === "cabin" && <CabinMap chosen={item.cabin} sample={search.get("sample") === "1"} onChoose={code => { const next = new URLSearchParams(search); next.set("cabin", code); setSearch(next, { replace: true }); }} />}

    {item.id === "cabin" ? item.cabin && <div className="bp-row">
      <Field label="First month" hint="Cabins start on the 1st.">
        <select value={choice.start} onChange={e => set({ start: e.target.value })}>
          <option value="">Choose a month</option>
          {mockCabinMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
      </Field>
    </div> : <Field label={item.id === "event" ? "Event date" : "Start date"} hint="Times are Bengaluru time.">
      <select value={choice.start} onChange={e => set({ start: e.target.value })}>
        <option value="">Choose a date</option>
        {dates.map(d => <option key={d.date} value={d.date} disabled={!d.available}>{dateLabel(d.date)}{d.available ? "" : " · Unavailable"}</option>)}
      </select>
    </Field>}

    {item.id === "event" && <>
      <div className="bp-row">
        <Field label="Start time">
          <select value={choice.startTime} onChange={e => { const startTime = e.target.value; set({ startTime, hours: Math.min(choice.hours, 23 - Number(startTime.slice(0, 2))) }); }}>
            {eventStartTimes.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Hours" hint={`Ends at ${eventEnd(choice.startTime, choice.hours)}`}>
          <select value={choice.hours} onChange={e => set({ hours: Number(e.target.value) })}>
            {Array.from({ length: 23 - Number(choice.startTime.slice(0, 2)) }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </Field>
        <Field label="Attendees" hint="Up to 35, including you.">
          <input type="number" min={1} max={35} value={choice.attendees} onChange={e => set({ attendees: Number(e.target.value) })} />
        </Field>
      </div>
      <Field label="About the event" hint="What it is, who is coming and any setup you need. At least 10 characters.">
        <textarea rows={3} value={choice.purpose} onChange={e => set({ purpose: e.target.value })} />
      </Field>
    </>}

    <p className="bp-estimate">Estimated total <strong>{formatPaise(quoteFor(item, choice).payNowPaise)}</strong>{item.depositPaise ? <> + {formatPaise(item.depositPaise)} refundable deposit</> : null}</p>
    <button className="button button-primary" disabled={!choiceReady(item, choice)}>Continue</button>
  </form>;
}

export function StepBody({ item, booking, signedIn }: { item: Bookable; booking: MockBooking; signedIn: boolean }) {
  const { flow, step, update, next, reset } = booking;
  switch (step.id) {
    case "choose":
      return <ChooseStep item={item} booking={booking} signedIn={signedIn} />;
    case "review":
      return <div className="bp-step-body">
        <p className="bp-summary-line">{choiceSummary(item, flow.choice)}</p>
        <QuoteTable item={item} booking={booking} />
        <p className="bp-note">{taxNote}</p>
        <h4>Cancellation</h4>
        <TermsList item={item} />
        <label className="bp-consent">
          <input type="checkbox" checked={flow.accepted} onChange={e => update({ accepted: e.target.checked })} />
          <span>I accept the <a href="/terms/" target="_blank" rel="noreferrer">terms</a>, <a href="/privacy/" target="_blank" rel="noreferrer">privacy notice</a> and <a href="/refund-policy/" target="_blank" rel="noreferrer">refund and cancellation policy</a>.</span>
        </label>
        <button type="button" className="button button-primary" disabled={!flow.accepted} onClick={next}>{item.id === "event" ? "Send request" : "Request agreement"}</button>
        <p className="bp-note">Nothing is charged yet. {item.id === "desk" ? "A request does not reserve a chair; availability is checked again before payment." : "Armature reviews the request first."}</p>
      </div>;
    case "approval":
      return <div className="bp-step-body">
        {flow.approved ? <><Status tone="good">Approved</Status><p>Your slot is approved. Armature is preparing the agreement.</p>
          <button type="button" className="button button-primary" onClick={next}>Continue</button></>
          : <><Status tone="warn">Waiting for Armature</Status><p>We check the slot and your event details. Come back here to check the status. Nothing is charged until you pay.</p>
            <Simulate onClick={() => update({ approved: true })}>Armature approves</Simulate></>}
      </div>;
    case "agreement": {
      const labels = { preparing: "Armature is preparing your agreement", ready: "Ready for your signature", signed: "Signed — waiting for Armature to countersign", countersigned: "Signed by both parties" };
      return <div className="bp-step-body">
        <Status tone={flow.agreement === "countersigned" ? "good" : flow.agreement === "ready" ? "accent" : "warn"}>{labels[flow.agreement]}</Status>
        {flow.agreement === "preparing" && <Simulate onClick={() => update({ agreement: "ready" })}>agreement prepared</Simulate>}
        {flow.agreement === "ready" && <><p>Read it carefully. If something is wrong, ask for a correction before you sign.</p>
          <div className="button-row"><button type="button" className="button button-primary" onClick={() => update({ agreement: "signed" })}>Open in PandaDoc to sign</button>
            <button type="button" className="button button-quiet">Request a correction</button></div></>}
        {flow.agreement === "signed" && <Simulate onClick={() => update({ agreement: "countersigned" })}>Armature countersigns</Simulate>}
        {flow.agreement === "countersigned" && <button type="button" className="button button-primary" onClick={next}>Continue</button>}
      </div>;
    }
    case "deposit":
      return <div className="bp-step-body">
        <p>The deposit is paid by bank transfer, never through Razorpay, and refunded to the account you add here.</p>
        <ol className="bp-substeps">
          <li className={flow.refundAccount ? "is-done" : ""}>
            <strong>Add your refund account</strong>
            {flow.refundAccount ? <span>Saved · account ending ••••1234 (sample)</span> : <div className="bp-row">
              <Field label="Account holder"><input defaultValue="Sample Member" /></Field>
              <Field label="IFSC"><input defaultValue="SAMP0000001" /></Field>
              <button type="button" className="button button-quiet" onClick={() => update({ refundAccount: true })}>Save account</button>
            </div>}
          </li>
          <li className={flow.depositReference ? "is-done" : ""}>
            <strong>Send {item.depositPaise ? formatPaise(item.depositPaise) : "the confirmed deposit"} to Armature</strong>
            <span className="bp-placeholder">Armature's bank details appear here</span>
            {flow.refundAccount && !flow.depositReference && <form className="bp-row" onSubmit={e => { e.preventDefault(); update({ depositReference: String(new FormData(e.currentTarget).get("ref") || "UTR-SAMPLE") }); }}>
              <Field label="Transfer reference (UTR)"><input name="ref" defaultValue="UTR123456789" /></Field>
              <button className="button button-quiet">Submit reference</button>
            </form>}
            {flow.depositReference && <span>Reference {flow.depositReference} submitted</span>}
          </li>
          <li className={flow.depositVerified ? "is-done" : ""}>
            <strong>Armature confirms the deposit</strong>
            {flow.depositVerified ? <span>Deposit received</span> : flow.depositReference ? <Simulate onClick={() => update({ depositVerified: true })}>deposit verified</Simulate> : <span>After your transfer arrives</span>}
          </li>
        </ol>
        {flow.depositVerified && <button type="button" className="button button-primary" onClick={next}>Continue to rent</button>}
      </div>;
    case "pay": {
      const amount = quoteFor(item, flow.choice).payNowPaise;
      return <div className="bp-step-body">
        <p className="bp-pay-amount">{formatPaise(amount)}</p>
        <p>The payment link stays open for 30 minutes. Don't pay twice while an earlier attempt is pending.</p>
        <button type="button" className="button button-primary" onClick={() => { update({ paid: true }); next(); }}>Pay {formatPaise(amount)} with Razorpay</button>
        <p className="bp-note">Preview: no payment is taken.</p>
      </div>;
    }
    case "done":
      return <div className="bp-step-body">
        <Status tone="good">Confirmed</Status>
        <p className="bp-summary-line">{item.name} · {choiceSummary(item, flow.choice)}</p>
        <p>Reference <strong className="mono">{flow.reference}</strong>. Quote it if you email hello@armatureailabs.com.</p>
        <h4>If your plans change</h4>
        <TermsList item={item} />
        <div className="button-row"><button type="button" className="button button-quiet" onClick={reset}>Start another booking</button></div>
      </div>;
  }
}
