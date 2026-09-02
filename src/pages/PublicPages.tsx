import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  BatteryCharging,
  Box,
  Cable,
  Camera,
  Cpu,
  ExternalLink,
  Gauge,
  Radio,
  ShieldCheck,
  Sparkles,
  Users,
  Wrench
} from "lucide-react";
import { Link } from "react-router-dom";
import { Field, PageHeader, Section, Status } from "../components/Primitives";
import { memberPlatformAvailable } from "../config/release";
import { useApp } from "../context/AppContext";

const equipmentRows = [
  ["Robot arm cell", "6-axis industrial arm, controller, safety PLC, light curtains", "3-phase 415V · dedicated · interlocked", "DB-A"],
  ["Machine shop", "CNC router, grinder, drill press, metrology, extraction", "3-phase 415V + extraction", "DB-A"],
  ["Rapid prototyping", "FDM and resin printers, laser cutter, hand finishing", "1-phase 230V · four 16A circuits", "DB-B"],
  ["Flexible test bay", "Reconfigurable test fixtures and portable safety barriers", "1-phase 230V · general circuits", "DB-B"],
  ["Storage + batteries", "Fire-rated LiPo charging cabinet, shelving, safe bags", "1-phase 230V · dedicated charging", "DB-B"],
  ["Electronics + assembly", "ESD benches, scopes, supplies, soldering", "1-phase 230V · clean isolated ground", "DB-C"],
  ["Compute + control", "GPU nodes, DGX Spark, Jetsons, NAS, NVR, networking", "1-phase 230V · UPS-backed", "DB-C"],
  ["Builder pods", "Sixteen desks, lockers, monitors, clean power", "1-phase 230V · general circuits", "DB-D"],
  ["Demo floor", "Floor boxes, AV, reconfigurable rigs", "1-phase 230V · floor outlets", "DB-D"],
  ["Entry, HVAC, lighting", "HVAC, lighting, access control", "Mixed · main feed", "Main"]
];

const distributionBoards = [
  [ShieldCheck, "Main", "Incomer + master", "Utility incomer, metering, main breaker, and the master E-stop for hazard zones."],
  [Wrench, "DB-A", "Heavy / 3-phase", "Robot arm cell and machine shop, interlocked with the safety perimeter."],
  [BatteryCharging, "DB-B", "Prototyping + batteries", "Printing, drone charging, and the battery cabinet on separated circuits."],
  [Cpu, "DB-C", "Clean / UPS", "Isolated grounded power for electronics, compute, networking, and NVR."],
  [Users, "DB-D", "General / demo / pods", "Demo-floor outlets, builder pods, general sockets, lighting, and HVAC."]
] as const;

export function EquipmentPage() {
  const { state } = useApp();
  return (
    <>
      <PageHeader
        meta="Equipment · power · safety"
        title="Every zone, mapped."
        description="Each zone is mapped to its equipment, power requirement, booking rule, and safety boundary. Heavy loads stay isolated from the clean circuits that electronics and compute depend on."
        actions={<div className="button-row">
          {memberPlatformAvailable && (
            <Link className="button button-primary" to="/book">
              Book live resources <ArrowRight aria-hidden="true" />
            </Link>
          )}
          <Link className="button button-quiet" to="/maker-desk">
            Open the maker desk
          </Link>
        </div>}
      />
      <Section number="01" title="Live resource board" lede="Availability shown here follows the same resource records used by booking.">
        <div className="resource-grid">
          {state.resources.map((resource) => (
            <article className="resource-card" key={resource.id}>
              {resource.image ? (
                <img src={resource.image} alt="" loading="lazy" />
              ) : (
                <div className="resource-placeholder"><Wrench aria-hidden="true" /></div>
              )}
              <div className="resource-card-body">
                <div className="row-between">
                  <span className="mono">{resource.zone}</span>
                  <Status tone={resource.available ? "good" : "bad"}>
                    {resource.available ? "Available" : "Blocked"}
                  </Status>
                </div>
                <h3>{resource.name}</h3>
                <p>{resource.description}</p>
                <div className="resource-meta mono">
                  <span>{resource.durationMinutes} min default</span>
                  <span>{resource.capacity} people</span>
                  <span>{resource.hazardous ? "certified use" : "standard access"}</span>
                </div>
                {memberPlatformAvailable ? (
                  <Link to={`/book/${resource.slug}`}>View slots <ArrowRight aria-hidden="true" /></Link>
                ) : (
                  <span className="mono">Bookings opening soon</span>
                )}
              </div>
            </article>
          ))}
        </div>
      </Section>
      <Section number="02" title="Zone by zone" dark>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Zone</th><th>Key equipment</th><th>Power</th><th>Board</th></tr></thead>
            <tbody>
              {equipmentRows.map((row) => (
                <tr key={row[0]}>
                  <th>{row[0]}</th>
                  <td>{row[1]}</td>
                  <td>{row[2]}</td>
                  <td><span className="mono">{row[3]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section number="03" title="Distribution boards" lede="Five boards separate hazardous loads, batteries, clean electronics, compute, pods, and general floor power.">
        <div className="service-grid">
          {distributionBoards.map(([Icon, board, title, copy]) => (
            <article className="service-card" key={board}>
              <Icon aria-hidden="true" />
              <span className="mono">{board}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section number="04" title="One-line power topology" dark>
        <div className="power-topology" aria-label="Power distribution from the utility incomer through Main to four separated distribution boards">
          <div className="power-main">
            <span className="mono">BESCOM incomer</span>
            <ArrowRight aria-hidden="true" />
            <div>
              <strong>Main</strong>
              <span>Metering · master E-stop</span>
            </div>
          </div>
          <div className="power-branch-grid">
            {distributionBoards.slice(1).map(([, board, title, copy]) => (
              <article key={board}>
                <span className="mono">{board}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </div>
        <p className="lede">Heavy machinery, battery charging, clean UPS loads, and general floor power remain electrically separated.</p>
      </Section>
    </>
  );
}

export function ServicesPage() {
  const talentServices = [
    [Users, "Hackathon-based hiring", "Run an invention challenge on the lab floor with a real problem statement, arms, sensors, Jetsons, and GPUs; assess candidates through working prototypes.", "Planning estimate · Rs 2-5 L per edition + per-hire fee"],
    [Gauge, "Employee training", "Private invention-lab cohorts covering edge AI, embedded systems, Jetson vision, local LLMs, and robotics fundamentals, ending in a demonstration.", "Planning estimate · Rs 1.5-4 L per cohort"],
    [Sparkles, "Student research programs", "Semester-long, industry-linked edge AI and physical AI projects supervised in the lab with colleges and companies.", "Per student · per batch"],
    [ShieldCheck, "Edge AI invention sprints", "Four-week evening programs using Jetsons, cameras, sensors, and DGX Spark, ending in a certified capstone build.", "Rs [rate] per seat"],
    [Camera, "Public workshops", "One-day hands-on formats for small batches. Member booking options remain visible on the Membership page.", "Planning estimate · Rs 5,000-10,000 per seat"],
    [Radio, "Demo days and meetups", "Use the demo floor, AV, and working equipment as the setting for launches, meetups, and live demonstrations.", "Planning estimate · Rs 25,000-75,000 per evening"]
  ] as const;

  const buildServices = [
    [Box, "Prototyping as a service", "Brief in, working prototype out: engineering, printers, CNC, electronics, and test equipment.", "Planning estimate · Rs 2-15 L per project"],
    [Camera, "Commissioned datasets", "Manipulation, vision, and site-specific datasets collected on lab rigs and annotated to a defined specification.", "Per project"],
    [Sparkles, "Research residencies", "Bench, equipment, and collaboration for research professionals and corporate R&D teams.", "Monthly residency"],
    [Wrench, "Equipment with operator", "The arm or camera rigs with a lab engineer operating the test and safety process.", "Day rate"],
    [Cable, "Member maker desk", "Secure project lockers, build-sized consumables, and complete portable toolkits for everyday fabrication work.", "Member pickup + rental"],
    [Gauge, "Hardware sourcing and BOM", "Component specification, vendor comparison, imports, compliance checks, and assembly planning so teams can start building.", "Fee + approved procurement margin"],
    [Radio, "Zone sponsorships", "Hardware brands can support a bench, a demonstration station, or a workshop series used by the builder community.", "Annual plan"]
  ] as const;

  return (
    <>
      <PageHeader
        meta="Services · deployments · research"
        title="Build here, or bring the lab to the site."
        description="Armature combines a bookable robotics floor with engineering services for organizations that need working hardware, private AI infrastructure, or credible physical datasets."
        actions={(
          <>
            <Link className="button button-primary" to="/join">Become a member <ArrowRight aria-hidden="true" /></Link>
            <a className="button button-quiet" href="mailto:hello@armaturelab.org">Discuss a project</a>
          </>
        )}
      />
      <Section number="01" title="Talent and training" lede="The fastest way to find, grow, and test hardware talent is to watch it build. Armature runs that room.">
        <div className="service-grid">
          {talentServices.map(([Icon, title, copy, rate]) => (
            <article className="service-card" key={title}>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
              <span className="mono">{rate}</span>
            </article>
          ))}
        </div>
        <p className="lede">All figures are INR-first planning estimates, not quotes. Final scope, cohort size, hardware, and staffing determine each proposal.</p>
      </Section>
      <Section number="02" title="Build and research services" lede="Hand over a brief or bring researchers to the benches; the same floor that trains builders also does commissioned work." dark>
        <div className="service-grid">
          {buildServices.map(([Icon, title, copy, rate]) => (
            <article className="service-card" key={title}>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
              <span className="mono">{rate}</span>
            </article>
          ))}
        </div>
        <div className="section-actions">
          <Link className="button button-quiet" to="/maker-desk">Open the maker desk <ArrowRight aria-hidden="true" /></Link>
          <Link className="button button-quiet" to="/join">See membership and booking <ArrowRight aria-hidden="true" /></Link>
        </div>
      </Section>
      <Section number="03" title="Design, build, and run a local AI data centre" lede="For organizations that want GPUs on their own premises, Armature can take a deployment from workload sizing and bill of materials through burn-in and ongoing operation.">
        <div className="service-grid">
          {([
            [Gauge, "Design", "Size the GPU, storage, networking, power, and cooling for the workload and budget, from a two-GPU workstation to a larger rack."],
            [Wrench, "Build", "Assemble and burn-test the system in the lab; validate PCIe topology, firmware, drivers, thermals, and sustained training or inference."],
            [Cpu, "Run", "Install on the customer network with monitoring, recovery procedures, updates, and optional managed capacity planning."]
          ] as const).map(([Icon, title, copy]) => (
            <article className="service-card" key={title}>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <div className="section-actions">
          <a className="button button-quiet" href="https://github.com/autonomous-ai/autonomous-computer" target="_blank" rel="noreferrer">
            Open build reference <ExternalLink aria-hidden="true" />
          </a>
        </div>
        <p className="lede">Hardware, engineering, and managed-operation costs are scoped separately in INR after a current bill of materials and site-power review.</p>
      </Section>
      <Section number="04" title="Why on-prem physical AI" lede="Continuous camera and sensor workloads need predictable latency, a controlled data boundary, and infrastructure that can serve more than one local use case." dark>
        <div className="process-list">
          {[
            ["01", "Continuous video stays local", "An on-site GPU processes camera streams in real time without round-the-clock cloud transfer."],
            ["02", "Footage remains inside", "Sensitive video, documents, and model queries stay within the organization's premises and access policies."],
            ["03", "One stack serves many jobs", "The same local compute can support safety analytics, dashboards, document search, assistants, and site-specific models."],
            ["04", "The lab remains behind it", "Armature specifies, deploys, tests, and maintains the system as workloads and operational needs change."]
          ].map(([number, title, copy]) => (
            <div className="process-row" key={number}><span className="mono">{number}</span><h3>{title}</h3><p>{copy}</p></div>
          ))}
        </div>
        <div className="service-grid">
          {([
            [Camera, "Existing cameras + sensors", "CCTV and site sensors remain the operational inputs."],
            [Radio, "Jetson-class edge boxes", "Local ingest, filtering, and bounded low-latency inference near the source."],
            [Cpu, "On-prem GPU server", "Private model serving, video analytics, storage, and local LLM workloads."],
            [Sparkles, "Alerts + local applications", "Dashboards, safety events, search, and assistants stay available on the customer network."]
          ] as const).map(([Icon, title, copy]) => (
            <article className="service-card" key={title}>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <p className="lede">Architecture: cameras and sensors to edge boxes to the on-prem GPU server to local alerts, dashboards, and LLM applications. Operational data does not need to leave the site.</p>
      </Section>
      <Section number="05" title="Who it is for">
        <div className="service-grid">
          {([
            [ShieldCheck, "Hospitals", "Patient-area monitoring, fall or restricted-zone alerts, and hygiene workflows under hospital-controlled data policies."],
            [Users, "Malls + hotels", "Footfall, crowd flow, queue analytics, incident detection, and guest-safety operations across public spaces."],
            [Wrench, "Factories", "PPE and safety signals, intrusion alerts, line monitoring, and visual inspection around existing equipment."],
            [Camera, "Schools + institutes", "Entry, perimeter, attendance signals, and after-hours anomaly review under campus control."],
            [Cpu, "Private knowledge teams", "Local assistants, document search, and reporting on the same on-prem GPU infrastructure."],
            [Sparkles, "Teams learning physical AI", "Hands-on workshops using Jetsons, DGX Spark, sensors, cameras, and robotics equipment in the lab."]
          ] as const).map(([Icon, title, copy]) => (
            <article className="service-card" key={title}>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </Section>
      <Section number="06" title="How an engagement runs" dark>
        <div className="process-list">
          {[
            ["01", "Assess", "Review cameras, workloads, footfall, privacy constraints, network, power, and intended operating outcomes."],
            ["02", "Pilot", "Prove one bounded use case in one zone, with measurable acceptance criteria agreed before deployment."],
            ["03", "Deploy", "Install edge boxes, GPU, storage, networking, models, monitoring, and recovery procedures on site."],
            ["04", "Operate", "Monitor the system, review incidents, update models, and plan capacity through a managed-service period."],
            ["05", "Expand", "Add zones, cameras, models, and local LLM workloads on the same controlled architecture."]
          ].map(([number, title, copy]) => (
            <div className="process-row" key={number}><span className="mono">{number}</span><h3>{title}</h3><p>{copy}</p></div>
          ))}
        </div>
        <p className="lede">Commercial planning separates the one-time assessment and pilot, deployment hardware, and any monthly managed service. Final INR pricing follows a site assessment and current vendor quotes.</p>
      </Section>
    </>
  );
}

export function JoinPage() {
  const { currentMember, state, submitApplication } = useApp();
  const pendingApplication = state.applications.find(
    (application) => application.memberId === currentMember?.id && application.state === "pending"
  );
  const membershipActive = currentMember?.membershipState === "active";

  const actions = !memberPlatformAvailable ? (
    <a className="button button-primary" href="mailto:hello@armaturelab.org">Email the lab</a>
  ) : membershipActive ? (
    <Link className="button button-primary" to="/book">Book a resource <ArrowRight aria-hidden="true" /></Link>
  ) : pendingApplication ? (
    <Link className="button button-primary" to="/dashboard">Open member workspace <ArrowRight aria-hidden="true" /></Link>
  ) : currentMember ? (
    <a className="button button-primary" href="#membership-application">Complete your application <ArrowRight aria-hidden="true" /></a>
  ) : (
    <Link className="button button-primary" to="/auth" state={{ from: "/join" }}>Create member account <ArrowRight aria-hidden="true" /></Link>
  );

  return (
    <>
      <PageHeader
        meta="Membership · booking · HSR Layout"
        title="Join the lab. Book what you need."
        description="Create one member account, tell us what you are building, and complete staff approval. Approved members can reserve builder pods, equipment, compute, and the Demo floor from one workspace."
        actions={actions}
      />
      <Section number="01" title="One membership journey">
        <div className="process-list">
          {[
            ["01", "Create an account", "Use a secure email link, add your public name and handle, and tell us what you plan to build."],
            ["02", "Complete approval", "Staff review the application and issue any safety inductions required by the resources you intend to use."],
            ["03", "Book and build", "Choose an available resource, reserve the time, and manage the booking from your member workspace."]
          ].map(([number, title, copy]) => (
            <div className="process-row" key={number}><span className="mono">{number}</span><h3>{title}</h3><p>{copy}</p></div>
          ))}
        </div>
      </Section>
      <Section number="02" title="What members can reserve" lede="The booking screen follows the live resource board, so members see the capacity, duration, availability, and safety requirements before choosing a time." dark>
        <div className="service-grid">
          <article className="service-card">
            <Users aria-hidden="true" />
            <h3>A builder pod</h3>
            <p>Reserve one of sixteen two-person builder pods with a desk, power, monitor, locker, and access to the shared floor.</p>
          </article>
          <article className="service-card">
            <Cpu aria-hidden="true" />
            <h3>Equipment and compute</h3>
            <p>Book electronics benches, fabrication equipment, robot cells, GPUs, or edge AI kits when the required induction is current.</p>
          </article>
          <article className="service-card">
            <Sparkles aria-hidden="true" />
            <h3>The Demo floor</h3>
            <p>Reserve the 50-person demonstration and event area for a member event, working session, or live prototype demonstration.</p>
          </article>
        </div>
        <p className="lede">Meeting-room reservations will appear in the same booking screen after a room is commissioned and its capacity and operating hours are approved.</p>
      </Section>
      <Section number="03" title="Start your membership">
        {!memberPlatformAvailable ? (
          <>
            <Status tone="warn">Online signup is not live yet</Status>
            <p className="lede">
              Applications and bookings will open here after secure member sign-in and the end-to-end member journey pass the production launch check. For membership questions or a visit, email <a className="text-link" href="mailto:hello@armaturelab.org">hello@armaturelab.org</a>.
            </p>
          </>
        ) : membershipActive ? (
          <>
            <Status tone="good">Membership active</Status>
            <p className="lede">Your member workspace is ready. Choose a live resource and reserve the time you need.</p>
            <div className="section-actions"><Link className="button button-primary" to="/book">Book a resource <ArrowRight aria-hidden="true" /></Link></div>
          </>
        ) : pendingApplication ? (
          <>
            <Status tone="warn">Application under review</Status>
            <p className="lede">Your application has been submitted. Booking opens after staff approval and any required induction.</p>
            <div className="section-actions"><Link className="button button-quiet" to="/dashboard">Open member workspace <ArrowRight aria-hidden="true" /></Link></div>
          </>
        ) : currentMember ? (
          <ApplicationForm member={currentMember} onSubmit={submitApplication} />
        ) : (
          <>
            <p className="lede">Create an account or sign in with a secure email link. You will return here to complete the short membership application.</p>
            <div className="section-actions"><Link className="button button-primary" to="/auth" state={{ from: "/join" }}>Create account or sign in <ArrowRight aria-hidden="true" /></Link></div>
          </>
        )}
      </Section>
    </>
  );
}

function ApplicationForm({
  member,
  onSubmit
}: {
  member: { name: string; handle: string };
  onSubmit: (input: { name: string; handle: string; summary: string }) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await onSubmit({
        name: String(data.get("name")),
        handle: String(data.get("handle")),
        summary: String(data.get("summary"))
      });
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Application failed."
      );
    } finally {
      setWorking(false);
    }
  }

  return (
    <form
      id="membership-application"
      className="inline-form"
      onSubmit={submit}
    >
      <div className="form-grid">
        <Field label="Your name">
          <input name="name" required maxLength={120} autoComplete="name" defaultValue={member.name} />
        </Field>
        <Field label="Public profile handle" hint="3–30 lowercase letters, numbers, underscores, or hyphens.">
          <input
            name="handle"
            required
            minLength={3}
            maxLength={30}
            pattern="[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]"
            autoCapitalize="none"
            autoComplete="username"
            spellCheck={false}
            defaultValue={member.handle}
            placeholder="your-name"
          />
        </Field>
      </div>
      <Field label="What are you building?">
        <textarea name="summary" required rows={4} placeholder="The prototype, its current state, and the equipment you expect to use." />
      </Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-primary" type="submit" disabled={working}>{working ? "Submitting…" : "Submit membership application"}</button>
    </form>
  );
}

export function NotFoundPage() {
  return (
    <PageHeader
      meta="404 · route not found"
      title="That bench is not on the floor plan."
      description="The route may have moved. Return to the lab or open the member workspace."
      actions={
        <>
          <Link className="button button-primary" to="/">The lab</Link>
          {memberPlatformAvailable && (
            <Link className="button button-quiet" to="/dashboard">Dashboard</Link>
          )}
        </>
      }
    />
  );
}
