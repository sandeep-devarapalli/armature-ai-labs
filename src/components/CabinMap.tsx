import { useEffect, useRef, useState } from "react";
import { cabinRent, cabins as defaultCabins, formatPaise, seatPaise, statusLabel, type Cabin } from "../lib/cabins";

type Viewer = { dispose: () => void; reset: () => void; selectCabin: (code: string | null) => void };

const seatsLine = (c: Cabin) => `${c.billable} + ${c.extra} seats`;
const floorName = (c: Cabin) => c.floor === "ground" ? "Ground floor" : "First floor";

// Floor plan of the cabins in 3D, a list that also works without WebGL, and the chosen cabin's facts and photos.
export function CabinMap({ list = defaultCabins, chosen, onChoose }: { list?: Cabin[]; chosen?: string; onChoose: (code: string) => void }) {
  const [viewing, setViewing] = useState(chosen ?? list.find(c => c.status === "available")?.code ?? "C04");
  const cabin = list.find(c => c.code === viewing) ?? list[0];
  const floor = cabin.floor;
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [error, setError] = useState("");
  const [shown, setShown] = useState(0);
  const latest = useRef(viewing);
  latest.current = viewing;
  const statuses = list.map(c => c.status).join();

  useEffect(() => {
    let active = true;
    const element = host.current;
    if (!element) return;
    setError("");
    const onFloor = list.filter(c => c.floor === floor).map(c => ({ code: c.code, label: c.name, seats: c.billable, status: c.status,
      detail: c.status === "available" ? `${seatsLine(c)} · ${formatPaise(cabinRent(c))}/mo` : `${seatsLine(c)} · ${statusLabel[c.status]}` }));
    void import("../lib/booking-map/viewer.js").then(async module => {
      if (!active) return;
      const api: Viewer = await module.mountViewer(element, { kind: floor === "ground" ? "ground-seats" : "first-seats", bookingType: "cabin", cabins: onFloor,
        selectedCabin: latest.current, onCabin: (code: string) => { setViewing(code); setShown(0); } });
      if (!active) { api.dispose(); return; }
      viewer.current = api;
    }).catch(() => { if (active) setError("The 3D floor plan could not load. Use the cabin list instead."); });
    return () => { active = false; viewer.current?.dispose(); viewer.current = null; };
    // The scene is rebuilt only when the floor or a cabin's status changes.
  }, [floor, statuses]);
  useEffect(() => { viewer.current?.selectCabin(viewing); }, [viewing]);

  const pick = (code: string) => { setViewing(code); setShown(0); };
  return <div className="cabin-map">
    <div className="cabin-map-bar">
      <div className="segmented" role="group" aria-label="Floor">
        <button type="button" aria-pressed={floor === "ground"} onClick={() => pick("C01")}>Ground floor</button>
        <button type="button" aria-pressed={floor === "first"} onClick={() => floor !== "first" && pick(list.find(c => c.floor === "first" && c.status === "available")?.code ?? "C04")}>First floor</button>
      </div>
      <button type="button" className="button button-quiet" onClick={() => viewer.current?.reset()}>Whole floor</button>
    </div>
    <div ref={host} className="cabin-map-canvas" role="img" aria-label={`3D plan of the ${floor} floor showing ${list.filter(c => c.floor === floor).map(c => c.name).join(" and ")}`} />
    {error && <p role="status" className="cabin-map-note">{error}</p>}
    <p className="cabin-map-legend mono"><span className="cabin-key is-glass" /> Glass partition <span className="cabin-key is-door" /> Glass door <span className="cabin-key is-chosen" /> Selected cabin</p>
    <ul className="cabin-list" aria-label="Cabins">
      {list.map(c => <li key={c.code}><button type="button" aria-pressed={c.code === viewing} onClick={() => pick(c.code)}>
        <strong>{c.name}</strong><span>{floorName(c)} · {seatsLine(c)}</span>
        <span className={`cabin-status is-${c.status}`}>{statusLabel[c.status]}</span>
      </button></li>)}
    </ul>
    <section className="cabin-facts" aria-labelledby="cabin-facts-name">
      <h3 id="cabin-facts-name">{cabin.name} <span className={`cabin-status is-${cabin.status}`}>{statusLabel[cabin.status]}</span></h3>
      <dl>
        <div><dt>Where</dt><dd>{floorName(cabin)}, room {cabin.room}</dd></div>
        <div><dt>Seats</dt><dd>{cabin.billable} billable, plus {cabin.extra} extra seats free (room for {cabin.billable + cabin.extra})</dd></div>
        <div><dt>Rent</dt><dd>{formatPaise(seatPaise)} a seat · {formatPaise(cabinRent(cabin))} a month</dd></div>
        <div><dt>Deposit</dt><dd>{cabin.depositPaise ? `${formatPaise(cabin.depositPaise)}, refundable` : "To be confirmed"}</dd></div>
      </dl>
      {cabin.photos.length ? <figure className="cabin-photos">
        <img src={cabin.photos[shown].src} alt={cabin.photos[shown].alt} />
        <div className="cabin-thumbs" role="group" aria-label={`${cabin.name} photos`}>
          {cabin.photos.map((p, i) => <button key={p.src} type="button" aria-pressed={i === shown} onClick={() => setShown(i)}><img src={p.src} alt="" /><span className="sr-only">{p.alt}</span></button>)}
        </div>
        <figcaption className="mono">{cabin.photoCaption ?? `${cabin.name}, November 2026`}</figcaption>
      </figure> : <p className="cabin-map-placeholder">Photos of {cabin.name} are coming. It is fitted out like Cabin 101.</p>}
      {cabin.status === "available"
        ? <button type="button" className="button button-primary" aria-pressed={chosen === cabin.code} onClick={() => onChoose(cabin.code)}>{chosen === cabin.code ? `${cabin.name} selected` : `Book ${cabin.name}`}</button>
        : <button type="button" className="button" disabled>{cabin.status === "occupied" ? `${cabin.name} is occupied` : `${cabin.name} is coming soon`}</button>}
    </section>
  </div>;
}
