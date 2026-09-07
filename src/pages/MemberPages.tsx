import { useEffect, useMemo, useState, type FormEvent } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  ImageUp,
  KeyRound,
  QrCode,
  ShieldCheck,
  UserRound,
  Users,
  Wrench
} from "lucide-react";
import {
  addHours,
  addMinutes,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMinute
} from "date-fns";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MemberAvatar } from "../components/MemberAvatar";
import { EmptyState, Field, Metric, PageHeader, Section, Status } from "../components/Primitives";
import { resourceFor, useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import type { MemberProfile } from "../types/domain";

const dateTime = (value: string) => format(parseISO(value), "EEE, d MMM · h:mm a");
const time = (value: string) => format(parseISO(value), "h:mm a");

function serializeLinks(links: MemberProfile["projectLinks"]) {
  return links.map((link) => `${link.label} | ${link.url}`).join("\n");
}

function parseLinks(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, rawUrl] = line.split("|", 2).map((part) => part.trim());
      if (!label || !rawUrl) {
        throw new Error("Use one link per line in the format Label | https://example.com.");
      }
      const url = new URL(rawUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("Public links must use http or https.");
      }
      return { label, url: url.toString() };
    });
}

export function DashboardPage() {
  const { currentMember, state, mode } = useApp();
  if (!currentMember) return null;
  const bookings = state.bookings
    .filter((booking) => booking.ownerId === currentMember.id && booking.state === "confirmed")
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const activeAttendance = state.attendance.find(
    (session) => session.memberId === currentMember.id && session.state === "open"
  );
  const next = bookings.find((booking) => isAfter(parseISO(booking.endsAt), new Date()));

  return (
    <>
      <header className="workspace-hero">
        <div className="wrap workspace-hero-grid">
          <div>
            <span className="mono">Member workspace · {mode}</span>
            <h1>Good to see you, {currentMember.name.split(" ")[0]}.</h1>
            <p>Your approval, safety credentials, reservations, and attendance are kept together here.</p>
          </div>
          <div className="dashboard-actions">
            <Link className="button button-primary" to="/book"><CalendarDays aria-hidden="true" /> Book a resource</Link>
            <Link className="button button-quiet" to="/check-in"><QrCode aria-hidden="true" /> Check in</Link>
          </div>
        </div>
      </header>
      <section className="workspace-metrics">
        <div className="wrap metric-grid four">
          <Metric label="Membership" value={<Status tone={currentMember.membershipState === "active" ? "good" : "warn"}>{currentMember.membershipState}</Status>} />
          <Metric label="Certifications" value={currentMember.certifications.length} note="active in demo" />
          <Metric label="Upcoming" value={bookings.length} note="confirmed bookings" />
          <Metric label="Attendance" value={activeAttendance ? "On site" : "Checked out"} />
        </div>
      </section>
      <Section number="01" title="Next on the floor">
        {next ? (
          <article className="booking-feature">
            <div>
              <span className="mono">{resourceFor(state.resources, next.resourceId)?.zone}</span>
              <h3>{resourceFor(state.resources, next.resourceId)?.name}</h3>
              <p>{next.purpose}</p>
            </div>
            <div className="booking-time">
              <CalendarClock aria-hidden="true" />
              <strong>{dateTime(next.startsAt)}</strong>
              <span>{time(next.startsAt)}–{time(next.endsAt)}</span>
            </div>
            <Link to={`/bookings/${next.id}`}>Manage <ArrowRight aria-hidden="true" /></Link>
          </article>
        ) : (
          <EmptyState title="No upcoming bookings">Choose a resource and reserve the first block of work.</EmptyState>
        )}
      </Section>
      <Section number="02" title="Safety access" dark>
        <div className="cert-list">
          {currentMember.certifications.map((certification) => (
            <div key={certification}><BadgeCheck aria-hidden="true" /><div><strong>{certification}</strong><span>Active · issued by Armature AI Labs staff</span></div></div>
          ))}
        </div>
      </Section>
    </>
  );
}

export function ProfilePage() {
  const { currentMember, updateProfile, uploadAvatar, mode } = useApp();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [avatarWorking, setAvatarWorking] = useState(false);
  if (!currentMember) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorking(true);
    setSaved(false);
    setError("");
    try {
      await updateProfile({
        name: String(data.get("name")),
        handle: String(data.get("handle")).replace(/^@/, "").trim(),
        organization: String(data.get("organization")),
        bio: String(data.get("bio")),
        phone: String(data.get("phone")),
        emergencyContact: String(data.get("emergencyContact")),
        skills: String(data.get("skills")).split(",").map((value) => value.trim()).filter(Boolean),
        projectLinks: parseLinks(data.get("projectLinks")),
        socialLinks: parseLinks(data.get("socialLinks"))
      });
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Profile save failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader
        meta="Private account · public profile controls"
        title="Keep your working identity current."
        description="Name, handle, avatar, bio, skills, organization, and public links can appear in the member directory. Contact and operational records remain private."
      />
      <Section number="01" title="Profile">
        <div className="avatar-editor">
          <MemberAvatar member={currentMember} large />
          <div>
            <h3>Public avatar</h3>
            <p>JPEG, PNG, or WebP. Five megabytes maximum.</p>
            <label className="button button-quiet">
              <ImageUp aria-hidden="true" />
              {avatarWorking ? "Uploading…" : "Choose image"}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={avatarWorking}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setAvatarWorking(true);
                  setError("");
                  void uploadAvatar(file)
                    .catch((reason: Error) => setError(reason.message))
                    .finally(() => {
                      setAvatarWorking(false);
                      event.target.value = "";
                    });
                }}
              />
            </label>
          </div>
        </div>
        <form className="profile-form" onSubmit={submit}>
          <div className="form-grid">
            <Field label="Display name"><input name="name" defaultValue={currentMember.name} required /></Field>
            <Field label="Public handle"><input name="handle" defaultValue={currentMember.handle} required pattern="[a-z0-9-]+" /></Field>
            <Field label="Organization"><input name="organization" defaultValue={currentMember.organization} /></Field>
            <Field label="Private phone"><input name="phone" type="tel" defaultValue={currentMember.phone} /></Field>
          </div>
          <Field label="Public bio"><textarea name="bio" rows={4} defaultValue={currentMember.bio} required /></Field>
          <Field label="Public skills" hint="Comma-separated"><input name="skills" defaultValue={currentMember.skills.join(", ")} /></Field>
          <Field label="Public project links" hint="One per line: Label | https://example.com"><textarea name="projectLinks" rows={3} defaultValue={serializeLinks(currentMember.projectLinks)} /></Field>
          <Field label="Public social links" hint="One per line: Label | https://example.com"><textarea name="socialLinks" rows={3} defaultValue={serializeLinks(currentMember.socialLinks)} /></Field>
          <Field label="Private emergency contact"><input name="emergencyContact" defaultValue={currentMember.emergencyContact} /></Field>
          <div className="button-row">
            <button className="button button-primary" type="submit" disabled={working}><UserRound aria-hidden="true" /> {working ? "Saving…" : "Save profile"}</button>
            <Link className="button button-quiet" to={`/members/${currentMember.handle}`}>View public profile <ExternalLink aria-hidden="true" /></Link>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          {saved && <p className="success-message"><CheckCircle2 aria-hidden="true" /> Saved {mode === "demo" ? "in the local demo store" : "to your private member record"}.</p>}
        </form>
      </Section>
      <Section number="02" title="Account security" dark>
        <MfaPanel mode={mode} />
      </Section>
    </>
  );
}

function MfaPanel({ mode }: { mode: "demo" | "supabase" }) {
  const [factorId, setFactorId] = useState("");
  const [enrollment, setEnrollment] = useState<{
    id: string;
    qrCode: string;
    secret: string;
  } | null>(null);
  const [assurance, setAssurance] = useState("aal1");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function loadSecurityState() {
    if (!supabase) return;
    const [factorsResult, assuranceResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);
    if (factorsResult.error) throw factorsResult.error;
    if (assuranceResult.error) throw assuranceResult.error;
    setFactorId(factorsResult.data.totp.find((factor) => factor.status === "verified")?.id ?? "");
    setAssurance(assuranceResult.data.currentLevel ?? "aal1");
  }

  useEffect(() => {
    void loadSecurityState().catch((reason: Error) => setError(reason.message));
  }, []);

  async function startEnrollment() {
    if (!supabase) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Armature AI Labs authenticator"
      });
      if (enrollError) throw enrollError;
      setEnrollment({
        id: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not begin MFA setup.");
    } finally {
      setWorking(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const selectedFactorId = enrollment?.id ?? factorId;
    if (!selectedFactorId) return;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: selectedFactorId,
        code
      });
      if (verifyError) throw verifyError;
      setEnrollment(null);
      setCode("");
      await loadSecurityState();
      setMessage("Authenticator verified. This session now satisfies the staff override MFA gate.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The authenticator code was not accepted.");
    } finally {
      setWorking(false);
    }
  }

  if (mode === "demo") {
    return (
      <div className="security-panel">
        <KeyRound aria-hidden="true" />
        <div>
          <h3>Authenticator setup is live-account only.</h3>
          <p>Supabase TOTP enrollment and session elevation are intentionally not simulated in the local demo.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="security-panel">
      <ShieldCheck aria-hidden="true" />
      <div>
        <div className="security-heading">
          <div>
            <h3>Authenticator app</h3>
            <p>Staff overrides and kiosk administration require an AAL2 session.</p>
          </div>
          <Status tone={assurance === "aal2" ? "good" : "warn"}>{assurance}</Status>
        </div>
        {!factorId && !enrollment && (
          <button className="button button-primary" type="button" disabled={working} onClick={() => void startEnrollment()}>
            <KeyRound aria-hidden="true" /> Set up authenticator
          </button>
        )}
        {enrollment && (
          <div className="mfa-enrollment">
            <img src={enrollment.qrCode} alt="Authenticator enrollment QR code" />
            <div>
              <p>Scan this code with an authenticator app, then enter its six-digit code.</p>
              <code>{enrollment.secret}</code>
            </div>
          </div>
        )}
        {(factorId || enrollment) && assurance !== "aal2" && (
          <form className="mfa-verify" onSubmit={verify}>
            <Field label="Six-digit authenticator code">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                required
              />
            </Field>
            <button className="button button-primary" type="submit" disabled={working || code.length !== 6}>
              <ShieldCheck aria-hidden="true" /> {working ? "Verifying…" : enrollment ? "Finish setup" : "Verify this session"}
            </button>
          </form>
        )}
        {assurance === "aal2" && <p className="success-message"><CheckCircle2 aria-hidden="true" /> This session is MFA verified.</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="success-message">{message}</p>}
      </div>
    </div>
  );
}

export function BookPage() {
  const { currentMember, state } = useApp();
  return (
    <>
      <PageHeader
        meta="Live resource directory"
        title="Reserve a working block."
        description="One approved member owns each booking. Availability, certification, guest, maintenance, and conflict rules are checked again when the reservation is created."
      />
      {currentMember?.membershipState !== "active" && (
        <div className="gate-banner"><div className="wrap"><AlertTriangle aria-hidden="true" /><p>Your membership is {currentMember?.membershipState}. Booking unlocks after staff approval.</p><Link to="/join">View application</Link></div></div>
      )}
      <Section number="01" title="Bookable resources">
        <div className="book-resource-list">
          {state.resources.map((resource) => {
            const missing = resource.certifications.filter((cert) => !currentMember?.certifications.includes(cert));
            const blocked = !resource.available || missing.length > 0 || currentMember?.membershipState !== "active";
            return (
              <article className="book-resource-row" key={resource.id}>
                <div className="resource-symbol"><Wrench aria-hidden="true" /></div>
                <div>
                  <span className="mono">{resource.zone} · {resource.kind}</span>
                  <h3>{resource.name}</h3>
                  <p>{resource.description}</p>
                  <div className="tag-row">
                    <span>{resource.durationMinutes} min default</span>
                    <span>max {resource.maxDurationMinutes / 60} hr</span>
                    <span>{resource.maxGuests} guests</span>
                  </div>
                </div>
                <div className="book-row-action">
                  {missing.length ? <Status tone="warn">{missing[0]} required</Status> : <Status tone={resource.available ? "good" : "bad"}>{resource.available ? "Ready" : "Maintenance"}</Status>}
                  {blocked ? <button className="button button-quiet" disabled>Unavailable</button> : <Link className="button button-primary" to={`/book/${resource.slug}`}>Choose time</Link>}
                </div>
              </article>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function nextQuarterHour() {
  const now = startOfMinute(new Date());
  const remainder = now.getMinutes() % 15;
  return addMinutes(now, remainder === 0 ? 0 : 15 - remainder);
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export function ResourceBookingPage() {
  const { resource: slug } = useParams();
  const { state, currentMember, createBooking, listAvailability, online } = useApp();
  const navigate = useNavigate();
  const resource = state.resources.find((item) => item.slug === slug);
  const [start, setStart] = useState(toLocalInput(nextQuarterHour()));
  const [duration, setDuration] = useState(resource?.durationMinutes ?? 60);
  const [guests, setGuests] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [availability, setAvailability] = useState<Array<{ startsAt: string; endsAt: string; available: boolean; reason: string | null }>>([]);
  const [availabilityError, setAvailabilityError] = useState("");
  if (!resource || !currentMember) return <PageHeader title="Resource not found." description="Return to the live resource directory." actions={<Link className="button button-quiet" to="/book">Resources</Link>} />;
  const resourceId = resource.id;

  useEffect(() => {
    const selected = new Date(start);
    if (Number.isNaN(selected.getTime())) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void listAvailability(
        resourceId,
        selected.toISOString(),
        addHours(selected, 8).toISOString(),
        duration
      ).then((slots) => {
        if (active) {
          setAvailability(slots);
          setAvailabilityError("");
        }
      }).catch((reason: Error) => {
        if (active) setAvailabilityError(reason.message);
      });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [duration, listAvailability, resourceId, start]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!online) {
      setError("Booking requires a live connection.");
      return;
    }
    const data = new FormData(event.currentTarget);
    setWorking(true);
    try {
      const booking = await createBooking({
        resourceId,
        startsAt: new Date(start).toISOString(),
        durationMinutes: duration,
        purpose: String(data.get("purpose")),
        guestNames: guests.split(",").map((guest) => guest.trim()).filter(Boolean)
      });
      navigate(`/bookings/${booking.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Booking failed.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader meta={`${resource.zone} · ${resource.kind}`} title={resource.name} description={resource.description} />
      <Section number="01" title="Choose a live block">
        <div className="booking-layout">
          <form className="booking-form" onSubmit={submit}>
            <Field label="Start time" hint="Asia/Kolkata · 15-minute increments">
              <input type="datetime-local" required step={900} value={start} onChange={(event) => setStart(event.target.value)} />
            </Field>
            <Field label={`Duration · ${duration} minutes`}>
              <input type="range" min={15} max={resource.maxDurationMinutes} step={15} value={duration} onChange={(event) => setDuration(Number(event.target.value))} />
            </Field>
            <Field label={`Guests · maximum ${resource.maxGuests}`} hint={resource.hazardous ? "Guests are prohibited for this hazardous resource." : "Comma-separated names"}>
              <input value={guests} onChange={(event) => setGuests(event.target.value)} disabled={resource.maxGuests === 0} placeholder={resource.maxGuests ? "Guest names" : "No guests permitted"} />
            </Field>
            <Field label="Purpose of session"><textarea name="purpose" rows={4} required placeholder="What will you build or test during this block?" /></Field>
            {resource.certifications.length > 0 && <div className="cert-gate"><ShieldCheck aria-hidden="true" /><span>Required: {resource.certifications.join(", ")}</span></div>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-wide" type="submit" disabled={!online || working}>{working ? "Confirming…" : "Confirm booking"} <ArrowRight aria-hidden="true" /></button>
          </form>
          <aside className="availability-panel">
            <span className="mono">Anonymous live availability</span>
            {availabilityError && <p className="form-error">{availabilityError}</p>}
            {availability.slice(0, 8).map((slot) => (
              <button
                className="availability-slot"
                type="button"
                key={slot.startsAt}
                disabled={!slot.available}
                onClick={() => setStart(toLocalInput(parseISO(slot.startsAt)))}
              >
                <CalendarClock aria-hidden="true" />
                <span>{dateTime(slot.startsAt)}</span>
                <strong>{time(slot.startsAt)}–{time(slot.endsAt)}</strong>
                <Status tone={slot.available ? "good" : "neutral"}>{slot.available ? "Open" : slot.reason ?? "Unavailable"}</Status>
              </button>
            ))}
            {!availability.length && !availabilityError && <p>Checking operating hours and reservations…</p>}
            <p className="estimate-note">The final conflict and certification check runs atomically in Postgres.</p>
          </aside>
        </div>
      </Section>
    </>
  );
}

export function BookingsPage() {
  const { state, currentMember } = useApp();
  if (!currentMember) return null;
  const bookings = state.bookings.filter((booking) => booking.ownerId === currentMember.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  return (
    <>
      <PageHeader meta="Private reservation history" title="My bookings." description="Confirmed, cancelled, completed, and no-show records remain private to the responsible member and staff." actions={<Link className="button button-primary" to="/book">New booking</Link>} />
      <Section number="01" title={`${bookings.length} booking records`}>
        {bookings.length ? <div className="booking-list">{bookings.map((booking) => {
          const resource = resourceFor(state.resources, booking.resourceId);
          return <article key={booking.id}><div><span className="mono">{booking.id.slice(0, 16)}</span><h3>{resource?.name}</h3><p>{booking.purpose}</p></div><div><strong>{dateTime(booking.startsAt)}</strong><span>{time(booking.startsAt)}–{time(booking.endsAt)}</span></div><Status tone={booking.state === "confirmed" ? "good" : "neutral"}>{booking.state}</Status><Link to={`/bookings/${booking.id}`}>Open <ArrowRight aria-hidden="true" /></Link></article>;
        })}</div> : <EmptyState title="No bookings yet">Reserve the first block of work.</EmptyState>}
      </Section>
    </>
  );
}

export function BookingDetailPage() {
  const { id } = useParams();
  const { state, cancelBooking, rescheduleBooking, online } = useApp();
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const booking = state.bookings.find((item) => item.id === id);
  if (!booking) return <PageHeader title="Booking not found." description="It may have been removed from the local demo store." />;
  const resource = resourceFor(state.resources, booking.resourceId);
  const durationMinutes = Math.round(
    (parseISO(booking.endsAt).getTime() - parseISO(booking.startsAt).getTime()) /
      60000
  );

  async function reschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setWorking(true);
    setError("");
    try {
      await rescheduleBooking(
        booking!.id,
        new Date(String(data.get("startsAt"))).toISOString(),
        Number(data.get("duration"))
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not reschedule the booking.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader meta={`Booking · ${booking.state}`} title={resource?.name ?? "Resource"} description={booking.purpose} />
      <Section number="01" title="Reservation record">
        <div className="record-grid">
          <Metric label="Start" value={dateTime(booking.startsAt)} />
          <Metric label="End" value={dateTime(booking.endsAt)} />
          <Metric label="Guests" value={booking.guestNames.length || "None"} note={booking.guestNames.join(", ")} />
          <Metric label="State" value={<Status tone={booking.state === "confirmed" ? "good" : "neutral"}>{booking.state}</Status>} />
        </div>
        <div className="button-row record-actions">
          {booking.state === "confirmed" && <button className="button button-danger" type="button" disabled={!online || working} onClick={() => {
            setWorking(true);
            setError("");
            void cancelBooking(booking.id).catch((reason: Error) => setError(reason.message)).finally(() => setWorking(false));
          }}>{working ? "Cancelling…" : "Cancel booking"}</button>}
          <Link className="button button-quiet" to="/bookings">All bookings</Link>
        </div>
        {booking.state === "confirmed" && (
          <form className="reschedule-form" onSubmit={reschedule}>
            <div>
              <span className="mono">Move this reservation</span>
              <h3>Choose a new working block</h3>
            </div>
            <Field label="New start">
              <input
                name="startsAt"
                type="datetime-local"
                defaultValue={toLocalInput(parseISO(booking.startsAt))}
                required
              />
            </Field>
            <Field label="Duration">
              <select name="duration" defaultValue={durationMinutes}>
                {[30, 60, 90, 120, 180, 240]
                  .filter((minutes) => minutes <= (resource?.maxDurationMinutes ?? 240))
                  .map((minutes) => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
              </select>
            </Field>
            <button className="button button-primary" type="submit" disabled={!online || working}>
              <CalendarClock aria-hidden="true" /> {working ? "Checking…" : "Reschedule"}
            </button>
          </form>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
      </Section>
    </>
  );
}

export function CheckInPage() {
  const { state, currentMember, createCheckinIntent, mode, online } = useApp();
  const [intent, setIntent] = useState<{ token: string; expiresAt: string; action: "check_in" | "check_out" } | null>(null);
  const [image, setImage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const activeSession = state.attendance.find((session) => session.memberId === currentMember?.id && session.state === "open");
  const action = activeSession ? "check_out" : "check_in";

  useEffect(() => {
    if (!intent) return;
    void QRCode.toDataURL(`armature://check-in?token=${intent.token}`, { width: 320, margin: 2, color: { dark: "#0A1220", light: "#FFFEFA" } }).then(setImage);
    const tick = () => setSeconds(Math.max(0, Math.ceil((parseISO(intent.expiresAt).getTime() - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 500);
    return () => window.clearInterval(timer);
  }, [intent]);

  async function generate() {
    if (!online) return;
    setWorking(true);
    setError("");
    try {
      setIntent(await createCheckinIntent(activeSession?.bookingId, action));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create a code.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader meta="On-site attendance" title={activeSession ? "You are checked in." : "Present a one-use code."} description="The member PWA generates the code. A trusted kiosk scans it and validates membership, booking window, certifications, nonce, and replay state." />
      <Section number="01" title={activeSession ? "Active session" : "Member code"}>
        {activeSession && (
          <div className="active-attendance"><CheckCircle2 aria-hidden="true" /><div><span className="mono">Checked in {dateTime(activeSession.checkedInAt)}</span><h3>{resourceFor(state.resources, state.bookings.find((booking) => booking.id === activeSession.bookingId)?.resourceId ?? "")?.name}</h3><p>Generate a check-out code and present it to the kiosk before leaving.</p></div></div>
        )}
        <div className="qr-layout">
            <div className="qr-frame">
              {image && seconds > 0 ? <img src={image} alt="One-use Armature AI Labs check-in QR code" /> : <QrCode aria-hidden="true" />}
            </div>
            <div className="qr-instructions">
              <span className="mono">60-second one-use {action.replace("_", "-")} intent</span>
              <h3>{intent && seconds > 0 ? `${seconds} seconds remaining` : "Ready when you reach the kiosk"}</h3>
              <p>The code is single-use and contains no profile, booking, or contact details. It cannot be generated offline.</p>
              <button className="button button-primary" type="button" onClick={() => void generate()} disabled={!online || working}>{working ? "Generating…" : intent ? "Generate a fresh code" : `Generate ${action === "check_in" ? "check-in" : "check-out"} code`}</button>
              {error && <p className="form-error" role="alert">{error}</p>}
              {intent && mode === "demo" && <code className="demo-token">{intent.token}</code>}
            </div>
          </div>
      </Section>
      <Section number="02" title="Check-in window" dark>
        <div className="metric-grid three">
          <Metric label="Opens" value="15 min before" />
          <Metric label="Closes" value="30 min after start" />
          <Metric label="Code expiry" value="60 seconds" />
        </div>
      </Section>
    </>
  );
}
