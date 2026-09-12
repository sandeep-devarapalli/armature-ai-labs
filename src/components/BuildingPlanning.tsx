import { lazy, Suspense, useState } from "react";
import { Section } from "./Primitives";
import { ModelBoundary } from "./ModelBoundary";
import rooms from "../data/buildingRoomServices.json";
import roomCad from "../data/buildingRoomCad.json";
import release from "../data/buildingModelRelease.json";
import "./BuildingPlanning.css";

const Viewer = lazy(() => import("./BuildingModelViewer"));
const root = release.root;
const floors = [{ id: "ground", name: "Ground floor" }, { id: "first", name: "First floor" }] as const;
type RoomPreview = { revision: string; blender: string; cad: string; closed?: string; plan?: string };

export function BuildingPlanning() {
  const [floor, setFloor] = useState<"ground" | "first">("ground");
  const [roomId, setRoomId] = useState("GF-10");
  const [showModel, setShowModel] = useState(false);
  const room = rooms.find((item) => item.id === roomId)!;
  const cad = roomCad.find((item) => item.id === roomId)!;
  const floorInfo = floors.find((item) => item.id === floor)!;
  const floorName = floorInfo.name;
  const floorAssets = release.floors[floor];
  const cadDownload = release.downloads[floor === "ground" ? "groundCad" : "firstCad"].url;
  const roomRender = (release.roomPreviews as Record<string, RoomPreview>)[room.id];
  const enclosure = release.enclosure.roomId === room.id ? release.enclosure : null;

  return <Section number="01" id="planning-model" title="Models and room plans."
    lede="Updated 12 September 2026 · FF02 workshop terrace shown with the proposed steel-frame enclosure and lab layout.">
    <p className="building-model-help">Planning layouts. Site dimensions, occupied access and installation details still need verification.</p>
    <div className="building-floor-tabs" role="group" aria-label="Choose model floor">
      {floors.map((item) => <button key={item.id} type="button" aria-pressed={floor === item.id}
        onClick={() => { setFloor(item.id); setRoomId(item.id === "ground" ? "GF-10" : "FF-03"); setShowModel(false); }}>
        {item.name} model
      </button>)}
    </div>
    <div className="building-model-stage">
      <header><h3>{floorName} · {floorAssets.revision}</h3><span className="mono">Blender-derived 3D</span></header>
      {showModel ? <>
        <ModelBoundary key={floor}><Suspense fallback={<p role="status">Starting viewer…</p>}>
          <Viewer key={floor} src={floorAssets.model} poster={floorAssets.preview} label={floorName} />
        </Suspense></ModelBoundary>
        <button className="building-viewer-close" type="button" onClick={() => setShowModel(false)}>Close 3D · return to preview</button>
        <details><summary>Static Blender preview</summary><img className="building-fallback-image" src={floorAssets.preview} alt={`${floorName} static Blender preview`} width={floorAssets.width} height={floorAssets.height} /></details>
      </> : <div className="building-model-poster">
        <img src={floorAssets.preview} alt={`${floorName} ${floorAssets.revision} Blender overview`} width={floorAssets.width} height={floorAssets.height} loading="lazy" />
        <button type="button" onClick={() => setShowModel(true)}>Open interactive 3D</button>
        <p>The 3D model loads only when opened. The image is a preview, not an interactive model.</p>
      </div>}
      <div className="building-plan-downloads" aria-label="Full-floor downloads">
        <a download href={cadDownload}>Full {floorName.toLowerCase()} · FreeCAD</a>
        <a download href={floorAssets.model}>Browser model · GLB</a>
        <a download href={release.downloads.blender.url}>Both floors · Blender source</a>
      </div>
      <p className="building-model-help">Download the native files for coordinated editing. Browser materials and lighting may look different.</p>
    </div>
    <div className="building-room-browser">
      <aside>
        <label className="mono" htmlFor="planning-room">Choose a room</label>
        <select id="planning-room" value={roomId} onChange={(event) => setRoomId(event.target.value)}>
          {rooms.filter((item) => item.floor === floor).map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}
        </select>
        <a href="#comparisons">Browse building views ↓</a>
      </aside>
      <article className="building-room-detail" aria-label="Selected room planning details">
        <div className="building-room-title"><span className="mono">{room.id} · {room.status}</span><h3>{room.name}</h3><p>{room.purpose}</p></div>
        <p><strong>Furniture / use:</strong> {room.seating}</p>
        <p className="building-room-model-note"><strong>Model status:</strong> {room.modelNote}</p>
        {roomRender ? <>
          <h4>Sliding-entrance cabin proposal · Blender</h4>
          <a className="building-room-preview" href={roomRender.blender} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} Blender render`}>
            <img src={roomRender.blender} alt={`${room.id} selected cabin Blender proposal ${roomRender.revision}`} width="1450" height="1450" loading="lazy" />
          </a>
          <p className="building-model-help">Direct native render with the new straight sliders parked open. Joined square tables can look like continuous surfaces; the CAD reference shows individual modules. These views do not establish usable occupied-seat access.</p>
          {roomRender.closed && roomRender.plan ? <details>
            <summary>FF03 closed-door and section-plan references</summary>
            <a className="building-room-preview" href={roomRender.closed} target="_blank" rel="noreferrer" aria-label="Open FF-03 closed-door render"><img src={roomRender.closed} alt="FF-03 four-person sliding entrance closed" width="1450" height="1450" loading="lazy" /></a>
            <a className="building-room-preview" href={roomRender.plan} target="_blank" rel="noreferrer" aria-label="Open FF-03 Blender section plan"><img src={roomRender.plan} alt="FF-03 Blender display section at 1.05 metres above the floor" width="1450" height="1450" loading="lazy" /></a>
            <p className="building-model-help">The plan is a horizontal display section at 1.05 m above the floor, not a surveyed construction drawing. The saved native geometry is unchanged by this viewing cut.</p>
          </details> : null}
        </> : null}
        {enclosure ? <>
          <h4>Enclosure proposal {enclosure.revision} · Blender</h4>
          <a className="building-room-preview" href={enclosure.blender} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} enclosure Blender render`}>
            <img src={enclosure.blender} alt={`${room.id} proposed steel-frame insulated-panel enclosure, native Blender render ${enclosure.revision}`} width="1450" height="1200" loading="lazy" />
          </a>
          <p className="building-model-help">Steel box-section frame, 50 mm PUF wall panels, 80 mm PUF roof falling to the west guard, a polycarbonate skylight strip along the north wall, three fixed windows and an insulated door to the retained curved balcony. Inside: the lab layout the S03 services plan will serve. A concept for review, not a structural, thermal or fabrication design.</p>
          <details>
            <summary>Enclosure CAD views: exterior, cutaway and plan</summary>
            <a className="building-room-preview" href={enclosure.cad} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} enclosure CAD exterior`}><img src={enclosure.cad} alt={`${room.id} enclosure native FreeCAD exterior from the south-west`} width="1600" height="1100" loading="lazy" /></a>
            <a className="building-room-preview" href={enclosure.cutaway} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} enclosure CAD cutaway`}><img src={enclosure.cutaway} alt={`${room.id} enclosure native FreeCAD cutaway showing frame, purlins and lab layout`} width="1600" height="1100" loading="lazy" /></a>
            <a className="building-room-preview" href={enclosure.plan} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} enclosure CAD plan`}><img src={enclosure.plan} alt={`${room.id} enclosure native FreeCAD plan without the roof`} width="1400" height="1400" loading="lazy" /></a>
            <p className="building-model-help">Native FreeCAD views of the room-level enclosure document. The full first-floor CAD download predates the enclosure and is retained unchanged.</p>
          </details>
          <div className="building-plan-downloads" aria-label="Enclosure downloads">
            <a href={enclosure.freecad} download>{room.id} · enclosure FreeCAD</a>
            <a href={enclosure.step} download>{room.id} · enclosure STEP</a>
          </div>
        </> : null}
        <h4>CAD reference and downloads</h4>
        {roomRender ? <a className="building-room-preview" href={roomRender.cad} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} native CAD render`}>
          <img src={roomRender.cad} alt={`${room.id} native FreeCAD axonometric view of the selected sliding-entrance design`} width="1600" height="1360" loading="lazy" />
        </a> : null}
        <p><strong>CAD contents:</strong> {cad.geometryKind}. {cad.solidCount} solids. Reference lines and open faces are not closed room volumes; use the extract provenance for exact contents.</p>
        <details open={roomRender ? undefined : true}>
          <summary>Unsectioned CAD wireframe · SVG reference</summary>
          <p>Diagonal mesh edges are not walls, bracing or access routes.{roomRender ? " Use the shaded native views above to read the selected cabin layout." : " Check the full-floor model for adjoining context."}</p>
          <a className="building-room-preview" href={cad.downloads.svg.url} target="_blank" rel="noreferrer" aria-label={`Open ${room.id} plan preview`}>
            <img src={cad.downloads.svg.url} alt={`${room.id} CAD reference included in ${release.label}`} width="1100" height="960" loading="lazy" />
          </a>
        </details>
        <div className="building-plan-downloads">
          <a href={cad.downloads.freecad.url} download>{room.id} · FreeCAD extract</a>
          <a href={cad.downloads.step.url} download>{room.id} · STEP extract</a>
          <a href={cad.downloads.svg.url} download>{room.id} · plan SVG</a>
          <a href={cad.provenance} download>{room.id} · source provenance</a>
        </div>
        <p className="building-model-help">Room extracts retain source shape geometry and shared openings; they do not reproduce the full document’s parametric dependency history. Use the full-floor file for coordinated editing.</p>
        <details><summary>Layout notes</summary>
          <ul>{room.holds.map((hold) => <li key={hold}>{hold}</li>)}</ul>
        </details>
      </article>
    </div>
    <details className="building-release-details"><summary>Revision, sources and future updates</summary>
      <p>Model publication: R05, 12 September 2026. Only FF02 changes: the earlier glazed-frame study is replaced by the proposed steel-frame insulated-panel enclosure and lab layout, published for review. The first-floor model retains the FF03 sliding entrance (R04), FF04/FF06 P03 entrances and FF06 balcony B02; the full first-floor CAD download is the retained R04 file. Ground-floor assets and all 15 room extracts remain the published R03/R04 files. Service quantities: the S02 electrical and setup plan of 12 September (section 03 below) supersedes the S01 discussion scenario of 10 September, which is retained as history; neither is a certified design. Original CAD and Blender sources are preserved privately. Public current-design copies omit earlier trials and private computer-path metadata, with separate source and download hashes.</p>
      <p>Changes require a coordinated export, room-plan regeneration, service-note review and tested website release. Saving a local Blender or CAD file does not automatically publish it. Pending or unreviewed models are never substituted silently.</p>
      <a href={`${root}/release.json`} download>Download file checksums and release manifest</a>
      <p><a href={`${root}/design-verification.json`} download>FF02 enclosure verification record</a> · covers Blender preservation, native reopen and browser reimport of the concept geometry, not structure, weatherproofing or installation approval. <a href="/building-models/r04/design-verification.json" download>R04 sliding-door verification</a> retains its original scope.</p>
      <p><a href="/building-models/r04/release.json" download>Previous published R04 manifest</a> · <a href="/building-models/r03/release.json" download>R03 manifest</a> · <a href="/building-models/r01/release.json" download>R01 manifest · 10 September</a>. All remain unchanged; R02 was an unpublished checkpoint.</p>
    </details>
  </Section>;
}
