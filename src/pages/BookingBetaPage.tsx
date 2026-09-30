import { useState } from "react";
import { Field, PageHeader, Section, Status } from "../components/Primitives";
import { BookingBetaMap, type BetaPlace } from "../components/BookingBetaMap";
import { estimateBookingBeta, type BookingBetaProduct } from "../lib/bookingBeta";
import "./BookingBetaPage.css";

const chairs: BetaPlace[] = Array.from({ length: 25 }, (_, index) => ({ resource_id: `S${String(index + 1).padStart(2, "0")}`, code: `S${String(index + 1).padStart(2, "0")}`, floor: "GF", room: "GF-10", kind: "workspace", capacity: 1 }));
const cabins: BetaPlace[] = ["GF-01", "FF-03", "FF-04", "FF-06"].map((room, index) => ({ resource_id: `C0${index + 1}`, code: `C0${index + 1}`, floor: index === 0 ? "GF" : "FF", room, kind: "cabin", capacity: 6 }));
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(paise / 100);
const dateLabel = (date: string) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

export function BookingBetaPage() {
  const [product, setProduct] = useState<BookingBetaProduct>("day");
  const [date, setDate] = useState("2026-11-17");
  const [dates, setDates] = useState(["2026-11-17"]);
  const [selected, setSelected] = useState("");
  const [student, setStudent] = useState(0);
  const [dateError, setDateError] = useState("");
  const places = product === "cabin" ? cabins : chairs;
  let estimate: ReturnType<typeof estimateBookingBeta> | null = null;
  let error = dateError;
  try { estimate = estimateBookingBeta({ product, dates: product === "day" ? dates : [date], studentDiscountPercent: product === "cabin" ? 0 : student }); }
  catch (reason) { error = reason instanceof Error ? reason.message : "Choose valid dates."; }
  function changeProduct(value: BookingBetaProduct) {
    setProduct(value); setSelected(""); setDateError("");
    if (value === "month" || value === "cabin") setDate("2026-12-01");
    else setDate("2026-11-17");
  }
  function addDate() {
    if (!date) return;
    if (dates.some(value => value.slice(0, 7) !== date.slice(0, 7))) { setDateError("Choose day-pass dates within one calendar month, or remove the existing dates first."); return; }
    setDateError(""); setDates(current => [...new Set([...current, date])].sort());
  }
  return <>
    <PageHeader meta="Beta · explore only" title="Find your place in the lab." description="Explore the building, compare pass dates and preview prices. This beta does not show live availability, reserve a place or collect payment." />
    <Section number="01" title="Choose your workspace">
      <div className="booking-beta-controls">
        <Field label="Pass type"><select value={product} onChange={event => changeProduct(event.target.value as BookingBetaProduct)}><option value="day">Day · flexi chair</option><option value="week">Week · flexi chair</option><option value="month">Month · reserved chair</option><option value="cabin">Month · whole six-seat cabin</option></select></Field>
        <Field label={product === "day" ? "Day-pass date" : product === "week" ? "Week start date" : "First day of month"}><input type="date" value={date} onChange={event => { setDate(event.target.value); setDateError(""); }} /></Field>
        {product === "day" && <button type="button" className="button button-quiet" onClick={addDate}>Add date</button>}
        {product !== "cabin" && <Field label="Student discount estimate" hint="Eligibility and award criteria are still being defined."><select value={student} onChange={event => setStudent(Number(event.target.value))}><option value={0}>No student discount</option><option value={10}>10% estimate</option><option value={20}>20% maximum estimate</option></select></Field>}
      </div>
      {product === "day" && <ul className="booking-beta-dates">{dates.map(day => <li key={day}>{dateLabel(day)} <button className="button button-quiet" type="button" aria-label={`Remove ${day}`} onClick={() => { setDates(current => current.filter(value => value !== day)); setDateError(""); }}>Remove</button></li>)}</ul>}
      <p>Standard access is 09:00–17:00 IST. Week passes cover seven consecutive days; monthly passes cover a calendar month. Flexi and reserved chairs share the same pool of 25. Teams take an entire six-seat cabin.</p>
      <BookingBetaMap places={places} selectedId={selected} onSelect={setSelected} cabin={product === "cabin"} />
      <div className="booking-beta-summary" aria-live="polite"><Status>Layout preview · availability not configured</Status><h3>{selected ? `${selected} · ${places.find(place => place.code === selected)?.room}` : "Choose a chair or cabin to explore"}</h3>
        {error ? <p role="alert">{error}</p> : estimate && <><p>{dateLabel(estimate.startsOn)} – {dateLabel(estimate.endsOn)}</p>{estimate.needsReview ? <p>{estimate.reviewReason}</p> : <><p>Standard price <strong>{money(estimate.standardTotalPaise)}</strong>{estimate.launchApplied && <> · launch price <strong>{money(estimate.subtotalPaise!)}</strong></>}</p>{student > 0 && product !== "cabin" && <p>Student estimate is applied after the launch offer where eligible. It is not an awarded discount.</p>}<p className="booking-beta-price">Estimated total <strong>{money(estimate.totalPaise!)}</strong> <span>before applicable tax</span></p></>}</>}
        <p>No reservation has been created. Launch pricing ends 31 December 2026; periods spanning that date need review. Phased services are planned from 17 November.</p>
      </div>
    </Section>
    <Section number="02" title="Before bookings open"><p>We are confirming the holiday calendar, final cabin enclosures and equipment placement. Equipment rates are still being prepared; equipment access will require coworking or cabin access for the same period, and all equipment stays in the lab.</p><p>Paid workspace and cabin access includes unlimited pantry essentials: milk, juices, Maggi and eggs. Outside food is welcome; please clean up after use.</p></Section>
  </>;
}
