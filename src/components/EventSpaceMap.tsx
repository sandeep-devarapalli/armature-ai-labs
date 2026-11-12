import { useEffect, useRef, useState } from "react";

type Viewer = { dispose: () => void; reset: () => void; focusEvent: () => void };

// The event space in 3D: GF-09 and GF-10 tinted on the ground floor, framed when it opens.
export function EventSpaceMap() {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const element = host.current;
    if (!element) return;
    void import("../lib/booking-map/viewer.js").then(async module => {
      if (!active) return;
      const api: Viewer = await module.mountViewer(element, { kind: "ground-seats", bookingType: "event", onCabin: () => {},
        notice: "Event space · GF-09 + GF-10 · indicative layout" });
      if (!active) { api.dispose(); return; }
      viewer.current = api; api.focusEvent();
    }).catch(() => { if (active) setError("The 3D floor plan could not load."); });
    return () => { active = false; viewer.current?.dispose(); viewer.current = null; };
  }, []);
  return <figure className="cabin-map">
    <div className="cabin-map-bar"><figcaption>Event space · GF-09 lounge and presentation hall + GF-10 commons</figcaption>
      <button type="button" className="button button-quiet" onClick={() => viewer.current?.focusEvent()}>Event space</button>
      <button type="button" className="button button-quiet" onClick={() => viewer.current?.reset()}>Whole floor</button></div>
    <div ref={host} className="cabin-map-canvas" role="img" aria-label="3D plan of the ground floor with the event space, GF-09 and GF-10, highlighted" />
    {error && <p role="status">{error}</p>}
  </figure>;
}
