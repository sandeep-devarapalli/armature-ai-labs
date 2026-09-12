import { useState } from "react";
import { Section } from "./Primitives";
import plan from "../data/buildingElectricalS02.json";
import "./ElectricalPlan.css";

type Floor = "ground" | "first";
const floorLabel: Record<Floor, string> = { ground: "Ground floor", first: "First floor" };

export function ElectricalPlan() {
  const [floor, setFloor] = useState<Floor>("ground");
  const drawing = plan.plans[floor];
  const rooms = plan.rooms.filter((room) => room.floor === (floor === "ground" ? "GF" : "FF"));
  const floorTotals = rooms.reduce((acc, room) => ({
    sockets6: acc.sockets6 + room.sockets6, sockets16: acc.sockets16 + room.sockets16, lights: acc.lights + room.lights,
    fans: acc.fans + room.fans, ac: acc.ac + room.ac.length, typical: acc.typical + room.typicalW
  }), { sockets6: 0, sockets16: 0, lights: 0, fans: 0, ac: 0, typical: 0 });
  const design = plan.scenarios[0];

  return <Section number="03" id="electrical-plan" title="Electrical and setup plan."
    lede={`S02, ${new Date(plan.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}: sockets, lighting, air conditioning, AV, cameras, access doors and backup power for both floors, reconciled to the ${plan.supply.replace("BESCOM ", "").split(";")[0]} supply.`}>
    <p className="building-model-help">{plan.boundary}</p>

    <div className="electrical-summary" aria-label="Load summary">
      <div><span className="mono">Design case</span><strong>{design.kw} kW</strong><p>25 people concurrent, four cabins in use, a GPU job running: {(10 - design.kw).toFixed(1)} kW of headroom under 10 kW.</p></div>
      <div><span className="mono">Phase balance</span><strong>{plan.phases.R.kw} · {plan.phases.Y.kw} · {plan.phases.B.kw} kW</strong><p>R, Y, B at the design case. Hall ACs split across R and Y; the UPS sits on B.</p></div>
      <div><span className="mono">Critical power</span><strong>{plan.ups.rating_kva} kVA UPS · {plan.ups.backup_h} h</strong><p>GPUs, printers, network, hall AV and access doors; {plan.ups.lifepo4_kwh_at_80pct_dod} kWh installed at 80% depth of discharge.</p></div>
      <div><span className="mono">Installed</span><strong>{plan.totals.sockets6} × 6 A · {plan.totals.sockets16} × 16 A</strong><p>{plan.totals.luminaires} luminaires, {plan.totals.fans} BLDC fans, {plan.totals.acUnits} AC units, {plan.totals.cameras} cameras, {plan.totals.accessDoors} access doors. Connected load {plan.totals.connectedKw} kW.</p></div>
    </div>

    <div className="building-floor-tabs" role="group" aria-label="Choose electrical plan floor">
      {(["ground", "first"] as const).map((id) => <button key={id} type="button" aria-pressed={floor === id} onClick={() => setFloor(id)}>{floorLabel[id]} electrical plan</button>)}
    </div>
    <figure className="electrical-drawing">
      <a className="building-room-preview" href={drawing.svg} target="_blank" rel="noreferrer" aria-label={`Open the ${floorLabel[floor].toLowerCase()} electrical plan`}>
        <img src={drawing.svg} alt={`${floorLabel[floor]} electrical and setup plan S02 with sockets, lighting, air conditioning, AV, cameras and access doors`} width={drawing.width} height={drawing.height} loading="lazy" decoding="async" />
      </a>
      <figcaption>{floorLabel[floor]}: {rooms.length} rooms, {floorTotals.sockets6} six-ampere and {floorTotals.sockets16} sixteen-ampere points, {floorTotals.lights} luminaires, {floorTotals.fans} fans, {floorTotals.ac} AC units. Typical occupied demand for the floor about {(floorTotals.typical / 1000).toFixed(1)} kW before diversity. Positions are indicative.</figcaption>
    </figure>

    <div className="electrical-table-wrap">
      <table className="electrical-table">
        <caption className="mono">{floorLabel[floor]} schedule per room</caption>
        <thead><tr><th scope="col">Room</th><th scope="col">Seats</th><th scope="col">Lighting</th><th scope="col">Fans</th><th scope="col">Air conditioning</th><th scope="col">6 A</th><th scope="col">16 A</th><th scope="col">Typical W</th></tr></thead>
        <tbody>
          {rooms.map((room) => <tr key={room.id}>
            <th scope="row"><span className="mono">{room.id}</span> {room.name}</th>
            <td>{room.seats}</td>
            <td>{room.lights} × {room.lamp}</td>
            <td>{room.fans}{room.exhaust ? ` + ${room.exhaust} exhaust` : ""}</td>
            <td>{room.ac.length ? room.ac.join(", ") : room.fans ? "fans" : "none"}</td>
            <td>{room.sockets6}</td>
            <td>{room.sockets16}</td>
            <td>{room.typicalW}</td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <details className="electrical-details" open>
      <summary>Equipment, AV, cameras and access doors</summary>
      <ul>
        {plan.rooms.flatMap((room) => room.equipment.map((item) => <li key={room.id + item.item}><span className="mono">{room.id}</span> {item.item}: {item.connectedW} W connected, {item.averageW} W average, {item.feed === "ups" ? "UPS" : "mains"} · {item.point}</li>))}
      </ul>
      <p><strong>Cameras (PoE, NVR in the workshop rack on the UPS):</strong> {plan.cameras.map((camera) => `${camera.id} ${camera.room} (${camera.view})`).join("; ")}.</p>
      <p><strong>Access doors (lock, reader, contact, exit light):</strong> {plan.accessDoors.map((door) => `${door.id} ${door.room} (${door.where})`).join("; ")}.</p>
    </details>

    <details className="electrical-details">
      <summary>Load scenarios against 10 kW</summary>
      <p>Maximum demand is billed on a 30-minute integrated basis, so short kettle cycles barely register while running ACs and bulk battery charging do.</p>
      <div className="electrical-scenarios">
        {plan.scenarios.map((scenario) => <article key={scenario.key}>
          <h4>{scenario.title}<span className="mono">{scenario.kw} kW</span></h4>
          <ul>{scenario.items.map(([item, watts]) => <li key={String(item)}>{item}: {watts} W</li>)}</ul>
        </article>)}
      </div>
      <p><strong>Phases at the design case.</strong> {(["R", "Y", "B"] as const).map((p) => `${p} ${plan.phases[p].kw} kW: ${plan.phases[p].items.join(", ")}`).join(". ")}.</p>
    </details>

    <details className="electrical-details">
      <summary>Backup power and house rules</summary>
      <p><strong>UPS.</strong> {plan.ups.rating_kva} kVA online double-conversion, about {plan.ups.rating_kw_at_pf0_9} kW at 0.9 power factor. Connected UPS load {plan.ups.connected_w} W, average {plan.ups.average_w} W, {plan.ups.backup_h} h at the average needs {plan.ups.energy_needed_kwh} kWh delivered. Recommended battery: {plan.ups.lifepo4_option}. Lead-acid alternative: {plan.ups.lead_acid_option}. Charger limited to about {plan.ups.charger_limit_w} W. {plan.ups.note}</p>
      <p><strong>Floor inverters.</strong> Ground: {plan.inverters.GF.rating} with {plan.inverters.GF.battery}, covering {plan.inverters.GF.covers}, roughly {plan.inverters.GF.backup_est_h} h. First: {plan.inverters.FF.rating} with {plan.inverters.FF.battery}, covering {plan.inverters.FF.covers}, roughly {plan.inverters.FF.backup_est_h} h. AC, kitchen and workshop raw circuits are never on an inverter.</p>
      <ol>{plan.rules.map((rule) => <li key={rule}>{rule}</li>)}</ol>
    </details>

    <div className="building-plan-downloads" aria-label="Electrical plan downloads">
      <a href={plan.downloads.groundCad} download>Ground floor · FreeCAD electrical</a>
      <a href={plan.downloads.firstCad} download>First floor · FreeCAD electrical</a>
      <a href={plan.downloads.groundStep} download>Ground floor · STEP symbols</a>
      <a href={plan.downloads.firstStep} download>First floor · STEP symbols</a>
      <a href={plan.plans.ground.png} download>Ground floor · plan PNG</a>
      <a href={plan.plans.first.png} download>First floor · plan PNG</a>
      <a href={plan.downloads.brief} download>Contractor brief · Markdown</a>
      <a href={plan.downloads.schedule} download>Schedule · JSON</a>
      <a href={plan.downloads.symbols} download>Symbol placements · JSON</a>
      <a href={plan.downloads.manifest} download>S02 manifest and checksums</a>
    </div>
    <p className="building-model-help">The native FreeCAD files carry the reference architecture copied from the published CAD plus an “S02 Electrical” group with one object per symbol (room, kind and rating in the label, at mounting height). Fresh save and reopen passed for both documents (<a href={plan.downloads.reopen} download>record</a>). No AI-generated imagery.</p>
  </Section>;
}
