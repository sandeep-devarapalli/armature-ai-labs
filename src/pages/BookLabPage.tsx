import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CabinMap } from "../components/CabinMap";
import { DeskBooking } from "../components/DeskCheckout";
import { PageHeader } from "../components/Primitives";
import { RentalBooking } from "../components/RentalCheckout";
import { deskCheckoutAvailable, rentalCheckoutAvailable } from "../config/release";
import { useAccount } from "../context/AccountContext";
import { cabins, formatPaise, seatPaise, statusLabel } from "../lib/cabins";
import { rentalRequest, type RentalProduct } from "../lib/rental-checkout";

type Row = { id: "desk" | "cabin" | "kit" | "event"; name: string; summary: string; prices: string[]; deposit: string; minimum: string; cancellation: string };

const lowestRent = (items: RentalProduct[]) => {
  const rents = items.flatMap(p => [p.dayRentPaise && [p.dayRentPaise, "day"], p.weekRentPaise && [p.weekRentPaise, "7 days"], p.monthRentPaise && [p.monthRentPaise, "30 days"]])
    .filter((r): r is [number, string] => Boolean(r)).sort((a, b) => a[0] - b[0]);
  return rents.length ? [`From ${formatPaise(rents[0][0])} / ${rents[0][1]}`] : ["Varies by item"];
};

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
  const cabinList = cabins.map(c => { const live = products.find(p => p.kind === "cabin" && p.room === c.room); return live ? { ...c, status: live.status } : c; });
  const rows: Row[] = [
    ...(deskCheckoutAvailable ? [{ id: "desk", name: "Desk pass", summary: "A chair on the lab floor, by the day, week or month.",
      prices: [`${formatPaise(35000)} / day`, `${formatPaise(175000)} / 7 days`, `${formatPaise(1300000)} / calendar month`], deposit: "None", minimum: "1 day",
      cancellation: "48 hours or more before the start: full refund" } as Row] : []),
    ...(rentalCheckoutAvailable ? [{ id: "cabin", name: "Team cabins", summary: cabinList.map(c => `${c.name.replace("Cabin ", "")} ${statusLabel[c.status].toLowerCase()}`).join(" · "),
      prices: [`${formatPaise(seatPaise)} / seat a month`], deposit: "To be confirmed", minimum: "1 calendar month",
      cancellation: "30 days or more before the start: full refund" } as Row, { id: "kit", name: "Equipment", summary: "Robot arms and cameras to use in the lab.",
      prices: lowestRent(equipment), deposit: "Shown per item", minimum: "1 day (cameras), 7 days (arms)", cancellation: "48 hours or more before the start: full refund" } as Row] : []),
    { id: "event", name: "Event space", summary: "The demo floor for meetups, launches and live demos.", prices: ["Coming soon"], deposit: "None", minimum: "1 hour",
      cancellation: "48 hours or more before the event: 50% refund" }
  ];
  const item = rows.find(r => r.id === params.get("item"));
  // The #steps hash makes the shell scroll the opened checkout into view.
  const choose = (next: Record<string, string>) => navigate({ search: "?" + new URLSearchParams(next), hash: "steps" });
  const cabin = cabinList.find(c => c.code === params.get("cabin"));
  const cabinProduct = cabin?.status === "available" ? products.find(p => p.kind === "cabin" && p.room === cabin.room)?.product : undefined;
  const kit = equipment.find(p => p.product === params.get("product"));

  return <>
    <PageHeader meta="Workspace bookings" title="Book the lab." description="Compare everything you can book, pick one, and follow the steps below. Nothing is charged until the payment step." />
    <section className="section">
      <div className="wrap">
        <div className="book-table-wrap">
          <table className="book-table">
            <caption className="mono">What you can book</caption>
            <thead><tr><th scope="col">Booking</th><th scope="col">Price</th><th scope="col">Deposit</th><th scope="col">Minimum</th><th scope="col">Cancellation</th><th scope="col"><span className="sr-only">Choose</span></th></tr></thead>
            <tbody>
              {rows.map(row => <tr key={row.id} className={row.id === item?.id ? "is-selected" : ""}>
                <th scope="row"><strong>{row.name}</strong><small>{row.summary}</small></th>
                <td data-label="Price">{row.prices.map(p => <span key={p} className="book-price">{p}</span>)}</td>
                <td data-label="Deposit">{row.deposit}</td>
                <td data-label="Minimum">{row.minimum}</td>
                <td data-label="Cancellation"><small>{row.cancellation}</small></td>
                <td><button type="button" className={row.id === item?.id ? "button button-primary" : "button button-quiet"} aria-pressed={row.id === item?.id}
                  aria-label={`${row.id === item?.id ? "Selected" : "Choose"} ${row.name.toLowerCase()}`} onClick={() => choose({ item: row.id })}>{row.id === item?.id ? "Selected" : "Choose"}</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="book-note">Armature is not GST-registered, so no GST is added.</p>
      </div>
    </section>
    {item && <section className="section" id="steps" aria-labelledby="steps-title">
      <div className="wrap">
        <h2 id="steps-title">{item.name}</h2>
        {item.id === "desk" && <DeskBooking />}
        {item.id === "cabin" && <>
          <CabinMap list={cabinList} chosen={cabin?.code} onChoose={code => choose({ item: "cabin", cabin: code })} />
          {cabinProduct ? <RentalBooking key={cabinProduct} initialProduct={cabinProduct} />
            : <p className="book-note">{cabinList.some(c => c.status === "available") ? "Pick an available cabin on the plan, then choose Book." : "No cabin is open for booking yet."} To ask about a cabin, write to <a href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a>.</p>}
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
        {item.id === "event" && <p className="book-note">Event bookings open soon. To book the demo floor now, write to <a href="mailto:hello@armatureailabs.com">hello@armatureailabs.com</a>.</p>}
      </div>
    </section>}
  </>;
}
