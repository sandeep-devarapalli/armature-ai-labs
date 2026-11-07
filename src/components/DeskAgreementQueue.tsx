import { useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MfaPanel } from "../pages/MemberPages";
import { ManualDeskAgreementReview } from "./ManualDeskAgreementReview";

type Request = {
  quoteId: string; memberId: string; customerEmail: string;
  chair: string; unit: string; start: string; amountPaise: number;
  agreementSigned?: boolean; status?: string;
};

export function DeskAgreementQueue({ client, blocked }: { client: SupabaseClient; blocked?: boolean }) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [selected, setSelected] = useState<Request | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const [error, setError] = useState("");

  async function load(offset = 0) {
    if (blocked || working.current) return;
    working.current = true; setBusy(true); setError("");
    try {
      const { data, error: failure } = await client.functions.invoke("desk-checkout", { body: { action: "staff_queue", offset } });
      if (failure || data?.mode !== "live" || !Array.isArray(data.quotes)) {
        throw new Error("Could not load desk requests. Verify your Admin session with MFA, then try again.");
      }
      setRequests(current => offset ? [...current, ...data.quotes] : data.quotes);
      setNextOffset(Number.isInteger(data.nextOffset) ? data.nextOffset : null);
      setLoaded(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load requests."); }
    finally { working.current = false; setBusy(false); }
  }

  return <details className="member-confirm">
    <summary>Desk agreement requests</summary>
    <p>Prepare the draft, resolve customer corrections, then send it through PandaDoc. Approve only the completed document with both signatures and its certificate. A request alone does not reserve inventory.</p>
    {!selected && <MfaPanel mode="supabase" />}
    <button className="button secondary" disabled={busy || blocked} onClick={() => void load()}>Refresh desk requests</button>
    {loaded && !requests.length && <p>No desk requests found.</p>}
    <ul>{requests.map(item => <li key={item.quoteId}>
      <p><strong>{item.customerEmail}</strong> · {item.chair} · {item.unit} · {item.start} · {new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.amountPaise / 100)}</p>
      <p>{item.status?.replaceAll("_", " ") || (item.agreementSigned ? "Agreement approved" : "Agreement preparation or signature review needed")}</p>
      <button className="button secondary" disabled={busy || blocked} onClick={() => setSelected(item)}>Review {item.quoteId}</button>
    </li>)}</ul>
    {nextOffset !== null && <button className="button secondary" disabled={busy || blocked} onClick={() => void load(nextOffset)}>Load more desk requests</button>}
    {selected && <>
      <p>Selected customer: <strong>{selected.customerEmail}</strong></p>
      <ManualDeskAgreementReview key={selected.quoteId} client={client} memberId={selected.memberId} initialQuoteId={selected.quoteId} blocked={blocked || busy} />
      <button className="button secondary" onClick={() => setSelected(null)}>Close desk review</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
