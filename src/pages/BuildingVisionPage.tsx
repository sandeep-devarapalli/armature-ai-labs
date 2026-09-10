import { useMemo, useState } from "react";
import { PageHeader, Section } from "../components/Primitives";
import { BuildingPlanning } from "../components/BuildingPlanning";
import {
  buildingVisionItems,
  type BuildingVisionFloor,
  type BuildingVisionItem
} from "../data/buildingVision";
import "./BuildingVisionPage.css";

const filters: Array<"All" | BuildingVisionFloor> = [
  "All",
  "Frontage",
  "Ground floor",
  "First floor"
];

const buildingVisionAgentPrompt = `Please propose a revision to the Building Vision page.

View: [00–20 · exact card title]
Requested change: [one clear change]
Reason: [what this improves]
Must preserve: [the approved model geometry, furniture, doors, stairs, floor levels, retained storage and access constraints]
Design authority: Latest approved Blender first, coordinated CAD second; align concept photos to them, never the reverse.
Reference: [identify the approved Blender release and matching CAD; attach the relevant earlier PNG from public/building-vision/rework-v2]
Set rule: Keep the canonical Building Vision set at exactly 21 PNGs unless I explicitly approve adding, removing or replacing a view.

Before doing any work, read AGENTS.md and DESIGN.md.
First describe the proposed change in words. Do not edit files until I approve.
After approval, align only the named concept image and its website note to the approved model. Keep unresolved proposals labelled; do not restore the legacy before/after assets or change another view.
Show me the revised local /building-vision page before committing or publishing.
Run npm test, npm run build and the building-vision browser test.`;

const buildingVisionResources = [
  {
    label: "GitHub repository",
    detail: "Browse or clone the public Armature AI Labs project.",
    href: "https://github.com/sandeep-devarapalli/armature-ai-labs"
  },
  {
    label: "Agent instructions",
    detail: "Read the project scope, constraints and validation rules.",
    href: "https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/AGENTS.md"
  },
  {
    label: "Design system",
    detail: "Check the palette, typography and layout rules before editing.",
    href: "https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/DESIGN.md"
  }
] as const;

export function BuildingVisionPage() {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]>("All");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const visibleItems = useMemo(
    () => activeFilter === "All"
      ? buildingVisionItems
      : buildingVisionItems.filter((item) => item.floor === activeFilter),
    [activeFilter]
  );

  async function copyAgentPrompt() {
    try {
      await navigator.clipboard.writeText(buildingVisionAgentPrompt);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div className="building-vision-page">
      <PageHeader
        meta="Armature AI Labs · HSR 1490 · HSR Layout, Bengaluru"
        title="The building, without rebuilding it."
        description="Explore the selected ground- and first-floor layouts for Armature AI Labs. The latest approved Blender model governs the design, coordinated CAD follows it, and current model renders are distinguished from the 21 earlier appearance references."
      >
        <p className="building-vision-quick-links"><a href="#planning-model">Explore 3D + room CAD</a> · <a href="#comparisons">Browse concept photos</a></p>
        <div className="building-vision-summary" aria-label="Concept summary">
          <div><strong>{buildingVisionItems.length}</strong><span className="mono">Building views</span></div>
          <div><strong>2</strong><span className="mono">Floors + frontage</span></div>
          <div><strong>1</strong><span className="mono">Model-led design hierarchy</span></div>
        </div>
      </PageHeader>

      <div className="building-vision-guardrail">
        <div className="wrap">
          <span className="mono">Design authority</span>
          <p>Latest approved Blender → coordinated CAD → aligned concept photos. Current model images below are direct R01 Blender renders; earlier photo concepts are labelled separately. Neither selection nor a successful export establishes construction readiness, safe occupancy or measured service capacity. AC and installation details remain proposals requiring site and professional checks.</p>
        </div>
      </div>

      <Section
        number="01"
        title="One building, four coordinated decisions."
        lede="Use the approved models for the selected layout, and the room-status notes for decisions that remain open. Appearance references must follow that distinction."
      >
        <div className="building-vision-principles">
          <article>
            <span className="mono">Existing shell</span>
            <h3>Keep the building legible</h3>
            <p>Preserve the existing shell, openings, stair turns, floor levels and retained storage in the approved Blender model. Coordinate CAD to it; use site evidence to resolve discrepancies rather than inferring geometry from a styled image.</p>
          </article>
          <article>
            <span className="mono">Access + glazing</span>
            <h3>Separate without closing in</h3>
            <p>The selected curved stair partitions use a left flat door at GF09 A01 and a central flat door at FF04 P01. Retain their distinct floor layouts and recorded door-approach restrictions; verify operation and egress on site.</p>
          </article>
          <article>
            <span className="mono">Work-ready interiors</span>
            <h3>Power, comfort and continuity</h3>
            <p>GF10 uses nine 2 ft 6 in square table modules, 17 counter chairs and 21 table chairs. Its counter is 17 in deep. These are selected positions, not a certified comfortable capacity; occupied-chair and movement checks remain visible in the planning review.</p>
          </article>
          <article>
            <span className="mono">Technical verification</span>
            <h3>Measure before building</h3>
            <p>Confirm dimensions, structure, waterproofing, HVAC, electrical capacity, fire safety and accessibility with qualified local professionals.</p>
          </article>
        </div>
      </Section>

      <BuildingPlanning />

      <Section
        number="03"
        title="The complete 21-view Building Vision."
        lede="Six current-layout views now use direct R01 Blender renders. Expand the earlier concepts to compare; conflicting or unfinished concepts stay folded away. All 21 original references are preserved. Use Blender first, CAD second."
        id="comparisons"
      >
        <div className="building-vision-filters" role="toolbar" aria-label="Filter building views">
          {filters.map((filter) => (
            <button
              className={filter === activeFilter ? "is-active" : undefined}
              type="button"
              aria-pressed={filter === activeFilter}
              onClick={() => setActiveFilter(filter)}
              key={filter}
            >
              {filter}
            </button>
          ))}
        </div>
        <p className="building-vision-count mono" aria-live="polite">
          Showing {visibleItems.length} of {buildingVisionItems.length} views
        </p>

        <div className="building-vision-list">
          {visibleItems.map((item) => (
            <article className="building-vision-room" id={item.id} key={item.id}>
              <header>
                <div>
                  <span className="mono">{item.floor}</span>
                  <h3>{item.title}</h3>
                </div>
                <p>{item.proposedUse}</p>
              </header>

              <div className="building-vision-concept">
                {item.modelImage ? (
                  <>
                    <figure className="building-vision-model-image">
                      <div className="building-vision-image-frame">
                        <img src={item.modelImage.src} alt={item.modelImage.alt} width={item.modelImage.width} height={item.modelImage.height} loading="lazy" decoding="async" />
                      </div>
                      <figcaption><span className="mono">View {item.sequence} · R01 Blender render</span> {item.modelImage.caption}</figcaption>
                    </figure>
                    <details className="building-vision-reference">
                      <summary>Earlier concept image — not the current layout</summary>
                      <EarlierConceptImage item={item} />
                    </details>
                  </>
                ) : item.modelNote ? (
                  <details className="building-vision-reference">
                    <summary>Earlier concept image — not the current layout</summary>
                    <EarlierConceptImage item={item} />
                  </details>
                ) : <EarlierConceptImage item={item} />}
              </div>

              <div className="building-vision-spec">
                <div className="building-vision-preserve"><span className="mono">Current design / reference status</span><p>{item.modelNote ?? "Earlier appearance reference, not a verified R01 render. Align any revision to the latest approved Blender model and coordinated CAD; finishes and service details shown are not installation approvals."}</p></div>
                <div><span className="mono">Design intent</span><p>{item.designIntent}</p></div>
                <div><span className="mono">Key elements</span><p>{item.keyElements}</p></div>
                <div className="building-vision-preserve"><span className="mono">Must remain</span><p>{item.preserve}</p></div>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        number="04"
        title="Use Codex or Claude to propose a revision."
        lede="A useful request names one view, one change and the parts of the building that must remain. The agent should propose first and edit only after approval."
        id="suggest-a-change"
      >
        <div className="building-vision-agent-resources">
          <header>
            <div>
              <span className="mono">Project access</span>
              <h3>Repository and working references.</h3>
            </div>
            <p>The repository is public. Open it in Codex or Claude, then use the two project guides before proposing changes.</p>
          </header>
          <div className="building-vision-agent-links">
            {buildingVisionResources.map((resource) => (
              <a href={resource.href} target="_blank" rel="noreferrer" key={resource.label}>
                <span className="mono">{resource.label}</span>
                <p>{resource.detail}</p>
                <strong aria-hidden="true">Open ↗</strong>
              </a>
            ))}
          </div>
          <p className="building-vision-agent-paths">
            <span className="mono">Building Vision files</span>
            <code>/Users/dev/Downloads/Armature Lab Building rework project/Armature Lab Building rework v2/</code>
            <code>src/pages/BuildingVisionPage.tsx</code>
            <code>src/data/buildingVision.ts</code>
            <code>public/building-vision/rework-v2/</code>
          </p>
        </div>

        <div className="building-vision-agent-grid">
          <article>
            <span className="mono">01 · Give context</span>
            <h3>Start the agent in this project.</h3>
            <ol>
              <li>Open the Armature AI Labs project in Codex or Claude and ask it to read <code>AGENTS.md</code> and <code>DESIGN.md</code>.</li>
              <li>Name the exact Building Vision card, identify the latest approved Blender release and coordinated CAD, then attach the relevant concept image.</li>
              <li>Describe one requested change and list every wall, opening, stair, tree or circulation route that must remain.</li>
            </ol>
          </article>
          <article>
            <span className="mono">02 · Review safely</span>
            <h3>Keep one coordinated image set.</h3>
            <ol>
              <li>Ask for a written proposal before allowing file edits or image generation.</li>
              <li>Align the named concept and its note to Blender first and CAD second; keep the canonical sequence at exactly 21 PNGs unless a set change is explicitly approved.</li>
              <li>Review the local page on desktop and mobile, then approve any commit or publication separately.</li>
            </ol>
          </article>
        </div>

        <div className="building-vision-agent-prompt" aria-label="Prompt template for Codex or Claude">
          <header>
            <div>
              <span className="mono">Ready-to-paste prompt</span>
              <p>Replace the bracketed fields, then paste this into Codex or Claude.</p>
            </div>
            <button
              className="building-vision-copy-button"
              type="button"
              aria-live="polite"
              onClick={() => void copyAgentPrompt()}
            >
              {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy prompt"}
            </button>
          </header>
          <pre><code>{buildingVisionAgentPrompt}</code></pre>
        </div>
      </Section>

      <section className="building-vision-note">
        <div className="wrap">
          <span className="mono">Before procurement</span>
          <p>Confirm dimensions and unresolved door, storage and service constraints on site; check landlord permissions, waterproofing, electrical capacity, HVAC, fire egress and accessibility with qualified local professionals. Ground and first floor are the verified scope. Layout approval does not settle these technical checks.</p>
        </div>
      </section>
    </div>
  );
}

function EarlierConceptImage({ item }: { item: BuildingVisionItem }) {
  return (
    <figure className="building-vision-reference-image">
      <div className="building-vision-image-frame">
        <img src={item.image} alt={item.alt} width={item.imageWidth} height={item.imageHeight} loading="lazy" decoding="async" />
      </div>
      <figcaption><span className="mono">View {item.sequence} · Earlier appearance reference</span> {item.caption}</figcaption>
    </figure>
  );
}
