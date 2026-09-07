import { useMemo, useState } from "react";
import { PageHeader, Section } from "../components/Primitives";
import {
  buildingVisionItems,
  type BuildingVisionFloor
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
Must preserve: [the exact walls, doors, windows, stairs, floor levels, storage, trees, gate, drainage and circulation shown]
Reference: [attach the matching approved PNG from public/building-vision/rework-v2]
Set rule: Keep the canonical Building Vision set at exactly 21 PNGs unless I explicitly approve adding, removing or replacing a view.

Before doing any work, read AGENTS.md and DESIGN.md.
First describe the proposed change in words. Do not edit files until I approve.
After approval, update only the named approved concept image and its website note. Do not restore the legacy before/after assets or change another view.
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
        meta="1426, 20th Main Road · HSR Layout"
        title="The building, without rebuilding it."
        description="A coordinated 21-view concept for adapting the existing HSR building into Armature AI Labs' coworking, meeting and presentation spaces. The approved sequence shows the frontage, ground floor and first floor with targeted access, glazing, flooring, furniture, lighting and identity upgrades."
      >
        <div className="building-vision-summary" aria-label="Concept summary">
          <div><strong>{buildingVisionItems.length}</strong><span className="mono">Building views</span></div>
          <div><strong>2</strong><span className="mono">Floors + frontage</span></div>
          <div><strong>1</strong><span className="mono">Coordinated concept set</span></div>
        </div>
      </PageHeader>

      <div className="building-vision-guardrail">
        <div className="wrap">
          <span className="mono">Concept boundary</span>
          <p>These images communicate design intent, not measured construction details. Retain the primary shell and stair geometry; survey every glass door, partition, balcony enclosure, egress route, waterproofing and service requirement before procurement.</p>
        </div>
      </div>

      <Section
        number="01"
        title="One building, four coordinated decisions."
        lede="The new sequence keeps every room recognisable while resolving how people arrive, work, meet, present and move through the building."
      >
        <div className="building-vision-principles">
          <article>
            <span className="mono">Existing shell</span>
            <h3>Keep the building legible</h3>
            <p>Respect the true walls, openings, stair turns, floor levels, fixed storage and balcony contours shown in the source photographs.</p>
          </article>
          <article>
            <span className="mono">Access + glazing</span>
            <h3>Separate without closing in</h3>
            <p>Use glass access doors, stair partitions and carefully fitted balcony enclosures while keeping adjacent doors and egress clear.</p>
          </article>
          <article>
            <span className="mono">Work-ready interiors</span>
            <h3>Power, comfort and continuity</h3>
            <p>Continuous workbars, powered round tables, acoustic flooring and compact furniture support daily work without wasting circulation.</p>
          </article>
          <article>
            <span className="mono">Technical verification</span>
            <h3>Measure before building</h3>
            <p>Confirm dimensions, structure, waterproofing, HVAC, electrical capacity, fire safety and accessibility with qualified local professionals.</p>
          </article>
        </div>
      </Section>

      <Section
        number="02"
        title="The complete 21-view Building Vision."
        lede="The numbered sequence below uses only the approved PNG set. Filter by area, then use each concept and note as a first-pass fit-out brief."
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
                <figure>
                  <div className="building-vision-image-frame">
                    <img
                      src={item.image}
                      alt={item.alt}
                      width={item.imageWidth}
                      height={item.imageHeight}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                  <figcaption><span className="mono">View {item.sequence}</span> {item.caption}</figcaption>
                </figure>
              </div>

              <div className="building-vision-spec">
                <div><span className="mono">Design intent</span><p>{item.designIntent}</p></div>
                <div><span className="mono">Key elements</span><p>{item.keyElements}</p></div>
                <div className="building-vision-preserve"><span className="mono">Must remain</span><p>{item.preserve}</p></div>
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section
        number="03"
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
              <li>Name the exact Building Vision card and attach the relevant screenshot or concept image.</li>
              <li>Describe one requested change and list every wall, opening, stair, tree or circulation route that must remain.</li>
            </ol>
          </article>
          <article>
            <span className="mono">02 · Review safely</span>
            <h3>Keep one coordinated image set.</h3>
            <ol>
              <li>Ask for a written proposal before allowing file edits or image generation.</li>
              <li>Revise only the named concept and its note; keep the canonical sequence at exactly 21 PNGs unless a set change is explicitly approved.</li>
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
          <p>Confirm the remaining floor labels and all dimensions against a measured survey; check landlord permissions, waterproofing, electrical capacity, fire egress and accessibility with qualified local professionals. The concepts intentionally do not resolve those technical checks.</p>
        </div>
      </section>
    </div>
  );
}
