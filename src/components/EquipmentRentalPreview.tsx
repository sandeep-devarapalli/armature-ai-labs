import { memberPlatformEnabled } from "../config/release";
import { demoModeEnabled, isSupabaseConfigured } from "../lib/supabase";
import { EquipmentRentalBooking } from "./EquipmentRentalBooking";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { EquipmentGuide } from "../data/equipmentGuides";

export function EquipmentRentalPreview({ guide }: { guide: EquipmentGuide }) {
  const [date, setDate] = useState("2026-11-17");
  const [start, setStart] = useState(9);
  const [minutes, setMinutes] = useState(60);
  const [reviewed, setReviewed] = useState(false);
  const printer = guide.kind === "printer";
  if (memberPlatformEnabled && !demoModeEnabled && isSupabaseConfigured) return <EquipmentRentalBooking slug={guide.slug} />;
  const withinHours = start + minutes / 60 <= 17;
  const clock = (hour: number) => `${String(Math.floor(hour)).padStart(2,"0")}:${hour%1 ? "30" : "00"}`;
  return <section className="equipment-rental-preview" aria-label="Equipment access planning"><h3>Plan an on-site session</h3><p><strong>Rate pending · bookings not open.</strong> {printer ? "Hourly access: one-hour minimum, then 30-minute increments." : "Daily access, within your paid workspace hours."}</p><div className="equipment-rental-fields"><label>Session date<input type="date" min="2026-11-17" value={date} onChange={event=>{setDate(event.target.value);setReviewed(false);}} /></label>{printer && <><label>Start time · IST<select value={start} onChange={event=>{setStart(Number(event.target.value));setReviewed(false);}}>{Array.from({length:15},(_,i)=>9+i/2).map(hour=><option key={hour} value={hour}>{clock(hour)}</option>)}</select></label><label>Slot duration<select value={minutes} onChange={event=>{setMinutes(Number(event.target.value));setReviewed(false);}}>{Array.from({length:15},(_,i)=>60+i*30).map(value=><option key={value} value={value}>{value} minutes</option>)}</select></label></>}</div>{printer && !withinHours && <p role="alert">This slot ends after standard workspace access at 17:00. Choose an earlier start or shorter duration.</p>}<button className="button button-quiet" type="button" disabled={!date || date<"2026-11-17" || (printer && !withinHours)} onClick={()=>setReviewed(true)}>Review planned session</button>{reviewed && <p role="status">Planning only: {date}, {printer ? `${clock(start)}–${clock(start+minutes/60)} IST` : "09:00–17:00 IST"}. No reservation or payment created. Live availability and the holiday calendar are not configured.</p>}<p>Workspace or cabin access must cover the whole session. Equipment stays in the lab. Floor and machine position are still to be confirmed. <Link to="/booking-beta">Explore the workspace layout</Link>.</p>{printer && <ul><li>Your prepaid slot will include setup, heating, printing and clearing the machine. Buy an approved filament spool from the lab; it belongs to you.</li><li>Verified equipment faults: refund for time lost, with the reason recorded. Design, settings and material mistakes remain chargeable.</li><li>Finish within both your slot and paid workspace access. No unattended overnight continuation initially. Extensions depend on availability and payment; slot expiry does not trigger an automatic power cut.</li></ul>}</section>;
}
