import { EquipmentRentalPreview } from "./EquipmentRentalPreview";
import { useEffect, useRef, useState } from "react";
import type { EquipmentGuide as Guide } from "../data/equipmentGuides";
import { Link } from "react-router-dom";
import "./EquipmentGuide.css";

export function EquipmentGuide({ guide }: { guide: Guide }) {
  const [threeD, setThreeD] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const [point, setPoint] = useState(0);
  const [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const viewer = useRef<ReturnType<typeof import("../lib/equipment/viewer").mountEquipment> | null>(null);
  useEffect(() => {
    if (!threeD || !host.current) return;
    let active = true;
    const element = host.current;
    setError("");
    void import("../lib/equipment/viewer.js").then(module => {
      if (active) viewer.current = module.mountEquipment(element, guide.kind, guide.hotspots, setPoint);
    }).catch(() => { if(active) setError("The 3D study could not load. The specifications and feature list remain available below."); });
    return () => { active=false; viewer.current?.dispose(); viewer.current=null; };
  }, [threeD, guide]);
  return <div className="equipment-guide">
    <div className="equipment-gallery">
      <div className="segmented" role="group" aria-label="Equipment view"><button type="button" aria-pressed={!threeD} onClick={()=>setThreeD(false)}>Product reference</button><button type="button" aria-pressed={threeD} onClick={()=>setThreeD(true)}>Explore in 3D</button></div>
      {threeD ? <><div ref={host} className="equipment-3d" aria-label={`Simplified ${guide.title} study`} /><div className="button-row"><button className="button button-quiet" type="button" onClick={()=>viewer.current?.zoom(.85)}>Zoom in</button><button className="button button-quiet" type="button" onClick={()=>viewer.current?.zoom(1.18)}>Zoom out</button><button className="button button-quiet" type="button" onClick={()=>viewer.current?.reset()}>Reset view</button></div><p className="estimate-note">Original simplified study, not manufacturer CAD. Feature positions are illustrative; use official documentation for dimensions and wiring.</p></> : <><EquipmentReference key={imageIndex} guide={guide} imageIndex={imageIndex} />{import.meta.env.DEV && <div className="segmented" role="group" aria-label="Product reference gallery"><button type="button" aria-pressed={imageIndex===0} onClick={()=>setImageIndex(0)}>Reference 1</button><button type="button" aria-pressed={imageIndex===1} onClick={()=>setImageIndex(1)}>Reference 2</button></div>}<p className="estimate-note">{import.meta.env.DEV ? "Manufacturer product reference, not a lab photograph. Local review only; image publication permission is unconfirmed." : "Original schematic illustration. Actual lab photography will follow commissioning."}</p>{guide.kind === "printer" && import.meta.env.DEV && <p className="estimate-note">The reference photo shows an AMS accessory above the printer; it is not assumed part of the planned kit.</p>}</>}
      {error && <p role="status">{error}</p>}
      <a href={guide.source} target="_blank" rel="noreferrer">{guide.sourceLabel} ↗</a>
    </div>
    <div className="equipment-guide-copy"><span className="status status-neutral">Planned · not bookable</span><h2>{guide.title}</h2><p>{guide.summary}</p><dl className="equipment-specs">{guide.specs.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h3>Understand the hardware</h3><div className="equipment-hotspot-list">{guide.hotspots.map((item,index)=><button type="button" key={item.title} aria-pressed={point===index} onClick={()=>setPoint(index)}>{index+1}. {item.title}</button>)}</div><p className="equipment-feature" aria-live="polite">{guide.hotspots[point]?.detail}</p><EquipmentRentalPreview guide={guide} /><h3>Planned kit</h3><ul>{guide.kit.map(item=><li key={item}>{item}</li>)}</ul><h3>Before your first session</h3><ul>{guide.requirements.map(item=><li key={item}>{item}</li>)}</ul><Link to={`/components/wishlist?name=${encodeURIComponent(guide.title)}`}>Suggest equipment for the lab →</Link></div>
  </div>;
}
export function EquipmentReference({ guide, imageIndex = 0 }: { guide: Guide; imageIndex?: number }) {
  const [failed,setFailed]=useState(false);
  if(import.meta.env.DEV && !failed) return <img className="equipment-product-image" src={`/equipment-reference-preview/${imageIndex === 0 ? guide.image : guide.extraImage}`} alt={`${guide.title} manufacturer product reference`} loading="lazy" onError={()=>setFailed(true)} />;
  return <svg className="equipment-product-image equipment-schematic" viewBox="0 0 480 340" role="img" aria-label={`${guide.title} schematic illustration`}><g fill="none" stroke="currentColor" strokeWidth="3">{guide.kind==='printer'?<><path d="M145 65h180v220H145zM160 100h150v160H160zM160 230h150M185 130h100v30H185zM190 270h90"/><path d="M275 75h35v17h-35zM286 174v30"/></>:<><path d="m95 125 210-35 85 135-210 35z"/><path d="m173 125 105-18 43 77-105 18zM203 119l42 76M221 116l42 76M240 113l42 76M259 110l42 76M135 173l19 32 31-5-19-32zM181 214l15 25 30-5-15-25zM227 206l15 25 30-5-15-25z"/></>}</g><text x="240" y="315" textAnchor="middle" fill="currentColor" fontSize="12">SCHEMATIC · NOT A LAB PHOTOGRAPH</text></svg>;
}
