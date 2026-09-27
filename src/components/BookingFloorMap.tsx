import { useEffect, useRef, useState } from "react";
import "./BookingFloorMap.css";

export type WorkspacePlace = { resource_id: string; code: string; floor: string; room: string; kind: string; capacity: number; available: boolean; unavailable_dates: { date: string; reason: string; closure_reason?: string }[] };
type Viewer = { dispose: () => void; reset: () => void; selectSeat: (code: string | null) => void; selectCabin: (code: string | null) => void; setUnavailable: (codes: string[]) => void };
const codes = [...Array.from({ length: 25 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`), "C01", "C02", "C03", "C04"];

export function BookingFloorMap({ places, selectedId, onSelect, cabin }: { places: WorkspacePlace[]; selectedId: string; onSelect: (id: string) => void; cabin: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [floor, setFloor] = useState("GF");
  const [error, setError] = useState("");
  const latest = useRef({ places, selectedId, onSelect });
  latest.current = { places, selectedId, onSelect };
  function sync(api: Viewer) {
    const value = latest.current;
    api.setUnavailable(codes.filter(code => !value.places.some(place => place.code === code && place.available)));
    const code = value.places.find(place => place.resource_id === value.selectedId)?.code ?? null;
    api.selectSeat(code); api.selectCabin(code);
  }
  useEffect(() => {
    let active = true;
    const element = host.current;
    if (!element) return;
    setError("");
    void import("../lib/booking-map/viewer.js").then(async module => {
      if (!active) return;
      const choose = (code: string) => { const place = latest.current.places.find(item => item.code === code && item.available); if (place) latest.current.onSelect(place.resource_id); };
      const api: Viewer = await module.mountViewer(element, { kind: floor === "GF" ? "ground-seats" : "first-seats", bookingType: cabin ? "cabin" : "desk", unavailableCodes: codes, onSeat: choose, onCabin: choose });
      if (!active) { api.dispose(); return; }
      viewer.current = api; sync(api);
    }).catch(() => { if (active) setError("The floor view could not load. Use the labelled chair and cabin list below."); });
    return () => { active = false; viewer.current?.dispose(); viewer.current = null; };
  }, [floor, cabin]);
  useEffect(() => { if (viewer.current) sync(viewer.current); }, [places, selectedId]);
  return <div className="booking-floor-map">
    <div className="segmented" aria-label="Building floor"><button type="button" aria-pressed={floor === "GF"} onClick={() => setFloor("GF")}>Ground floor</button><button type="button" aria-pressed={floor === "FF"} onClick={() => setFloor("FF")}>First floor</button><button type="button" onClick={() => viewer.current?.reset()}>Reset view</button></div>
    <div ref={host} className="booking-floor-canvas" aria-label="Building floor with selectable chairs and whole cabins" />
    {error && <p role="status">{error}</p>}
    <p className="estimate-note">Select a numbered chair beside its table. The same 25 chairs serve flexi and monthly reservations. Cabins are booked as a whole by a team. Layout is a planning model; cabin enclosure and occupied clearances remain under review.</p>
    <div className="booking-place-list" aria-label="Chair and cabin availability">{places.map(place => <button className="button button-quiet" type="button" key={place.resource_id} disabled={!place.available} aria-pressed={selectedId === place.resource_id} onClick={() => { setFloor(place.floor); onSelect(place.resource_id); }}><strong>{place.code} · {place.room}</strong><span>{place.kind === "cabin" ? `Whole cabin · ${place.capacity} seats · ` : "Chair · "}{place.available ? "Available" : "Unavailable"}</span>{!place.available && <small>{place.unavailable_dates.map(day => `${day.date}: ${day.closure_reason || day.reason}`).join("; ")}</small>}</button>)}</div>
  </div>;
}
