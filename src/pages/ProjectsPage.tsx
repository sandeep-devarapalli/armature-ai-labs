import { useRef, useState } from "react";
import {
  ArrowUpRight,
  Cpu,
  ChevronDown,
  HardDrive,
  Rocket,
  Search,
  Share2,
  SlidersHorizontal,
  Wrench,
  X
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { EmptyState, Field, Section, Status } from "../components/Primitives";
import { getProjectComponentCounts } from "../data/components";
import { projects } from "../data/projects";
import type { Project } from "../types/domain";

const priorities = ["P0", "P1", "P2"];
const statuses = [...new Set(projects.map((project) => project.status))];
const categories = [...new Set(projects.map((project) => project.category))].sort();
const featuredProjects = projects.filter((project) => project.priority === "P0");
const projectLayers = [
  { value: "", label: "All projects" },
  { value: "robotics", label: "Robotics" },
  { value: "sensing", label: "Sensing & interfaces" },
  { value: "ai", label: "AI & software" },
  { value: "infrastructure", label: "Infrastructure" }
] as const;
const sortOptions = [
  { value: "", label: "Roadmap order" },
  { value: "priority", label: "Priority: P0 first" },
  { value: "name", label: "Name: A to Z" }
];
const projectMediaCredits: Record<string, readonly [string, string]> = {
  "autonomous-computer": ["Autonomous AI · autonomous-computer", "https://github.com/autonomous-ai/autonomous-computer"],
  "local-8b-model": ["Unsloth Studio", "https://github.com/unslothai/unsloth"],
  "esp32-ai": ["Derived from slvDev · esp32-ai demo", "https://github.com/slvDev/esp32-ai"],
  recamera: ["Seeed Studio · reCamera", "https://github.com/Seeed-Studio/OSHW-reCamera-Series"],
  eyecam: ["Marc Teyssier et al. · Eyecam", "https://marcteyssier.com/thumbs/projects/eyecam/eyecam_3_zoom-800x400.jpg"],
  "ego-oscar": ["FPV Labs · Ego-OSCAR", "https://www.fpvlabs.ai/images/ego-oscar-hero.webp"],
  "lerobot-so-arm101": ["Hugging Face LeRobot", "https://github.com/huggingface/lerobot"],
  "so-arm100-so101": ["TheRobotStudio · SO-ARM100", "https://github.com/TheRobotStudio/SO-ARM100"],
  gem: ["GEM · Joe Clinton", "https://joeclinton.me/gem/"],
  openactuator: ["OpenActuator · LinearVCM project", "https://github.com/OpenActuator/LinearVCM"],
  "electrofluidic-fiber-muscles": ["MIT Media Lab · Ozgun Kilic Afsar", "https://www.media.mit.edu/projects/electrofluidicmuscle/overview/"],
  valetudo: ["Valetudo · Sören Beye", "https://valetudo.cloud/"],
  oomwoo: ["OOMWOO · MakersPet", "https://makerspet.com/blog/building-an-open-source-robot-vacuum-meet-oomwoo/"],
  openmower: ["OpenMower · Clemens Elflein", "https://openmower.de/"],
  "diy-weather-station": ["Nikodem Bartnik · DIY Weather Station", "https://github.com/NikodemBartnik/DIY-Weather-Station/blob/main/server/app/static/images/diy_weather_station.jpg"],
  q8bot: ["Q8bot · Yufeng (Eric) Wu", "https://github.com/EricYufengWu/q8bot"],
  "solo12-odri": ["Open Dynamic Robot Initiative · Solo 12", "https://github.com/open-dynamic-robot-initiative/open_robot_actuator_hardware"],
  "orion-quadruped": ["Ashish A. · Orion Quadruped", "https://github.com/AshishA26/Orion-Quadruped/blob/5d265a949ce82a890a101f3e6c9379515f0cefae/photos/Orion_Thumbnail.png"],
  "bridge-humanoid": ["BRIDGE project team · teleoperation demo", "https://drive.google.com/file/d/1r2t6l6J9tWuIiAmhrMzVjE-pLqLZ6EUT/view"],
  yor: ["YOR project team · yourownrobot.ai", "https://www.yourownrobot.ai/"],
  "rebot-devarm": ["Seeed Studio · reBot DevArm", "https://github.com/Seeed-Projects/reBot-DevArm"],
  openarm: ["OpenArm · Enactic", "https://github.com/enactic/openarm"],
  "low-cost-esp32-drone": ["Circuit Digest · ESP-Drone", "https://circuitdigest.com/microcontroller-projects/DIY-wifi-controlled-drone"],
  px4: ["PX4 · Holybro / Dronecode", "https://docs.px4.io/main/en/frames_multicopter/holybro_x500v2_pixhawk6c"],
  ardupilot: ["ArduPilot Project", "https://ardupilot.org/"],
  openmantaclaus: ["OpenMantaClaus · Kushagra Javeri", "https://github.com/kushagra77/OpenMantaClaus/blob/main/docs/assets/hero_shot.jpg"],
  "human-like-robot-skin": ["Marc Teyssier et al. · Human-like Robot Skin", "https://marcteyssier.com/thumbs/projects/humanlike-skin/dscf0391_crop2-800x400.jpg"],
  "skin-on-interfaces": ["Marc Teyssier et al. · Skin-On Interfaces", "https://marcteyssier.com/thumbs/projects/skin-on/pinchphone3-800x400.jpg"],
  flexitac: ["FlexiTac · Huang & Li", "https://flexitac.github.io/"],
  "9dtact": ["9DTact · Lin et al.", "https://linchangyi1.github.io/9DTact/"],
  "orca-hand": ["ORCA Dexterity", "https://www.orcahand.com/models"],
  "osmo-tactile-glove": ["OSMO · Yin et al.", "https://www.jessicayin.com/osmo_tactile_glove/"],
  "opentouch-glove": ["OpenTouch Glove · Murphy et al.", "https://wiresens-gloves.vercel.app/team/"],
  polysense: ["CounterChemists · PolySense", "https://marcteyssier.com/thumbs/projects/polysense/combined-800x400.jpg"],
  stag: ["MIT CSAIL · Sundaram et al.", "https://stag.csail.mit.edu/"],
  amazinghand: ["AmazingHand · Pollen Robotics", "https://github.com/pollen-robotics/AmazingHand"],
  "dexhand-v1": ["DexHand · IoT Design Shop", "https://www.dexhand.org/"],
  "leap-hand": ["LEAP Hand · CMU", "https://github.com/leap-hand/LEAP_Hand_Sim"],
  indymill: ["Nikodem Bartnik · IndyMill", "https://indystry.cc/wp-content/uploads/2021/10/1.2-e1635075424574.jpg"],
  netbox: ["NetBox Community", "https://github.com/netbox-community/netbox"],
  openbmc: ["OpenBMC · Linux Foundation", "https://openbmc.org/"],
  sonic: ["SONiC · Linux Foundation", "https://sonicfoundation.dev/brand-guidelines/"],
  "nasa-rover": ["NASA/JPL-Caltech · Open Source Rover", "https://github.com/nasa-jpl/open-source-rover"]
};
const localFirstLoop = [
  { title: "Store", copy: "NAS + DVC", icon: HardDrive },
  { title: "Train", copy: "GPU node", icon: Cpu },
  { title: "Build", copy: "Arms + robots", icon: Wrench },
  { title: "Deploy", copy: "Local AI", icon: Rocket },
  { title: "Share", copy: "Open repos", icon: Share2 }
] as const;

function getProjectLayer(project: Project) {
  if (project.infrastructure) {
    return "infrastructure";
  }
  if (["Embedded AI", "Machine Learning"].includes(project.category)) {
    return "ai";
  }
  if (["Tactile Sensing", "Tactile Interfaces", "Vision AI", "Wearables", "Environmental Sensing"].includes(project.category)) {
    return "sensing";
  }
  return "robotics";
}

function ProjectCard({ project }: { project: Project }) {
  const componentCounts = getProjectComponentCounts(project.slug);
  const mediaCredit = projectMediaCredits[project.slug];

  return (
    <article className="project-card" id={project.slug}>
      {project.image && (
        <figure className="project-visual">
          <img src={project.image} alt={`${project.title} project`} loading="lazy" />
          <figcaption className="project-credit mono">
            {mediaCredit ? (
              <a href={mediaCredit[1]} target="_blank" rel="noreferrer">Image: {mediaCredit[0]}</a>
            ) : (
              "Armature AI Labs reference illustration"
            )}
          </figcaption>
        </figure>
      )}
      <div className="project-card-body">
        <div className="row-between">
          <span className="mono">{project.category}</span>
          <div className="status-row">
            <Status tone={project.priority === "P0" ? "bad" : project.priority === "P1" ? "accent" : "neutral"}>{project.priority}</Status>
            <Status tone={project.status === "Build Now" ? "good" : "neutral"}>{project.status}</Status>
          </div>
        </div>
        <h3>{project.title}</h3>
        <p>{project.description}</p>
        <div className="resource-meta mono">
          <span>{componentCounts.required} required</span>
          <span>{componentCounts.optional} optional</span>
          <span>{componentCounts.alternative} alternative</span>
        </div>
        <div className="tag-row">{project.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <div className="project-card-links">
          {project.detailPath && (
            <Link to={project.detailPath}>
              Research brief <ArrowUpRight aria-hidden="true" />
            </Link>
          )}
          <Link to={`/components?project=${project.slug}`}>
            Build components <ArrowUpRight aria-hidden="true" />
          </Link>
          <a href={project.sourceUrl} target="_blank" rel="noreferrer">
            Project source <ArrowUpRight aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function ProjectsPage() {
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const validValue = (key: string, options: readonly string[]) => {
    const value = params.get(key) ?? "";
    return options.includes(value) ? value : "";
  };
  const priority = validValue("priority", priorities);
  const status = validValue("status", statuses);
  const layer = validValue("layer", projectLayers.map((item) => item.value));
  const category = validValue("category", categories);
  const sort = validValue("sort", sortOptions.map((item) => item.value));
  const query = params.get("q") ?? "";
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matchesSearch = (project: Project) => {
    const text = `${project.title} ${project.category} ${project.description} ${project.tags.join(" ")}`.toLowerCase();
    return words.every((word) => text.includes(word));
  };
  const filtered = projects.filter((project) =>
    (!priority || project.priority === priority)
    && (!status || project.status === status)
    && (!layer || getProjectLayer(project) === layer)
    && (!category || project.category === category)
    && matchesSearch(project)
  );
  if (sort === "name") filtered.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "priority") filtered.sort((a, b) => a.priority.localeCompare(b.priority));

  const activeFilters = [
    { key: "q", value: query.trim(), label: `Search: ${query.trim()}` },
    { key: "layer", value: layer, label: projectLayers.find((item) => item.value === layer)?.label },
    { key: "category", value: category, label: category },
    { key: "status", value: status, label: status },
    { key: "priority", value: priority, label: priority }
  ].filter((item) => item.value);
  const refinementCount = [category, status, priority].filter(Boolean).length;
  const visibleCategories = categories.filter((item) => !layer || projects.some((project) =>
    project.category === item && getProjectLayer(project) === layer
  ));

  function updateFilters(values: Record<string, string>, replace = false) {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(values)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    }, { replace, preventScrollReset: true });
  }

  function clearFilters() {
    updateFilters({ q: "", layer: "", category: "", status: "", priority: "", sort: "" });
  }

  return (
    <>
      <header className="projects-header">
        <div className="wrap">
          <div className="projects-heading">
            <h1>Projects</h1>
            <span className="mono">{projects.length} build & research tracks</span>
          </div>
          <p>Robots, sensing, local AI, and the tools to build them. Find your next lab project.</p>
        </div>
      </header>

      <section className="project-browser" id="project-grid" aria-label="Project catalog">
        <div className="wrap">
          <div className="project-search-row">
            <label className="search-box">
              <Search aria-hidden="true" />
              <span className="sr-only">Search projects</span>
              <input ref={searchInput} type="search" value={query} onChange={(event) => updateFilters({ q: event.target.value }, true)} placeholder="Search projects, hardware, or skills" />
            </label>
            <button className="button button-quiet project-filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="project-refinements" onClick={() => setFiltersOpen(!filtersOpen)}>
              <SlidersHorizontal aria-hidden="true" /> Filters{refinementCount > 0 && ` (${refinementCount})`}
              <ChevronDown aria-hidden="true" />
            </button>
          </div>
          <div className="project-topics" role="group" aria-label="Filter by topic">
            {projectLayers.map((item) => {
              const count = projects.filter((project) =>
                (!item.value || getProjectLayer(project) === item.value)
                && (!priority || project.priority === priority)
                && (!status || project.status === status)
                && matchesSearch(project)
              ).length;
              return (
                <button key={item.value} type="button" aria-pressed={layer === item.value} onClick={() => updateFilters({ layer: item.value, category: "" })}>
                  {item.label}<span>{count}</span>
                </button>
              );
            })}
          </div>
          <div id="project-refinements" className={`project-refinements${filtersOpen ? " is-open" : ""}`}>
            <Field label="Category">
              <select value={category} onChange={(event) => updateFilters({ category: event.target.value })}>
                <option value="">All categories</option>
                {[...new Set([...visibleCategories, ...(category ? [category] : [])])].map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Build status">
              <select value={status} onChange={(event) => updateFilters({ status: event.target.value })}>
                <option value="">All statuses</option>
                {statuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={priority} onChange={(event) => updateFilters({ priority: event.target.value })}>
                <option value="">All priorities</option>
                {priorities.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
          </div>
          <div className="project-results-bar">
            <p role="status" aria-live="polite" aria-atomic="true"><strong>{filtered.length}</strong> of {projects.length} projects</p>
            <label className="project-sort">
              <span>Sort by</span>
              <select value={sort} onChange={(event) => updateFilters({ sort: event.target.value })}>
                {sortOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
          </div>
          {activeFilters.length > 0 && (
            <div className="project-active-filters" aria-label="Active filters">
              {activeFilters.map((item) => (
                <button key={item.key} type="button" title={`Remove ${item.label}`} aria-label={`Remove ${item.label}`} onClick={() => updateFilters({ [item.key]: "" })}>
                  <span>{item.label}</span><X aria-hidden="true" />
                </button>
              ))}
              <button className="project-clear" type="button" onClick={clearFilters}>Clear all</button>
            </div>
          )}
          {filtered.length > 0 ? (
            <div className="project-grid">
              {filtered.map((project) => <ProjectCard key={project.slug} project={project} />)}
            </div>
          ) : (
            <div className="project-no-results">
              <EmptyState title="No projects match these filters.">Try a broader topic or a different search.</EmptyState>
              <button className="button button-primary" type="button" onClick={clearFilters}><X aria-hidden="true" /> Clear filters</button>
            </div>
          )}
        </div>
      </section>

      <Section
        id="p0-builds"
        number="01"
        title="P0 builds"
        lede="Storage, compute, and the first embodied-AI arm loop give the lab its local backbone."
      >
        <div className="project-priority-list">
          {featuredProjects.map((project) => (
            <Link key={project.slug} to={`/projects?q=${encodeURIComponent(project.title)}`} onClick={() => searchInput.current?.focus()}>
              <img src={project.image} alt="" loading="lazy" />
              <span>{project.title}<small>{project.category}</small></span>
              <ArrowUpRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </Section>

      <Section number="02" title="Infrastructure comes first" dark>
        <div className="infra-line">
          {[
            ["01", "Storage", "TrueNAS or OpenZFS for durable data."],
            ["02", "Compute", "A two-GPU local node before a rack."],
            ["03", "Versioning", "DVC remotes for datasets and models."],
            ["04", "Object layer", "S3 semantics only when projects need them."],
            ["05", "Operations", "NetBox, BMC, and networking as nodes multiply."]
          ].map(([number, title, copy]) => (
            <div key={number}><span className="mono">{number}</span><h3>{title}</h3><p>{copy}</p></div>
          ))}
        </div>
      </Section>

      <Section number="03" title="The local-first lab loop">
        <div className="process-line">
          {localFirstLoop.map(({ title, copy, icon: Icon }, index) => (
            <div className="process-step" key={title}>
              <span className="mono">0{index + 1}</span>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="quote-band">
        <div className="wrap">
          <p>
            Pick a mission, bring a build log, and make the stack real.{" "}
            <strong>The lab is where open-source robotics leaves the README.</strong>
          </p>
          <Link to="/join">
            Build with us <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </>
  );
}
