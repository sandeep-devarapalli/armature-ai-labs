import { useRegistrationLabel } from "../context/AccountContext";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Cctv,
  CheckCircle2,
  LockKeyhole,
  PackageOpen,
  ScanLine,
  ShieldCheck,
  ShoppingBasket
} from "lucide-react";
import { Link } from "react-router-dom";
import { FieldOfTouch } from "../components/FieldOfTouch";
import { PixelPhoto } from "../components/PixelPhoto";
import { VitruvianSketch } from "../components/VitruvianSketch";
import "./HomePagePixel.css";
import { Metric, Section } from "../components/Primitives";
import { basicOnboardingAvailable, deskCheckoutAvailable, equipmentPageAvailable, memberPlatformAvailable, publicBookingsAvailable } from "../config/release";


const labRoles = [
  {
    number: "01",
    title: "A workshop",
    copy: "Bench space, tools, and serious equipment to build on. Assemble, break, and iterate without doing it alone in a garage."
  },
  {
    number: "02",
    title: "A showroom",
    copy: "A place for resident teams to keep prototypes and demo material on the floor, so visitors can see working physical AI rather than a pitch deck."
  },
  {
    number: "03",
    title: "A room",
    copy: "A shared space for founders, engineers, researchers, and backers. Hard questions deserve people who have built the thing."
  },
  {
    number: "04",
    title: "A training ground",
    copy: "Hands-on workshops, student research with industry, and build days with the communities advancing Indian robotics."
  }
];

export function HomePage() {
  const registrationLabel = useRegistrationLabel();
  return (
    <div className="landing-pixel">
      <header className="home-hero home-hero-integrated">
        <div className="wrap home-hero-inner">
          <div className="editorial-hero-grid editorial-hero-motion"><div className="editorial-hero-copy">
          <h1>A place to build<br/><span className="muted">physical intelligence.</span></h1>
          <p className="hero-copy">
            The armature is the core of every motor: the part that moves. Ours is
            {publicBookingsAvailable
              ? "a 3,500 sq ft lab across two floors in HSR Layout, Bengaluru, for building physical AI and robotics."
              : "a planned 3,500 sq ft lab across two floors, designed for the full path from idea to working machine: robotics, prototyping, ESD-safe benches, and GPU compute."}
          </p>
          {!memberPlatformAvailable && <p className="hero-location mono">{deskCheckoutAvailable ? "Free membership registration and paid desk passes are available." : basicOnboardingAvailable ? "Free membership registration and Guest Pass requests are available." : "Contact the lab about membership and booking availability."}</p>}
          <p className="hero-location mono">The Physical AI and Robotics Lab · HSR Layout, Bengaluru</p>
          <div className="button-row">
            {memberPlatformAvailable ? (
              <Link className="button button-primary" to="/book">
                <CalendarDays aria-hidden="true" />
                Book a workstation
              </Link>
            ) : basicOnboardingAvailable ? (
              <Link className="button button-primary" to="/onboarding">
                {registrationLabel}
                <ArrowRight aria-hidden="true" />
              </Link>
            ) : (
              <a className="button button-primary" href="mailto:hello@armatureailabs.com">
                Enquire about membership
                <ArrowRight aria-hidden="true" />
              </a>
            )}
            {(publicBookingsAvailable || memberPlatformAvailable) && <Link className="button button-quiet" to="/bookings/">Explore bookings <ArrowRight aria-hidden="true" /></Link>}
            {equipmentPageAvailable && (
              <Link className="button button-quiet" to="/equipment">
                See the space
                <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>
          <aside className="hero-open-source" aria-labelledby="hero-open-source-title">
            <div>
              <h2 id="hero-open-source-title">Open source</h2>
              <p>Robot designs, software and model references from the lab.</p>
            </div>
            <a href="https://github.com/armature-ai-labs" target="_blank" rel="noreferrer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 19c-4.3 1.3-4.3-2.5-6-3m12 6v-3.3a2.9 2.9 0 0 0-.8-2.2c2.7-.3 5.5-1.3 5.5-6A4.7 4.7 0 0 0 18.5 7a4.4 4.4 0 0 0-.1-3.3S17.4 3.4 15 5a12 12 0 0 0-6 0C6.6 3.4 5.6 3.7 5.6 3.7A4.4 4.4 0 0 0 5.5 7a4.7 4.7 0 0 0-1.2 3.5c0 4.7 2.8 5.7 5.5 6a2.9 2.9 0 0 0-.8 2.2V22" />
              </svg>
              Explore on GitHub
              <ArrowUpRight className="hero-open-source-arrow" aria-hidden="true" />
            </a>
          </aside>
          </div><FieldOfTouch scene="scanner" priority look="pixel" /></div>
          <div className="hero-measure">
            <div className="metrics-strip">
              <Metric label="Footprint" value="3,500 sq ft" />
              <Metric label="Floors" value="2" />
              <Metric label="Planned cabins" value="7" />
              <Metric label="Balconies + terrace" value="3" />
            </div>
            <VitruvianSketch />
          </div>
        </div>
      </header>

      <Section
        number="01"
        title="A working floor, not a club lounge"
        lede="The plan is for every room to hold a real project in progress."
      >
        <div className="section-motion"><FieldOfTouch scene="interior" look="pixel" />
          <p className="motion-note">An illustrative laboratory study, not footage of Armature facilities.</p>
        </div>
        <div className="space-plates" aria-label="Photographs of the Armature AI Labs building during fit-out">
          <PixelPhoto
            src="/media/space/event-space-fit-out.jpg"
            width={1600}
            height={728}
            alt="The event space during fit-out: tall wooden-framed windows, track spotlights and linear lights, with protective board over the floor."
            label="Tav. I"
            caption="The event space during fit-out, October 2026."
          />
          <PixelPhoto
            src="/media/space/hall-fit-out.jpg"
            width={1600}
            height={728}
            alt="A long hall with wooden flooring and a staircase at the far end, with tools and materials from the fit-out on the floor."
            label="Tav. II"
            caption="Inside HSR 1490 during fit-out, October 2026."
          />
          <p className="space-plates-note mono">Photographs of the building in progress, shown with a pixel treatment. Fit-out is not complete.</p>
        </div>
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
          <span className="mono">Planned events and build days with</span>
          <div className="tag-row community-tags">
            <span>HSR Founders Club</span>
            <span>Robotics India community</span>
            <span>Partner communities</span>
          </div>
          <p>
            Armature AI Labs is the first planned facility in a larger vision: the
            Institute for Physical AI.
          </p>
        </div>
      </Section>

      <Section
        number="02"
        title="Two floors at a glance"
        lede="The proposed layout uses fifteen measured rooms across the ground and first floors: coworking commons, a presentation hall, seven cabins, a workshop terrace, and three balconies."
        dark
      >
        <LabModelShowcase />
      </Section>

      <Section
        number="03"
        title="Monitored, end to end"
        lede="The planned cameras and access trail are intended to keep a shared floor accountable, not unattended."
      >
        <div className="feature-grid">
          <article>
            <Cctv aria-hidden="true" />
            <h3>Whole-floor coverage</h3>
            <p>The plan connects the commons, presentation hall, cabins, workshop terrace, balconies, kitchen, and entrance to an on-site NVR.</p>
          </article>
          <article>
            <ShieldCheck aria-hidden="true" />
            <h3>Hazard-zone visibility</h3>
            <p>Guarded equipment will require induction, booking, interlocks, and staff operating rules before use.</p>
          </article>
          <article>
            <ScanLine aria-hidden="true" />
            <h3>Tied to attendance</h3>
            <p>The proposed workflow ties each booking to a responsible member and a check-in trail, with access-controlled recordings.</p>
          </article>
        </div>
      </Section>

      <Section
        number="04"
        title="From idea to working machine"
        lede="The intended workflow: work enters as a sketch and leaves as a machine someone has watched run."
      >
        <div className="section-motion motion-pair"><FieldOfTouch scene="gripper" look="pixel" /><FieldOfTouch scene="arm" look="pixel" /></div>
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
        lede="The planned maker desk brings secure storage, build-sized consumables, and complete portable toolkits alongside the equipment."
      >
        <div className="feature-grid">
          <article>
            <LockKeyhole aria-hidden="true" />
            <h3>Lock the project here</h3>
            <p>Planned small, medium, and tall secure lockers, with weekly, monthly, or yearly options to be confirmed.</p>
            <Link to="/maker-desk">Locker options <ArrowRight aria-hidden="true" /></Link>
          </article>
          <article>
            <ShoppingBasket aria-hidden="true" />
            <h3>Buy the handful</h3>
            <p>Planned bench stock includes screws, wire, headers, heat-shrink, solder, and other low-cost supplies in useful quantities.</p>
            <Link to="/maker-desk">Bench stock <ArrowRight aria-hidden="true" /></Link>
          </article>
          <article>
            <PackageOpen aria-hidden="true" />
            <h3>Rent a complete toolbox</h3>
            <p>Planned tagged electronics, mechanical, soldering, precision, and diagnostics kits, with checked returns.</p>
            <Link to="/maker-desk">Toolkit library <ArrowRight aria-hidden="true" /></Link>
          </article>
        </div>
      </Section>

      <Section
        number="06"
        title="Book, build, and leave a clean trail"
        lede={publicBookingsAvailable ? "See current passes, prices and eligibility on the bookings page. Equipment use may require a safety induction." : "Contact the lab about membership, safety inductions and workspace availability."}
      >
        <div className="process-line">
          {(publicBookingsAvailable ? [
            ["Choose access", "Review the current passes and resources to choose the right access."],
            ["Check requirements", "Sign in and follow the eligibility and safety requirements for your selection."],
            ["Confirm", "Pay at checkout for an eligible paid booking, or wait for staff approval of a free Guest Pass."],
            ["Visit", "Follow the arrival instructions for your confirmed visit."]
          ] : [
            ["Apply", "Tell us what you are building."],
            ["Induct", "Complete the lab and equipment safety checks."],
            ["Reserve", "Choose a resource and a live time slot."],
            ["Check in", "Present a one-use QR to the on-site kiosk."],
            ["Build", "Use the floor, log the work, and close the session."]
          ]).map(([title, copy], index) => (
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
            Most builders will never own a robot arm and dedicated GPU compute.
            <strong> We are building a place to share access.</strong>
          </p>
          <Link to="/join">
            {basicOnboardingAvailable ? "Explore membership" : "Membership enquiries"} <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}

const labModelViews = [
  { title: "Ground floor", src: "/building-models/r03/ground-floor.png", width: 1250, height: 1100, copy: "Commons, presentation lounge, reception and shared spaces.", target: "ground-floor-overview", release: "R03 · retained in R06" },
  { title: "First floor", src: "/building-models/r06/first-floor.png", width: 1450, height: 1200, copy: "Cabins, gallery and the proposed glass-enclosed workshop.", target: "first-floor-overview", release: "R06 · current proposal" },
  { title: "Coworking commons", src: "/building-vision/room-views-r01/GF-10.png", width: 1280, height: 1100, copy: "Joined tables and a wraparound window counter. Modelled seating positions are not certified capacity.", target: "gf-10-room", release: "GF-10 · R06 room view" },
  { title: "Glass workshop", src: "/building-models/r06/ff02-enclosure.png", width: 1450, height: 1200, copy: "Aluminium-framed glass workshop and roof proposal beside the retained curved balcony. Solar-control film remains provisional.", target: "ff-02-enclosure", release: "FF-02 · R06" }
];

function LabModelShowcase() {
  return <div className="lab-model-showcase">
    <p className="model-label">Blender design renders—not photographs of completed spaces. Layout and installation details remain subject to verification.</p>
    <div className="lab-model-grid">
      {labModelViews.map(view => <figure key={view.target}>
        <Link to={`/building-vision/#${view.target}`} aria-label={`Explore ${view.title} models`}>
          <img src={view.src} width={view.width} height={view.height} alt={`${view.title} Blender design render`} loading="lazy" decoding="async" />
        </Link>
        <figcaption><span className="mono">{view.release}</span><h3>{view.title}</h3><p>{view.copy}</p>
          <Link to={`/building-vision/#${view.target}`}>Explore the model <ArrowRight aria-hidden="true" /></Link>
        </figcaption>
      </figure>)}
    </div>
  </div>;
}
