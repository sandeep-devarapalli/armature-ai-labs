import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Filter,
  Search
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { EmptyState, Metric, PageHeader, Section, Status } from "../components/Primitives";
import { componentRequestsAvailable } from "../config/release";
import { useApp } from "../context/AppContext";
import { useInventory } from "../context/InventoryContext";
import {
  availabilityLabel,
  componentOffers,
  components,
  getComponent,
  getOffersForComponent,
  getProjectsForComponent,
  isOfferStale,
  projectComponentLinks
} from "../data/components";
import { projects } from "../data/projects";
import type {
  CatalogComponent,
  ComponentAvailability,
  ComponentOffer,
  ComponentOfferStockState
} from "../types/domain";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2
});

const availabilityFilters = ["all", "available", "low_stock", "unavailable"] as const;
type AvailabilityFilter = (typeof availabilityFilters)[number];

const categoryOptions = [
  "All categories",
  ...Array.from(new Set(components.map((component) => component.category))).sort()
];

export function ComponentsPage() {
  const { currentMember } = useApp();
  const { inventory } = useInventory();
  const [searchParams] = useSearchParams();
  const projectSlug = searchParams.get("project");
  const selectedProject = projects.find((project) => project.slug === projectSlug);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All categories");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const projectSlugs = projectSlug
      ? new Set(
          projectComponentLinks
            .filter((link) => link.projectSlug === projectSlug)
            .map((link) => link.componentSlug)
        )
      : null;

    return components.filter((component) => {
      const matchesProject = !projectSlugs || projectSlugs.has(component.slug);
      const matchesCategory = category === "All categories" || component.category === category;
      const matchesAvailability = availability === "all" || component.availability === availability;
      const haystack = [
        component.name,
        component.category,
        component.description,
        ...component.tags
      ].join(" ").toLowerCase();
      return matchesProject
        && matchesCategory
        && matchesAvailability
        && (!needle || haystack.includes(needle));
    });
  }, [availability, category, projectSlug, query]);

  return (
    <>
      <PageHeader
        meta="Component catalog · audited 26 July 2026"
        title={selectedProject ? `Build list for ${selectedProject.title}.` : "Know what the lab can build with."}
        description="A project-linked catalog of assembled systems, controllers, motion parts, sensors, compute, and sourcing gaps. Availability is intentionally coarse; prices are dated snapshots, not live quotes."
        actions={(componentRequestsAvailable || selectedProject) ? (
          <>
            {componentRequestsAvailable && (
              <Link className="button button-primary" to="/components/request">
                Request a component
              </Link>
            )}
            {selectedProject && (
              <Link className="button button-quiet" to="/components">
                Clear project filter
              </Link>
            )}
          </>
        ) : undefined}
      />
      <section className="procurement-summary">
        <div className="wrap metrics-strip">
          <Metric label="Catalog" value={`${components.length} component classes`} />
          <Metric label="Dated offers" value={`${componentOffers.length} vendor variants`} />
          <Metric label="Price rule" value="Recheck after 30 days" />
          <Metric label="Stock view" value="Coarse public state" />
        </div>
      </section>
      <Section
        number="01"
        title="Component index"
        lede={`${filtered.length} of ${components.length} component classes shown${selectedProject ? ` for ${selectedProject.title}` : ""}.`}
      >
        <div className="filter-bar">
          <label className="search-box">
            <Search aria-hidden="true" />
            <span className="sr-only">Search components</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search components"
            />
          </label>
          <label className="search-box">
            <Filter aria-hidden="true" />
            <span className="sr-only">Filter by category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categoryOptions.map((option) => <option key={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="filter-bar">
          <div className="segmented" role="group" aria-label="Filter by availability">
            {availabilityFilters.map((item) => (
              <button
                key={item}
                className={availability === item ? "active" : ""}
                onClick={() => setAvailability(item)}
                type="button"
              >
                {item === "all" ? "All" : availabilityLabel(item)}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <div className="project-grid">
            {filtered.map((component) => (
              <ComponentCard
                component={component}
                exactStock={currentMember
                  ? inventory.lots.filter((lot) => lot.componentSlug === component.slug)
                  : []}
                key={component.slug}
              />
            ))}
          </div>
        ) : (
          <EmptyState title="No components match">
            Clear a filter or search for a broader component class.
          </EmptyState>
        )}
      </Section>
      <Section number="02" title="How to read the catalog" dark>
        <div className="infra-line">
          {[
            ["01", "Available", "An audited offer was orderable."],
            ["02", "Low stock", "Visible supply was explicitly limited."],
            ["03", "Unavailable", "Sold out, quote-only, or a sourcing gap."],
            ["04", "Validate", "Resolve SKU, voltage, tax, or warranty before PO."],
            ["05", "Target", "A planning quantity for ten parallel builders."]
          ].map(([number, title, copy]) => (
            <div key={number}>
              <span className="mono">{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function ComponentCard({
  component,
  exactStock
}: {
  component: CatalogComponent;
  exactStock: ReturnType<typeof useInventory>["inventory"]["lots"];
}) {
  const offers = getOffersForComponent(component.slug);
  const pricedOffers = offers
    .filter((offer) => offer.gstInclusivePriceInr !== undefined)
    .sort((a, b) => Number(a.gstInclusivePriceInr) - Number(b.gstInclusivePriceInr));
  const projectCount = getProjectsForComponent(component.slug).length;

  return (
    <article className="project-card">
      <div className="project-card-body">
        <div className="row-between">
          <span className="mono">{component.category}</span>
          <Status tone={availabilityTone(component.availability)}>
            {availabilityLabel(component.availability)}
          </Status>
        </div>
        <h3>{component.name}</h3>
        <p>{component.description}</p>
        <div className="resource-meta mono">
          <span>Target · {component.quantityTarget} {component.quantityUnit}</span>
          <span>{projectCount} project{projectCount === 1 ? "" : "s"}</span>
          <span>
            {pricedOffers.length
              ? `From ${inr.format(Number(pricedOffers[0].gstInclusivePriceInr))} incl. GST`
              : "Specialist source required"}
          </span>
          {exactStock.length > 0 && (
            <span>
              Exact stock · {exactStock.reduce((total, lot) => total + lot.quantityAvailable, 0)} available
            </span>
          )}
        </div>
        <div className="tag-row">
          {component.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
        <Link to={`/components/${component.slug}`}>
          Component record <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function ComponentDetailPage() {
  const { currentMember } = useApp();
  const { inventory } = useInventory();
  const { slug = "" } = useParams();
  const component = getComponent(slug);

  if (!component) {
    return (
      <PageHeader
        meta="Component record · not found"
        title="That component is not in the drawer."
        description="The catalog record may have moved or the component has not been audited yet."
        actions={<Link className="button button-primary" to="/components">Component catalog</Link>}
      />
    );
  }

  const offers = getOffersForComponent(component.slug);
  const exactStock = inventory.lots.filter((lot) => lot.componentSlug === component.slug);
  const linkedProjects = getProjectsForComponent(component.slug)
    .map((link) => ({
      ...link,
      project: projects.find((project) => project.slug === link.projectSlug)
    }))
    .filter((item) => item.project);

  return (
    <>
      <PageHeader
        meta={`${component.category} · component record`}
        title={component.name}
        description={component.description}
        actions={
          <Link className="button button-primary" to="/components">
            <ArrowLeft aria-hidden="true" /> All components
          </Link>
        }
      />
      <section className="procurement-summary">
        <div className="wrap metrics-strip">
          <Metric label="Availability" value={availabilityLabel(component.availability)} />
          <Metric label="Target" value={`${component.quantityTarget} ${component.quantityUnit}`} />
          <Metric label="Inventory class" value={component.inventoryClass.replaceAll("_", " ")} />
          <Metric
            label={currentMember ? "Exact stock" : "PO state"}
            value={currentMember && exactStock.length
              ? `${exactStock.reduce((total, lot) => total + lot.quantityAvailable, 0)} available`
              : component.validationState.replaceAll("_", " ")}
          />
        </div>
      </section>
      <Section
        number="01"
        title="Vendor offers"
        lede="Prices are static audit snapshots. Reconfirm stock, GST, landed price, warranty, and delivery before purchase."
      >
        {offers.length ? <OfferTable offers={offers} /> : (
          <EmptyState title="Specialist source required">
            No direct orderable offer was verified in the current audit.
          </EmptyState>
        )}
      </Section>
      <Section number="02" title="Compatible projects" dark>
        {linkedProjects.length ? (
          <div className="source-grid">
            {linkedProjects.map(({ project, role }) => project && (
              <Link to={`/projects#${project.slug}`} key={project.slug}>
                <Status tone={role === "required" ? "bad" : role === "optional" ? "accent" : "neutral"}>
                  {role}
                </Status>
                <span>{project.title}</span>
                <ArrowRight aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No project mapping">
            This is lab stock without a current roadmap dependency.
          </EmptyState>
        )}
      </Section>
      {currentMember && exactStock.length > 0 && (
        <Section number="03" title="Member stock locations">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Location</th><th>Available / on hand</th><th>Class</th><th>Updated</th></tr></thead>
              <tbody>
                {exactStock.map((lot) => (
                  <tr key={lot.id}>
                    <th>{inventory.locations.find((location) => location.id === lot.locationId)?.name ?? "Unassigned"}</th>
                    <td>{lot.quantityAvailable} / {lot.quantityOnHand} {lot.unit}</td>
                    <td>{lot.inventoryClass.replaceAll("_", " ")}</td>
                    <td>{lot.updatedAt.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      <Section number={currentMember && exactStock.length > 0 ? "04" : "03"} title="Purchase validation">
        <div className="role-list">
          {component.validationNotes.map((note, index) => (
            <div className="role-row" key={note}>
              <span className="mono">{String(index + 1).padStart(2, "0")}</span>
              <div><p>{note}</p></div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

export function OfferTable({ offers }: { offers: ComponentOffer[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Vendor / variant</th>
            <th>GST-inclusive</th>
            <th>Ex-GST</th>
            <th>Rating</th>
            <th>Stock</th>
            <th>Checked</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {offers.map((offer) => {
            const stale = isOfferStale(offer.checkedAt);
            return (
              <tr key={offer.id}>
                <th>
                  {offer.vendor}<br />
                  <span className="mono">{offer.variant}</span>
                  {(offer.sku || offer.mpn) && (
                    <><br /><small>{[offer.sku, offer.mpn].filter(Boolean).join(" · ")}</small></>
                  )}
                </th>
                <td>{formatPrice(offer.gstInclusivePriceInr)}</td>
                <td>{formatPrice(offer.exGstPriceInr)}</td>
                <td>{formatOfferRating(offer)}</td>
                <td><Status tone={offerStockTone(offer.stockState)}>{offerStockLabel(offer.stockState)}</Status></td>
                <td>
                  {offer.checkedAt}
                  {stale && <><br /><Status tone="warn">Recheck price</Status></>}
                </td>
                <td>
                  <a href={offer.directUrl} target="_blank" rel="noreferrer">
                    Direct link <ExternalLink aria-hidden="true" />
                  </a>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function formatPrice(value?: number) {
  return value === undefined ? "Quote / unavailable" : inr.format(value);
}

function formatOfferRating(offer: ComponentOffer) {
  return offer.customerRating === undefined
    ? "Not captured"
    : `${offer.customerRating.toFixed(1)} / 5 · ${offer.customerRatingCount ?? 0} ratings`;
}

function availabilityTone(availability: ComponentAvailability) {
  return availability === "available" ? "good" : availability === "low_stock" ? "warn" : "bad";
}

function offerStockTone(stock: ComponentOfferStockState) {
  return stock === "in_stock" ? "good" : stock === "limited" ? "warn" : stock === "out_of_stock" ? "bad" : "neutral";
}

function offerStockLabel(stock: ComponentOfferStockState) {
  return {
    in_stock: "In stock",
    limited: "Limited",
    out_of_stock: "Out of stock",
    quote_required: "Quote required",
    unknown: "Unconfirmed"
  }[stock];
}
