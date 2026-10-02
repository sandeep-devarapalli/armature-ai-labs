import { ArrowUpRight, Building2, ChevronRight, List, Map as MapIcon, MapPin, Pause, Pencil, Play, PlusCircle, Search, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { EcosystemMap } from "../components/EcosystemMap";
import { EcosystemContributionForm } from "../components/EcosystemContributionForm";
import { ecosystemSectors } from "../data/bengaluruEcosystem";
import { ecosystemNeeds, ecosystemTypes, ecosystemTypeLabels, getEcosystemListings, type EcosystemListing } from "../lib/ecosystem";
import { trackEcosystemFilter } from "../lib/analytics";
import "./EcosystemPage.css";

const contributionUrl = "https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/docs/ecosystem-contributions.md";

export function EcosystemPage() {
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = useState<EcosystemListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [mobileView, setMobileView] = useState<"map" | "list">("map");
  const [tourActive, setTourActive] = useState(false);
  const [draftVersion, setDraftVersion] = useState(0);
  const detailRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const query = params.get("q") ?? "";
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const type = params.get("type") ?? "";
  const need = params.get("need") ?? "";
  const sector = params.get("sector") ?? "";
  const focus = params.get("focus");
  const contribution = params.get("contribute");
  const selected = listings.find((item) => item.slug === focus);
  const editTarget = listings.find((item) => item.slug === params.get("edit"));

  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    void getEcosystemListings().then((rows) => { if (active) setListings(rows); })
      .catch((reason: Error) => { if (active) { setListings([]); setError(reason.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const filtered = useMemo(() => listings.filter(({ data }) =>
    (!type || data.primaryType === type || data.alsoListedAs.includes(type as typeof data.primaryType))
    && (!need || data.needs.includes(need as typeof data.needs[number]))
    && (!sector || data.sectors.includes(sector as typeof data.sectors[number]))
    && (!deferredQuery || [data.name, data.summary, data.locality, data.founders, data.subcategory, ...data.sectors, ...data.needs].join(" ").toLowerCase().includes(deferredQuery))
  ), [listings, type, need, sector, deferredQuery]);
  const entities = useMemo(() => filtered.map((item) => ({ ...item.data, slug: item.slug })), [filtered]);
  const mapped = useMemo(() => entities.filter((item) => item.coordinates), [entities]);

  function setFilter(key: string, value: string, replace = false) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace }); setTourActive(false);
    if (key === "type" || key === "need") trackEcosystemFilter(key, value);
  }
  function select(slug: string | null) {
    setFilter("focus", slug ?? "");
    if (slug) { setMobileView("map"); requestAnimationFrame(() => detailRef.current?.focus({ preventScroll: true })); }
  }
  function contribute(item?: EcosystemListing) {
    setDraftVersion((value) => value + 1);
    const next = new URLSearchParams(params);
    next.set("contribute", item?.data.primaryType ?? "startup");
    if (item) next.set("edit", item.slug); else next.delete("edit");
    setParams(next); setTourActive(false);
  }
  function closeContribution() {
    const next = new URLSearchParams(params);
    next.delete("contribute"); next.delete("edit"); setParams(next);
  }
  useEffect(() => {
    if (contribution === null) return;
    formRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
    if (!formRef.current?.contains(document.activeElement)) formRef.current?.focus({ preventScroll: true });
  }, [contribution, editTarget?.slug]);
  useEffect(() => {
    if (!tourActive || mapped.length === 0) return;
    const timer = window.setInterval(() => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        const index = mapped.findIndex((item) => item.slug === current.get("focus"));
        next.set("focus", mapped[(index + 1) % mapped.length].slug);
        return next;
      }, { replace: true });
    }, 4800);
    return () => window.clearInterval(timer);
  }, [tourActive, mapped, setParams]);

  return <div className="ecosystem-page builder-atlas">
    <header className="atlas-heading"><div><h1>Bengaluru, for builders.</h1><p>Discover robotics and hardware startups, labs, suppliers and places to build.</p></div><div className="atlas-submit"><button className="button atlas-primary" onClick={() => contribute()}><PlusCircle aria-hidden="true" />Submit a startup or place</button><small>No login required · Admin approval before publishing</small></div></header>
    <section aria-label="Explore the ecosystem" className="atlas-explorer">
      <div className="atlas-filters">
        <label className="ecosystem-search"><span className="sr-only">Search startups, places, capabilities or neighbourhoods</span><Search aria-hidden="true" /><input type="search" value={query} onChange={(event) => setFilter("q", event.target.value, true)} placeholder="Search startups, places, capabilities or neighbourhoods" />{query && <button onClick={() => setFilter("q", "")} aria-label="Clear search"><X /></button>}</label>
        <div className="atlas-types" role="group" aria-label="Listing type"><button aria-pressed={!type} onClick={() => setFilter("type", "")}>All</button>{ecosystemTypes.map((value) => <button key={value} aria-pressed={type === value} onClick={() => setFilter("type", value)}>{ecosystemTypeLabels[value]}</button>)}</div>
        <div className="atlas-needs" role="group" aria-label="What do you need?"><span>What do you need?</span>{ecosystemNeeds.map((value) => <button key={value} aria-pressed={need === value} onClick={() => setFilter("need", need === value ? "" : value)}>{value}</button>)}<label><span className="sr-only">Sector</span><select value={sector} onChange={(event) => setFilter("sector", event.target.value)}><option value="">All sectors</option>{ecosystemSectors.map((value) => <option key={value}>{value}</option>)}</select></label>{(type || need || sector || query) && <button onClick={() => { const next = new URLSearchParams(params); ["type", "need", "sector", "q"].forEach((key) => next.delete(key)); setParams(next); }}>Clear filters</button>}</div>
      </div>
      <div className="atlas-view-controls"><span aria-live="polite">{loading ? "Loading atlas…" : `${filtered.length} results · ${mapped.length} on map`}</span><div className="ecosystem-mobile-switch" role="group" aria-label="Choose map or list view"><button aria-pressed={mobileView === "map"} onClick={() => setMobileView("map")}><MapIcon />Map</button><button aria-pressed={mobileView === "list"} onClick={() => setMobileView("list")}><List />List</button></div><button className="atlas-tour" disabled={!mapped.length} aria-pressed={tourActive} onClick={() => { setMobileView("map"); setTourActive(!tourActive); }}>{tourActive ? <Pause /> : <Play />}{tourActive ? "Stop tour" : "Tour mapped places"}</button></div>
      {error ? <div className="atlas-load-error" role="alert"><h2>The atlas is temporarily unavailable.</h2><p>{error}</p><button className="button" onClick={() => setReload((value) => value + 1)}>Retry loading</button><p>Previously saved directory data is not shown while it cannot be checked.</p></div> : <div className="atlas-workbench" data-mobile-view={mobileView}>
        <aside className="atlas-directory" aria-label="Ecosystem listings">{filtered.map((item) => <article key={item.slug} className={selected?.slug === item.slug ? "active" : ""}><button className="atlas-listing" onClick={() => select(item.slug)} aria-current={selected?.slug === item.slug ? "true" : undefined}><Building2 aria-hidden="true" /><span><strong>{item.data.name}</strong><span>{item.data.summary}</span><small>{item.data.locality || "Location not supplied"} · {ecosystemTypeLabels[item.data.primaryType]}</small></span><ChevronRight aria-hidden="true" /></button><button className="atlas-edit-link" onClick={() => contribute(item)} aria-label={`Suggest an edit / Add details for ${item.data.name}`}><Pencil aria-hidden="true" />Suggest an edit / Add details</button></article>)}{!loading && !filtered.length && <div className="ecosystem-empty"><strong>No matching places or organisations.</strong><p>Try a broader search, or help add what’s missing.</p><button className="button" onClick={() => contribute()}>Submit a startup or place</button></div>}</aside>
        <div className="atlas-map"><EcosystemMap entities={entities} selectedSlug={focus} onSelect={select} />{selected && <article ref={detailRef} tabIndex={-1} className="atlas-detail" aria-label={`${selected.data.name} details`}><button className="ecosystem-detail-close" onClick={() => select(null)} aria-label="Close listing details"><X /></button><h2>{selected.data.name}</h2><p>{selected.data.summary}</p><p className="atlas-location"><MapPin aria-hidden="true" />{selected.data.locality || "Location not supplied"}</p>{selected.data.coordinates && selected.data.locationPrecision === "Locality-level" && <small>Approximate locality pin, not an exact entrance.</small>}{selected.data.accessNote && <p>{selected.data.accessNote}</p>}
          <div className="atlas-detail-actions">{selected.data.websiteUrl && <a className="button" href={selected.data.websiteUrl} target="_blank" rel="noreferrer">Website<ArrowUpRight /></a>}<button className="button" onClick={() => contribute(selected)}><Pencil />Suggest an edit / Add details</button></div><small>No login required · Changes reviewed by admins</small>
          <details key={selected.slug}><summary>More details and contact</summary>{selected.data.founders && <p>Founding team: {selected.data.founders}</p>}{selected.data.sectors.length > 0 && <p>{selected.data.sectors.join(" · ")}</p>}{selected.data.publicPhones.map((phone) => <p key={`${phone.label}-${phone.number}`}>{phone.label}: <a href={`tel:${phone.number.replace(/[^+\d]/g, "")}`}>{phone.number}</a></p>)}{selected.data.publicEmail && <p><a href={`mailto:${selected.data.publicEmail}`}>{selected.data.publicEmail}</a></p>}{[selected.data.engageHow, selected.data.salesChannel, selected.data.priceLevel, selected.data.minOrder, selected.data.pricingModel, selected.data.turnaround, selected.data.tips].filter(Boolean).map((value, index) => <p key={index}>{value}</p>)}</details>
          <div className="atlas-source">{selected.data.sourceUrl && <a href={selected.data.sourceUrl} target="_blank" rel="noreferrer">Public source<ArrowUpRight /></a>}{selected.data.verifiedAt && <small>Source checked <time dateTime={selected.data.verifiedAt}>{selected.data.verifiedAt}</time></small>}{selected.data.credit && <small>Contributed by {selected.data.credit.link ? <a href={selected.data.credit.link} target="_blank" rel="noreferrer">{selected.data.credit.name}</a> : selected.data.credit.name}</small>}</div>
        </article>}</div>
      </div>}
      <footer className="atlas-footer"><p>Locality pins are approximate. Entries without confirmed locations stay in the list. Confirm access before visiting.</p><a href={contributionUrl} target="_blank" rel="noreferrer">Contribute through GitHub<ArrowUpRight /></a></footer>
    </section>
    {contribution !== null && <div ref={formRef} id="contribute" className="atlas-form-anchor" tabIndex={-1}>{params.has("edit") && !editTarget ? <div role="alert"><p>{loading ? "Loading the listing…" : "This listing is no longer available. Start a new suggestion instead."}</p><button className="button" onClick={() => contribute()}>New suggestion</button><button className="button" onClick={closeContribution}>Close</button></div> : <EcosystemContributionForm key={`${editTarget?.slug ?? "new"}-${contribution}-${draftVersion}`} initialListing={editTarget ?? null} initialType={contribution} onClose={closeContribution} />}</div>}
    <p className="atlas-privacy"><Link to="/privacy#privacy-ecosystem">How we handle contributions and contact details</Link></p>
  </div>;
}
