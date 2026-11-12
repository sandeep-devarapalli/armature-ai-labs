import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/Primitives";
import { formatPaise, taxNote } from "../bookings/catalogue";
import { equipment, findEquipment, type EquipmentListing } from "../bookings/equipment";

// "Sample stock" in the preview toolbar pretends every item has a free unit, so the rent and buy steps can be tried.
const withStock = (item: EquipmentListing, inStock: boolean): EquipmentListing =>
  inStock ? { ...item, stock: { units: Math.max(1, item.stock?.units ?? 0), free: Math.max(1, item.stock?.units ?? 0) } } : item;

const stockBlocker = (item: EquipmentListing) => !item.stock ? "Coming soon" : item.stock.free === 0 ? "Out of stock" : null;

const rentBlocker = (item: EquipmentListing) => {
  const stock = stockBlocker(item);
  if (stock) return stock;
  if (item.weekPaise === null && item.monthPaise === null) return "Rental price to be confirmed";
  if (item.depositPaise === null) return "Deposit to be confirmed";
  return null;
};

function Stock({ item }: { item: EquipmentListing }) {
  const s = item.stock;
  const label = !s ? "Coming soon" : s.free === 0 ? "Out of stock" : `${s.free} of ${s.units} available`;
  return <span className={`bpe-stock mono ${s && s.free ? "is-in" : "is-out"}`}>{label}{s?.note ? ` · ${s.note}` : ""}</span>;
}

const fromPrice = (item: EquipmentListing) => item.dayPaise !== undefined ? <>from <strong>{formatPaise(item.dayPaise)}</strong> / day</>
  : item.weekPaise !== null ? <><strong>{formatPaise(item.weekPaise)}</strong> / week</>
  : item.monthPaise !== null ? <><strong>{formatPaise(item.monthPaise)}</strong> / month</> : null;

function Card({ item: listed, base, inStock }: { item: EquipmentListing; base: string; inStock: boolean }) {
  const item = withStock(listed, inStock);
  const rent = fromPrice(item);
  return <Link className="bpe-card" to={`${base}/equipment/${item.code}`}>
    <img src={item.images[0].src} alt="" />
    <span className="mono bp-kicker">{item.category} · {item.maker}</span>
    <strong>{item.name}</strong>
    <small>{item.version}</small>
    <Stock item={item} />
    <span className="bpe-card-price">{rent ? <>Rent {rent}</> : item.salePaise === null ? "Price coming soon" : "Not for rent"}</span>
    {item.salePaise !== null && <span className="bpe-card-price">Buy <strong>{formatPaise(item.salePaise)}</strong></span>}
  </Link>;
}

export function EquipmentList({ base, inStock }: { base: string; inStock: boolean }) {
  return <>
    <PageHeader meta="Equipment" title="Rent or buy lab kit." description="Robot arms and cameras you can rent by the week or month for use in the lab, or buy outright. Each item has its own page with the version, specs, what's in the box and stock." />
    <section className="section">
      <div className="wrap">
        <div className="bpe-grid">{equipment.map(item => <Card key={item.code} item={item} base={base} inStock={inStock} />)}</div>
        <p className="bp-note">{taxNote}</p>
      </div>
    </section>
  </>;
}

type BuyStage = "idle" | "requested" | "checked" | "paid" | "collected" | "refunded";

function BuyFlow({ item, blocker }: { item: EquipmentListing; blocker: string | null }) {
  const [stage, setStage] = useState<BuyStage>("idle");
  const price = formatPaise(item.salePaise!);
  const steps: [BuyStage, string][] = [["requested", "Request to buy, then visit the lab"], ["checked", "Staff confirm you checked it"], ["paid", "Pay online through Razorpay"], ["collected", "Collect it from the lab"]];
  const order: BuyStage[] = ["idle", "requested", "checked", "paid", "collected"];
  const at = order.indexOf(stage);
  if (stage === "idle") return <>
    <ol className="bp-terms">{steps.map(([, label]) => <li key={label}>{label}.</li>)}</ol>
    {blocker ? <button type="button" className="button" disabled>{blocker}</button>
      : <button type="button" className="button button-primary" onClick={() => setStage("requested")}>Request to buy · {price}</button>}
    <p className="bp-note">No contract. Sold as checked in the lab. Full refund until you collect it.</p>
  </>;
  return <div className="bpe-buyflow" aria-live="polite">
    <ol className="bp-substeps">{steps.map(([id, label], i) => <li key={id} className={stage !== "refunded" && i < at ? "is-done" : ""}><strong>{label}</strong></li>)}</ol>
    {stage === "requested" && <><p>Request sent. Come to the lab to check the item; staff will open payment for you once you're happy with it.</p>
      <button type="button" className="button bp-simulate" onClick={() => setStage("checked")}>Simulate: staff mark check done</button></>}
    {stage === "checked" && <><p>Payment is open for 30 minutes.</p>
      <button type="button" className="button button-primary" onClick={() => setStage("paid")}>Pay {price}</button></>}
    {stage === "paid" && <><p>Paid. Collect it from the lab. Until you collect it you can ask for a full refund.</p>
      <div className="bp-row"><button type="button" className="button bp-simulate" onClick={() => setStage("collected")}>Simulate: staff mark collected</button>
      <button type="button" className="button button-quiet" onClick={() => setStage("refunded")}>Ask for a refund</button></div></>}
    {stage === "collected" && <p><strong>Collected.</strong> The sale is complete; refunds are no longer available.</p>}
    {stage === "refunded" && <p><strong>Refunded in full.</strong> The item goes back into stock.</p>}
    {(stage === "collected" || stage === "refunded") && <button type="button" className="button button-quiet" onClick={() => setStage("idle")}>Start again</button>}
  </div>;
}

export function EquipmentDetail({ code, base, inStock }: { code: string; base: string; inStock: boolean }) {
  const item = withStock(findEquipment(code)!, inStock);
  const [shown, setShown] = useState(0);
  const blocker = rentBlocker(item);
  const addOns = (item.addOns ?? []).map(findEquipment).filter((e): e is EquipmentListing => !!e);
  const usedWith = equipment.filter(e => e.addOns?.includes(item.code));
  const hasRent = item.weekPaise !== null || item.monthPaise !== null;
  const buyBlocker = stockBlocker(item);
  const sum = (a: number | null | undefined, b: number | null | undefined) => a != null && b != null ? formatPaise(a + b) : "—";
  return <section className="section">
    <div className="wrap">
      <Link className="mono bp-back" to={`${base}/equipment`}>← All equipment</Link>
      <article className="bpe-detail" aria-labelledby="bpe-name">
        <div className="bpe-top">
          <div className="bpe-gallery">
            <img className="bpe-main-img" src={item.images[shown].src} alt={item.images[shown].alt} />
            <div className="bpe-thumbs" role="group" aria-label="Product images">
              {item.images.map((img, i) => <button key={img.src} type="button" className={i === shown ? "is-on" : ""} aria-pressed={i === shown} onClick={() => setShown(i)}>
                <img src={img.src} alt="" /><span className="sr-only">{img.alt}</span>
              </button>)}
            </div>
          </div>
          <div className="bpe-buy">
            <span className="mono bp-kicker">{item.category} · {item.maker}</span>
            <h1 id="bpe-name">{item.name}</h1>
            <p className="bpe-version"><span className="mono">Version</span>{item.version}</p>
            <Stock item={item} />
            <p className="bp-lede">{item.summary}</p>
            <div className="bpe-offer">
              <h2 className="mono">Rent</h2>
              {hasRent ? <table className="bp-quote bpe-prices"><tbody>
                {item.dayPaise !== undefined && <tr><th>Per day</th><td>{formatPaise(item.dayPaise)}</td></tr>}
                {item.weekPaise !== null && <tr><th>Per week</th><td>{formatPaise(item.weekPaise)}</td></tr>}
                {item.monthPaise !== null && <tr><th>Per month</th><td>{formatPaise(item.monthPaise)}</td></tr>}
                <tr><th>Refundable deposit</th><td>{item.depositPaise !== null ? formatPaise(item.depositPaise) : "To be confirmed"}</td></tr>
              </tbody></table> : <p className="bp-placeholder">Rental price to be confirmed by Armature.</p>}
              {blocker ? <button type="button" className="button" disabled>{blocker}</button>
                : <Link className="button button-primary" to={`${base}/kit?item=${item.code}`}>Request to rent</Link>}
              <p className="bp-note">Used in the lab only, with workspace access for the same period. Armature reviews every request before the agreement.</p>
            </div>
            {item.salePaise !== null && <div className="bpe-offer">
              <h2 className="mono">Buy</h2>
              <p className="bpe-sale">{formatPaise(item.salePaise)}</p>
              <BuyFlow key={String(inStock)} item={item} blocker={buyBlocker} />
            </div>}
            <ul className="bpa-includes">{item.highlights.map(line => <li key={line}>{line}</li>)}</ul>
          </div>
        </div>
        {(addOns.length > 0 || usedWith.length > 0) && <div className="bpe-related">
          <h3>{addOns.length ? "Add a camera" : "Works with"}</h3>
          {addOns.length > 0 && <p className="bp-note">Rent or buy the arm on its own or with a camera. Cameras can also be rented or bought separately.</p>}
          {addOns.map(a => <table key={a.code} className="bp-quote bpe-prices bpe-bundle">
            <caption className="mono">Bundle: arm + {a.name}</caption>
            <tbody>
              <tr><th>Rent per week</th><td>{sum(item.weekPaise, a.weekPaise)}</td></tr>
              <tr><th>Rent per month</th><td>{sum(item.monthPaise, a.monthPaise)}</td></tr>
              <tr><th>Buy</th><td>{sum(item.salePaise, a.salePaise)}</td></tr>
            </tbody>
          </table>)}
          <div className="bpe-grid">{(addOns.length ? addOns : usedWith).map(e => <Card key={e.code} item={e} base={base} inStock={inStock} />)}</div>
        </div>}
        <div className="bpe-specs">
          <section>
            <h3>Technical details</h3>
            <dl className="bpe-spec-list">{item.specs.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </section>
          <section>
            <h3>What's in the box</h3>
            <table className="bpe-parts">
              <thead><tr><th scope="col">Part</th><th scope="col">Qty</th></tr></thead>
              <tbody>{item.parts.map(([part, qty]) => <tr key={part}><td>{part}</td><td>{qty}</td></tr>)}</tbody>
            </table>
            <p className="bp-note">{item.partsNote} Specs and images: <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label}</a>.</p>
          </section>
        </div>
      </article>
      <p className="bp-note">{taxNote}</p>
    </div>
  </section>;
}
