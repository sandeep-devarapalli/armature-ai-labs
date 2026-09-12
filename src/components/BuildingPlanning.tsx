import { lazy, Suspense, useState } from "react";
import { Section } from "./Primitives";
import { ModelBoundary } from "./ModelBoundary";
import rooms from "../data/buildingRoomServices.json";
import roomCad from "../data/buildingRoomCad.json";
import release from "../data/buildingModelRelease.json";
import "./BuildingPlanning.css";

const Viewer = lazy(() => import("./BuildingModelViewer"));
const root = release.root;
const floors = [{ id: "ground", name: "Ground floor", width: 1250, height: 1100 }, { id: "first", name: "First floor", width: 1450, height: 1200 }] as const;

export function BuildingPlanning() {
  const [floor, setFloor] = useState<"ground" | "first">("ground");
  const [roomId, setRoomId] = useState("GF-10");
  const [showModel, setShowModel] = useState(false);
  const room = rooms.find((item) => item.id === roomId)!;
  const cad = roomCad.find((item) => item.id === roomId)!;
  const floorInfo = floors.find((item) => item.id === floor)!;
  const floorName = floorInfo.name;
  const file = `${root}/${floor}-floor`;
  const roomFile = `${root}/rooms/${room.id}`;
  const cadDownload = release.downloads[floor === "ground" ? "groundCad" : "firstCad"].url;
  const roomRender = room.id === "FF-04" || room.id === "FF-06"
    ? `${root}/${room.id.replace("-", "").toLowerCase()}-cabins.png` : null;
  const allowance = room.equipmentWatts + room.lightWatts;

  return <Section number="02" id="planning-model" title="Explore the model. Plan each room."
    lede="Ground floor and first floor · Model publication R03 · 12 September 2026. Download the full native plans or inspect one room at a time.">
    <div className="building-planning-notice">
      <strong>Planning designs—not construction approval.</strong> R03 includes the selected FF04 and FF06 twin cabins with sliding entrances, eight full-size tables and eight chair proxies in each room. GF01’s cabin A, FF02’s workshop, FF03’s cabins and FF06’s B02 balcony are retained. Occupied-chair access, site dimensions and hardware engineering still need review; modeled seats are not verified usable capacity. No verified second-floor model is available. GF05 patio is excluded.
    </div>
    <div className="building-floor-tabs" role="group" aria-label="Choose model floor">
      {floors.map((item) => <button key={item.id} type="button" aria-pressed={floor === item.id}
        onClick={() => { setFloor(item.id); setRoomId(item.id === "ground" ? "GF-10" : "FF-04"); setShowModel(false); }}>
        {item.name} model
      </button>)}
    </div>
    <div className="building-model-stage">
      <header><h3>{floorName} · {release.label}</h3><span className="mono">Blender-derived 3D</span></header>
      {showModel ? <>
        <ModelBoundary key={floor}><Suspense fallback={<p role="status">Starting viewer…</p>}>
          <Viewer key={floor} src={`${file}.glb`} poster={`${file}.png`} label={floorName} />
        </Suspense></ModelBoundary>
        <button className="building-viewer-close" type="button" onClick={() => setShowModel(false)}>Close 3D · return to preview</button>
        <details><summary>Static Blender preview</summary><img className="building-fallback-image" src={`${file}.png`} alt={`${floorName} static Blender preview`} width={floorInfo.width} height={floorInfo.height} /></details>
      </> : <div className="building-model-poster">
        <img src={`${file}.png`} alt={`${floorName} R03 Blender overview`} width={floorInfo.width} height={floorInfo.height} loading="lazy" />
        <button type="button" onClick={() => setShowModel(true)}>Open interactive 3D</button>
        <p>The 3D model loads only when opened. The image is a preview, not an interactive model.</p>
      </div>}
      <div className="building-plan-downloads" aria-label="Full-floor downloads">
        <a download href={cadDownload}>Full {floorName.toLowerCase()} · FreeCAD</a>
        <a download href={`${file}.glb`}>Browser model · GLB</a>
        <a download href={release.downloads.blender.url}>Both floors · Blender source</a>
      </div>
      <p className="building-model-help">GLB geometry comes from the saved Blender file; procedural materials and lighting may look different in the browser. Public native downloads contain the current selected design only, not earlier private trials. CAD copies preserve the selected shapes and world positions, but do not reproduce every original parametric dependency.</p>
    </div>
    <div className="building-room-browser">
      <aside>
        <label className="mono" htmlFor="planning-room">Choose a room</label>
        <select id="planning-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
          {rooms.filter((item) => item.floor === floor).map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}
        </select>
        <p>FF04 and FF06 extracts follow the R03 native proposal. The other 13 room extracts retain their checked R02 geometry; per-room provenance identifies the source. They are not new independent design revisions.</p>
        <a href="#comparisons">View the 21-image concept tour ↓</a>
      </aside>
      <article className="building-room-detail" aria-label="Selected room planning details">
        <div className="building-room-title"><span className="mono">{room.id} · {room.status}</span><h3>{room.name}</h3><p>{room.purpose}</p></div>
        <p><strong>Furniture / use:</strong> {room.seating}</p>
        <p className="building-room-model-note"><strong>Model status:</strong> {room.modelNote}</p>
        {roomRender ? <>
          <h4>Sliding-entrance cabin proposal · Blender</h4>
          <a className="building-room-preview" href={roomRender} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} Blender render`}>
            <img src={roomRender} alt={`${room.id} selected twin-cabin Blender proposal R03`} width="1450" height="1450" loading="lazy" />
          </a>
          <p className="building-model-help">Direct native render with the new straight sliders parked open. Joined square tables can look like continuous surfaces; the CAD reference shows individual modules. These views do not establish usable occupied-seat access.</p>
        </> : null}
        <h4>CAD reference and downloads</h4>
        {roomRender ? <a className="building-room-preview" href={`${root}/${room.id.replace("-", "").toLowerCase()}-cad.png`} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} native CAD render`}>
          <img src={`${root}/${room.id.replace("-", "").toLowerCase()}-cad.png`} alt={`${room.id} native FreeCAD axonometric view of the selected sliding-entrance design`} width="1600" height="1360" loading="lazy" />
        </a> : null}
        <p><strong>CAD contents:</strong> {cad.geometryKind}. {cad.solidCount} solids. Reference lines and open faces are not closed room volumes; use the extract provenance for exact contents.</p>
        <details open={roomRender ? undefined : true}>
          <summary>Unsectioned CAD wireframe · SVG reference</summary>
          <p>Diagonal mesh edges are not walls, bracing or access routes.{roomRender ? " Use the shaded native views above to read the selected cabin layout." : " Check the full-floor model for adjoining context."}</p>
          <a className="building-room-preview" href={`${roomFile}.svg`} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} plan preview`}>
            <img src={`${roomFile}.svg`} alt={`${room.id} CAD reference included in R03`} width="1100" height="960" loading="lazy" />
          </a>
        </details>
        <div className="building-plan-downloads">
          <a href={cad.downloads.freecad.url} download>{room.id} · FreeCAD extract</a>
          <a href={cad.downloads.step.url} download>{room.id} · STEP extract</a>
          <a href={`${roomFile}.svg`} download>{room.id} · plan SVG</a>
        </div>
        <p className="building-model-help">Room extracts retain source shape geometry and shared openings; they do not reproduce the full document’s parametric dependency history. Use the full-floor file for coordinated editing.</p>
        <h4>Earlier S01 service estimate · not recalculated for R03</h4>
        <p>The 10 September service assumptions below are retained for comparison, not approved requirements for the newer layout. FF03’s two-desk, FF04’s circulation-only and FF06’s four-desk allowances do not cover their current cabin proposals.</p>
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
      <p>Model publication: R03, 12 September 2026. Ground floor: GF01 cabin A P01 cumulative. First floor: selected FF04/FF06 cabins with P03 sliding entrances, retaining FF03 cabins, FF02 workshop P01 and FF06 balcony B02. Service quantities remain the unapproved S01 scenario of 10 September; room-status notes were reviewed for R03. Original CAD and Blender sources are preserved privately. Public current-design copies omit earlier trials and private computer-path metadata, with separate source and download hashes.</p>
      <p>Changes require a coordinated export, room-plan regeneration, service-note review and tested website release. Saving a local Blender or CAD file does not automatically publish it. Pending or unreviewed models are never substituted silently.</p>
      <a href={`${root}/release.json`} download>Download file checksums and release manifest</a>
      <p><a href={`${root}/design-verification.json`} download>Modeled sliding-door verification</a> · complete modeled travel and local opening/corridor checks passed; occupied-use and installation approval remain separate.</p>
      <p><a href="/building-models/r01/release.json" download>Previous published R01 manifest · 10 September</a> — retained for history. R02 was an unpublished checkpoint; use R03 for this model publication.</p>
    </details>
  </Section>;
}
