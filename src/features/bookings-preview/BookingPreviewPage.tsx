import { useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { findBookable } from "../bookings/catalogue";
import { findCabin, withSample } from "../bookings/cabins";
import { cabinBookable } from "./cabinBooking";
import { findEquipment } from "../bookings/equipment";
import { equipmentBookable } from "./equipmentBooking";
import { EquipmentDetail, EquipmentList } from "./EquipmentPreview";
import { OptionAFlow, OptionALanding } from "./OptionA";
import { OptionBPage } from "./OptionB";
import { StaffPreview } from "./StaffPreview";
import "./booking-preview.css";

export function BookingPreviewPage() {
  const { option = "a", item: itemId, code } = useParams();
  const [signedIn, setSignedIn] = useState(true);
  const [inStock, setInStock] = useState(false);
  const [search, setSearch] = useSearchParams();
  const chosen = findEquipment(search.get("item") ?? undefined);
  const sample = search.get("sample") === "1";
  const cabinPick = findCabin(search.get("cabin"));
  const cabin = cabinPick && withSample(cabinPick, sample).status === "available" ? cabinPick : undefined;
  if (option !== "a" && option !== "b") return <Navigate to="/booking-preview/a" replace />;
  const base = `/booking-preview/${option}`;
  const staff = itemId === "staff";
  const gear = itemId === "equipment";
  const item = staff || gear ? undefined : itemId === "kit" && chosen ? equipmentBookable(chosen) : itemId === "cabin" && cabin ? cabinBookable(cabin) : findBookable(itemId);
  if (itemId && !staff && !gear && !item) return <Navigate to={base} replace />;
  if (gear && code && !findEquipment(code)) return <Navigate to={`${base}/equipment`} replace />;

  return <div className="bp-root">
    <nav className="bp-toolbar mono" aria-label="Preview controls">
      <span>Local preview · sample data</span>
      <Link className={option === "a" ? "is-on" : ""} to={`/booking-preview/a${staff ? "/staff" : ""}`}>Option A</Link>
      <Link className={option === "b" ? "is-on" : ""} to={`/booking-preview/b${staff ? "/staff" : ""}`}>Option B</Link>
      <Link className={!staff && !gear ? "is-on" : ""} to={base}>Member</Link>
      <Link className={gear ? "is-on" : ""} to={`${base}/equipment`}>Equipment</Link>
      <Link className={staff ? "is-on" : ""} to={`${base}/staff`}>Staff</Link>
      {gear && <label><input type="checkbox" checked={inStock} onChange={e => setInStock(e.target.checked)} /> Sample stock</label>}
      {!staff && !gear && <label><input type="checkbox" checked={sample} onChange={e => { const next = new URLSearchParams(search); if (e.target.checked) next.set("sample", "1"); else { next.delete("sample"); next.delete("cabin"); } setSearch(next, { replace: true }); }} /> Sample availability</label>}
      {!staff && !gear && <label><input type="checkbox" checked={signedIn} onChange={e => setSignedIn(e.target.checked)} /> Signed in</label>}
    </nav>
    {staff ? <StaffPreview layout={option} />
      : gear ? code ? <EquipmentDetail key={code} code={code} base={base} inStock={inStock} /> : <EquipmentList base={base} inStock={inStock} />
      : option === "b" ? <OptionBPage key={item?.name ?? "all"} signedIn={signedIn} base={base} initial={(itemId === "kit" && chosen) || (itemId === "cabin") ? item : undefined} />
      : item ? <OptionAFlow key={item.id + item.name} item={item} base={base} signedIn={signedIn} />
      : <OptionALanding base={base} />}
  </div>;
}
