import { useEffect, useRef, useState } from "react";

type Viewer = { dispose: () => void; reset: () => void; selectSeat: (code: string | null) => void; setUnavailable: (codes: string[]) => void; focusSeats: () => void };
const allChairs = Array.from({ length: 25 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`);

// The GF-10 commons in 3D. Only chairs open for the chosen pass can be picked; the chair list in the form stays the fallback.
export function DeskChairMap({ chairs, chosen, disabled, onChoose }: { chairs: string[]; chosen: string; disabled: boolean; onChoose: (code: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<Viewer | null>(null);
  const [error, setError] = useState("");
  const latest = useRef({ chairs, chosen, disabled, onChoose });
  latest.current = { chairs, chosen, disabled, onChoose };
  const open = chairs.join();
  function sync(api: Viewer) {
    api.setUnavailable(allChairs.filter(code => !latest.current.chairs.includes(code)));
    api.selectSeat(latest.current.chosen || null);
  }
  useEffect(() => {
    let active = true;
    const element = host.current;
    if (!element) return;
    setError("");
    void import("../lib/booking-map/viewer.js").then(async module => {
      if (!active) return;
      const api: Viewer = await module.mountViewer(element, { kind: "ground-seats", bookingType: "desk", unavailableCodes: allChairs,
        notice: `${latest.current.chairs.length} chairs open for desk passes · GF-10 commons`, onCabin: () => {},
        onSeat: (code: string) => { if (latest.current.disabled) sync(api); else latest.current.onChoose(code); } });
      if (!active) { api.dispose(); return; }
      viewer.current = api; sync(api); api.focusSeats();
    }).catch(() => { if (active) setError("The 3D floor plan could not load. Choose a chair from the list instead."); });
    return () => { active = false; viewer.current?.dispose(); viewer.current = null; };
  }, [open]);
  useEffect(() => { if (viewer.current) sync(viewer.current); }, [chosen]);
  return <div className="cabin-map">
    <div className="cabin-map-bar"><p>Tap a numbered chair to choose it.</p>
      <button type="button" className="button button-quiet" onClick={() => viewer.current?.reset()}>Whole floor</button></div>
    <div ref={host} className="cabin-map-canvas" role="img" aria-label={`3D plan of the GF-10 commons. Seats open for this pass: ${chairs.join(", ")}`} />
    {error && <p role="status">{error}</p>}
  </div>;
}
