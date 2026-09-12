import { useState } from "react";
import { PageHeader, Section } from "../components/Primitives";
import { BuildingPlanning } from "../components/BuildingPlanning";
import { ElectricalPlan } from "../components/ElectricalPlan";
import release from "../data/buildingModelRelease.json";
import rooms from "../data/buildingRooms";
import roomViews from "../data/buildingRoomViews.json";
import "./BuildingVisionPage.css";

const filters = ["All", "Ground floor", "First floor"] as const;
const views = [
  ...(["ground", "first"] as const).map((floor) => ({
    id: `${floor}-floor-overview`, floor: floor === "ground" ? "Ground floor" : "First floor",
    title: floor === "ground" ? "Ground-floor layout" : "First-floor layout",
    src: release.floors[floor].preview, alt: `${floor === "ground" ? "Ground" : "First"} floor selected native Blender layout`,
    caption: `Current ${floor}-floor model overview.`, width: release.floors[floor].width, height: release.floors[floor].height
  })),
  {
    id: "ff-02-enclosure", floor: "First floor", title: "FF-02 · Enclosure proposal",
    src: release.enclosure.blender, alt: "FF-02 proposed aluminium-framed glass enclosure and glass roof, native Blender render",
    caption: "Glass-enclosure and glass-roof proposal with cabin-style aluminium framing. Existing masonry and the open curved balcony are retained.",
    width: 1450, height: 1200
  },
  ...(["FF-03", "FF-04", "FF-06"] as const).map((id) => ({
    id: `${id.toLowerCase()}-cabins`, floor: "First floor", title: `${id} · Cabin layout`,
    src: release.roomPreviews[id].blender, alt: `${id} selected cabin layout${id === "FF-03" ? " with sliding doors open" : ""}`,
    caption: id === "FF-03" ? "Four-seat cabin with the new two-panel sliding entrance." : "Selected cabin layout with sliding entrances.",
    width: 1450, height: 1450
  })),
  ...roomViews.map((view) => {
    const room = rooms.find((item) => item.id === view.id)!;
    return {
      id: `${view.id.toLowerCase()}-room`, floor: room.floor === "ground" ? "Ground floor" : "First floor",
      title: `${room.id} · ${room.name}`, src: view.image, alt: `${room.id} · ${room.name} · native Blender room view`,
      caption: view.caption, width: view.width, height: view.height
    };
  })
];

export function BuildingVisionPage() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("All");
  const visibleItems = views.filter((item) => activeFilter === "All" || item.floor === activeFilter);

  return <div className="building-vision-page">
    <PageHeader meta="Armature AI Labs · HSR 1490" title="Building Vision"
      description="Explore our ground- and first-floor layouts, room views, and downloadable Blender and CAD designs.">
      <p className="building-vision-quick-links"><a href="#planning-model">Explore models and downloads</a> · <a href="#comparisons">Browse building views</a> · <a href="#electrical-plan">Electrical and setup plan</a></p>
      <p>1490, 11th Cross, 20th Main, 1st Sector, HSR Layout, Bengaluru – 560034, Karnataka.</p>
    </PageHeader>
    <BuildingPlanning />
    <Section number="02" id="comparisons" title="Building views."
      lede="Selected layouts from the current model collection.">
      <div className="building-vision-filters" role="toolbar" aria-label="Filter building views">
        {filters.map((filter) => <button key={filter} type="button" aria-pressed={filter === activeFilter}
          className={filter === activeFilter ? "is-active" : undefined} onClick={() => setActiveFilter(filter)}>{filter}</button>)}
      </div>
      <p className="building-vision-count mono" aria-live="polite">Showing {visibleItems.length} of {views.length} views</p>
      <div className="building-vision-list">
        {visibleItems.map((item) => <article className="building-vision-room" id={item.id} key={item.id}>
          <header><div><span className="mono">{item.floor}</span><h3>{item.title}</h3></div></header>
          <figure className="building-vision-model-image">
            <a className="building-vision-image-frame" href={item.src} target="_blank" rel="noreferrer">
              <img src={item.src} alt={item.alt} width={item.width} height={item.height} loading="lazy" decoding="async" />
            </a>
            <figcaption>{item.caption}</figcaption>
          </figure>
        </article>)}
      </div>
    </Section>
    <ElectricalPlan />
  </div>;
}
