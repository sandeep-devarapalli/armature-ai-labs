import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

interface Notice { id: string; recipient_email: string; kind: string; state: string; delivery_state: string | null; attempts: number; created_at: string; delivery_updated_at: string | null; suppressed: boolean }
interface Result { items: Notice[]; total: number }
const empty: Result = { items: [], total: 0 };
const states: Record<string, string> = { held: "Held", pending: "Queued", leased: "Claimed", sending: "Sending", accepted: "Accepted by provider", failed: "Send failed", unknown: "Outcome unknown", suppressed: "Suppressed" };
const delivery: Record<string, string> = { unconfirmed: "No delivery event received", sent: "Sent by provider", delivered: "Delivered to recipient server", delivery_delayed: "Delivery delayed", bounced: "Bounced", complained: "Spam complaint", failed: "Delivery failed", suppressed: "Suppressed by provider" };
const filters = { ...states, ...delivery, failed: "Failed (send or delivery)", suppressed: "Suppressed (send or delivery)" };
const kinds: Record<string, string> = { registration_saved: "Registration saved", ready: "Ready for review", resubmission_ready: "Resubmission ready", admin_ready: "Reviewer alert", corrections_requested: "Corrections requested", approved: "Membership approved", rejected: "Registration rejected", revoked: "Membership revoked", reinstated: "Membership reinstated" };

export function MemberNotificationStatus({ client }: { client: SupabaseClient }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result>(empty);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true); setResult(empty); setError("");
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await client.rpc("list_member_notification_status", { p_page: page, p_search: search.trim(), p_state: state });
          if (response.error) throw response.error;
          if (active) setResult(response.data as Result);
        } catch { if (active) setError("Could not load notification status. Your access may have changed. Refresh to try again."); }
        finally { if (active) setLoading(false); }
      })();
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [client, open, page, search, state, refresh]);
  return <section className="member-detail member-notification-history" aria-label="Membership notification status">
    <h2><button className="button secondary" aria-expanded={open} aria-controls="member-notification-status" onClick={() => { setOpen(!open); setResult(empty); }}>{open ? "Hide" : "View"} notification status</button></h2>
    {open && <div id="member-notification-status">
      <p>Read-only delivery history. Accepted by provider does not mean delivered. Delivered means the recipient server accepted the email; it does not confirm that someone read it. Held messages have not been released for sending.</p>
      <div className="member-filters"><label>Recipient email<input type="search" maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><label>Notification status<select value={state} onChange={(event) => { setState(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(filters).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="button secondary" disabled={loading} onClick={() => setRefresh(refresh + 1)}>Refresh notifications</button></div>
      {loading && <p role="status">Loading notification status…</p>}{error && <p role="alert">{error}</p>}
      {!loading && !error && <><div className="member-table-scroll"><table><caption>{result.total} matching notifications</caption><thead><tr><th>Recipient / notification</th><th>Send status</th><th>Delivery status</th><th>Timing / attempts</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.id}><td>{item.recipient_email}<br />{kinds[item.kind] || item.kind}</td><td data-label="Send status">{states[item.state] || item.state}</td><td data-label="Delivery status">{item.delivery_state ? delivery[item.delivery_state] || item.delivery_state : "No delivery event received"}{item.suppressed && <p>Further sends to this address are blocked.</p>}</td><td data-label="Timing / attempts">Created: {new Date(item.created_at).toLocaleString()}<br />Delivery update: {item.delivery_updated_at ? new Date(item.delivery_updated_at).toLocaleString() : "—"}<br />Attempts: {item.attempts}</td></tr>)}</tbody></table></div>{result.total === 0 && <p>No matching notifications.</p>}<div className="member-pagination"><button className="button secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous notifications</button><span>Page {page} of {Math.max(1, Math.ceil(result.total / 25))}</span><button className="button secondary" disabled={page * 25 >= result.total} onClick={() => setPage(page + 1)}>Next notifications</button></div></>}
    </div>}
  </section>;
}
