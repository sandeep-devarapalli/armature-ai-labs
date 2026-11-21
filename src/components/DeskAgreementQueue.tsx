import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MfaPanel } from "../pages/MemberPages";
import { ManualDeskAgreementReview } from "./ManualDeskAgreementReview";

type Request = {
  quoteId: string;
  chair: string; unit: string; start: string; end?: string; amountPaise: number;
  directCheckout?: boolean; orderPending?: boolean; hasOrder?: boolean;
  agreementSigned?: boolean; status?: string; createdAt?: string;
};

const passLabels: Record<string, string> = { day: "Day pass", week: "Week pass", month: "Month pass" };
const raisedAt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

function requestStatus(request: Request) {
  if (request.status) return request.status.replaceAll("_", " ");
  if (request.orderPending) return "Order needs reconciliation";
  if (request.hasOrder) return "Order linked · check payment status";
  if (request.directCheckout) return "Awaiting direct checkout";
  return request.agreementSigned ? "Agreement approved" : "Agreement pending";
}

export function DeskAgreementQueue({ client, blocked, standalone }: { client: SupabaseClient; blocked?: boolean; standalone?: boolean }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [detail, setDetail] = useState<{ memberId: string; customerEmail: string } | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [directCheckout, setDirectCheckout] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState("");

  const load = useCallback(async (offset = 0) => {
    if (blocked || working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      const { data, error: failure } = await client.functions.invoke("desk-checkout", { body: { action: "staff_overview", offset } });
      if (failure || data?.mode !== "live" || !Array.isArray(data.quotes)) {
        throw new Error("Could not load desk requests. Check your Admin session and try again.");
      }
      setRequests(current => offset ? [...current, ...data.quotes] : data.quotes);
      setNextOffset(Number.isInteger(data.nextOffset) ? data.nextOffset : null);
      setDirectCheckout(data.directCheckout === true);
      setLoaded(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load requests."); }
    finally { working.current = false; setBusy(false); }
  }, [blocked, client]);

  useEffect(() => { if (standalone) void load(); }, [standalone, load]);

  async function reveal(quoteId: string) {
    if (blocked || working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      const { data, error: failure } = await client.functions.invoke("desk-checkout", { body: { action: "staff_detail", quoteId } });
      if (failure || data?.mode !== "live" || data.quoteId !== quoteId || !data.memberId || typeof data.customerEmail !== "string") {
        throw new Error("Could not open protected details. Verify your Admin session with MFA and try again.");
      }
      setDetail({ memberId: data.memberId, customerEmail: data.customerEmail });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not open protected details."); }
    finally { working.current = false; setBusy(false); }
  }

  const Wrapper = standalone ? "section" : "details";
  return <Wrapper className={standalone ? undefined : "member-confirm"}>
    {standalone ? <h2>Desk bookings</h2> : <summary>Desk booking requests</summary>}
    {loaded && <p>{directCheckout ? "Customers accept website policies and pay through Razorpay. Review any existing order before asking a customer to try again." : "Prepare the draft, resolve customer corrections, then send it through PandaDoc. Approve only the completed document with both signatures and its certificate. A request alone does not reserve inventory."}</p>}
    <button className="button secondary" disabled={busy || blocked} onClick={() => void load()}>Refresh desk requests</button>
    {loaded && !requests.length && <p>No desk requests found.</p>}
    {requests.length > 0 && <div className="table-wrap" role="region" aria-label="Desk requests table" tabIndex={0}>
      <table aria-label="Desk booking requests">
        <thead><tr>
          <th scope="col">Reference</th>
          <th scope="col">Raised (IST)</th>
          <th scope="col">Pass and desk</th>
          <th scope="col">Booking dates</th>
          <th scope="col">Amount</th>
          <th scope="col">Status</th>
          <th scope="col">Request</th>
        </tr></thead>
        <tbody>{requests.map(item => <tr key={item.quoteId}>
          <th scope="row" className="mono">{item.quoteId}</th>
          <td>{item.createdAt ? raisedAt.format(new Date(item.createdAt)) : "—"}</td>
          <td>{passLabels[item.unit] ?? item.unit} · {item.chair}</td>
          <td>{item.start}{item.end && item.end !== item.start ? " to " + item.end : ""}</td>
          <td>{money.format(item.amountPaise / 100)}</td>
          <td>{requestStatus(item)}</td>
          <td>
            <button className="button secondary" aria-label={"Review " + item.quoteId} disabled={busy || blocked} onClick={() => { setDetail(null); setError(""); setSelected(item); }}>Review</button>
          </td>
        </tr>)}</tbody>
      </table>
    </div>}
    {nextOffset !== null && <button className="button secondary" disabled={busy || blocked} onClick={() => void load(nextOffset)}>Load more desk requests</button>}
    {selected && <>
      {detail ? <>
        <p>Selected customer: <strong>{detail.customerEmail}</strong></p>
        <ManualDeskAgreementReview key={selected.quoteId} client={client} memberId={detail.memberId} initialQuoteId={selected.quoteId} blocked={blocked || busy} />
      </> : <>
        <p>Verify with MFA to view customer details and review this booking.</p>
        <MfaPanel mode="supabase" />
        <button className="button secondary" disabled={busy || blocked} onClick={() => void reveal(selected.quoteId)}>Open protected details</button>
      </>}
      <button className="button secondary" disabled={busy} onClick={() => { setDetail(null); setSelected(null); setError(""); }}>Close desk review</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </Wrapper>;
}
