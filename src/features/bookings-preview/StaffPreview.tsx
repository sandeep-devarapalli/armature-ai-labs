import { useState } from "react";
import { PageHeader, Status } from "../../components/Primitives";
import { findBookable, formatPaise } from "../bookings/catalogue";
import { staffChecklists, staffRequests, type StaffRequest } from "./mockBooking";

const nextLabel = (r: StaffRequest, done: number) => staffChecklists[r.itemId][done] ?? "Complete";

function Checklist({ request, done, onDone }: { request: StaffRequest; done: number; onDone: () => void }) {
  const steps = staffChecklists[request.itemId];
  return <ol className="bps-checklist">
    {steps.map((label, i) => <li key={label} className={i < done ? "is-done" : i === done ? "is-current" : ""}>
      <span className="mono">{i < done ? "✓" : String(i + 1).padStart(2, "0")}</span>
      <span>{label}</span>
      {i === done && <button type="button" className="button button-primary" onClick={onDone}>Simulate: done</button>}
    </li>)}
  </ol>;
}

export function StaffPreview({ layout }: { layout: "a" | "b" }) {
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState(staffRequests[0].id);
  const advance = (id: string) => setProgress(p => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
  const statusOf = (r: StaffRequest) => {
    const done = progress[r.id] ?? 0;
    return done >= staffChecklists[r.itemId].length ? <Status tone="good">Complete</Status> : done === 0 ? <Status tone="warn">Needs action</Status> : <Status tone="accent">In progress</Status>;
  };
  const current = staffRequests.find(r => r.id === selected)!;

  return <>
    <PageHeader meta="Staff · booking review" title="Booking requests." description="Every desk, rental and event request in one queue, with the next action for each. Agreement uploads still require MFA and a different admin from the member." />
    <section className="section">
      <div className="wrap">
        {layout === "a" ? <div className="bps-split">
          <ul className="bps-queue">
            {staffRequests.map(r => <li key={r.id}><button type="button" className={r.id === selected ? "is-selected" : ""} onClick={() => setSelected(r.id)}>
              <span className="mono">{findBookable(r.itemId)?.name}</span>
              <strong>{r.member}</strong>
              <small>{r.summary}</small>
              {statusOf(r)}
            </button></li>)}
          </ul>
          <div className="bps-detail">
            <span className="mono bp-kicker">{current.id} · {current.submitted}</span>
            <h2>{findBookable(current.itemId)?.name} for {current.member}</h2>
            <p>{current.summary} · {formatPaise(current.amountPaise)}</p>
            <Checklist request={current} done={progress[current.id] ?? 0} onDone={() => advance(current.id)} />
          </div>
        </div> : <div className="bpb-table-wrap">
          <table className="bpb-table bps-table">
            <thead><tr><th scope="col">Request</th><th scope="col">Member</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col">Next action</th></tr></thead>
            <tbody>
              {staffRequests.map(r => {
                const done = progress[r.id] ?? 0;
                const open = r.id === selected;
                return [<tr key={r.id} className={open ? "is-selected" : ""}>
                  <th scope="row"><button type="button" className="bps-row-toggle" aria-expanded={open} onClick={() => setSelected(open ? "" : r.id)}><strong>{findBookable(r.itemId)?.name}</strong><small>{r.summary}</small></button></th>
                  <td>{r.member}<small>{r.submitted}</small></td>
                  <td>{formatPaise(r.amountPaise)}</td>
                  <td>{statusOf(r)}</td>
                  <td><small>{nextLabel(r, done)}</small></td>
                </tr>, open && <tr key={`${r.id}-detail`} className="bps-detail-row"><td colSpan={5}><Checklist request={r} done={done} onDone={() => advance(r.id)} /></td></tr>];
              })}
            </tbody>
          </table>
        </div>}
      </div>
    </section>
  </>;
}
