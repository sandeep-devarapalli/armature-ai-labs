import { lazy, Suspense, useState } from "react";
import { Section } from "./Primitives";
import { ModelBoundary } from "./ModelBoundary";
import rooms from "../data/buildingRoomServices.json";
import roomCad from "../data/buildingRoomCad.json";
import "./BuildingPlanning.css";

const Viewer = lazy(() => import("./BuildingModelViewer"));
const root = "/building-models/r01";
const floors = [{ id: "ground", name: "Ground floor" }, { id: "first", name: "First floor" }] as const;

export function BuildingPlanning() {
  const [floor, setFloor] = useState<"ground" | "first">("ground");
  const [roomId, setRoomId] = useState("GF-10");
  const [showModel, setShowModel] = useState(false);
  const room = rooms.find((item) => item.id === roomId)!;
  const cad = roomCad.find((item) => item.id === roomId)!;
  const floorName = floors.find((item) => item.id === floor)!.name;
  const file = `${root}/${floor}-floor`;
  const roomFile = `${root}/rooms/${room.id}`;
  const allowance = room.equipmentWatts + room.lightWatts;

  return <Section number="02" id="planning-model" title="Explore the model. Plan each room."
    lede="Ground floor and first floor · Coordinated Selected Layout R01 · 10 September 2026. Download the full native plans or inspect one room at a time.">
    <div className="building-planning-notice">
      <strong>Issued model ≠ finished construction design.</strong> R01 is the latest verified coordinated model in this release. The service schedule below is a new, unapproved planning scenario. FF02’s workshop and cover, FF03/FF06’s private offices and GF01’s cabin still need integration or fit checks; they are not shown as completed work in R01. No verified second-floor model is available. GF05 patio is excluded.
    </div>
    <div className="building-floor-tabs" role="group" aria-label="Choose model floor">
      {floors.map((item) => <button key={item.id} type="button" aria-pressed={floor === item.id}
        onClick={() => { setFloor(item.id); setRoomId(item.id === "ground" ? "GF-10" : "FF-02"); setShowModel(false); }}>
        {item.name} model
      </button>)}
    </div>
    <div className="building-model-stage">
      <header><h3>{floorName} · R01</h3><span className="mono">Blender-derived 3D</span></header>
      {showModel ? <>
        <ModelBoundary key={floor}><Suspense fallback={<p role="status">Starting viewer…</p>}>
          <Viewer key={floor} src={`${file}.glb`} poster={`${file}.png`} label={floorName} />
        </Suspense></ModelBoundary>
        <button className="building-viewer-close" type="button" onClick={() => setShowModel(false)}>Close 3D · return to preview</button>
        <details><summary>Static Blender preview</summary><img className="building-fallback-image" src={`${file}.png`} alt={`${floorName} static Blender preview`} width="1400" height="1000" /></details>
      </> : <div className="building-model-poster">
        <img src={`${file}.png`} alt={`${floorName} R01 Blender overview`} width="1400" height="1000" loading="lazy" />
        <button type="button" onClick={() => setShowModel(true)}>Open interactive 3D</button>
        <p>The 3D model loads only when opened. The image is a preview, not an interactive model.</p>
      </div>}
      <div className="building-plan-downloads" aria-label="Full-floor downloads">
        <a download href={`${file}.FCStd`}>Full {floorName.toLowerCase()} · FreeCAD</a>
        <a download href={`${file}.glb`}>Browser model · GLB</a>
        <a download href={`${root}/selected-layout.blend`}>Both floors · Blender source</a>
      </div>
      <p className="building-model-help">GLB geometry comes from the issued Blender file; procedural materials and lighting may look different in the browser. The native files remain authoritative for this revision.</p>
    </div>
    <div className="building-room-browser">
      <aside>
        <label className="mono" htmlFor="planning-room">Choose a room</label>
        <select id="planning-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
          {rooms.filter((item) => item.floor === floor).map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}
        </select>
        <p>Room previews and CAD are extracted from R01. They are not newer designs than the full-floor download.</p>
        <a href="#comparisons">View the 21-image concept tour ↓</a>
      </aside>
      <article className="building-room-detail" aria-label="Selected room planning details">
        <div className="building-room-title"><span className="mono">{room.id} · {room.status}</span><h3>{room.name}</h3><p>{room.purpose}</p></div>
        <p><strong>Furniture / use:</strong> {room.seating}</p>
        <p className="building-room-model-note"><strong>Model status:</strong> {room.modelNote}</p>
        <p><strong>CAD contents:</strong> {cad.geometryKind}. {cad.solidCount === 0 ? "This STEP contains curves/wires, not a volumetric room shell." : "Architecture is source 2D linework; selected fit-out is 3D geometry."}</p>
        <a className="building-room-preview" href={`${roomFile}.svg`} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} plan preview`}>
          <img src={`${roomFile}.svg`} alt={`${room.id} CAD reference plan extracted from R01`} width="1000" height="800" loading="lazy" />
        </a>
        <div className="building-plan-downloads">
          <a href={`${roomFile}.FCStd`} download>{room.id} · FreeCAD extract</a>
          <a href={`${roomFile}.step`} download>{room.id} · STEP extract</a>
          <a href={`${roomFile}.svg`} download>{room.id} · plan SVG</a>
        </div>
        <p className="building-model-help">Room extracts retain source shape geometry and shared openings; they do not reproduce the full document’s parametric dependency history. Use the full-floor file for coordinated editing.</p>
        <h4>Proposed services · estimate, not an installation schedule</h4>
        <dl className="building-service-grid">
          <div><dt>Individual sockets</dt><dd>{room.sockets}</dd><p>{room.socketNote}</p></div>
          <div><dt>Lights / nominal load</dt><dd>{room.lights} / {room.lightWatts} W</dd><p>{room.lightingBasis}</p></div>
          <div><dt>Partial equipment + lighting allowance</dt><dd>{(allowance / 1000).toFixed(2)} kW</dd><p>{room.equipmentWatts} W equipment + {room.lightWatts} W lighting. Excludes AC, heating and unselected high-power appliances—not the room’s total required power.</p></div>
          <div><dt>Air conditioning</dt><dd>{room.ac}</dd><p>{room.acNote}</p></div>
        </dl>
        <details><summary>Load assumptions and unresolved items</summary>
          <p>{room.equipmentBasis}</p>
          <ul>{room.holds.map((hold) => <li key={hold}>{hold}</li>)}</ul>
        </details>
      </article>
    </div>
    <div className="building-services-boundary">
      <h3>Use these numbers for discussion—not wiring or procurement.</h3>
      <p>A socket is one usable receptacle, not one plate or circuit. Fixture watts are hypothetical allowances, not verified brightness. Load figures are arithmetic planning baskets—not maximum demand, breaker ratings, cable sizing, UPS capacity or a whole-building supply calculation. AC electrical loads are additional and remain unquantified; cooling capacity is not electrical input.</p>
      <p>A qualified local designer must verify loads, protection, earthing, wet-area safety, ventilation, heat gains, egress and existing services. Soldering needs local fume extraction; an enclosed balcony or AC alone is not sufficient.</p>
      <p>Reference guidance: <a href="https://www.hse.gov.uk/asthma/solderers.htm" target="_blank" rel="noreferrer">HSE soldering fume control</a> · <a href="https://www.osha.gov/etools/computer-workstations/workstation-environment" target="_blank" rel="noreferrer">OSHA glare and workstation environment</a>. General guidance, not local approval.</p>
    </div>
    <details className="building-release-details"><summary>Revision, sources and future updates</summary>
      <p>Geometry release: R01, 10 September 2026. Service proposal: S01, 10 September 2026. Original CAD and Blender sources are preserved. Public native copies omit private computer-path metadata; geometry and native reopen are verified, with separate source and download hashes.</p>
      <p>Changes require a coordinated export, room-plan regeneration, service-note review and tested website release. Saving a local Blender or CAD file does not automatically publish it. Pending or unreviewed models are never substituted silently.</p>
      <a href={`${root}/release.json`} download>Download file checksums and release manifest</a>
    </details>
  </Section>;
}
