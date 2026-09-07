import {
  ArrowUpRight,
  Building2,
  List,
  Map as MapIcon,
  MapPin,
  Pause,
  Play,
  Search,
  X
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useSearchParams } from "react-router-dom";
import { EcosystemMap } from "../components/EcosystemMap";
import { PageHeader } from "../components/Primitives";
import {
  bengaluruEcosystem,
  ecosystemSectors,
  filterEcosystemEntities,
  type EcosystemEntity,
  type EcosystemSector
} from "../data/bengaluruEcosystem";

const allSectors = ["All", ...ecosystemSectors] as const;
type SectorFilter = (typeof allSectors)[number];

const ecosystemContributionUrl =
  "https://github.com/sandeep-devarapalli/armature-ai-labs";

function publicLocality(entity: EcosystemEntity) {
  if (
    entity.locality.includes("exact site not publicly verified")
    || entity.locality.includes("current operating site needs verification")
    || entity.locality.includes("operating status and exact site need verification")
    || entity.locality === "Bengaluru · IISc and ARTPARK ecosystem"
  ) {
    return "Bengaluru";
  }
  if (entity.locality.startsWith("HSR Layout signal")) {
    return "Near HSR Layout, Bengaluru";
  }
  if (entity.locality === "Bengaluru operating address · Tumakuru registered address") {
    return "Bengaluru and Tumakuru";
  }
  return entity.locality;
}

function ContributionPrompt({ selected = false }: { selected?: boolean }) {
  return (
    <div className="ecosystem-contribution">
      <strong>{selected ? "Know this organization?" : "Help improve the map."}</strong>
      <p>
        Signed-in suggestions with admin review are planned. You can add a company
        or update its details today through GitHub.
      </p>
      <a href={ecosystemContributionUrl} target="_blank" rel="noreferrer">
        Contribute on GitHub <ArrowUpRight aria-hidden="true" />
      </a>
    </div>
  );
}

function EntityDetail({
  entity,
  onClose
}: {
  entity: EcosystemEntity;
  onClose: () => void;
}) {
  return (
    <article className="ecosystem-detail" aria-live="polite">
      <button
        className="ecosystem-detail-close"
        type="button"
        onClick={onClose}
        aria-label="Close organization details"
      >
        <X aria-hidden="true" />
      </button>
      <div className="eyebrow mono">{entity.entityType}</div>
      <h2>{entity.name}</h2>
      <p className="ecosystem-detail-summary">{entity.summary}</p>
      <div className="ecosystem-detail-facts">
        <div>
          <MapPin aria-hidden="true" />
          <span>
            <small className="mono">Location</small>
            {publicLocality(entity)}
          </span>
        </div>
        {entity.founders && (
          <div>
            <Building2 aria-hidden="true" />
            <span>
              <small className="mono">Founding team</small>
              {entity.founders}
            </span>
          </div>
        )}
      </div>
      <div className="ecosystem-sector-list">
        {entity.sectors.map((sector) => <span key={sector}>{sector}</span>)}
      </div>
      <div className="ecosystem-detail-actions">
        <a href={entity.websiteUrl} target="_blank" rel="noreferrer">
          Visit website <ArrowUpRight aria-hidden="true" />
        </a>
        {entity.sourceUrl !== entity.websiteUrl && (
          <a href={entity.sourceUrl} target="_blank" rel="noreferrer">
            View source <ArrowUpRight aria-hidden="true" />
          </a>
        )}
      </div>
      <ContributionPrompt selected />
    </article>
  );
}

export function EcosystemPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState<SectorFilter>("All");
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [tourActive, setTourActive] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const sectionRef = useRef<HTMLElement>(null);
  const focusSlug = searchParams.get("focus");
  const selected = bengaluruEcosystem.find((item) => item.slug === focusSlug) ?? null;

  const filtered = useMemo(
    () => filterEcosystemEntities(
      bengaluruEcosystem,
      deferredQuery,
      sector as EcosystemSector | "All"
    ),
    [deferredQuery, sector]
  );
  const mapped = useMemo(
    () => filtered.filter((item) => item.coordinates),
    [filtered]
  );
  const totalMapped = useMemo(
    () => bengaluruEcosystem.filter((item) => item.coordinates).length,
    []
  );

  function selectEntity(slug: string | null, keepTour = false) {
    const next = new URLSearchParams(searchParams);
    if (slug) next.set("focus", slug);
    else next.delete("focus");
    setSearchParams(next, { replace: true });
    if (!keepTour) setTourActive(false);
  }

  useEffect(() => {
    if (!tourActive) return;
    if (mapped.length === 0) {
      setTourActive(false);
      return;
    }

    const advance = () => {
      const currentIndex = mapped.findIndex((item) => item.slug === focusSlug);
      const next = mapped[(currentIndex + 1) % mapped.length];
      selectEntity(next.slug, true);
    };
    if (!mapped.some((item) => item.slug === focusSlug)) advance();
    const interval = window.setInterval(advance, 4_800);
    return () => window.clearInterval(interval);
  }, [focusSlug, mapped, tourActive]);

  function startTour() {
    if (tourActive) {
      setTourActive(false);
      return;
    }
    if (mapped.length === 0) return;
    setMobileView("map");
    setTourActive(true);
    selectEntity(mapped[0].slug, true);
  }

  function openExplorer() {
    sectionRef.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start"
    });
  }

  return (
    <div className="ecosystem-page">
      <PageHeader
        meta="Bengaluru robotics ecosystem"
        title="Robotics, mapped."
        description="Discover Bengaluru's companies, labs, and learning spaces working across robotics, autonomous systems, hardware, drones, and space technology."
        actions={(
          <>
            <button className="button button-primary" type="button" onClick={openExplorer}>
              Explore the map
            </button>
            <button className="button button-quiet" type="button" onClick={startTour}>
              {tourActive ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {tourActive ? "Stop guided tour" : "Tour mapped teams"}
            </button>
          </>
        )}
      >
        <div className="ecosystem-hero-stats mono">
          <span><strong>{bengaluruEcosystem.length}</strong> organizations</span>
          <span><strong>{totalMapped}</strong> organizations on the map</span>
          <span><strong>{ecosystemSectors.length}</strong> sectors</span>
        </div>
      </PageHeader>

      <section className="ecosystem-explorer" ref={sectionRef} aria-labelledby="ecosystem-explorer-title">
        <div className="wrap ecosystem-wrap">
          <div className="ecosystem-toolbar">
            <div>
              <div className="eyebrow mono">Bengaluru discovery map</div>
              <h2 id="ecosystem-explorer-title">Find a team. Follow the hardware.</h2>
            </div>
            <label className="ecosystem-search">
              <span className="sr-only">Search organizations, founders, sectors, or localities</span>
              <Search aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search teams, founders, or places"
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                  <X aria-hidden="true" />
                </button>
              )}
            </label>
          </div>

          <div className="ecosystem-sectors" role="group" aria-label="Filter by sector">
            {allSectors.map((option) => (
              <button
                key={option}
                className={sector === option ? "active" : ""}
                type="button"
                aria-pressed={sector === option}
                onClick={() => setSector(option)}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="ecosystem-mobile-switch" role="group" aria-label="Choose map or list view">
            <button
              className={mobileView === "map" ? "active" : ""}
              type="button"
              aria-pressed={mobileView === "map"}
              onClick={() => setMobileView("map")}
            >
              <MapIcon aria-hidden="true" /> Map
            </button>
            <button
              className={mobileView === "list" ? "active" : ""}
              type="button"
              aria-pressed={mobileView === "list"}
              onClick={() => setMobileView("list")}
            >
              <List aria-hidden="true" /> List
            </button>
          </div>

          <div
            className="ecosystem-workbench"
            data-mobile-view={mobileView}
            data-has-selection={Boolean(selected)}
          >
            <aside className="ecosystem-directory" aria-label="Organization list">
              <div className="ecosystem-directory-heading">
                <span className="mono">
                  {filtered.length} {filtered.length === 1 ? "result" : "results"}
                </span>
                <span>{mapped.length} on map</span>
              </div>
              <div className="ecosystem-directory-list">
                {filtered.map((item) => (
                  <button
                    key={item.slug}
                    className={selected?.slug === item.slug ? "active" : ""}
                    type="button"
                    aria-pressed={selected?.slug === item.slug}
                    onClick={() => selectEntity(item.slug)}
                  >
                    <span className="ecosystem-entity-marker" data-sector={item.sectors[0]} />
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.sectors.slice(0, 2).join(" · ")}</small>
                      <small className="ecosystem-entity-locality">
                        {publicLocality(item)}
                      </small>
                    </span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="ecosystem-empty">
                    <strong>No matching organizations.</strong>
                    <span>Try a broader term or another sector.</span>
                  </div>
                )}
              </div>
            </aside>

            <div className="ecosystem-map-pane">
              <EcosystemMap
                entities={filtered}
                selectedSlug={selected?.slug ?? null}
                onSelect={(slug) => selectEntity(slug)}
              />
            </div>

            <aside className="ecosystem-detail-pane" aria-label="Organization details">
              {selected ? (
                <EntityDetail entity={selected} onClose={() => selectEntity(null)} />
              ) : (
                <div className="ecosystem-method">
                  <div className="eyebrow mono">About the map</div>
                  <h2>Built to be useful.</h2>
                  <p>
                    Pins mark organizations with a published locality or address.
                    Teams known only at city level still appear in the list.
                  </p>
                  <dl>
                    <div>
                      <dt>Organizations on the map</dt>
                      <dd>{totalMapped}</dd>
                    </div>
                    <div>
                      <dt>Last updated</dt>
                        <dd>7 August 2026</dd>
                    </div>
                  </dl>
                  <p className="ecosystem-method-note">
                    Select an organization to see its summary, founders, website, and public source.
                  </p>
                  <ContributionPrompt />
                </div>
              )}
            </aside>
          </div>
        </div>
      </section>
    </div>
  );
}
