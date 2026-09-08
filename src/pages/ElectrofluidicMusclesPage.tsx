import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Database,
  FlaskConical,
  Gauge,
  ShieldAlert
} from "lucide-react";
import { Link } from "react-router-dom";
import { Metric, PageHeader, Section, Status } from "../components/Primitives";

const buildGates = [
  {
    number: "00",
    title: "Reproduce the evidence",
    state: "Current",
    copy: "Run the released analysis, reconcile the paper, preprint, dataset, and media, then freeze a versioned research brief.",
    evidence: "Reproducible notebook, source register, preliminary BOM, hazard review"
  },
  {
    number: "01",
    title: "Build the winding fixture",
    state: "Planned",
    copy: "Create a dry, unenergized winding and inspection workflow before introducing working fluid or electrical power.",
    evidence: "Fixture CAD, measured geometry, microscopy record, repeatable samples"
  },
  {
    number: "02",
    title: "Validate a pneumatic muscle coupon",
    state: "Planned",
    copy: "Characterize the thin McKibben actuator separately with a conventional regulated pressure source.",
    evidence: "Pressure, contraction, force, leakage, and cycle data"
  },
  {
    number: "03",
    title: "Characterize one fiber pump",
    state: "Safety hold",
    copy: "Energize only inside an interlocked, current-limited high-voltage cell and map pressure, flow, current, and temperature.",
    evidence: "Signed SOP, isolation test, pump curve, failure log"
  },
  {
    number: "04",
    title: "Close the antagonistic loop",
    state: "Planned",
    copy: "Join two actuators and the embedded pump, then determine the bias-pressure window that avoids cavitation and instability.",
    evidence: "Sealed loop, bias map, closed-loop force and stroke data"
  },
  {
    number: "05",
    title: "Demonstrate useful work",
    state: "Planned",
    copy: "Move a guarded lever or test mass before considering a bundle, robot joint, woven structure, or wearable form.",
    evidence: "Repeatability, efficiency, thermal behavior, cycle life, teardown report"
  }
] as const;

const sources = [
  {
    label: "Project overview",
    title: "MIT Media Lab: Electrofluidic fiber muscles",
    href: "https://www.media.mit.edu/projects/electrofluidicmuscle/overview/"
  },
  {
    label: "2026 paper",
    title: "Science Robotics: Electrofluidic fiber muscles",
    href: "https://doi.org/10.1126/scirobotics.ady6438"
  },
  {
    label: "Background paper",
    title: "Science 2023: Electrohydrodynamic fiber pumps",
    href: "https://doi.org/10.1126/science.ade8654"
  },
  {
    label: "Open manuscript",
    title: "2023 accepted manuscript and supplement",
    href: "https://www.epfl.ch/labs/lmts/wp-content/uploads/2023/03/20230331-Fiber-manuscript-open-access.pdf"
  },
  {
    label: "Pump data",
    title: "2023 fiber-pump characterization dataset",
    href: "https://zenodo.org/records/7451722"
  },
  {
    label: "Released data",
    title: "Zenodo data record, current version",
    href: "https://zenodo.org/records/18678491"
  },
  {
    label: "Provided record",
    title: "Zenodo data record, earlier version",
    href: "https://zenodo.org/records/17038750"
  },
  {
    label: "Open preprint",
    title: "Zenodo preprint",
    href: "https://zenodo.org/records/17902764"
  }
] as const;

export function ElectrofluidicMusclesPage() {
  return (
    <main className="research-project-page">
      <PageHeader
        meta="Running research · P1 · safety-gated"
        title="Electrofluidic Fiber Muscles"
        description="Armature AI Labs' replication track for millimeter-scale artificial muscles that combine an embedded electrohydrodynamic pump with thin fluidic actuators. The first goal is an instrumented bench coupon, not a wearable demo."
        actions={(
          <>
            <Link className="button button-quiet" to="/projects">
              <ArrowLeft aria-hidden="true" /> Projects
            </Link>
            <Link className="button button-primary" to="/components?project=electrofluidic-fiber-muscles">
              Build components <ArrowRight aria-hidden="true" />
            </Link>
            <a className="button button-quiet" href="https://www.media.mit.edu/projects/electrofluidicmuscle/overview/" target="_blank" rel="noreferrer">
              MIT project <ArrowUpRight aria-hidden="true" />
            </a>
          </>
        )}
      />

      <div className="research-project-media wrap">
        <figure>
          <img
            src="/project-images/electrofluidic-fiber-muscles-principle.png"
            alt="Published electrofluidic fiber muscle principle, configurations, and demonstrations"
          />
          <figcaption className="mono">
            Official project figure · Ozgun Kilic Afsar / MIT Media Lab · CC BY 4.0
          </figcaption>
        </figure>
      </div>

      <section className="research-metrics" aria-label="Published performance highlights">
        <div className="wrap metric-grid four">
          <Metric label="Pump diameter" value="< 2 mm" note="reported project scale" />
          <Metric label="Power density" value="50 W/kg" note="reported configuration" />
          <Metric label="Contraction" value="20%" note="reported configuration" />
          <Metric label="Response" value="< 0.3 s" note="reported lever demo" />
        </div>
      </section>

      <Section
        number="01"
        title="What the research establishes"
        lede="The pump becomes part of the muscle fiber, removing the external hydraulic pump and fluid tubes while retaining an electrical tether."
      >
        <div className="research-principle-grid">
          <div>
            <h3>An antagonistic fluid circuit</h3>
            <p>
              An electric field drives dielectric fluid through a helical electrohydrodynamic pump between two thin McKibben actuators. As one contracts, the opposing actuator receives fluid and stores the return volume. A controlled initial pressure is central to avoiding cavitation and electrical failure.
            </p>
            <div className="research-correction">
              <strong>Source correction</strong>
              <p>
                The supplied Science DOI is the 2023 foundational fiber-pump paper. The electrofluidic muscle itself was published in Science Robotics in 2026 under DOI 10.1126/scirobotics.ady6438. Both remain in the research record because they answer different parts of the build.
              </p>
            </div>
          </div>
          <figure>
            <img src="/project-images/electrofluidic-fiber-pump-official.png" alt="Electrohydrodynamic fiber pump removed from its winding mandrel" />
            <figcaption className="mono">Fiber pump after winding · Ozgun Kilic Afsar / MIT Media Lab · CC BY 4.0</figcaption>
          </figure>
        </div>
      </Section>

      <Section
        number="02"
        title="Armature AI Labs' research objective"
        lede="Reproduce the mechanism in evidence-producing stages, then determine whether it is reliable enough for a robot joint or textile structure."
      >
        <div className="research-objectives">
          <article>
            <Database aria-hidden="true" />
            <h3>Reproduce</h3>
            <p>Re-run released analysis and turn the literature into a versioned, inspectable lab record.</p>
          </article>
          <article>
            <Gauge aria-hidden="true" />
            <h3>Characterize</h3>
            <p>Measure pump, actuator, and closed-loop behavior independently before integrating a demonstration.</p>
          </article>
          <article>
            <FlaskConical aria-hidden="true" />
            <h3>Improve</h3>
            <p>Study winding repeatability, sealing, bias pressure, efficiency, thermal limits, and cycle life.</p>
          </article>
        </div>
        <div className="research-baseline">
          <div>
            <span className="mono">First reproducible coupon</span>
            <h3>Start with the 2023 pump, not a guessed 2026 muscle</h3>
            <p>
              The open precursor manuscript specifies a 200 mm pump coupon built around a 1.2 mm mandrel, six TPU filaments, and two continuous 80 micrometre copper-wire electrodes. That is enough to establish winding, fusion, sealing, and metrology before the lab attempts a closed-loop muscle.
            </p>
            <p className="research-baseline-note">
              This baseline reproduces the fiber pump only. It does not fill in the still-unpublished actuator materials, demonstration lengths, working-fluid volume, bias pressure, sealing procedure, drive limits, or lifetime distribution of the 2026 system.
            </p>
          </div>
          <dl>
            <div><dt>Body</dt><dd>Filaflex 70A TPU, six-filament reference geometry</dd></div>
            <div><dt>Electrodes</dt><dd>Two continuous 80 micrometre copper wires</dd></div>
            <div><dt>Reference coupon</dt><dd>200 mm length, approximately 2.0 mm outer diameter</dd></div>
            <div><dt>Thermal fusion</dt><dd>Published process: 180 C for 18 minutes</dd></div>
            <div><dt>Published fluid</dt><dd>Fresh 3M Novec 7100, subject to current sourcing and safety review</dd></div>
            <div><dt>Replication rule</dt><dd>Three independent pumps with repeatable curves before integration</dd></div>
          </dl>
        </div>
      </Section>

      <Section
        number="03"
        title="Build in gates, not leaps"
        lede="Every stage ends with evidence and a stop/go review. Later stages do not begin because an earlier specimen moved once."
      >
        <div className="research-gates">
          {buildGates.map((gate) => (
            <article className="research-gate" key={gate.number}>
              <span className="mono">{gate.number}</span>
              <div>
                <div className="row-between">
                  <h3>{gate.title}</h3>
                  <Status tone={gate.state === "Current" ? "accent" : gate.state === "Safety hold" ? "bad" : "neutral"}>{gate.state}</Status>
                </div>
                <p>{gate.copy}</p>
                <small><strong>Exit evidence:</strong> {gate.evidence}</small>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        number="04"
        title="The experimental loop"
        lede="Keep electrical input, fluid transport, mechanical output, and measurement visible as separate subsystems."
      >
        <div className="research-flow" aria-label="Electrofluidic muscle experimental flow">
          {[
            ["01", "Current-limited HV", "Controlled electrical input"],
            ["02", "Helical EHD pump", "Electric field moves fluid"],
            ["03", "Dielectric circuit", "Sealed flow and bias pressure"],
            ["04", "Antagonistic pair", "One contracts as one receives fluid"],
            ["05", "Instrumented load", "Force, stroke, current, heat"]
          ].map(([number, title, copy]) => (
            <div key={number}>
              <span className="mono">{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        number="05"
        title="Safety boundaries"
        lede="This project combines kilovolt-class electrical work, pressurized fluid, custom materials, and stored mechanical energy. It belongs in a controlled research cell."
        dark
      >
        <div className="research-safety-grid">
          {[
            "Energize only inside an interlocked, guarded, current-limited high-voltage enclosure with a verified discharge state.",
            "Approve the dielectric fluid from its current SDS, compatibility data, spill plan, storage requirements, and disposal route.",
            "Use pressure-rated fittings, shielding, leak inspection, remote instrumentation, and defined pressure limits.",
            "Do not substitute the working fluid without dielectric, vapor-pressure, EHD, and material-compatibility validation.",
            "Do not scale to a parallel bundle until three independent pump coupons reproduce reliably.",
            "No human-contact, wearable, overhead-lifting, or autonomous energization work in the initial replication stages."
          ].map((item) => (
            <div key={item}>
              <ShieldAlert aria-hidden="true" />
              <p>{item}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        number="06"
        title="Open research record"
        lede="The project is published with strong scientific evidence and released data, but not as a turnkey fabrication kit. Armature AI Labs' contribution is a traceable path from source to repeatable bench result."
      >
        <div className="source-grid">
          {sources.map((source) => (
            <a href={source.href} key={source.href} target="_blank" rel="noreferrer">
              <span className="mono">{source.label}</span>
              <strong>{source.title}</strong>
              <ArrowUpRight aria-hidden="true" />
            </a>
          ))}
        </div>
        <div className="research-output-list">
          <span className="mono">Armature AI Labs outputs</span>
          <p>SOP · versioned BOM · fixture CAD · analysis notebooks · test data · failure register · build logs</p>
        </div>
      </Section>
    </main>
  );
}
