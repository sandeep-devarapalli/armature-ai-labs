import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Field, PageHeader } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { formatPassDate, guestPassLabels, passRequest, type GoldenApplication, type GuestPass } from "../lib/pass-requests";

export { default as PassStaffPage } from "./PassStaffPage";

const guestPath = "/bookings/?item=guest#steps";
const goldenPath = "/golden-pass";
const readField = (data: FormData, field: string) => String(data.get(field) ?? "").trim();
const todayInBengaluru = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function PassSignIn({ next, children }: { next: string; children: string }) {
  return <div className="pass-panel"><p>{children}</p><Link className="button button-primary" to={"/auth?next=" + encodeURIComponent(next)}>Sign in by email</Link></div>;
}

export function GuestPassBooking() {
  const { loading, signedIn, account } = useAccount();
  if (loading) return <p role="status">Loading your account…</p>;
  if (!signedIn) return <PassSignIn next={guestPath}>Sign in to request your free Guest Pass. Anyone with a confirmed email can apply.</PassSignIn>;
  if (!account) return <p role="alert">Your account could not be loaded. Please refresh and try again.</p>;
  return <GuestRequests key={account.user_id} />;
}

function GuestRequests() {
  const [passes, setPasses] = useState<GuestPass[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    passRequest<GuestPass[]>("get_my_guest_passes")
      .then(rows => { if (active) setPasses(rows); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [revision]);

  async function update(rpc: "request_guest_pass" | "accept_guest_pass_date", args: Record<string, string>, message: string, form?: HTMLFormElement) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const pass = await passRequest<GuestPass>(rpc, args);
      setPasses(previous => [pass, ...(previous ?? []).filter(row => row.id !== pass.id)]);
      setNotice(message);
      form?.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request could not be saved.");
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void update("request_guest_pass", {
      p_visit_date: readField(data, "date"), p_purpose: readField(data, "purpose"), p_details: readField(data, "details"),
    }, "Request received. Wait for staff approval before visiting.", event.currentTarget);
  }

  return <div className="pass-layout">
    <form className="pass-panel" onSubmit={submit}>
      <h3>Request a free Guest Pass</h3>
      <p>Attend an event or meet someone at our HSR Layout lab. Coming to work? <Link to="/bookings/?item=desk#steps">Choose a paid desk pass</Link>.</p>
      <Field label="Preferred visit date"><input type="date" name="date" min={todayInBengaluru()} required /></Field>
      <Field label="Reason for visiting"><select name="purpose" required defaultValue=""><option value="" disabled>Choose one</option><option value="event">Attend an event</option><option value="meeting">Meet someone</option></select></Field>
      <Field label="Event name or meeting details"><textarea name="details" required minLength={3} maxLength={400} rows={3} /></Field>
      <label className="pass-consent"><input type="checkbox" required /> I’ll wait for approval and check in at reception.</label>
      <button className="button button-primary" disabled={busy || passes === null}>Submit guest request</button>
      <Link to="/privacy">Privacy notice</Link>
    </form>
    <section className="pass-panel" aria-labelledby="my-guest-passes">
      <h3 id="my-guest-passes">My Guest Pass requests</h3>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      {passes === null && (error ? <button type="button" className="button button-quiet" onClick={() => { setError(""); setRevision(n => n + 1); }}>Retry</button> : <p>Loading requests…</p>)}
      {passes?.length === 0 && <p>Your requests and staff decisions will appear here.</p>}
      {passes?.map(pass => <article className="pass-request" key={pass.id}>
        <strong>{formatPassDate(pass.visit_date)} · {guestPassLabels[pass.status]}</strong>
        <p>{pass.details}</p>
        {pass.status === "approved" && <p>Show <strong className="mono">{pass.reference}</strong> at reception on your approved date.</p>}
        {pass.staff_note && <p>{pass.staff_note}</p>}
        {pass.status === "alternate" && pass.offered_date && <p>
          Offered date {formatPassDate(pass.offered_date)}{" "}
          <button type="button" className="button button-quiet" disabled={busy} onClick={() => void update("accept_guest_pass_date", { p_id: pass.id }, "New date submitted for staff approval.")}>Accept date</button>
        </p>}
      </article>)}
    </section>
  </div>;
}

export function GoldenPassPage() {
  const { loading, signedIn, account } = useAccount();
  return <>
    <PageHeader meta="Annual membership" title="Armature AI Labs Golden Pass." description="₹1,00,000 per year for daytime access every day and priority booking for lab resources." />
    <section className="section"><div className="wrap pass-layout">
      <div>
        <div className="golden-pass-card" aria-label="Golden Pass sample membership card">
          <div><img src="/brand/editorial-2026-09/source/approved-circular-mark.svg" alt="" /> Armature AI Labs</div>
          <strong>Golden Pass</strong><span>Sample member · Annual <small>◔ Tap at reader</small></span>
        </div>
        <p className="book-note">Engraved metal card concept with proposed tap access.</p>
      </div>
      <div className="pass-panel"><h2>What’s included</h2>
        <ul><li>Daytime shared workspace access every day of the year.</li>
          <li>Priority booking for the 3D printer, other lab equipment, and eligible lab resources. Equipment use follows lab induction and safety rules.</li>
          <li>Partner locations and future Armature labs in Bengaluru and across India as they become available.</li>
          <li>Members-only mixers, project reviews, and hosted guest visits.</li></ul>
        <Link to="/bookings/?item=desk#steps">See daily, weekly and ₹13,000 monthly desk passes</Link>
      </div>
    </div></section>
    <section className="section" id="apply"><div className="wrap">
      <h2>Apply for the Golden Pass</h2>
      <p>Staff reviews your application and contacts you about payment and activation.</p>
      {loading ? <p role="status">Loading your account…</p>
        : !signedIn ? <PassSignIn next={goldenPath + "#apply"}>Sign in by email to start your application.</PassSignIn>
        : account ? <GoldenApplicationForm key={account.user_id} /> : <p role="alert">Your account could not be loaded. Please refresh and try again.</p>}
    </div></section>
  </>;
}

function GoldenApplicationForm() {
  const [application, setApplication] = useState<GoldenApplication | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    passRequest<GoldenApplication[]>("get_my_golden_pass_application")
      .then(rows => { if (active) { setApplication(rows[0] ?? null); setLoaded(true); } })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [revision]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      setApplication(await passRequest<GoldenApplication>("submit_golden_pass_application", {
        p_details: readField(new FormData(event.currentTarget), "details"),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Your application could not be saved.");
    } finally { setBusy(false); }
  }

  if (application) return <p role="status">Application received on {formatPassDate(application.created_at)}. Staff will contact you.</p>;
  return <>{error && <p role="alert">{error}</p>}
    {!loaded ? error ? <button className="button button-quiet" type="button" onClick={() => { setError(""); setRevision(n => n + 1); }}>Retry</button>
      : <p role="status">Checking for an existing application…</p>
      : <form className="pass-panel pass-application" onSubmit={submit}>
        <Field label="What are you building, and how would you use the lab?"><textarea name="details" required minLength={3} maxLength={400} rows={4} /></Field>
        <button className="button button-primary" disabled={busy}>Submit application</button>
        <Link to="/privacy">Privacy notice</Link>
      </form>}
  </>;
}
