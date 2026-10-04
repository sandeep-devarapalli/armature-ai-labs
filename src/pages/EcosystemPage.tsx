import { ArrowDown, ArrowUp, ArrowUpRight, Building2, ChevronDown, ChevronUp, ChevronRight, Coffee, Home, MapPin, Maximize2, Pause, Pencil, Play, PlusCircle, Rocket, Search, SlidersHorizontal, Users, Wrench, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EcosystemMap } from "../components/EcosystemMap";
import { EcosystemPlaceDetails } from "../components/EcosystemPlaceDetails";
import { EcosystemContributionForm } from "../components/EcosystemContributionForm";
import { ecosystemSectors } from "../data/bengaluruEcosystem";
import { ecosystemCities, guideChapters } from "../data/ecosystemGuide";
import { ecosystemNeeds, ecosystemTypes, ecosystemTypeLabels, getEcosystemListings, type EcosystemListing } from "../lib/ecosystem";
import { listingMatchesTopic } from "../lib/ecosystemGuide";
import { trackEcosystemFilter } from "../lib/analytics";
import "./EcosystemPage.css";

const contributionUrl = "https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/docs/ecosystem-contributions.md";
const topics = [{ id: "", label: "All", icon: MapPin }, { id: "startups", label: "Startups", icon: Rocket }, { id: "workspaces", label: "Workspaces", icon: Building2 }, { id: "communities", label: "Communities", icon: Users }, { id: "cafes", label: "Cafés", icon: Coffee }, { id: "build-source", label: "Build & source", icon: Wrench }, { id: "living", label: "Living", icon: Home }];
const city = ecosystemCities[0];

export function EcosystemPage() {
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = useState<EcosystemListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const [limit, setLimit] = useState(30);
  const guideRef = useRef<HTMLElement>(null);
  const guideScroll = useRef(0);
  const formRef = useRef<HTMLDivElement>(null);
  const explorerRef = useRef<HTMLElement>(null);
  const query = params.get("q") ?? "";
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const type = params.get("type") ?? "";
  const need = params.get("need") ?? "";
  const sector = params.get("sector") ?? "";
  const topic = params.get("topic") ?? "";
  const focus = params.get("focus");
  const previousFocus = useRef(focus);
  const contribution = params.get("contribute");
  const selected = listings.find(item => item.slug === focus);
  const editTarget = listings.find(item => item.slug === params.get("edit"));
  const browsingGuide = !query && !type && !need && !sector && !topic;
  const chapter = guideChapters.find(item => item.id === params.get("chapter")) ?? guideChapters[0];

  useEffect(() => {
    const header = document.querySelector(".topbar");
    if (!header || typeof ResizeObserver === "undefined") return;
    const updateHeight = () => explorerRef.current?.style.setProperty("--atlas-header-height", `${header.getBoundingClientRect().height}px`);
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header); updateHeight();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void getEcosystemListings().then(rows => { if (active) setListings(rows); })
      .catch((reason: Error) => { if (active) { setListings([]); setError(reason.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);
  const filtered = useMemo(() => listings.filter(({ data }) =>
    (data.city ?? "bangalore") === city.id && listingMatchesTopic(data, topic)
    && (!type || data.primaryType === type || data.alsoListedAs.includes(type as typeof data.primaryType))
    && (!need || data.needs.includes(need as typeof data.needs[number]))
    && (!sector || data.sectors.includes(sector as typeof data.sectors[number]))
    && (!deferredQuery || [data.name, data.summary, data.locality, data.founders, data.subcategory, ...data.sectors, ...data.needs].join(" ").toLowerCase().includes(deferredQuery))
  ), [listings, topic, type, need, sector, deferredQuery]);
  const entities = useMemo(() => {
    const rows = selected && !filtered.some(item => item.slug === selected.slug) ? [...filtered, selected] : filtered;
    return rows.map(item => ({ ...item.data, slug: item.slug }));
  }, [filtered, selected]);
  const mapped = useMemo(() => filtered.filter(item => item.data.coordinates), [filtered]);
  useEffect(() => { setLimit(30); }, [query, type, need, sector, topic]);
  useEffect(() => {
    if (focus) { setCollapsed(false); setSheetExpanded(false); }
    else if (guideRef.current) {
      guideRef.current.scrollTop = guideScroll.current;
      if (previousFocus.current && !document.activeElement?.closest(".atlas-search-toolbar")) guideRef.current.focus({ preventScroll: true });
    }
    previousFocus.current = focus;
  }, [focus]);
  function setFilter(key: string, value: string, replace = false) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== "focus" && key !== "chapter") next.delete("focus");
    setParams(next, { replace }); setTourActive(false);
    if (key === "type" || key === "need") trackEcosystemFilter(key, value);
  }
  function select(slug: string | null) {
    if (slug && !focus) guideScroll.current = guideRef.current?.scrollTop ?? 0;
    setFilter("focus", slug ?? "");
  }
  function togglePanel() {
    setCollapsed(!collapsed); setSheetExpanded(false); setTourActive(false);
  }
  function jumpTo(id: string) {
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: "start" });
    target?.focus({ preventScroll: true });
  }
  function contribute(item?: EcosystemListing) {
    setDraftVersion(value => value + 1);
    const next = new URLSearchParams(params);
    next.set("contribute", item?.data.primaryType ?? "startup");
    if (item) next.set("edit", item.slug); else next.delete("edit");
    setParams(next); setTourActive(false);
  }
  function closeContribution() {
    const next = new URLSearchParams(params);
    next.delete("contribute"); next.delete("edit"); setParams(next);
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".atlas-primary")?.focus());
  }
  useEffect(() => {
    if (contribution === null) return;
    formRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    if (!formRef.current?.contains(document.activeElement)) formRef.current?.focus({ preventScroll: true });
  }, [contribution, editTarget?.slug]);
  useEffect(() => {
    if (!tourActive || !mapped.length) return;
    const timer = window.setInterval(() => {
      setParams(current => {
        const next = new URLSearchParams(current);
        const index = mapped.findIndex(item => item.slug === current.get("focus"));
        next.set("focus", mapped[(index + 1) % mapped.length].slug);
        return next;
      }, { replace: true });
    }, 4800);
    return () => window.clearInterval(timer);
  }, [tourActive, mapped, setParams]);
  function listingCard(item: EcosystemListing) {
    return <article key={item.slug} className="atlas-card"><button className="atlas-listing" onClick={() => select(item.slug)}><Building2 aria-hidden="true" /><span><strong>{item.data.name}</strong><small>{item.data.subcategory || ecosystemTypeLabels[item.data.primaryType]}</small><span>{item.data.summary}</span></span><ChevronRight aria-hidden="true" /></button><div className="atlas-card-actions"><button onClick={() => select(item.slug)}>View details <ArrowUpRight /></button><button onClick={() => contribute(item)} aria-label={`Suggest an edit / Add details for ${item.data.name}`}><Pencil />Suggest an edit</button></div></article>;
  }
  return <div className="ecosystem-page builder-atlas">
    <section id="ecosystem-map" tabIndex={-1} ref={explorerRef} aria-label="Explore the ecosystem" className="atlas-explorer" data-collapsed={collapsed} data-detail={Boolean(selected)} data-sheet-expanded={sheetExpanded}>
      <div className="atlas-map"><EcosystemMap entities={entities} selectedSlug={focus} onSelect={select} /></div>
      <div className="atlas-submit"><button className="button atlas-primary" onClick={() => contribute()}><PlusCircle aria-hidden="true" />Submit a startup or place</button><small>No login required · Admin approval before publishing</small></div>
      <nav className="atlas-topics" aria-label="Explore by topic">{topics.map(({ id, label, icon: Icon }) => <button key={id} aria-pressed={topic === id} onClick={() => { setFilter("topic", id); setCollapsed(false); }}><Icon />{label}</button>)}</nav>
      <button className="atlas-expand button" aria-expanded={!collapsed} onClick={togglePanel}><Maximize2 />{collapsed ? "Show results" : "Expand map"}</button>
      <div className="atlas-panel">
        <div className="atlas-search-toolbar">
          <span className="atlas-city"><MapPin aria-hidden="true" />{city.name}</span>
          <label className="ecosystem-search"><span className="sr-only">Search startups, places, capabilities or neighbourhoods</span><Search aria-hidden="true" /><input type="search" value={query} onChange={event => { setFilter("q", event.target.value, true); setCollapsed(false); }} placeholder="Search startups, places and resources" />{query && <button onClick={() => { setFilter("q", ""); setCollapsed(false); }} aria-label="Clear search"><X /></button>}</label>
          <button className="atlas-rollup" aria-expanded={!collapsed} aria-controls="atlas-results" onClick={togglePanel}>{collapsed ? <ChevronDown /> : <ChevronUp />}{collapsed ? "Show results" : "Minimize to bar"}</button>
          <button className="atlas-guide-jump" onClick={() => jumpTo("bangalore-guide")}>Bangalore city guide <ArrowDown /></button>
        </div>
        <div id="atlas-results" className="atlas-panel-content" hidden={collapsed}>
        <button className="atlas-sheet-toggle" aria-expanded={sheetExpanded} onClick={() => setSheetExpanded(!sheetExpanded)}><ChevronDown />{sheetExpanded ? "Show more map" : "Expand results & details"}</button>
        {selected && <EcosystemPlaceDetails listing={selected} onBack={() => select(null)} onEdit={() => contribute(selected)} />}
        <aside hidden={Boolean(selected)} ref={guideRef} tabIndex={-1} className="atlas-directory" aria-label="Ecosystem listings">
          <h1>Bangalore ecosystem</h1><p className="atlas-intro">{city.intro} For robotics, hardware and the wider startup community.</p>
          {params.get("city") && params.get("city") !== city.id && <p role="status">Bangalore is our first city guide. Other cities are not available yet.</p>}
          <details className="atlas-filter-disclosure"><summary><SlidersHorizontal />More filters{type || need || sector ? " · active" : ""}</summary><div className="atlas-types" role="group" aria-label="Listing type">{ecosystemTypes.map(value => <button key={value} aria-pressed={type === value} onClick={() => setFilter("type", type === value ? "" : value)}>{ecosystemTypeLabels[value]}</button>)}</div><div className="atlas-needs" role="group" aria-label="What do you need?"><span>What do you need?</span>{ecosystemNeeds.map(value => <button key={value} aria-pressed={need === value} onClick={() => setFilter("need", need === value ? "" : value)}>{value}</button>)}<label><span className="sr-only">Sector</span><select value={sector} onChange={event => setFilter("sector", event.target.value)}><option value="">All sectors</option>{ecosystemSectors.map(value => <option key={value}>{value}</option>)}</select></label></div></details>
          {!browsingGuide && <button className="atlas-text-button" onClick={() => { const next = new URLSearchParams(params); ["topic", "type", "need", "sector", "q"].forEach(key => next.delete(key)); setParams(next); }}>Clear filters</button>}
          {focus && !loading && !selected && <p role="status">This listing is not available. Browse the current guide below.</p>}
          {error ? <div className="atlas-load-error" role="alert"><h2>The atlas is temporarily unavailable.</h2><p>{error}</p><button className="button" onClick={() => setReload(value => value + 1)}>Retry loading</button><p>Previously saved directory data is not shown while it cannot be checked.</p></div> : <>
            <div className="atlas-results-heading"><h2>{browsingGuide ? "Explore the ecosystem" : topics.find(item => item.id === topic)?.label || "Matching listings"}</h2><span aria-live="polite">{loading ? "Loading atlas…" : `${filtered.length} results · ${mapped.length} on map`}</span></div>
            {filtered.slice(0, limit).map(listingCard)}{filtered.length > limit && <button className="button atlas-show-more" onClick={() => setLimit(value => value + 30)}>Show more listings ({filtered.length - limit} remaining)</button>}
            {!loading && !filtered.length && <div className="ecosystem-empty"><strong>No matching places or organisations.</strong><p>Try a broader search, or help add what’s missing.</p><button className="button" onClick={() => contribute()}>Submit a startup or place</button></div>}
          </>}
          <button className="atlas-tour" disabled={!mapped.length} aria-pressed={tourActive} onClick={() => { guideScroll.current = guideRef.current?.scrollTop ?? 0; setTourActive(!tourActive); }}>{tourActive ? <Pause /> : <Play />}{tourActive ? "Stop tour" : "Tour mapped places"}</button>
          <footer className="atlas-footer"><p>Locality pins are approximate. Entries without confirmed locations stay in the list. Confirm access before visiting.</p><a href={contributionUrl} target="_blank" rel="noreferrer">Contribute through GitHub<ArrowUpRight /></a></footer>
        </aside>
        </div>
      </div>
      {tourActive && selected && <button className="button atlas-stop-tour" onClick={() => setTourActive(false)}><Pause />Stop tour</button>}
    </section>
    <section id="bangalore-guide" tabIndex={-1} className="atlas-city-guide" aria-labelledby="city-guide-title">
      <header><h2 id="city-guide-title">{city.title}</h2><button className="atlas-text-button" onClick={() => jumpTo("ecosystem-map")}>Back to map <ArrowUp /></button></header>
      <p>A practical starting point for working, building and settling into Bangalore’s startup community. Explore the map above, then use these notes to plan your next step.</p>
      <nav aria-label="Starter guide chapters">{guideChapters.map(item => <button key={item.id} aria-pressed={chapter.id === item.id} onClick={() => setFilter("chapter", item.id)}>{item.title}</button>)}</nav>
      <article aria-label={chapter.title}><div><h3>{chapter.title}</h3><p>{chapter.intro}</p>{chapter.paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div><aside aria-label="Useful links"><h3>Explore further</h3><div className="atlas-reading-links">{chapter.sources.map(source => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight /></a>)}</div><button className="atlas-text-button" onClick={() => { const next = new URLSearchParams(params); ["q", "type", "need", "sector", "focus"].forEach(key => next.delete(key)); next.set("topic", chapter.id === "work-meet" ? "workspaces" : chapter.id); setParams(next); setCollapsed(false); setTourActive(false); jumpTo("ecosystem-map"); }}>Explore {chapter.id === "work-meet" ? "workspaces" : chapter.title.toLowerCase()} on the map <ArrowUpRight /></button></aside></article>
    </section>
    {contribution !== null && <div ref={formRef} id="contribute" className="atlas-form-anchor" tabIndex={-1}>{params.has("edit") && !editTarget ? <div role="alert"><p>{loading ? "Loading the listing…" : "This listing is no longer available. Start a new suggestion instead."}</p><button className="button" onClick={() => contribute()}>New suggestion</button><button className="button" onClick={closeContribution}>Close</button></div> : <EcosystemContributionForm key={`${editTarget?.slug ?? "new"}-${contribution}-${draftVersion}`} initialListing={editTarget ?? null} initialType={contribution} listings={listings} onClose={closeContribution} />}</div>}
    <p className="atlas-privacy"><Link to="/privacy#privacy-ecosystem">How we handle contributions and contact details</Link></p>
  </div>;
}
