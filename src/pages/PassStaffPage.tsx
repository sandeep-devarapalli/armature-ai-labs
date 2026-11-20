import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { EmptyState, Field, PageHeader, Status } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { formatPassDate, guestPassLabels, passRequest, type GuestPass, type GoldenApplication } from "../lib/pass-requests";

type StaffGuest = GuestPass & { guest_email?: string };
type StaffApplication = GoldenApplication & { applicant_email?: string };
type Decision = "approve" | "decline" | "offer" | "check_in";

function guestStatus(status: GuestPass["status"]) {
  return <Status tone={status === "approved" || status === "checked_in" ? "good" : status === "pending" || status === "alternate" ? "warn" : "neutral"}>
    {guestPassLabels[status]}
  </Status>;
}

function ReviewGuest({ guest, reserved, working, onDecision }: { guest: StaffGuest; reserved: number; working: boolean;
  onDecision: (id: string, action: Decision, fields: FormData) => Promise<void> }) {
  const [action, setAction] = useState<Decision>("approve");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onDecision(guest.id, guest.status === "approved" ? "check_in" : action, new FormData(event.currentTarget));
  }

  return <section className="pass-review-detail" aria-label="Selected guest pass">
    <header><h3>Review request</h3>{guestStatus(guest.status)}</header>
    <dl className="pass-review-facts">
      <div><dt>Guest email</dt><dd>{guest.guest_email}</dd></div>
      <div><dt>Visit date</dt><dd>{formatPassDate(guest.visit_date)}</dd></div>
      <div><dt>Reason</dt><dd>{guest.purpose === "event" ? "Attend an event" : "Meet someone"}</dd></div>

      {guest.offered_date && <div><dt>Offered date</dt><dd>{formatPassDate(guest.offered_date)}</dd></div>}
      <div className="pass-review-full"><dt>Visit details</dt><dd>{guest.details}</dd></div>
      {guest.staff_note && <div className="pass-review-full"><dt>Note to guest</dt><dd>{guest.staff_note}</dd></div>}
    </dl>
    {guest.status === "pending" && <form className="ol-form" onSubmit={submit}>
      <p className="book-note">{reserved} of 4 guest places reserved in this queue.</p>
      <Field label="Decision"><select value={action} disabled={working} onChange={event => setAction(event.target.value as Decision)}>
        <option value="approve">Approve visit</option><option value="offer">Offer another date</option><option value="decline">Decline request</option>
      </select></Field>
      {action === "offer" && <Field label="Alternative date"><input name="date" type="date" min={today} required disabled={working} /></Field>}
      <Field label="Note to guest" hint="Optional. The guest sees this on their status page.">
        <textarea name="note" rows={2} maxLength={250} disabled={working} />
      </Field>
      <button className="button button-primary" disabled={working}>{working ? "Saving…" : action === "approve" ? "Approve visit" : action === "offer" ? "Offer another date" : "Decline request"}</button>
    </form>}
    {guest.status === "approved" && <form className="ol-form" onSubmit={submit}>
      <Field label="Guest’s pass reference" hint="Match the person to this request before checking them in.">
        <input name="reference" required maxLength={80} autoComplete="off" disabled={working || guest.visit_date !== today} />
      </Field>
      <button className="button button-primary" disabled={working || guest.visit_date !== today}>{working ? "Checking in…" : "Check guest in"}</button>
      {guest.visit_date !== today && <p className="book-note">Check-in opens on the approved visit date.</p>}
    </form>}
    {guest.status === "alternate" && <p className="book-note">Waiting for the guest to accept the offered date.</p>}
  </section>;
}

function PassQueues() {
  const [guests, setGuests] = useState<StaffGuest[]>([]);
  const [applications, setApplications] = useState<StaffApplication[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("all");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    void Promise.all([
      passRequest<StaffGuest[]>("staff_list_guest_passes"),
      passRequest<StaffApplication[]>("staff_list_golden_pass_applications"),
    ]).then(([guestList, applicationList]) => {
      if (!live) return;
      setGuests(guestList);
      setApplications(applicationList);
    }).catch(() => {
      if (!live) return;
      setGuests([]);
      setApplications([]);
      setError("The pass queues could not be loaded. Try refreshing.");
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refresh]);

  async function decide(id: string, action: Decision, fields: FormData) {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const updated = await passRequest<StaffGuest>("staff_update_guest_pass", {
        p_id: id, p_action: action, p_offered_date: action === "offer" ? String(fields.get("date")) : null,
        p_note: action === "check_in" ? null : String(fields.get("note") ?? "").trim() || null,
        p_reference: action === "check_in" ? String(fields.get("reference") ?? "").trim() : null,
      });
      setGuests(rows => rows.map(guest => guest.id === updated.id ? { ...guest, ...updated } : guest));
      setNotice(`Guest pass updated. ${guestPassLabels[updated.status]}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the guest pass.");
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }

  const visible = filter === "all" ? guests : guests.filter(guest => guest.status === filter);
  const selected = visible.find(guest => guest.id === selectedId) ?? visible[0];
  const reserved = selected ? guests.filter(guest => guest.visit_date === selected.visit_date && (guest.status === "approved" || guest.status === "checked_in")).length : 0;
  return <section className="section"><div className="wrap pass-review">
    <div className="pass-review-bar">
      <h2>Guest passes</h2>
      <button type="button" className="button button-quiet" onClick={() => setRefresh(value => value + 1)} disabled={loading || working}>Refresh queues</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading requests…</p> : <>
      <div className="pass-review-grid">
        <div>
          <Field label="Guest pass status"><select value={filter} disabled={working} onChange={event => setFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(guestPassLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></Field>
          {visible.length ? <div className="book-table-wrap pass-review-table"><table className="book-table">
            <caption className="mono">Visit requests</caption>
            <thead><tr><th scope="col">Guest</th><th scope="col">Visit date</th><th scope="col">Status</th></tr></thead>
            <tbody>{visible.map(guest => <tr key={guest.id} className={selected?.id === guest.id ? "is-selected" : ""}>
              <th scope="row"><button className="button button-quiet" type="button" aria-pressed={selected?.id === guest.id} disabled={working} onClick={() => setSelectedId(guest.id)}>{guest.guest_email}</button></th>
              <td data-label="Visit date">{formatPassDate(guest.visit_date)}</td><td data-label="Status">{guestStatus(guest.status)}</td>
            </tr>)}</tbody>
          </table></div> : <EmptyState title="No matching guest passes">Choose a different status or refresh the queue.</EmptyState>}
        </div>
        {selected && <ReviewGuest key={selected.id} guest={selected} reserved={reserved} working={working} onDecision={decide} />}
      </div>
      <h2>Golden Pass applications</h2>
      <p className="book-note">Contact applicants to arrange payment and activate membership manually.</p>
      {applications.length ? <ul className="pass-applications">{applications.map(application => <li key={application.id}>
        <h3>{application.applicant_email}</h3>
        <p className="book-note">Received {formatPassDate(application.created_at)}</p>
        <p>{application.details}</p>
        {application.applicant_email && <a href={`mailto:${encodeURIComponent(application.applicant_email).replace(/%40/g, "@")}?subject=Armature%20AI%20Labs%20Golden%20Pass`}>Email applicant</a>}
      </li>)}</ul> : <EmptyState title="No Golden Pass applications">New applications will appear here.</EmptyState>}
    </>}
  </div></section>;
}

export default function PassStaffPage() {
  const { account, signedIn, loading, error, refresh } = useAccount();
  const isStaff = account?.role === "membership_reviewer" || account?.role === "admin" || account?.role === "super_admin";
  return <>
    <PageHeader title="Pass requests." description="Review Guest Pass requests and follow up on Golden Pass applications." />
    {isStaff && account ? <PassQueues key={account.user_id} /> : <section className="section"><div className="wrap">
      {loading ? <p role="status">Checking staff access…</p> : error ? <>
        <p role="alert">{error}</p><button className="button button-quiet" onClick={() => void refresh()}>Retry</button>
      </> : signedIn ? <p>This area is available to Armature staff.</p>
        : <Link className="button button-primary" to="/auth?next=%2Fadmin%2Fpasses">Sign in</Link>}
    </div></section>}
  </>;
}
