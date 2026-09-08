import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  Cpu,
  Filter,
  HardDrive,
  Rocket,
  Search,
  Share2,
  Wrench
} from "lucide-react";
import { Link } from "react-router-dom";
import { EmptyState, Field, PageHeader, Section, Status } from "../components/Primitives";
import { getProjectComponentCounts } from "../data/components";
import { projects } from "../data/projects";
import type { Project } from "../types/domain";

const priorities = ["All", "P0", "P1", "P2"] as const;
const statuses = ["All statuses", ...new Set(projects.map((project) => project.status))];
const categories = ["All categories", ...new Set(projects.map((project) => project.category))];
const featuredProjects = projects.filter((project) => project.priority === "P0");
const projectLayers = ["All layers", "Lab infrastructure", "AI & software", "Robotics & autonomy", "Sensing & interfaces"] as const;
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

type ProjectLayer = (typeof projectLayers)[number];

function getProjectLayer(project: Project): Exclude<ProjectLayer, "All layers"> {
  if (project.infrastructure) {
    return "Lab infrastructure";
  }
  if (["Embedded AI", "Machine Learning"].includes(project.category)) {
    return "AI & software";
  }
  if (["Tactile Sensing", "Tactile Interfaces", "Vision AI", "Wearables", "Environmental Sensing"].includes(project.category)) {
    return "Sensing & interfaces";
  }
  return "Robotics & autonomy";
}

function ProjectCard({ project, anchor = true }: { project: Project; anchor?: boolean }) {
  const componentCounts = getProjectComponentCounts(project.slug);
  const mediaCredit = projectMediaCredits[project.slug];

  return (
    <article className="project-card" id={anchor ? project.slug : undefined}>
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
    </article>
  );
}

export function ProjectsPage() {
  const [priority, setPriority] = useState<(typeof priorities)[number]>("All");
  const [status, setStatus] = useState("All statuses");
  const [layer, setLayer] = useState<ProjectLayer>("All layers");
  const [category, setCategory] = useState("All categories");
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const needle = query.toLowerCase().trim();
    return projects.filter((project) => {
      const matchesPriority = priority === "All" || project.priority === priority;
      const matchesStatus = status === "All statuses" || project.status === status;
      const matchesLayer = layer === "All layers" || getProjectLayer(project) === layer;
      const matchesCategory = category === "All categories" || project.category === category;
      const haystack = `${project.title} ${project.category} ${project.description} ${project.tags.join(" ")}`.toLowerCase();
      return matchesPriority && matchesStatus && matchesLayer && matchesCategory && (!needle || haystack.includes(needle));
    });
  }, [category, layer, priority, query, status]);

  return (
    <>
      <PageHeader
        meta="Open projects · living build roadmap"
        title="Build what the lab needs next."
        description="A working roadmap of open hardware, robot learning, tactile sensing, mobile autonomy, and the infrastructure that keeps every experiment reproducible."
      >
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
      </PageHeader>

      <Section
        id="p0-builds"
        number="01"
        title="P0 builds"
        lede="Start here. Storage, compute, and the first embodied-AI arm loop give the lab its local backbone."
      >
        <div className="project-grid">
          {featuredProjects.map((project) => <ProjectCard anchor={false} key={project.slug} project={project} />)}
        </div>
      </Section>

      <Section
        id="project-grid"
        number="02"
        title="Project grid"
        lede={`${filtered.length} of ${projects.length} project tracks shown. Filter by build status, lab layer, category, or priority.`}
      >
        <div className="filter-bar">
          <label className="search-box">
            <Search aria-hidden="true" />
            <span className="sr-only">Search projects</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" />
          </label>
          <div className="segmented" role="group" aria-label="Filter by priority">
            <Filter aria-hidden="true" />
            {priorities.map((item) => (
              <button key={item} className={priority === item ? "active" : ""} onClick={() => setPriority(item)} type="button">
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-bar">
          <div className="form-grid" style={{ width: "100%" }}>
            <Field label="Status">
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                {statuses.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Lab layer">
              <select value={layer} onChange={(event) => setLayer(event.target.value as ProjectLayer)}>
                {projectLayers.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Category">
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories.map((item) => <option key={item}>{item}</option>)}
              </select>
            </Field>
          </div>
        </div>
        {filtered.length > 0 ? (
          <div className="project-grid">
            {filtered.map((project) => <ProjectCard key={project.slug} project={project} />)}
          </div>
        ) : (
          <EmptyState title="No projects match these filters.">
            Try another status, lab layer, category, priority, or search term.
          </EmptyState>
        )}
      </Section>

      <Section number="03" title="Infrastructure comes first" dark>
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
