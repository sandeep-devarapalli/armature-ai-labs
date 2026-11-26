import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CabinMap } from "../components/CabinMap";
import { DeskBooking } from "../components/DeskCheckout";
import { EventBooking } from "../components/EventCheckout";
import { PageHeader } from "../components/Primitives";
import { RentalBooking } from "../components/RentalCheckout";
import { basicOnboardingAvailable, deskCheckoutAvailable, eventCheckoutAvailable, rentalCheckoutAvailable, venturePassAvailable } from "../config/release";
import { useAccount } from "../context/AccountContext";
import { cabinRent, cabins, formatPaise, statusLabel } from "../lib/cabins";
import { GuestPassBooking } from "./PassPages";
import { rentalRequest, type RentalProduct } from "../lib/rental-checkout";

type Row = { id: "desk" | "guest" | "cabin" | "kit" | "event"; name: string; summary: string; prices: string[]; deposit: string; minimum: string; cancellation: string };

const lowestRent = (items: RentalProduct[]) => {
  const rents = items.flatMap(p => [p.dayRentPaise && [p.dayRentPaise, "day"], p.weekRentPaise && [p.weekRentPaise, "7 days"], p.monthRentPaise && [p.monthRentPaise, "30 days"]])
    .filter((r): r is [number, string] => Boolean(r)).sort((a, b) => a[0] - b[0]);
  return rents.length ? [`From ${formatPaise(rents[0][0])} / ${rents[0][1]}`] : ["Varies by item"];
};

const annualPasses = [
  {
    id: "golden", name: "Golden Pass", audience: "For individual builders",
    summary: "Daytime lab access every day and priority booking.",
    price: "₹1,00,000", term: "for 12 months", to: "/golden-pass"
  },
  {
    id: "venture", name: "Venture Partner Pass", audience: "For venture firms",
    summary: "Founder introductions, portfolio showcases and lab access. Limited to four partner firms.",
    price: "₹5,00,000", term: "per firm per year", to: "/venture-partner-pass"
  }
] as const;

function AnnualPasses({ available }: { available: readonly (typeof annualPasses)[number][] }) {
  return <section id="annual-passes" className="book-annual" aria-labelledby="annual-passes-title">
    <h3 id="annual-passes-title">Annual passes</h3>
    <div className="book-annual-options">
      {available.map(pass => <article key={pass.id} className={`book-annual-option book-annual--${pass.id}`}>
        <div className="book-annual-intro">
          <h4>{pass.name}</h4>
          <p className="book-annual-audience">{pass.audience}</p>
          <p className="book-annual-summary">{pass.summary}</p>
        </div>
        <p className="book-annual-price"><strong>{pass.price}</strong><span>{pass.term}</span></p>
        <Link className="button button-quiet" to={pass.to}>Explore {pass.name}</Link>
      </article>)}
    </div>
  </section>;
}

export default function BookLabPage() {
  const { account } = useAccount();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [products, setProducts] = useState<RentalProduct[]>([]);
  const memberId = account?.user_id;
  useEffect(() => {
    if (!rentalCheckoutAvailable || !memberId) return;
    let active = true;
    rentalRequest<{ products: RentalProduct[] }>({ action: "availability" }, memberId)
      .then(result => { if (active) setProducts(result.products); }).catch(() => { /* Static statuses still show. */ });
    return () => { active = false; };
  }, [memberId]);

  const equipment = products.filter(p => p.kind === "equipment");
  const cabinList = cabins.map(c => { const live = products.find(p => p.kind === "cabin" && p.room === c.room); return c.status === "occupied" && live ? { ...c, depositPaise: live.depositPaise } : c; });
  const rows: Row[] = [
    ...(deskCheckoutAvailable ? [{ id: "desk", name: "Desk pass", summary: "A chair on the lab floor, by the day, week or month.",
      prices: [`${formatPaise(35000)} / day`, `${formatPaise(175000)} / 7 days`, `${formatPaise(1300000)} / calendar month`], deposit: "None", minimum: "1 day",
      cancellation: "48 hours or more before the start: full refund" } as Row] : []),
    ...(basicOnboardingAvailable ? [{ id: "guest", name: "Guest Pass", summary: "Attend an event or meet someone. Staff approval required.",
      prices: ["Free"], deposit: "None", minimum: "1 day", cancellation: "No payment" } as Row] : []),
    ...(rentalCheckoutAvailable ? [{ id: "cabin", name: "Team cabins", summary: cabinList.map(c => `${c.name.replace("Cabin ", "")} ${statusLabel[c.status].toLowerCase()}`).join(" · "),
      prices: cabinList.filter(c => c.status === "quote").map(c => `${c.name} · ${formatPaise(cabinRent(c))} / month`),
      deposit: "Confirmed in quote", minimum: "Confirmed in quote", cancellation: "Confirmed in quote" } as Row, { id: "kit", name: "Equipment", summary: "Robot arms and cameras to use in the lab.",
      prices: lowestRent(equipment), deposit: "Shown per item", minimum: "1 day (cameras), 7 days (arms)", cancellation: "48 hours or more before the start: full refund" } as Row] : []),
    { id: "event", name: "Event space", summary: "The demo floor for meetups, launches and live demos.", prices: [eventCheckoutAvailable ? `${formatPaise(250000)} / hour` : "Coming soon"], deposit: "None", minimum: "1 hour",
      cancellation: "48 hours or more before the event: 50% refund" }
  ];
  const availablePasses = annualPasses.filter(pass => pass.id === "golden" ? basicOnboardingAvailable : venturePassAvailable);
  const item = rows.find(r => r.id === params.get("item"));
  // The #steps hash makes the shell scroll the opened checkout into view.
  const choose = (next: Record<string, string>) => navigate({ search: "?" + new URLSearchParams(next), hash: "steps" });
  const cabin = cabinList.find(c => c.code === params.get("cabin"));
  const kit = equipment.find(p => p.product === params.get("product"));

  return <>
    <PageHeader meta="Workspace bookings" title="Book the lab." description="Reserve a desk to work, request a free Guest Pass for an event or meeting, or ask for a team cabin quote. Compare the available options below." />
    <section className="section">
      <div className="wrap">
        <h2 id="book-access-title" className="join-access-heading">Compare access</h2>
        {availablePasses.length > 0 && <>
          <AnnualPasses available={availablePasses} />
          <h3 id="book-flexible-title" className="book-flexible-title">Book as you go</h3>
        </>}
        <div className="book-table-wrap">
          <table className="book-table book-access-table" aria-labelledby={availablePasses.length ? "book-flexible-title" : "book-access-title"}>
            <thead><tr><th scope="col">Access</th><th scope="col">Price and availability</th><th scope="col">Next step</th></tr></thead>
            <tbody>
              {rows.map(row => <tr key={row.id} className={row.id === item?.id ? "is-selected" : ""}>
                <th scope="row"><strong>{row.name}</strong><small>{row.summary}</small></th>
                <td data-label="Price">{row.prices.map(p => <span key={p} className="book-price">{p}</span>)}
                  <details className="book-row-terms"><summary>Booking terms</summary>
                    <small>Deposit: {row.deposit} · Minimum: {row.minimum}</small>
                    <small>Cancellation: {row.cancellation}</small>
                  </details>
                </td>
                <td><button type="button" className="button button-quiet" aria-pressed={row.id === item?.id}
                  aria-label={row.id === item?.id ? `Selected ${row.name.toLowerCase()}` : undefined} onClick={() => choose({ item: row.id })}>{row.id === item?.id ? "Selected" : { desk: "Choose a desk pass", guest: "Request a Guest Pass", cabin: "View cabin quotes", kit: "Browse equipment", event: eventCheckoutAvailable ? "Book event space" : "Event enquiries" }[row.id]}</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {basicOnboardingAvailable && deskCheckoutAvailable && <p className="book-note">For a workday, choose a paid desk pass. Guest Passes are for visits and require staff approval.</p>}
        <p className="book-note">Armature is not GST-registered, so no GST is added.</p>
      </div>
    </section>
    {item && <section className="section" id="steps" aria-labelledby="steps-title">
      <div className="wrap">
        <h2 id="steps-title">{item.name}</h2>
        {item.id === "desk" && <DeskBooking />}
        {item.id === "guest" && <GuestPassBooking />}
        {item.id === "cabin" && <>
          <p className="book-note">Monthly prices are for the whole cabin and open to negotiation. First-floor cabins require six months’ rent in advance.</p>
          <CabinMap list={cabinList} chosen={cabin?.code} />
        </>}
        {item.id === "kit" && <>
          {equipment.length > 0 && <ul className="book-items" aria-label="Equipment">
            {equipment.map(p => <li key={p.product}><button type="button" aria-pressed={p.product === kit?.product} disabled={p.status !== "available"}
              onClick={() => choose({ item: "kit", product: p.product })}><strong>{p.name}</strong><span>{lowestRent([p])[0]}{p.status !== "available" ? " · " + statusLabel[p.status] : ""}</span></button></li>)}
          </ul>}
          {equipment.length > 0 && <p className="book-note"><Link to={kit ? `/bookings/equipment/${encodeURIComponent(kit.product)}` : "/bookings/equipment"}>
            {kit ? `Specs, photos and what's in the box for ${kit.name}` : "Compare specs, photos and what's in the box"}</Link></p>}
          <RentalBooking key={kit?.product ?? "kit"} initialProduct={kit?.product} />
        </>}
        {item.id === "event" && (eventCheckoutAvailable ? <EventBooking /> : <p className="book-note">Event bookings open soon. To book the demo floor now, write to <a href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a>.</p>)}
      </div>
    </section>}
  </>;
}

export { default as MyBookingsPage } from "./MyBookingsPage";
