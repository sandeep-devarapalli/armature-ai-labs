import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import { useAccount } from "../context/AccountContext";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { labInstant } from "../lib/bookingTime";
import { BookingFloorMap, type WorkspacePlace } from "./BookingFloorMap";

type Unit = { unit_id: string; component_slug: string; resource_id: string; name: string; rate_id: string; charge_unit: "hour" | "day"; price_paise: number; tax_bps: number; valid_until: string | null };
type Quote = { id: string; amount_paise: number; tax_paise: number; total_paise: number; expires_at: string; payment_state: "unpaid" | "authorized" | "captured" };
type Product = { id: string; name: string };
const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const client = supabase as SupabaseClient | null;

export function EquipmentRentalBooking({ slug }: { slug: string }) {
  const { account } = useAccount();
  if (!account || account.status !== "approved") return <p>Approved basic membership is required for equipment access. <Link to="/onboarding">Open my registration</Link>.</p>;
  return <RentalForm key={`${account.user_id}:${slug}`} slug={slug} />;
}

function RentalForm({ slug }: { slug: string }) {
  const { teamAccess } = useApp();
  const { account } = useAccount();
  const [organizationId, setOrganizationId] = useState("");
  const [operatorId, setOperatorId] = useState(account!.user_id);
  const [roster, setRoster] = useState<{ user_id: string; display_name: string; seat_enabled: boolean }[]>([]);
  const [parents, setParents] = useState<{ id: string; ends_at: string }[]>([]);
  const [parentId, setParentId] = useState("");
  const team = teamAccess.find(item => item.organizationId === organizationId);
  const [units, setUnits] = useState<Unit[]>([]);
  const [rateId, setRateId] = useState("");
  const [date, setDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [combined, setCombined] = useState(false);
  const [bookings, setBookings] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [places, setPlaces] = useState<WorkspacePlace[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState("");
  const context = useRef("");
  context.current = JSON.stringify([rateId, date, endDate, start, end, combined, bookings, productId, resourceId, organizationId, operatorId, parentId]);
  const unit = units.find(item => item.rate_id === rateId);
  const [workspaceBookings, setWorkspaceBookings] = useState<{ id: string; name: string; starts_at: string; ends_at: string }[]>([]);
  useEffect(() => {
    let active = true;
    if (!client) return;
    void Promise.all([client.rpc("get_equipment_rental_options"), client.from("booking_products").select("id,name").eq("kind", "workspace").eq("unit", "day").eq("enabled", true)]).then(([options, passes]) => {
      if (!active) return;
      const failure = options.error ?? passes.error;
      if (failure) setError(failure.message);
      else { setUnits(((options.data ?? []) as Unit[]).filter(item => item.component_slug === slug)); setProducts(passes.data ?? []); }
    });
    return () => { active = false; };
  }, [slug]);
  useEffect(() => {
    setOperatorId(account!.user_id); setBookings([]); setResourceId(""); setPlaces([]); setRoster([]); setParentId("");
    let active = true; setWorkspaceBookings([]);
    void client!.rpc("get_equipment_workspace_coverage", { p_organization_id: organizationId || null }).then(result => {
      if (!active) return;
      if (result.error) setError(result.error.message); else setWorkspaceBookings(result.data ?? []);
    });
    if (organizationId && team?.role === "admin") void client!.rpc("list_team_roster", { p_organization_id: organizationId }).then(result => {
      if (!active) return;
      if (result.error) setError(result.error.message); else { setRoster(result.data ?? []); if (!result.data?.some((member: { user_id: string; seat_enabled: boolean }) => member.user_id === account!.user_id && member.seat_enabled)) setOperatorId(""); }
    });
    return () => { active = false; };
  }, [organizationId, team?.role, account!.user_id]);
  useEffect(() => {
    let active = true; setParents([]); setParentId("");
    if (!unit || !operatorId) return;
    void client!.rpc("get_equipment_rental_extensions", { p_unit_id: unit!.unit_id, p_operator_id: operatorId || null, p_organization_id: organizationId || null }).then(result => {
      if (!active) return;
      if (result.error) setError(result.error.message); else setParents(result.data ?? []);
    });
    return () => { active = false; };
  }, [rateId, operatorId, organizationId]);
  useEffect(() => { setQuote(null); setOrder(""); }, [rateId, date, endDate, start, end, combined, bookings, productId, resourceId, organizationId, operatorId, parentId]);
  useEffect(() => { setPlaces([]); setResourceId(""); }, [date, endDate, rateId, productId]);
  function dates() {
    if (!date) throw new Error("Choose a session date.");
    const last = unit?.charge_unit === "day" ? endDate || date : date;
    const first = labInstant(`${date}T09:00`), final = labInstant(`${last}T09:00`);
    const count = Math.round((final.getTime() - first.getTime()) / 86_400_000) + 1;
    if (count < 1 || count > 31) throw new Error("Choose up to 31 consecutive days, with the end date after the start.");
    return Array.from({ length: count }, (_, index) => new Date(Date.parse(`${date}T12:00:00Z`) + index * 86_400_000).toISOString().slice(0, 10));
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (failure) { setError((failure as Error).message || "Unable to complete the request."); }
    finally { setBusy(false); }
  }
  async function checkChairs() {
    const key = context.current;
    const result = await client!.rpc("get_workspace_availability", { p_product_id: productId, p_dates: dates() });
    if (key !== context.current) return;
    if (result.error) throw result.error;
    setPlaces(result.data as WorkspacePlace[]);
  }
  async function readQuote(id: string, key: string) {
    const result = await client!.from("equipment_rental_quotes").select("id,amount_paise,tax_paise,total_paise,expires_at,payment_state").eq("id", id).single();
    if (key !== context.current) return;
    if (result.error) throw result.error;
    setQuote(result.data as Quote);
  }
  async function getQuote() {
    if (!unit) return;
    const chosen = dates(), daily = unit.charge_unit === "day", key = context.current;
    const result = await client!.rpc("create_equipment_rental_quote", { p_rate_id: rateId, p_starts_at: labInstant(`${date}T${daily ? "09:00" : start}`).toISOString(), p_ends_at: labInstant(`${chosen.at(-1)}T${daily ? "17:00" : end}`).toISOString(), p_dates: daily ? chosen : null, p_operator_id: operatorId, p_organization_id: organizationId || null, p_parent_order_id: parentId || null });
    if (key !== context.current) return;
    if (result.error) throw result.error;
    await readQuote(result.data as string, key);
  }
  async function reserve() {
    if (!quote || quote.payment_state !== "authorized") return;
    const key = context.current;
    const result = await client!.rpc("reserve_equipment_rental", { p_quote_id: quote.id, p_workspace_booking_ids: combined ? null : bookings, p_workspace_resource_id: combined ? resourceId : null, p_workspace_product_id: combined ? productId : null, p_workspace_dates: combined ? dates() : null, p_organization_id: organizationId || null });
    if (key !== context.current) return;
    if (result.error) throw result.error;
    setOrder(result.data as string); setQuote(null);
  }
  return <section className="equipment-rental-preview" aria-label="Equipment rental draft">
    <h3>Equipment rental · local test</h3><p>Local preparation only. Team admins can select an enabled named member as the equipment operator; website Admin status alone does not grant team access. Training, same-lab paid workspace access and current rates are checked by the server. No real payment processing is enabled.</p>
    {error && <p role="alert">{error}</p>}
    {!units.length && <p>No commissioned unit with an approved rate and tax configuration is available for this item.</p>}
    <fieldset disabled={busy || Boolean(order)}><legend>Session and workspace</legend><label>Booking account<select value={organizationId} onChange={event => setOrganizationId(event.target.value)}><option value="">Personal</option>{teamAccess.filter(item => item.membershipActive && (item.seatEnabled || item.role === "admin")).map(item => <option key={item.organizationId} value={item.organizationId}>{item.organizationName}</option>)}</select></label>
    {team?.role === "admin" && <label>Equipment operator<select value={operatorId} onChange={event => setOperatorId(event.target.value)}><option value="">Choose an enabled team member</option>{roster.filter(item => item.seat_enabled).map(item => <option key={item.user_id} value={item.user_id}>{item.display_name}</option>)}</select></label>}
    <div className="equipment-rental-fields">
      <label>Commissioned unit<select value={rateId} onChange={event => setRateId(event.target.value)}><option value="">Choose equipment</option>{units.map(item => <option key={item.rate_id} value={item.rate_id}>{item.name} · {money(item.price_paise)}/{item.charge_unit} before tax</option>)}</select></label>
      <label>First date · IST<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      {unit?.charge_unit === "day" ? <label>Last date · inclusive<input type="date" min={date} value={endDate} onChange={event => setEndDate(event.target.value)} /></label> : <><label>Start · IST<input type="time" step="1800" min="09:00" max="16:00" value={start} onChange={event => setStart(event.target.value)} /></label><label>Finish · IST<input type="time" step="1800" min="10:00" max="17:00" value={end} onChange={event => setEnd(event.target.value)} /></label></>}
    </div>
    {parents.length > 0 && <label>Existing rental to extend<select value={parentId} onChange={event => setParentId(event.target.value)}><option value="">New rental</option>{parents.map(item => <option key={item.id} value={item.id}>{item.id} · ends {new Date(item.ends_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</option>)}</select></label>}
    {parentId && <p>Choose a session immediately after the previous rental: the same ending time for hourly equipment, or the next calendar day for daily equipment. The original reservation stays unchanged if the extension fails.</p>}
    <label><input type="checkbox" checked={combined} onChange={event => setCombined(event.target.checked)} />Reserve a chair using an existing paid day-pass entitlement</label>
    {combined ? <><label>Paid workspace product<select value={productId} onChange={event => setProductId(event.target.value)}><option value="">Choose a day pass</option>{products.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" disabled={!productId || !date} onClick={() => void run(checkChairs)}>Check chairs for equipment dates</button>{places.length > 0 && <BookingFloorMap places={places} selectedId={resourceId} onSelect={setResourceId} cabin={false} />}</> : <div><p>Select existing workspace reservations covering every equipment date.</p>{workspaceBookings.map(item => <label key={item.id}><input type="checkbox" checked={bookings.includes(item.id)} onChange={event => setBookings(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />{item.name} · {new Date(item.starts_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</label>)}{!workspaceBookings.length && <p>No confirmed workspace reservations found for this booking account. <Link to="/passes">Open workspace passes</Link>.</p>}</div>}
    <button type="button" disabled={!unit || !date || !operatorId || (combined ? !resourceId : !bookings.length)} onClick={() => void run(getQuote)}>Get equipment quote</button>
    </fieldset>
    {quote && <div aria-label="Rental quote"><p>A quote does not reserve equipment or guarantee availability. The server checks availability, training and workspace coverage again when you confirm.</p><p>Equipment: {money(quote.amount_paise)} · Tax: {money(quote.tax_paise)} · Total: {money(quote.total_paise)}</p><p>Workspace: covered by your existing paid entitlement; no additional workspace charge in this transaction. Consumables are separate and unquoted.</p><p>Quote {quote.id}. Expires {new Date(quote.expires_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p><p>{quote.payment_state === "authorized" ? "Local mock receipt authorized by an Admin." : "Awaiting local Admin mock authorization. No payment has been taken."}</p><button type="button" disabled={busy} onClick={() => void run(() => readQuote(quote.id, context.current))}>Refresh authorization</button><button type="button" disabled={busy || quote.payment_state !== "authorized"} onClick={() => void run(reserve)}>Reserve with authorized test receipt</button></div>}
    {order && <p role="status">Local test reservation created: {order}. <Link to="/bookings">View bookings</Link>.</p>}
  </section>;
}
