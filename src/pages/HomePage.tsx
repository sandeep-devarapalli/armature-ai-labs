import {
  ArrowRight,
  Armchair,
  CalendarDays,
  Cctv,
  CheckCircle2,
  Coffee,
  Droplets,
  ExternalLink,
  Layers,
  LockKeyhole,
  PackageOpen,
  Presentation,
  ScanLine,
  ShieldCheck,
  ShoppingBasket,
  Store,
  Sun,
  Users,
  UtensilsCrossed,
  Wrench
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { BrandMark } from "../components/BrandMark";
import { Metric, Section } from "../components/Primitives";
import { equipmentPageAvailable, memberPlatformAvailable } from "../config/release";
import { useTheme } from "../context/ThemeContext";

type RoomUse = "work" | "shared" | "outdoor" | "support";

type Room = {
  id: string;
  name: string;
  /** Carpet area in square feet, measured from the published building CAD. */
  areaSqFt: number;
  use: RoomUse;
  note: string;
  icon: LucideIcon;
};

/**
 * Measured room programme. Areas are carpet areas taken from the R03 ground-floor
 * and R04 first-floor CAD (room boundary polygons and floor slabs), rounded to the
 * nearest 5 sq ft. The GF-05 patio is excluded by decision; walls, the stair and
 * the first-floor void are not counted, which is why the rooms sum below the
 * roughly 3,500 sq ft gross built-up footprint.
 */
const roomProgramme: { floor: string; rooms: Room[] }[] = [
  {
    floor: "Ground floor",
    rooms: [
      { id: "GF-10", name: "Coworking commons", areaSqFt: 385, use: "work", note: "Long tables, window counter · 38 modelled positions", icon: Users },
      { id: "GF-09", name: "Lounge and presentation hall", areaSqFt: 300, use: "shared", note: "Talks, demos, the spiral stair", icon: Presentation },
      { id: "GF-01", name: "Four-person cabin", areaSqFt: 235, use: "work", note: "Opposed desks, retained storage", icon: Users },
      { id: "GF-08", name: "Balcony café", areaSqFt: 205, use: "outdoor", note: "Railed balcony, café tables, wall bar", icon: Coffee },
      { id: "GF-04", name: "Kitchen", areaSqFt: 190, use: "shared", note: "Existing kitchen, marble retained", icon: UtensilsCrossed },
      { id: "GF-02", name: "Reception and goodies store", areaSqFt: 90, use: "shared", note: "Visitor check-in, merchandise racks", icon: Store },
      { id: "GF-07", name: "Enclosed booth", areaSqFt: 45, use: "work", note: "Glass-fronted bench booth", icon: Armchair },
      { id: "GF-03 · GF-06", name: "Washrooms", areaSqFt: 100, use: "support", note: "Two retained sanitary spaces", icon: Droplets }
    ]
  },
  {
    floor: "First floor",
    rooms: [
      { id: "FF-04", name: "Stair landing and gallery", areaSqFt: 410, use: "work", note: "Twin cabins around the open void", icon: Layers },
      { id: "FF-06", name: "Office twin cabins", areaSqFt: 350, use: "work", note: "Two four-table cabins, cupboard retained", icon: Users },
      { id: "FF-02", name: "Workshop terrace", areaSqFt: 260, use: "outdoor", note: "Open, railed · electronics workshop proposal", icon: Wrench },
      { id: "FF-03", name: "Two- and four-person cabins", areaSqFt: 230, use: "work", note: "Six modelled seats, sliding entrance", icon: Users },
      { id: "FF-06 B", name: "Balcony", areaSqFt: 100, use: "outdoor", note: "Dedicated lower-cabin balcony", icon: Sun },
      { id: "FF-01 · FF-05", name: "Washrooms", areaSqFt: 125, use: "support", note: "Retained support and bathroom", icon: Droplets }
    ]
  }
];

const roomUseLabels: Record<RoomUse, string> = {
  work: "Cabins and desks",
  shared: "Shared and visitor-facing",
  outdoor: "Balconies and terrace",
  support: "Support"
};

const labRoles = [
  {
    number: "01",
    title: "A workshop",
    copy: "Bench space, tools, and serious equipment to build on. Assemble, break, and iterate without doing it alone in a garage."
  },
  {
    number: "02",
    title: "A showroom",
    copy: "Resident teams keep prototypes and demo material on the floor, so visitors see working physical AI rather than a pitch deck."
  },
  {
    number: "03",
    title: "A room",
    copy: "Founders, engineers, researchers, and backers share the space. Hard questions get answered by people who have built the thing."
  },
  {
    number: "04",
    title: "A training ground",
    copy: "Hands-on workshops, student research with industry, and build days with the communities advancing Indian robotics."
  }
];

export function HomePage() {
  return (
    <>
      <header className="home-hero">
        <HeroKernelField />
        <div className="wrap home-hero-inner">
          <div className="eyebrow mono">
            The Physical AI and Robotics Lab · HSR Layout, Bengaluru
          </div>
          <div className="hero-lockup">
            <BrandMark compact animated />
            <div>
              <h1>armature ai labs</h1>
              <span className="mono">The physical AI and robotics lab</span>
            </div>
          </div>
          <p className="hero-copy">
            The armature is the core of every motor: the part that moves. Ours is
            a 3,500 sq ft lab across two floors, built for the full path from idea
            to working machine: arms, prototyping, machining, ESD-safe benches, and
            GPU compute, all bookable by the hour.
          </p>
          <div className="button-row">
            {memberPlatformAvailable ? (
              <Link className="button button-primary" to="/book">
                <CalendarDays aria-hidden="true" />
                Book a workstation
              </Link>
            ) : (
              <Link className="button button-primary" to="/projects">
                Explore projects
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
            {equipmentPageAvailable && (
              <Link className="button button-quiet" to="/equipment">
                See the space
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
            <a
              className="button button-quiet"
              href="https://discord.gg/qGNXGmF8z"
              target="_blank"
              rel="noreferrer"
            >
              Join Discord
              <ExternalLink aria-hidden="true" />
            </a>
            <a
              className="button button-quiet"
              href="https://www.linkedin.com/company/armature-ai-labs/"
              target="_blank"
              rel="noreferrer"
            >
              Follow on LinkedIn
              <ExternalLink aria-hidden="true" />
            </a>
          </div>
          <div className="metrics-strip">
            <Metric label="Footprint" value="3,500 sq ft" />
            <Metric label="Floors" value="2" />
            <Metric label="Cabins" value="7" />
            <Metric label="Balconies + terrace" value="3" />
          </div>
        </div>
      </header>

      <Section
        number="01"
        title="A working floor, not a club lounge"
        lede="Every room is meant to hold a real project in progress."
      >
        <div className="role-list">
          {labRoles.map((role) => (
            <article className="role-row" key={role.number}>
              <span className="mono">→ {role.number}</span>
              <div>
                <h3>{role.title}</h3>
                <p>{role.copy}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="community-context">
          <span className="mono">Events and build days with</span>
          <div className="tag-row community-tags">
            <span>HSR Founders Club</span>
            <span>Robotics India community</span>
            <span>Partner communities</span>
          </div>
          <p>
            Armature AI Labs is the first working facility in a larger plan: the
            Institute for Physical AI.
          </p>
        </div>
      </Section>

      <Section
        number="02"
        title="Two floors at a glance"
        lede="Fifteen measured rooms across the ground and first floors: coworking commons, a presentation hall, seven cabins, a workshop terrace, and three balconies."
        dark
      >
        <div className="room-programme" aria-label="Armature AI Labs room programme by floor">
          {roomProgramme.map((level) => {
            const floorTotal = level.rooms.reduce((sum, room) => sum + room.areaSqFt, 0);
            return (
              <section className="room-floor" key={level.floor} aria-label={level.floor}>
                <header className="room-floor-header">
                  <h3>{level.floor}</h3>
                  <span className="mono">{level.rooms.length} rooms · {floorTotal.toLocaleString("en-IN")} sq ft carpet</span>
                </header>
                <div className="room-grid">
                  {level.rooms.map((room) => {
                    const Icon = room.icon;
                    return (
                      <article className={`room-tile room-${room.use}`} key={room.id} data-room-tile>
                        <Icon aria-hidden="true" />
                        <span className="mono room-id">{room.id}</span>
                        <strong>{room.name}</strong>
                        <span className="mono room-area">{room.areaSqFt} sq ft</span>
                        <p>{room.note}</p>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <div className="legend-row mono">
          <span><i className="legend-moss" /> {roomUseLabels.work}</span>
          <span><i className="legend-saffron" /> {roomUseLabels.shared}</span>
          <span><i className="legend-sky" /> {roomUseLabels.outdoor}</span>
          <span><i className="legend-neutral" /> {roomUseLabels.support}</span>
        </div>
        <p className="room-programme-note">
          Carpet areas measured from the published building CAD; walls, the stair and the
          first-floor void are not counted, and the ground-floor patio is excluded. Modelled
          seats are planning positions, not certified capacity.{" "}
          <Link to="/building-vision">Open the models and room CAD <ArrowRight aria-hidden="true" /></Link>
        </p>
      </Section>

      <Section
        number="03"
        title="Monitored, end to end"
        lede="Cameras and the access trail make a shared floor accountable without turning it into an unattended room."
      >
        <div className="feature-grid">
          <article>
            <Cctv aria-hidden="true" />
            <h3>Whole-floor coverage</h3>
            <p>The commons, presentation hall, cabins, workshop terrace, balconies, kitchen, and entrance feed the on-site NVR.</p>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" />
            <h3>Hazard-zone visibility</h3>
            <p>Guarded equipment remains subject to induction, booking, interlocks, and staff operating rules.</p>
          </article>
          <article>
            <ScanLine aria-hidden="true" />
            <h3>Tied to attendance</h3>
            <p>Each booking has a responsible member and a check-in trail, while recordings remain access-controlled.</p>
          </article>
        </div>
      </Section>

      <Section
        number="04"
        title="From idea to working machine"
        lede="The floor is a pipeline. Work enters as a sketch and leaves as a machine someone has watched run."
      >
        <div className="process-line pipeline-line">
          {[
            ["Sketch", "Define the job and the test."],
            ["Build", "Use benches, printers, and tools."],
            ["Test", "Move into the arm cell or flexible test bay."],
            ["Show", "Run the prototype on the demo floor."],
            ["Ship", "Document it and take it into the world."]
          ].map(([title, copy], index) => (
            <div className="process-step" key={title}>
              <span className="mono">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        number="05"
        title="The maker desk keeps small friction small"
        lede="Secure storage, build-sized consumables, and complete portable toolkits sit beside the heavy equipment."
      >
        <div className="feature-grid">
          <article>
            <LockKeyhole aria-hidden="true" />
            <h3>Lock the project here</h3>
            <p>Subscribe to a small, medium, or tall secure locker for a week, month, or year.</p>
            <Link to="/maker-desk">Locker options <ArrowRight aria-hidden="true" /></Link>
          </article>
          <article>
            <ShoppingBasket aria-hidden="true" />
            <h3>Buy the handful</h3>
            <p>Pick up screws, wire, headers, heat-shrink, solder, and other low-cost bench stock in useful quantities.</p>
            <Link to="/maker-desk">Bench stock <ArrowRight aria-hidden="true" /></Link>
          </article>
          <article>
            <PackageOpen aria-hidden="true" />
            <h3>Rent a complete toolbox</h3>
            <p>Use a tagged electronics, mechanical, soldering, precision, or diagnostics kit and return it checked.</p>
            <Link to="/maker-desk">Toolkit library <ArrowRight aria-hidden="true" /></Link>
          </article>
        </div>
      </Section>

      <Section
        number="06"
        title="Book, build, and leave a clean trail"
        lede="Accounts, certification gates, reservations, and attendance are one operational path."
      >
        <div className="process-line">
          {[
            ["Apply", "Tell us what you are building."],
            ["Induct", "Complete the lab and equipment safety checks."],
            ["Reserve", "Choose a resource and a live time slot."],
            ["Check in", "Present a one-use QR to the on-site kiosk."],
            ["Build", "Use the floor, log the work, and close the session."]
          ].map(([title, copy], index) => (
            <div className="process-step" key={title}>
              <span className="mono">0{index + 1}</span>
              <CheckCircle2 aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </Section>

      <div className="quote-band">
        <div className="wrap">
          <p>
            Most builders will never own a six-axis arm, a machine shop, and
            dedicated GPU compute. <strong>Here you book them by the hour.</strong>
          </p>
          <Link to="/join">
            Join the floor <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </>
  );
}

function HeroKernelField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const canvasElement = canvas;
    const drawingContext = context;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tile = 22;
    const gap = 7;
    let width = 0;
    let height = 0;
    let columns = 0;
    let rows = 0;
    let frame = 0;

    function resize() {
      const bounds = canvasElement.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return false;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      width = bounds.width;
      height = bounds.height;
      canvasElement.width = Math.round(width * pixelRatio);
      canvasElement.height = Math.round(height * pixelRatio);
      drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      columns = Math.ceil(width / (tile + gap)) + 1;
      rows = Math.ceil(height / (tile + gap)) + 1;
      return true;
    }

    function jitter(column: number, row: number) {
      const seed = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;
      return seed - Math.floor(seed);
    }

    function draw(time: number) {
      const lattice = getComputedStyle(document.documentElement)
        .getPropertyValue("--kernel-grid")
        .trim();
      drawingContext.clearRect(0, 0, width, height);

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * (tile + gap);
          const y = row * (tile + gap);
          const variation = jitter(column, row);
          drawingContext.strokeStyle = lattice;
          drawingContext.lineWidth = 1;
          drawingContext.strokeRect(x + 0.5, y + 0.5, tile, tile);

          const phase = (
            (column + row) * 0.55
            - time * 0.0011
            + variation * 0.8
          ) % (columns * 0.16);
          const wave = Math.max(0, 1 - Math.abs(phase) / 1.5);
          if (wave > 0.02) {
            drawingContext.fillStyle = `rgba(232, 154, 44, ${(0.38 * wave).toFixed(3)})`;
            drawingContext.fillRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
          }

          if (variation > 0.985 && Math.sin(time * 0.002 + variation * 40) > 0.55) {
            drawingContext.fillStyle = "rgba(196, 74, 42, 0.30)";
            drawingContext.fillRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
          }
        }
      }
    }

    function animate(time: number) {
      draw(time);
      frame = window.requestAnimationFrame(animate);
    }

    const resizeObserver = new ResizeObserver(() => {
      if (resize() && reducedMotion) draw(900);
    });
    resizeObserver.observe(canvasElement);

    if (resize()) {
      if (reducedMotion) draw(900);
      else frame = window.requestAnimationFrame(animate);
    }

    return () => {
      resizeObserver.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [theme]);

  return <canvas className="hero-kernel-field" ref={canvasRef} aria-hidden="true" />;
}
