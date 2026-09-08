import { useEffect, useRef, useState, type FormEvent, type PropsWithChildren } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarSync,
  CircuitBoard,
  ClipboardList,
  DoorOpen,
  ListChecks,
  PackageOpen,
  Radio,
  ServerCog,
  UserCheck,
  Users,
  Wrench
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { Link, NavLink, useLocation } from "react-router-dom";
import { EmptyState, Metric, PageHeader, Section, Status } from "../components/Primitives";
import { MemberAvatar } from "../components/MemberAvatar";
import { resourceFor, useApp } from "../context/AppContext";

const adminLinks = [
  ["/admin/members", "Members", Users],
  ["/admin/resources", "Resources", Wrench],
  ["/admin/bookings", "Bookings", CalendarClock],
  ["/admin/attendance", "Attendance", DoorOpen],
  ["/admin/components", "Components", CircuitBoard],
  ["/admin/inventory", "Inventory", Archive],
  ["/admin/component-requests", "Requests", ClipboardList],
  ["/admin/cabinets", "Cabinets", Radio],
  ["/admin/maker-services", "Maker desk", PackageOpen],
  ["/admin/integrations", "Integrations", ServerCog]
] as const;

export function OperationsHeader({ children }: PropsWithChildren) {
  const { mode } = useApp();
  const { pathname } = useLocation();
  const navRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    navRef.current
      ?.querySelector<HTMLAnchorElement>("a.active")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [pathname]);

  return (
    <>
      <header className="operations-header">
        <div className="wrap">
          <div><span className="mono">Staff operations · protected role</span><h1>{children}</h1></div>
          <Status tone={mode === "demo" ? "warn" : "good"}>{mode === "demo" ? "Local demo controls" : "Supabase RLS active"}</Status>
        </div>
      </header>
      <nav className="admin-nav" aria-label="Operations sections">
        <div className="wrap" ref={navRef}>
          {adminLinks.map(([to, label, Icon]) => <NavLink key={to} to={to}><Icon aria-hidden="true" />{label}</NavLink>)}
        </div>
      </nav>
    </>
  );
}

export function AdminMembersPage() {
  const { state, decideMembership, issueCertification } = useApp();
  const [error, setError] = useState("");
  const [certificationSaved, setCertificationSaved] = useState(false);
  const certificationNames = Array.from(
    new Set(state.resources.flatMap((resource) => resource.certifications))
  ).sort();

  async function certify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setCertificationSaved(false);
    const data = new FormData(event.currentTarget);
    try {
      await issueCertification(
        String(data.get("memberId")),
        String(data.get("certification")),
        String(data.get("expiresAt")),
        String(data.get("notes"))
      );
      setCertificationSaved(true);
      event.currentTarget.reset();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Certification could not be issued.");
    }
  }

  return (
    <>
      <OperationsHeader>Member approvals</OperationsHeader>
      <Section number="01" title="Applications" lede="Staff roles must come from protected database records in production, never editable profile metadata.">
        <div className="admin-list">
          {state.applications.map((application) => {
            const member = state.profiles.find((profile) => profile.id === application.memberId);
            return (
              <article key={application.id}>
                {member && <MemberAvatar member={member} />}
                <div><span className="mono">{format(parseISO(application.requestedAt), "d MMM yyyy")} · {member?.organization}</span><h3>{member?.name}</h3><p>{application.buildSummary}</p></div>
                <Status tone={application.state === "approved" ? "good" : application.state === "declined" ? "bad" : "warn"}>{application.state}</Status>
                <div className="row-actions">
                  <button type="button" className="icon-button good" title="Approve" onClick={() => { setError(""); void decideMembership(application.id, true).catch((reason: Error) => setError(reason.message)); }}><UserCheck aria-hidden="true" /><span className="sr-only">Approve {member?.name}</span></button>
                  <button type="button" className="icon-button bad" title="Decline" onClick={() => { setError(""); void decideMembership(application.id, false).catch((reason: Error) => setError(reason.message)); }}><AlertTriangle aria-hidden="true" /><span className="sr-only">Decline {member?.name}</span></button>
                </div>
              </article>
            );
          })}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </Section>
      <Section number="02" title="Certification queue" dark>
        <div className="operations-callout"><BadgeCheck aria-hidden="true" /><div><h3>Issue certifications only after an observed induction.</h3><p>The production RPC records issuer, evidence, issue and expiry dates, and an audit event. Profile owners cannot issue their own access.</p></div></div>
        <form className="profile-form" onSubmit={certify}>
          <div className="form-grid">
            <label>Approved member<select name="memberId" required defaultValue=""><option value="" disabled>Select a member</option>{state.profiles.filter((member) => member.membershipState === "active").map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
            <label>Certification<select name="certification" required defaultValue=""><option value="" disabled>Select an induction</option>{certificationNames.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
            <label>Expiry date<input name="expiresAt" type="date" /></label>
            <label>Issuance notes<input name="notes" placeholder="Observed induction and assessor notes" /></label>
          </div>
          <button className="button button-primary" type="submit"><BadgeCheck aria-hidden="true" /> Issue certification</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {certificationSaved && <p className="success-message">Certification issued and audited.</p>}
        </form>
      </Section>
    </>
  );
}

export function AdminResourcesPage() {
  const { state, toggleResource, createResourceBlock, setResourceHours } = useApp();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [hoursSaved, setHoursSaved] = useState(false);

  async function saveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setHoursSaved(false);
    const data = new FormData(event.currentTarget);
    const closed = data.get("closed") === "on";
    try {
      await setResourceHours({
        resourceId: String(data.get("resourceId")),
        dayOfWeek: Number(data.get("dayOfWeek")),
        opensAt: closed ? undefined : String(data.get("opensAt")),
        closesAt: closed ? undefined : String(data.get("closesAt"))
      });
      setHoursSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Operating hours could not be updated.");
    }
  }

  async function blockResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const data = new FormData(event.currentTarget);
    try {
      await createResourceBlock({
        resourceId: String(data.get("resourceId")),
        startsAt: new Date(String(data.get("startsAt"))).toISOString(),
        endsAt: new Date(String(data.get("endsAt"))).toISOString(),
        kind: String(data.get("kind")) as "maintenance" | "closure" | "staff_hold",
        reason: String(data.get("reason"))
      });
      event.currentTarget.reset();
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create the resource block.");
    }
  }

  return (
    <>
      <OperationsHeader>Resources and maintenance</OperationsHeader>
      <Section number="01" title="Resource controls">
        <div className="admin-resource-list">
          {state.resources.map((resource) => (
            <article key={resource.id}>
              <div><span className="mono">{resource.zone} · {resource.kind}</span><h3>{resource.name}</h3><p>{resource.certifications.length ? `Requires ${resource.certifications.join(", ")}` : "No resource-specific certification"}</p></div>
              <div className="resource-rules"><span>{resource.durationMinutes} min default</span><span>{resource.bookingHorizonDays} day horizon</span><span>{resource.capacity} capacity</span></div>
              <label className="switch-control"><input type="checkbox" checked={resource.available} onChange={() => { setError(""); void toggleResource(resource.id).catch((reason: Error) => setError(reason.message)); }} /><span /><b>{resource.available ? "Open" : "Closed"}</b></label>
            </article>
          ))}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </Section>
      <Section number="02" title="Weekly operating hours" dark>
        <form className="profile-form" onSubmit={saveHours}>
          <div className="form-grid">
            <label>Resource<select name="resourceId" required defaultValue=""><option value="" disabled>Select a resource</option>{state.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
            <label>Weekday<select name="dayOfWeek" defaultValue="1"><option value="0">Sunday</option><option value="1">Monday</option><option value="2">Tuesday</option><option value="3">Wednesday</option><option value="4">Thursday</option><option value="5">Friday</option><option value="6">Saturday</option></select></label>
            <label>Opens<input name="opensAt" type="time" defaultValue="09:00" /></label>
            <label>Closes<input name="closesAt" type="time" defaultValue="20:00" /></label>
          </div>
          <label className="checkbox-field"><input name="closed" type="checkbox" /> Keep this resource closed for the selected weekday</label>
          <button className="button button-primary" type="submit">Save weekday hours</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {hoursSaved && <p className="success-message">Base operating hours updated.</p>}
        </form>
      </Section>
      <Section number="03" title="Maintenance and closure blocks" dark>
        <form className="profile-form" onSubmit={blockResource}>
          <div className="form-grid">
            <label>Resource<select name="resourceId" required defaultValue=""><option value="" disabled>Select a resource</option>{state.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></label>
            <label>Block type<select name="kind" defaultValue="maintenance"><option value="maintenance">Maintenance</option><option value="closure">Closure</option><option value="staff_hold">Staff hold</option></select></label>
            <label>Starts<input name="startsAt" type="datetime-local" required /></label>
            <label>Ends<input name="endsAt" type="datetime-local" required /></label>
          </div>
          <label>Reason<input name="reason" required minLength={3} placeholder="Maintenance work, safety closure, or staff hold" /></label>
          <button className="button button-primary" type="submit">Create block</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {saved && <p className="success-message">Resource block created.</p>}
        </form>
      </Section>
    </>
  );
}

export function AdminBookingsPage() {
  const { state, setBookingStatus } = useApp();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function updateStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    const data = new FormData(event.currentTarget);
    try {
      await setBookingStatus(
        String(data.get("bookingId")),
        String(data.get("status")) as "cancelled" | "no_show" | "completed",
        String(data.get("reason"))
      );
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Booking state could not be updated.");
    }
  }

  return (
    <>
      <OperationsHeader>Booking ledger</OperationsHeader>
      <Section number="01" title="Reservations">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Booking</th><th>Member</th><th>Resource</th><th>Start</th><th>Guests</th><th>State</th></tr></thead>
            <tbody>
              {state.bookings.map((booking) => {
                const member = state.profiles.find((profile) => profile.id === booking.ownerId);
                return <tr key={booking.id}><th>{booking.id.slice(0, 18)}</th><td>{member?.name}</td><td>{resourceFor(state.resources, booking.resourceId)?.name}</td><td>{format(parseISO(booking.startsAt), "d MMM · h:mm a")}</td><td>{booking.guestNames.length}</td><td><Status tone={booking.state === "confirmed" ? "good" : "neutral"}>{booking.state}</Status></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section number="02" title="Staff booking action" dark>
        <form className="profile-form" onSubmit={updateStatus}>
          <div className="form-grid">
            <label>Confirmed booking<select name="bookingId" required defaultValue=""><option value="" disabled>Select a booking</option>{state.bookings.filter((booking) => booking.state === "confirmed").map((booking) => <option key={booking.id} value={booking.id}>{resourceFor(state.resources, booking.resourceId)?.name} · {state.profiles.find((member) => member.id === booking.ownerId)?.name}</option>)}</select></label>
            <label>Action<select name="status" defaultValue="cancelled"><option value="cancelled">Cancel</option><option value="no_show">Mark no-show</option><option value="completed">Mark completed</option></select></label>
          </div>
          <label>Required reason<input name="reason" required minLength={3} placeholder="Operational reason for the audited change" /></label>
          <button className="button button-primary" type="submit">Apply booking action</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {saved && <p className="success-message">Booking state updated and audited.</p>}
        </form>
      </Section>
    </>
  );
}

export function AdminAttendancePage() {
  const { state, checkOut } = useApp();
  const [error, setError] = useState("");
  return (
    <>
      <OperationsHeader>Attendance floor</OperationsHeader>
      <section className="workspace-metrics"><div className="wrap metric-grid three"><Metric label="On site" value={state.attendance.filter((session) => session.state === "open").length} /><Metric label="Closed" value={state.attendance.filter((session) => session.state === "closed").length} /><Metric label="Flagged" value={state.attendance.filter((session) => session.state === "flagged").length} /></div></section>
      <Section number="01" title="Sessions">
        {state.attendance.length ? <div className="admin-list">{state.attendance.map((session) => {
          const member = state.profiles.find((profile) => profile.id === session.memberId);
          const booking = state.bookings.find((item) => item.id === session.bookingId);
          return <article key={session.id}>{member && <MemberAvatar member={member} />}<div><span className="mono">{format(parseISO(session.checkedInAt), "d MMM · h:mm a")}</span><h3>{member?.name}</h3><p>{resourceFor(state.resources, booking?.resourceId ?? "")?.name}</p></div><Status tone={session.state === "open" ? "good" : "neutral"}>{session.state}</Status>{session.state === "open" && <button className="button button-quiet" type="button" onClick={() => { setError(""); void checkOut(session.id).catch((reason: Error) => setError(reason.message)); }}>Staff close</button>}</article>;
        })}</div> : <EmptyState title="No attendance sessions">A validated kiosk scan will open the first record.</EmptyState>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </Section>
    </>
  );
}

export function AdminIntegrationsPage() {
  const { state, mode, resetDemo, createKioskEnrollment } = useApp();
  const failed = state.calendarSync.filter((item) => item.state === "failed").length;
  const [enrollment, setEnrollment] = useState<{ token: string; expiresAt: string } | null>(null);
  const [error, setError] = useState("");

  async function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      setEnrollment(await createKioskEnrollment(String(data.get("name"))));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Kiosk enrollment failed.");
    }
  }
  return (
    <>
      <OperationsHeader>Integration monitor</OperationsHeader>
      <section className="workspace-metrics"><div className="wrap metric-grid three"><Metric label="Data mode" value={mode} /><Metric label="Calendar queue" value={state.calendarSync.filter((item) => item.state === "queued").length} /><Metric label="Failures" value={failed} /></div></section>
      <Section number="01" title="Google Calendar mirror">
        <div className="integration-banner"><CalendarSync aria-hidden="true" /><div><span className="mono">bookings@armaturelab.org</span><h3>One private calendar per resource</h3><p>Supabase remains authoritative. Confirmed bookings enqueue idempotent create, update, and cancel operations; external edits are overwritten after conflict review.</p></div><Status tone={mode === "demo" ? "warn" : "good"}>{mode === "demo" ? "Not connected" : "Connected"}</Status></div>
        <div className="integration-list">
          {state.calendarSync.map((sync) => <article key={sync.id}><CalendarSync aria-hidden="true" /><div><span className="mono">{sync.operation} · attempt {sync.attempts}</span><h3>{resourceFor(state.resources, sync.resourceId)?.name}</h3><p>{sync.message}</p></div><Status tone={sync.state === "synced" ? "good" : sync.state === "failed" ? "bad" : "warn"}>{sync.state}</Status></article>)}
        </div>
      </Section>
      <Section number="02" title="Kiosk enrollment" dark>
        <form className="inline-form" onSubmit={enroll}>
          <label>Kiosk name<input name="name" required minLength={3} defaultValue="HSR entry kiosk" /></label>
          <button className="button button-primary" type="submit">Create 10-minute enrollment</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {enrollment && <div className="enrollment-token"><span className="mono">Enter this once on the kiosk · expires {format(parseISO(enrollment.expiresAt), "h:mm a")}</span><code>{enrollment.token}</code></div>}
        </form>
      </Section>
      {mode === "demo" && <Section number="03" title="Demo maintenance" dark>
        <div className="operations-callout"><ListChecks aria-hidden="true" /><div><h3>Reset local operational state</h3><p>This removes locally created bookings, profiles, check-in intents, and attendance changes, then restores the seeded demo.</p></div><button className="button button-quiet" type="button" onClick={resetDemo}>Reset demo</button></div>
      </Section>}
    </>
  );
}

export function KioskLinkPage() {
  return (
    <PageHeader
      meta="Trusted on-site device"
      title="Armature AI Labs check-in kiosk."
      description="Enroll this device from staff operations before scanning member codes. Production enrollment binds a device key and rejects unsigned, replayed, expired, or off-site requests."
      actions={<Link className="button button-primary" to="/kiosk">Open kiosk <ArrowRight aria-hidden="true" /></Link>}
    />
  );
}
