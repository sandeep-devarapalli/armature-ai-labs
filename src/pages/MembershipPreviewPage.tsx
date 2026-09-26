import { useState } from "react";
import { Field, PageHeader, Section, Status } from "../components/Primitives";
import { buildPassPreview, cabinGuestLimit, getAgeOnDate, isFullRefundEligible, validateRegistration } from "../lib/membershipPreview";
import "./MembershipPreviewPage.css";

type PassKind = "day" | "week" | "month" | "overnight";
type Review = "draft" | "pending" | "approved" | "rejected";
const today = "2026-09-26";
const closure = "2026-10-02";
const initial = { name: "Sample Builder", email: "builder@example.test", phone: "0000000000", linkedInUrl: "https://www.linkedin.com/in/synthetic-builder", dateOfBirth: "2000-01-01", guardianEmail: "guardian@example.test" };
const displayDate = (date: string) => new Date(date.length === 10 ? `${date}T09:00:00+05:30` : date).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", ...(date.length === 10 ? {} : { timeStyle: "short" as const }) });

export function MembershipPreviewPage() {
  const [person, setPerson] = useState(initial);
  const [photo, setPhoto] = useState(false);
  const [document, setDocument] = useState(false);
  const [documentType, setDocumentType] = useState("PAN");
  const [consent, setConsent] = useState(false);
  const [guardianReviewed, setGuardianReviewed] = useState(false);
  const [review, setReview] = useState<Review>("draft");
  const [deleted, setDeleted] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [kind, setKind] = useState<PassKind>("day");
  const [date, setDate] = useState("2026-10-05");
  const [selectedDates, setSelectedDates] = useState(["2026-10-05"]);
  const [renewal, setRenewal] = useState(false);
  const [receipt, setReceipt] = useState<ReturnType<typeof buildPassPreview> | null>(null);
  const [refunded, setRefunded] = useState(false);
  const [refundMoment, setRefundMoment] = useState("inside");
  const [seats, setSeats] = useState(5);
  const [guests, setGuests] = useState(2);
  const [guestHours, setGuestHours] = useState(3);
  const [attendees, setAttendees] = useState(35);
  const [eventHours, setEventHours] = useState(1);
  const [eventDay, setEventDay] = useState("2026-10-05");
  const [eventStart, setEventStart] = useState("17:00");
  const [eventAdmin, setEventAdmin] = useState(false);
  const [workspace, setWorkspace] = useState(false);
  const [certified, setCertified] = useState(false);
  const [storage, setStorage] = useState(false);
  const age = getAgeOnDate(person.dateOfBirth, today);
  const notify = (message: string) => setNotifications((items) => [message, ...items]);
  function registrationErrors(staff = false) {
    const result = validateRegistration({ ...person, guardianConsentReviewed: staff ? guardianReviewed : true }, today);
    if (!person.name.trim()) result.push("A full name is required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.email)) result.push("A valid email is required.");
    if (!/^\+?[\d ()-]{10,15}$/.test(person.phone)) result.push("A phone number is required.");
    if (!photo) result.push("Attach the synthetic profile photo.");
    if (!document || deleted) result.push("Attach a current synthetic identity document.");
    if (!consent) result.push("Accept the lab rules and privacy notice.");
    return result;
  }
  function resetProfile(dateOfBirth: string) {
    setPerson({ ...initial, dateOfBirth }); setReview("draft"); setGuardianReviewed(false);
    setPhoto(false); setDocument(false); setDeleted(false); setConsent(false); setErrors([]);
    setReceipt(null); setRefunded(false); setNotifications([]);
  }
  let pass: ReturnType<typeof buildPassPreview> | null = null;
  let passError = "";
  try { pass = buildPassPreview({ kind, date, selectedDates, dateOfBirth: person.dateOfBirth, renewalRequested: renewal }, [closure]); }
  catch (error) { passError = error instanceof Error ? error.message : "Choose valid dates."; }
  const canPurchase = review === "approved" && !!pass && !pass.closedDates.length;
  const refundBase = receipt?.refundDeadline ? new Date(receipt.refundDeadline).getTime() : NaN;
  const refundAt = Number.isFinite(refundBase) ? new Date(refundBase + (refundMoment === "inside" ? -60_000 : 60_000)).toISOString() : "";
  const multiDateRefund = receipt?.kind === "day" && receipt.dates.length > 1;
  const refundEligible = !!receipt && !!refundAt && !multiDateRefund && isFullRefundEligible(receipt, refundAt);
  const eventMinutes = Number(eventStart.slice(0, 2)) * 60 + Number(eventStart.slice(3));
  const eventDateValue = Date.parse(`${eventDay}T12:00:00Z`);
  const validEventDate = /^\d{4}-\d{2}-\d{2}$/.test(eventDay) && Number.isFinite(eventDateValue) && new Date(eventDateValue).toISOString().slice(0, 10) === eventDay;
  const weekend = validEventDate && [0, 6].includes(new Date(eventDateValue).getUTCDay());
  const daytime = eventMinutes < 17 * 60;
  const eventAllowed = validEventDate && Number.isInteger(attendees) && attendees >= 1 && attendees <= 35 && Number.isFinite(eventHours) && eventHours >= 1 && Number.isFinite(eventMinutes) && eventMinutes - 20 >= 8 * 60 && eventMinutes + eventHours * 60 <= 21 * 60 && eventDay !== closure && (!daytime || weekend || eventAdmin);
  const timeLabel = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  return <div className="membership-preview">
    <PageHeader meta="Local review · Synthetic data only" title="One account. A place to build." description="Review registration, paid access and resource rules before the member platform opens.">
      <p className="mp-notice">Interactive simulation only. No uploads, saved applications, messages, charges or real reservations. Refresh clears this session. Razorpay remains paused.</p>
      <nav className="button-row" aria-label="Preview sections"><a href="#registration">Registration</a><a href="#staff-review">Staff review</a><a href="#passes">Passes</a><a href="#resource-rules">Resources</a></nav>
    </PageHeader>
    <Section number="01" title="Free basic membership" lede="Verify the person once. Paid access is a separate step." id="registration">
      <div className="mp-grid"><div>
        <Field label="Synthetic applicant"><select value={age >= 18 ? "adult" : age >= 16 ? "minor" : "underage"} onChange={(event) => resetProfile(event.target.value === "adult" ? "2000-01-01" : event.target.value === "minor" ? "2010-01-01" : "2012-01-01")}><option value="adult">Adult sample · 26</option><option value="minor">Younger builder sample · 16</option><option value="underage">Underage sample · 14</option></select></Field>
        <fieldset disabled={review !== "draft" && review !== "rejected"} className="mp-fields">
          <Field label="Full name"><input value={person.name} onChange={(e) => setPerson({ ...person, name: e.target.value })} /></Field>
          <Field label="Email"><input type="email" value={person.email} onChange={(e) => setPerson({ ...person, email: e.target.value })} /></Field>
          <Field label="Phone"><input value={person.phone} onChange={(e) => setPerson({ ...person, phone: e.target.value })} /></Field>
          <Field label="LinkedIn URL · required"><input type="url" value={person.linkedInUrl} onChange={(e) => setPerson({ ...person, linkedInUrl: e.target.value })} /></Field>
          {age < 18 && <Field label="Guardian email" hint="The guardian must email the lab with the minor’s details and explicit permission. Staff reviews the actual email; a typed address is not consent."><input type="email" value={person.guardianEmail} onChange={(e) => setPerson({ ...person, guardianEmail: e.target.value })} /></Field>}
          <Field label="Identity document"><select value={documentType} onChange={(e) => setDocumentType(e.target.value)}><option>PAN</option><option>Aadhaar</option><option>Passport</option></select></Field>
          <div className="button-row"><button className="button secondary" onClick={() => setPhoto(true)}>{photo ? "Synthetic photo attached" : "Attach synthetic photo"}</button><button className="button secondary" onClick={() => { setDocument(true); setDeleted(false); }}>{document ? "Synthetic ID attached" : "Attach synthetic ID"}</button></div>
          <label className="mp-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Accept lab rules and privacy notice for this simulation.</label>
        </fieldset>
        <button className="button" disabled={review === "pending" || review === "approved"} onClick={() => { const issues = registrationErrors(); setErrors(issues); if (!issues.length) { setReview("pending"); notify("Application received — pending staff review. No email was sent."); } }}>Submit sample application</button>
        {!!errors.length && <ul role="alert">{errors.map((error) => <li key={error}>{error}</li>)}</ul>}
      </div><aside className="mp-ledger">
        <span className="mono">Application record</span><h3>{person.name || "Unnamed sample"}</h3><Status>{review}</Status>
        <dl><dt>Basic membership</dt><dd>Free</dd><dt>Paid access</dt><dd>{receipt && !refunded ? "Simulated purchase" : "None"}</dd><dt>Review date</dt><dd>{displayDate(today)}</dd><dt>Minimum age</dt><dd>16; guardian permission below 18</dd></dl>
        <div className="mp-document" aria-label="Synthetic identity document preview"><strong>{deleted ? "Document copy deleted" : document ? `${documentType} · SYNTHETIC` : "No document attached"}</strong><span>{document && !deleted ? "SAMPLE ONLY — NOT A VALID ID" : "No real file is collected in this preview."}</span></div>
        <p>Uploaded copies expire 30 days after upload, even while review is pending. Verification records remain; document copies do not.</p>
      </aside></div>
    </Section>
    <Section number="02" title="Staff review" id="staff-review" lede="A separate review surface, simulated here for inspection. Production requires restricted staff access.">
      <div className="mp-grid"><div>
        {age < 18 && <label className="mp-check"><input type="checkbox" checked={guardianReviewed} disabled={review === "approved"} onChange={(e) => setGuardianReviewed(e.target.checked)} /> Staff inspected synthetic guardian email containing minor details and explicit permission.</label>}
        <div className="button-row"><button className="button" disabled={review !== "pending"} onClick={() => { const issues = registrationErrors(true); setErrors(issues); if (!issues.length) { setReview("approved"); notify("Basic membership approved — paid access is not included. No email was sent."); } }}>Approve sample member</button><button className="button secondary" disabled={review !== "pending"} onClick={() => { setReview("rejected"); notify("Application needs correction — resubmit the sample. No email was sent."); }}>Request corrections</button></div>
        <button className="button secondary" disabled={!document || deleted} onClick={() => { setDeleted(true); setDocument(false); notify("Day 30 simulated: document copy deleted. Review status retained; no actual storage exists."); }}>Simulate day-30 ID deletion</button>
        <p>Verification record: {review === "approved" ? `Staff-approved ${documentType}, reviewed ${displayDate(today)}. No document number retained.` : "Not yet verified."}</p>
      </div><div><h3>Local notification log</h3><div aria-live="polite">{notifications.length ? <ol className="mp-feed">{notifications.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}</ol> : <p>Application and review updates will appear here.</p>}</div></div></div>
    </Section>
    <Section number="03" title="Choose paid access" id="passes" lede="Standard passes: 09:00–17:00 IST. General lab hours: 08:00–23:00. Overnight is a separate adults-only entitlement.">
      <aside className="mp-notice" aria-label="Included workspace perks">
        <h3>Included with your coworking or cabin pass</h3>
        <p>All paid coworking and cabin passes, including day passes, include unlimited access to pantry essentials such as milk, juices, Maggi and eggs during your valid workspace access.</p>
        <p>You may order outside food. Please clean up after yourself and leave shared eating and pantry areas tidy.</p>
        <p>Equipment access is purchased separately and requires a coworking or cabin pass covering the equipment-use period.</p>
      </aside>
      <div className="mp-grid"><div className="mp-fields">
        <Field label="Pass type"><select value={kind} onChange={(e) => { setKind(e.target.value as PassKind); setRenewal(false); }}><option value="day">Day pass · selected dates</option><option value="week">Week pass · seven consecutive days</option><option value="month">Month pass · calendar month</option><option value="overnight">Overnight · 23:00–08:00</option></select></Field>
        <Field label={kind === "month" ? "Select any date in the calendar month" : "Pass date"}><input type="date" value={date} onChange={(e) => { setDate(e.target.value); if (kind === "day") setSelectedDates([e.target.value]); }} /></Field>
        {kind === "day" && <><Field label="Additional day-pass date"><input type="date" aria-label="Additional day-pass date" onChange={(e) => { if (e.target.value) setSelectedDates((dates) => [...new Set([...dates, e.target.value])].sort()); }} /></Field><div className="mp-date-list">{selectedDates.map((value) => <button key={value} className="button secondary" onClick={() => setSelectedDates(selectedDates.filter((item) => item !== value))} aria-label={`Remove ${value}`}>{displayDate(value)} ×</button>)}</div><small>Pick individual dates within one month. Day passes never renew.</small></>}
        {(kind === "week" || kind === "month") && <label className="mp-check"><input type="checkbox" checked={renewal} onChange={(e) => setRenewal(e.target.checked)} /> Preview optional automatic renewal</label>}
        <p className="mp-notice">Synthetic closure: 2 October 2026. This is a test fixture, not the verified holiday calendar. Passes crossing it cannot be purchased in this preview until holiday handling is settled.</p>
        <p>Renewal is a preference only; no payment mandate is created. Holiday credits, failed renewals and price-change rules remain to review.</p>
      </div><aside className="mp-ledger"><span className="mono">Review before purchase</span>
        {pass ? <><h3>{displayDate(pass.startDate)} — {displayDate(pass.endDate)}</h3><p>{pass.accessLabel}</p><p>{pass.dates.length} calendar date(s) · {pass.closedDates.length} closure(s)</p>{!!pass.closedDates.length && <p role="alert">Closed: {pass.closedDates.join(", ")}</p>}<p>Renewal: {pass.renewalRequested ? "Opted in for preview only" : "Off"}</p></> : <p role="alert">{passError}</p>}
        <h3>Pricing pending</h3><p>No amount is invented and no money moves.</p><button className="button" disabled={!canPurchase} onClick={() => { setReceipt(pass); setRefunded(false); notify("Mock payment succeeded. A synthetic pass receipt was created; no charge or live access."); }}>Simulate successful payment</button>
        {review !== "approved" && <p>Basic membership approval is required first.</p>}
      </aside></div>
      {receipt && <div className="mp-receipt"><h3>{refunded ? "Full refund requested · simulation" : "Synthetic paid-pass receipt"}</h3><p>{displayDate(receipt.startDate)} — {displayDate(receipt.endDate)} · {receipt.accessLabel}</p>
        {receipt.refundDeadline && !multiDateRefund ? <><p>Refund deadline: {displayDate(receipt.refundDeadline)} IST. {receipt.refundInterpretation}</p><Field label="Refund clock simulation"><select value={refundMoment} onChange={(e) => setRefundMoment(e.target.value)}><option value="inside">One minute before deadline</option><option value="outside">One minute after deadline</option></select></Field><p>{refundEligible ? "Eligible for a full refund request." : "Outside this preview’s refund window."}</p><button className="button secondary" disabled={!refundEligible || refunded} onClick={() => { setRefunded(true); notify("Full refund request recorded locally. No payment-provider refund was issued."); }}>Request full refund</button></> : <p>A refund policy for this pass or multi-date order has not been approved.</p>}
        <p>Weekly/monthly windows use elapsed 24/48 hours for this preview, pending confirmation. Multi-date orders and non-pass refund rules need separate approval.</p>
      </div>}
    </Section>
    <Section number="04" title="Resources, cabins and events" id="resource-rules" lede="Inspect the operating rules separately from payments. These controls create no bookings.">
      <div className="mp-resources"><article><h3>Equipment add-ons</h3><p>Book coworking or cabin access first, then purchase equipment access for the same usage period. Equipment payment alone does not include workspace entry.</p><p>For example, add hourly 3D-printer access or a daily Jetson Orin Nano allocation. Equipment stays inside the lab; multi-day allocated kits remain reserved with assigned overnight storage.</p>{[[workspace, setWorkspace, "Paid coworking or cabin access covers the equipment-use period"], [certified, setCertified, "Required individual certification checked"], [storage, setStorage, "Assigned storage and return date recorded"]].map(([checked, setter, label]) => <label className="mp-check" key={String(label)}><input type="checkbox" checked={checked as boolean} onChange={(e) => (setter as (value: boolean) => void)(e.target.checked)} />{label as string}</label>)}<Status>{workspace && certified && storage ? "Ready for allocation review" : "Requirements incomplete"}</Status></article>
      <article><h3>Private cabin</h3><p>Purchase all default seats. Host-funded day passes do not increase physical capacity.</p><Field label="Cabin seats"><input type="number" min="1" max="20" value={seats} onChange={(e) => setSeats(Number.isFinite(Number(e.target.value)) ? Math.min(20, Math.max(1, Math.floor(Number(e.target.value)))) : 1)} /></Field><Field label="Simultaneous visitors"><input type="number" min="0" value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></Field><Field label="Visitor stay (hours)"><input type="number" min="0" value={guestHours} onChange={(e) => setGuestHours(Number(e.target.value))} /></Field><p>Visitor allowance: {cabinGuestLimit(seats)}. Maximum stay: 3 hours.</p><Status>{Number.isInteger(guests) && guests >= 0 && guests <= cabinGuestLimit(seats) && guestHours > 0 && guestHours <= 3 ? "Within guest allowance; check occupancy" : "Guest allowance exceeded"}</Status><p>Team admins may book for named eligible members and transfer administration. Certifications follow the actual user.</p></article>
      <article><h3>Ground-floor events</h3><p>35 seated guests. Four microphones, speakers and presentation screen. Guest registration is separate.</p><Field label="Event date"><input type="date" value={eventDay} onChange={(e) => { setEventDay(e.target.value); setEventAdmin(false); }} /></Field><Field label="Event start (IST)"><input type="time" value={eventStart} onChange={(e) => setEventStart(e.target.value)} /></Field><Field label="Event duration (hours)"><input type="number" min="1" max="13" value={eventHours} onChange={(e) => setEventHours(Number(e.target.value))} /></Field><Field label="Seated attendees"><input type="number" min="1" max="35" value={attendees} onChange={(e) => setAttendees(Number(e.target.value))} /></Field>{daytime && !weekend && <label className="mp-check"><input type="checkbox" checked={eventAdmin} onChange={(e) => setEventAdmin(e.target.checked)} /> Simulate special weekday daytime approval</label>}<p>Block {timeLabel(eventMinutes - 20)}–{timeLabel(eventMinutes + eventHours * 60 + 20)}, including 20-minute setup and cleanup.</p><Status>{eventAllowed ? "Preview checks passed; availability not checked" : "Review timing, closure, approval or seating"}</Status><p>Evenings 17:00–21:00; weekends permit daytime events. Daytime setup stays after 08:00 in this provisional preview. Buffered overlap checks, final day-long packages and payment remain required.</p></article></div>
    </Section>
  </div>;
}
