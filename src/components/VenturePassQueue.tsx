import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { MfaPanel } from "../pages/MemberPages";
import { approveVentureApplication, ventureFirmTypes, ventureRequest, ventureStatuses, ventureTime, type VentureApplication } from "../lib/venture-pass";

export default function VenturePassQueue() {
  const [rows, setRows] = useState<VentureApplication[] | null>(null);
  const [selected, setSelected] = useState<{ row: VentureApplication; action: "approve" | "decline" } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { setRows(await ventureRequest<VentureApplication[]>("staff_list_venture_pass_applications")); }
    catch (reason) { setRows(null); setError(reason instanceof Error ? reason.message : "Could not load applications."); }
    finally { setBusy(false); }
  }, []);

  async function decide() {
    if (!selected || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const updated = selected.action === "approve"
        ? await approveVentureApplication(selected.row.id)
        : await ventureRequest<VentureApplication>("staff_review_venture_pass_application", {
          p_id: selected.row.id, p_action: "decline",
        });
      setRows(previous => previous?.map(row => row.id === updated.id ? { ...row, ...updated } : row) ?? [updated]);
      setSelected(null);
      setNotice(updated.payment_expires_at
        ? `Approved. Payment is due by ${ventureTime.format(new Date(updated.payment_expires_at))} IST.`
        : "Application declined.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the decision."); }
    finally { setBusy(false); }
  }

  return <section className="section" id="venture-partner-pass-applications"><div className="wrap">
    <h2>Venture Partner Pass applications</h2>
    <p>Approval reserves a place for one hour. Confirm the applicant is ready to pay before approving. <Link to="/venture-partner-pass">View the offer</Link></p>
    <MfaPanel mode="supabase" />
    <button className="button button-quiet" onClick={() => void load()} disabled={busy}>{rows ? "Refresh applications" : "Load applications"}</button>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {rows && (rows.length ? <div className="table-wrap" role="region" aria-label="Venture Partner Pass applications" tabIndex={0}>
      <table>
        <thead><tr><th scope="col">Firm</th><th scope="col">Applicant</th><th scope="col">Requested (IST)</th><th scope="col">Status</th><th scope="col">Action</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.id}>
          <th scope="row">{row.firm_name}<br />{ventureFirmTypes[row.firm_type]}</th>
          <td>{row.contact_name}<br />{row.email}</td>
          <td>{ventureTime.format(new Date(row.created_at))}</td>
          <td>{row.preparing ? "Preparing checkout" : ventureStatuses[row.status]}{(row.status === "approved" || row.preparing) && row.payment_expires_at && <><br />{ventureTime.format(new Date(row.payment_expires_at))} IST</>}</td>
          <td>{row.status === "pending" && <button className="button button-quiet" disabled={busy} onClick={() => setSelected({ row, action: "approve" })}>{row.preparing ? "Retry checkout setup" : "Review"}</button>}</td>
        </tr>)}</tbody>
      </table>
    </div> : <p>No Venture Partner Pass applications yet.</p>)}
    {selected && <section className="member-confirm" aria-label="Review Venture Partner Pass application">
      <h3>{selected.row.firm_name}</h3>
      {selected.row.website && <p>{selected.row.website}</p>}
      <p>{selected.row.details}</p>
      <p>{selected.row.preparing
        ? "Retry checkout preparation within the original one-hour window."
        : "Approving starts the one-hour payment window and prepares the Razorpay link before emailing the applicant."}</p>
      {!selected.row.preparing && <label>Decision <select value={selected.action} disabled={busy} onChange={event => setSelected({ ...selected, action: event.target.value === "decline" ? "decline" : "approve" })}>
        <option value="approve">Approve application</option><option value="decline">Decline application</option>
      </select></label>}
      <div className="button-row">
        <button className="button button-primary" disabled={busy} onClick={() => void decide()}>{selected.row.preparing
          ? "Retry checkout setup" : selected.action === "approve" ? "Approve and start payment window" : "Decline application"}</button>
        <button className="button button-quiet" disabled={busy} onClick={() => setSelected(null)}>Cancel</button>
      </div>
    </section>}
  </div></section>;
}
