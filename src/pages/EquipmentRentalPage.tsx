import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PageHeader } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { formatPaise } from "../lib/cabins";
import { rentalRequest, type RentalProduct } from "../lib/rental-checkout";

const gstNote = "Armature is not GST-registered, so no GST is added.";
const rentLink = (code: string) => `/bookings?item=kit&product=${encodeURIComponent(code)}#steps`;

function Stock({ item }: { item: RentalProduct }) {
  const free = item.freeUnits ?? 0;
  const label = item.status !== "available" ? "Coming soon" : free === 0 ? "Out of stock" : `${free} of ${item.quantity} available`;
  return <span className={`eq-stock mono ${item.status === "available" && free ? "is-in" : "is-out"}`}>{label}{item.stockNote ? ` · ${item.stockNote}` : ""}</span>;
}

const fromPrice = (item: RentalProduct) => item.dayRentPaise ? <>from <strong>{formatPaise(item.dayRentPaise)}</strong> / day</>
  : item.weekRentPaise ? <><strong>{formatPaise(item.weekRentPaise)}</strong> / 7 days</>
  : item.monthRentPaise ? <><strong>{formatPaise(item.monthRentPaise)}</strong> / 30 days</> : null;

function Card({ item }: { item: RentalProduct }) {
  const rent = fromPrice(item);
  return <Link className="eq-card" to={`/bookings/equipment/${encodeURIComponent(item.product)}`}>
    {item.images?.[0] && <img src={item.images[0].src} alt="" />}
    <span className="mono eq-kicker">{[item.category, item.maker].filter(Boolean).join(" · ")}</span>
    <strong>{item.name}</strong>
    {item.version && <small>{item.version}</small>}
    <Stock item={item} />
    <span className="eq-card-price">{rent ? <>Rent {rent}</> : "Rental price to be confirmed"}</span>
    {item.salePaise && <span className="eq-card-price">Buy <strong>{formatPaise(item.salePaise)}</strong></span>}
  </Link>;
}

function Detail({ item }: { item: RentalProduct }) {
  const [shown, setShown] = useState(0);
  const images = item.images ?? [];
  const free = item.freeUnits ?? 0;
  const hasRent = Boolean(item.dayRentPaise || item.weekRentPaise || item.monthRentPaise);
  const blocker = item.status !== "available" ? "Coming soon" : free === 0 ? "Out of stock" : !hasRent ? "Rental price to be confirmed" : null;
  return <article className="eq-detail" aria-labelledby="eq-name">
    <div className="eq-top">
      {images.length > 0 && <div className="eq-gallery">
        <img className="eq-main-img" src={images[shown].src} alt={images[shown].alt} />
        {images.length > 1 && <div className="eq-thumbs" role="group" aria-label="Product images">
          {images.map((img, i) => <button key={img.src} type="button" className={i === shown ? "is-on" : ""} aria-pressed={i === shown} onClick={() => setShown(i)}>
            <img src={img.src} alt="" /><span className="sr-only">{img.alt}</span>
          </button>)}
        </div>}
      </div>}
      <div className="eq-buy">
        <span className="mono eq-kicker">{[item.category, item.maker].filter(Boolean).join(" · ")}</span>
        <h1 id="eq-name">{item.name}</h1>
        {item.version && <p className="eq-version"><span className="mono">Version</span>{item.version}</p>}
        <Stock item={item} />
        {item.summary && <p className="eq-lede">{item.summary}</p>}
        <div className="eq-offer">
          <h2 className="mono">Rent</h2>
          {hasRent ? <table className="eq-prices"><tbody>
            {item.dayRentPaise ? <tr><th>Per day</th><td>{formatPaise(item.dayRentPaise)}</td></tr> : null}
            {item.weekRentPaise ? <tr><th>Per 7 days</th><td>{formatPaise(item.weekRentPaise)}</td></tr> : null}
            {item.monthRentPaise ? <tr><th>Per 30 days</th><td>{formatPaise(item.monthRentPaise)}</td></tr> : null}
            <tr><th>Refundable deposit</th><td>{item.depositPaise === null ? "To be confirmed" : item.depositPaise === 0 ? "None" : formatPaise(item.depositPaise)}</td></tr>
          </tbody></table> : <p className="eq-note">Rental price to be confirmed by Armature.</p>}
          {blocker ? <button type="button" className="button" disabled>{blocker}</button>
            : <Link className="button button-primary" to={rentLink(item.product)}>Request to rent</Link>}
          <p className="eq-note">Used in the lab only, with workspace access for the same period. Armature reviews every request before the agreement.</p>
        </div>
        {item.salePaise && <div className="eq-offer">
          <h2 className="mono">Buy</h2>
          <p className="eq-sale">{formatPaise(item.salePaise)}</p>
          <p className="eq-note">Online buying opens later. To buy now, ask in the lab or write to <a href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a>.</p>
        </div>}
        {(item.highlights?.length ?? 0) > 0 && <ul className="eq-includes">{item.highlights!.map(line => <li key={line}>{line}</li>)}</ul>}
      </div>
    </div>
    {((item.specs?.length ?? 0) > 0 || (item.parts?.length ?? 0) > 0) && <div className="eq-specs">
      {(item.specs?.length ?? 0) > 0 && <section>
        <h3>Technical details</h3>
        <dl className="eq-spec-list">{item.specs!.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </section>}
      {(item.parts?.length ?? 0) > 0 && <section>
        <h3>What's in the box</h3>
        <table className="eq-parts">
          <thead><tr><th scope="col">Part</th><th scope="col">Qty</th></tr></thead>
          <tbody>{item.parts!.map(([part, qty]) => <tr key={part}><td>{part}</td><td>{qty}</td></tr>)}</tbody>
        </table>
        <p className="eq-note">{item.partsNote}{item.sourceUrl && <> Specs and images: <a href={item.sourceUrl} target="_blank" rel="noreferrer">{item.sourceLabel ?? "maker's page"}</a>.</>}</p>
      </section>}
    </div>}
  </article>;
}

// Equipment list at /bookings/equipment and one page per item at /bookings/equipment/:code. The catalogue is read for signed-in members only.
export default function EquipmentRentalPage() {
  const { code } = useParams();
  const { pathname } = useLocation();
  const { account } = useAccount();
  const memberId = account?.user_id;
  const [items, setItems] = useState<RentalProduct[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!memberId) return;
    let active = true;
    setError("");
    rentalRequest<{ products: RentalProduct[] }>({ action: "availability" }, memberId)
      .then(result => { if (active) setItems(result.products.filter(p => p.kind === "equipment")); })
      .catch(() => { if (active) setError("Equipment could not load. Try again in a moment."); });
    return () => { active = false; };
  }, [memberId]);
  const item = code ? items?.find(p => p.product === code) : undefined;

  return <>
    {!code && <PageHeader meta="Equipment" title="Rent lab kit." description="Robot arms and cameras you can rent for use in the lab. Each item has its own page with the version, specs, what's in the box and stock." />}
    <section className="section">
      <div className="wrap">
        {code && <Link className="mono eq-back" to="/bookings/equipment">← All equipment</Link>}
        {!memberId ? <div className="eq-signin">
          <p>Sign in to see equipment, prices and stock.</p>
          <Link className="button button-primary" to={"/auth?next=" + encodeURIComponent(pathname)}>Sign in</Link>
        </div>
          : error ? <p role="alert">{error}</p>
          : !items ? <p role="status">Loading equipment…</p>
          : code ? item ? <Detail item={item} /> : <p role="status">This item is not listed. <Link to="/bookings/equipment">See all equipment</Link>.</p>
          : <div className="eq-grid">{items.map(p => <Card key={p.product} item={p} />)}</div>}
        <p className="eq-note">{gstNote}</p>
      </div>
    </section>
  </>;
}
