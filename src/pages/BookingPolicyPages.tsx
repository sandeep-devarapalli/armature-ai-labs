import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { EmptyState, Field, PageHeader, Section } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import "./BookingPolicyPages.css";
import { BookingFloorMap, type WorkspacePlace } from "../components/BookingFloorMap";
import { Link, useNavigate } from "react-router-dom";
import { BookingInventoryAdmin } from "../components/BookingInventoryAdmin";

type Product = { id: string; code: string; name: string; kind: string; unit: string; price_paise: number | null; enabled: boolean };
type PassEntitlement = { id: string; product_id: string; resource_id: string | null; starts_at: string; ends_at: string };
type RenewalPreference = { product_id: string; resource_id: string; enabled: boolean };
type Quote = { seats?: number; starts_on: string; ends_on: string; dates: string[]; configured: boolean; total_paise: number | null; closed_dates: { date: string; reason: string }[] };
const value = (fields: FormData, name: string) => String(fields.get(name) ?? "");
const money = (value: number | null) => value === null ? "Price not configured" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value / 100);
const dateLabel = (value: string) => new Date(`${value}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

export function PassSelectionPage() {
  const navigate = useNavigate();
  const { account } = useAccount();
  const [entitlements, setEntitlements] = useState<PassEntitlement[]>([]);
  const [renewals, setRenewals] = useState<RenewalPreference[]>([]);
  const [renewalMessage, setRenewalMessage] = useState("");
  const { state, teamAccess, refresh: refreshBookings, online } = useApp();
  const [policies, setPolicies] = useState<{ resource_id: string; kind: string }[]>([]);
  const [resourceId, setResourceId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState("");
  const [date, setDate] = useState("");
  const [dates, setDates] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [places, setPlaces] = useState<WorkspacePlace[]>([]);
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [bookingAccount, setBookingAccount] = useState("personal");
  const [reservationMessage, setReservationMessage] = useState("");
  const teamAdmins = teamAccess.filter(team => team.role === "admin" && team.membershipActive && team.seatEnabled);
  const product = products.find((item) => item.id === selected);
  const requestContext = useRef("");
  requestContext.current = JSON.stringify([account?.user_id, selected, date, dates, bookingAccount, resourceId]);
  const mapped = product?.kind === "workspace" || product?.kind === "cabin";
  useEffect(() => { setPlaces([]); setQuote(null); setReview(false); setConfirmed(false); setReservationMessage(""); }, [selected, date, dates, account?.user_id]);
  async function checkPlaces() {
    if (!supabase || !product) return;
    const chosen = product.unit === "day" ? dates : [date];
    if (!chosen.length || !chosen[0]) { setError("Select at least one date."); return; }
    const context = requestContext.current;
    setWorking(true); setError(""); setPlaces([]); setReview(false); setQuote(null);
    try {
      const result = await supabase.rpc("get_workspace_availability", { p_product_id: selected, p_dates: chosen });
      if (context !== requestContext.current) return;
      if (result.error) throw result.error;
      setResourceId("");
      setPlaces(result.data as WorkspacePlace[]);
    } catch (reason) { if (context === requestContext.current) setError((reason as Error).message ?? "Unable to check availability."); }
    finally { setWorking(false); }
  }
  async function reserve() {
    if (!supabase || !confirmed || !resourceId || !product || !online) return;
    const context = requestContext.current;
    setWorking(true); setError("");
    try {
      const result = await supabase.rpc("reserve_workspace_pass", { p_resource_id: resourceId, p_product_id: selected, p_dates: product.unit === "day" ? dates : [date], p_organization_id: bookingAccount === "personal" ? null : bookingAccount });
      if (context !== requestContext.current) return;
      if (result.error) throw result.error;
      setReservationMessage("Reservation confirmed. View the dated records in My bookings.");
      setReview(false); setConfirmed(false); setPlaces([]); setResourceId(""); navigate("/bookings"); await refreshBookings();
    } catch (reason) { if (context !== requestContext.current) return; setError((reason as Error).message ?? "Reservation failed. Check availability again."); setReview(false); setConfirmed(false); setPlaces([]); setResourceId(""); }
    finally { setWorking(false); }
  }
  useEffect(() => { let active = true; if (supabase) void supabase.from("booking_products").select("id,code,name,kind,unit,price_paise,enabled").order("name").then(({ data, error: failure }) => { if (!active) return; if (failure) setError(failure.message); else setProducts((data ?? []) as Product[]); }); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; if (supabase) void supabase.from("resource_booking_policies").select("resource_id,kind").then(({ data, error: failure }) => { if (active) { if (failure) setError(failure.message); else setPolicies(data ?? []); } }); return () => { active = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (!supabase || !account?.user_id) { setEntitlements([]); setRenewals([]); return; }
    void Promise.all([supabase.from("paid_access_entitlements").select("id,product_id,resource_id,starts_at,ends_at").eq("user_id", account.user_id).is("revoked_at", null).order("created_at", { ascending: false }).limit(100), supabase.from("access_renewal_preferences").select("product_id,resource_id,enabled").eq("user_id", account.user_id)]).then(([passes, preferences]) => { if (!active) return; const failure = passes.error ?? preferences.error; if (failure) setError(failure.message); else { setEntitlements(passes.data ?? []); setRenewals(preferences.data ?? []); } });
    return () => { active = false; };
  }, [account?.user_id]);
  async function changeRenewal(pass: PassEntitlement, enabled: boolean) {
    const passResourceId = pass.resource_id;
    if (!supabase || !passResourceId) return;
    setWorking(true); setError(""); setRenewalMessage("");
    try {
      const result = await supabase.rpc("set_access_renewal", { p_entitlement_id: pass.id, p_enabled: enabled });
      if (result.error) throw result.error;
      setRenewals((current) => [...current.filter((item) => item.product_id !== pass.product_id || item.resource_id !== pass.resource_id), { product_id: pass.product_id, resource_id: passResourceId, enabled }]);
      setRenewalMessage("Renewal preference saved; automatic billing remains unavailable.");
    } catch (reason) { setError((reason as Error).message ?? "Unable to save renewal preference."); }
    finally { setWorking(false); }
  }
  function addDate() {
    if (!date) return;
    setError(""); setQuote(null);
    if (dates.length && dates[0].slice(0, 7) !== date.slice(0, 7)) { setError("Choose day-pass dates within the same calendar month."); return; }
    setDates((current) => [...new Set([...current, date])].sort());
  }
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !product) return;
    const chosen = product.unit === "day" ? dates : [date];
    if (!chosen.length || !chosen[0]) { setError("Select at least one date."); return; }
    const context = requestContext.current;
    setWorking(true); setError(""); setQuote(null);
    try {
      const result = await supabase.rpc("quote_access_pass", { p_product_id: selected, p_dates: chosen, p_discount_percent: 0, p_resource_id: resourceId || null });
      if (context !== requestContext.current) return;
      if (result.error) throw result.error;
      setQuote(result.data as Quote);
      if (mapped) { setReview(true); setConfirmed(false); }
    } catch (reason) { if (context === requestContext.current) setError((reason as Error).message ?? "Unable to calculate dates."); }
    finally { setWorking(false); }
  }
  const renewablePasses = [...new Map(entitlements.filter((pass) => pass.resource_id && products.some((product) => product.id === pass.product_id && ["week", "month"].includes(product.unit))).map((pass) => [`${pass.product_id}:${pass.resource_id}`, pass])).values()];
  return <>
    <PageHeader meta="Member workspace · access planning" title="Choose your lab access" description="Review your dates and closures before paid access opens. Reservations require an existing dated access entitlement. Payment collection remains disabled." />
    <Section number="01" title="Pass dates">
      <p className="lede">Standard workspace passes cover 09:00–17:00 IST. A week is seven consecutive days; a monthly pass covers the first through the last day of the calendar month. Overnight access is separate, adult-only, 23:00–08:00.</p>
      <form className="inline-form booking-policy-form" onSubmit={(event) => void calculate(event)}>
        <Field label="Access product"><select required disabled={working} value={selected} onChange={(event) => { setSelected(event.target.value); setResourceId(""); setDates([]); setDate(""); setQuote(null); setError(""); }}><option value="">Select a pass</option>{products.filter((item) => ["day", "week", "month"].includes(item.unit)).map((item) => <option key={item.id} value={item.id}>{item.name} · {money(item.price_paise)}</option>)}</select></Field>
        {product && <>{!mapped && <Field label="Pass resource"><select required disabled={working} value={resourceId} onChange={(event) => { setResourceId(event.target.value); setQuote(null); }}><option value="">Choose resource</option>{state.resources.filter((item) => policies.some((policy) => policy.resource_id === item.id && (product.kind === "overnight" ? ["workspace", "cabin"].includes(policy.kind) : policy.kind === product.kind))).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}<Field label={product.unit === "month" ? "First day of the month" : product.unit === "week" ? "Week start date" : "Day-pass date"}><input type="date" disabled={working} value={date} required={product.unit !== "day"} onChange={(event) => { setDate(event.target.value); setQuote(null); }} /></Field>{product.unit === "day" && <><button type="button" className="button button-quiet" disabled={working} onClick={addDate}>Add date</button><ul>{dates.map((day) => <li key={day}>{dateLabel(day)} <button type="button" className="button button-quiet" aria-label={`Remove ${day}`} disabled={working} onClick={() => { setDates((current) => current.filter((item) => item !== day)); setQuote(null); }}>Remove</button></li>)}</ul></>}{mapped ? <button className="button button-primary" type="button" disabled={working || !online} onClick={() => void checkPlaces()}>{working ? "Checking…" : "Check chair availability"}</button> : <button className="button button-primary" type="submit" disabled={working}>{working ? "Checking…" : "Check dates and price"}</button>}</>}
      </form>
      {mapped && product && !product.enabled && <p role="status">This pass is disabled by the lab. Availability and reservations remain unavailable until it is enabled.</p>}
      {mapped && places.length > 0 && <><fieldset disabled={working} className="booking-map-fieldset"><BookingFloorMap places={places} selectedId={resourceId} cabin={product?.kind === "cabin"} onSelect={id => { setResourceId(id); setReview(false); setQuote(null); setConfirmed(false); }} /></fieldset>
        <Field label="Booking account"><select disabled={working} value={bookingAccount} onChange={event => { setBookingAccount(event.target.value); setQuote(null); setReview(false); setConfirmed(false); }}><option value="personal" disabled={product?.kind === "cabin"}>Personal membership</option>{teamAdmins.map(team => <option key={team.organizationId} value={team.organizationId}>{team.organizationName} · team admin</option>)}</select></Field>
        {product?.kind === "cabin" && <p>Book all six seats together using an active team-admin account. Individual cabin seats are not sold.</p>}
        <form onSubmit={event => void calculate(event)}><button className="button button-primary" disabled={working || !resourceId || (product?.kind === "cabin" && bookingAccount === "personal")}>Review reservation</button></form></>}
      {reservationMessage && <p role="status">{reservationMessage} <Link to="/bookings">My bookings</Link></p>}
      {quote && <div className="inline-form" role="status"><h3>{dateLabel(quote.starts_on)} – {dateLabel(quote.ends_on)}</h3><p>{quote.dates.map(dateLabel).join(" · ")}</p><p>{quote.seats ?? 1} seat{quote.seats === 1 ? "" : "s"} included in this quote.</p><p>{quote.configured ? money(quote.total_paise) : "Price not configured. Paid activation remains unavailable."}</p><h4>Government and mandatory closures</h4><p>{quote.closed_dates.length ? quote.closed_dates.map((day) => `${dateLabel(day.date)}: ${day.reason}`).join(" · ") : "No closures recorded for these dates. The lab must confirm its holiday calendar before launch."}</p></div>}
      {review && quote && <div className="inline-form"><h3>Confirm {places.find(place => place.resource_id === resourceId)?.code}</h3><p>09:00–17:00 IST on the dates above. This reserves existing access; it does not purchase a pass or charge a payment.</p><label className="team-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I confirm these dates and this chair or whole cabin.</label><button type="button" className="button button-primary" disabled={!confirmed || working || !online} onClick={() => void reserve()}>Confirm reservation</button></div>}
      {!products.length && !error && <EmptyState title="Pass catalogue unavailable">A lab admin must configure products before a quote can be prepared.</EmptyState>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </Section>
    {entitlements.length > 0 && <Section number="02" title="Your pass renewal preferences"><p>Only your personal week and month passes support a renewal preference. This does not charge you or extend access.</p>{renewablePasses.map((pass) => <label className="team-check" key={pass.id}><input type="checkbox" disabled={working} checked={renewals.some((item) => item.product_id === pass.product_id && item.resource_id === pass.resource_id && item.enabled)} onChange={(event) => void changeRenewal(pass, event.target.checked)} /> Renew {products.find((product) => product.id === pass.product_id)?.name} · {state.resources.find((resource) => resource.id === pass.resource_id)?.name ?? "Selected resource"}</label>)}{renewalMessage && <p role="status">{renewalMessage}</p>}</Section>}
    <Section number="03" title="Included with workspace and cabin access"><p className="lede">Unlimited pantry essentials include milk, juices, Maggi and eggs. Outside food delivery is welcome; clean up after use. Equipment access is an additional subscription and requires workspace access for the same time. All equipment stays inside the lab.</p><p>Day passes do not renew automatically. Week and month passes can record a renewal preference below. Automatic billing and payment collection remain unavailable in this preview.</p></Section>
  </>;
}

export function AdminAccessPage() {
  const { account, loading } = useAccount();
  const { state } = useApp();
  const allowed = account?.role === "admin" || account?.role === "super_admin";
  const [products, setProducts] = useState<Product[]>([]);
  const [organizations, setOrganizations] = useState<{ id: string; name: string }[]>([]);
  const [testProduct, setTestProduct] = useState("");
  const [testOwner, setTestOwner] = useState("personal");
  const [entitlements, setEntitlements] = useState<{ id: string; user_id: string | null; organization_id: string | null; product_id: string; starts_at: string; ends_at: string; revoked_at: string | null }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [closures, setClosures] = useState<{ id: string; closed_on: string; reason: string; location_id: string }[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const refresh = useCallback(async () => {
    if (!allowed || !supabase) return;
    const [catalogue, sites, calendar, grants, teams] = await Promise.all([supabase.from("booking_products").select("id,code,name,kind,unit,price_paise,enabled").order("name"), supabase.from("locations").select("id,name"), supabase.from("booking_closures").select("id,closed_on,reason,location_id").order("closed_on"), supabase.from("paid_access_entitlements").select("id,user_id,organization_id,product_id,starts_at,ends_at,revoked_at").order("created_at", { ascending: false }).limit(100), supabase.from("organizations").select("id,name").order("name")]);
    const failure = catalogue.error ?? sites.error ?? calendar.error ?? grants.error ?? teams.error;
    if (failure) { setError(failure.message); return; }
    setProducts((catalogue.data ?? []) as Product[]); setLocations(sites.data ?? []); setClosures(calendar.data ?? []); setEntitlements(grants.data ?? []); setOrganizations(teams.data ?? []);
  }, [allowed]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function run(operation: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!supabase || !allowed) return;
    setWorking(true); setError(""); setMessage("");
    try { const result = await operation(); if (result.error) throw result.error; setMessage("Saved."); await refresh(); }
    catch (reason) { setError((reason as Error).message ?? "Changes could not be saved."); }
    finally { setWorking(false); }
  }
  function grantMock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    if (value(fields, "confirmed") !== "on") return;
    const grantResourceId = value(fields, "resource");
    if (!grantResourceId) { setError("Select a configured resource."); return; }
    const common = { p_user_id: testOwner === "personal" ? value(fields, "member") : null, p_product_id: value(fields, "product"), p_resource_id: grantResourceId, p_discount_percent: Number(value(fields, "discount")), p_organization_id: testOwner === "team" ? value(fields, "organization") : null };
    if (hourly) {
      const start = new Date(value(fields, "start") + "+05:30");
      const end = new Date(value(fields, "end") + "+05:30");
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setError("Choose an access end time after its start time."); return; }
      void run(() => supabase!.rpc("grant_mock_resource_access", { ...common, p_starts_at: start.toISOString(), p_ends_at: end.toISOString(), p_daytime_event_approved: value(fields, "daytimeApproved") === "on" }));
    } else void run(() => supabase!.rpc("grant_mock_access", { ...common, p_dates: value(fields, "dates").split(",").map((date) => date.trim()).filter(Boolean), p_seats: Number(value(fields, "seats")) }));
  }
  const hourly = products.find((item) => item.id === testProduct)?.unit === "hour";
  if (loading) return <div className="route-loading mono">Checking lab administration access…</div>;
  if (!allowed) return <PageHeader title="Lab admin access required" description="Only website Admins and Super admins can manage prices, closures and paid entitlements." />;
  return <>
    <PageHeader meta="Lab administration" title="Access, prices and closures" description="Keep unconfirmed prices empty. These controls do not activate payments or open public bookings." />
    <Section number="01" title="Prices and availability">{products.map((product) => <form className="inline-form booking-policy-form" key={`${product.id}-${product.price_paise}-${product.enabled}`} onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); const rupees = String(value(fields, "price")); void run(() => supabase!.rpc("configure_booking_product", { p_id: product.id, p_price_paise: rupees === "" ? null : Math.round(Number(rupees) * 100), p_enabled: value(fields, "enabled") === "on" })); }}><h3>{product.name}</h3><div className="form-grid"><Field label={`Price in rupees · ${product.name}`} hint={`${["workspace", "cabin", "overnight"].includes(product.kind) ? "Per seat per" : "Per"} ${product.unit}; taxes and launch terms must be confirmed separately.`}><input name="price" type="number" min="0" step="0.01" defaultValue={product.price_paise === null ? "" : product.price_paise / 100} placeholder="Unconfigured" /></Field><label className="team-check"><input name="enabled" type="checkbox" defaultChecked={product.enabled} /> Product available</label></div><button className="button button-primary" disabled={working}>Save product</button></form>)}</Section>
    <Section number="02" title="Holiday calendar"><form className="inline-form booking-policy-form" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); void run(() => supabase!.rpc("set_booking_closure", { p_location_id: value(fields, "location"), p_closed_on: value(fields, "date"), p_reason: value(fields, "reason"), p_closed: true })); }}><div className="form-grid"><Field label="Lab location"><select name="location" required defaultValue=""><option value="">Select location</option>{locations.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></Field><Field label="Closed date"><input name="date" type="date" required /></Field><Field label="Closure reason"><input name="reason" required maxLength={200} /></Field></div><button className="button button-primary" disabled={working}>Add closure</button></form><ul>{closures.map((day) => <li key={day.id}>{dateLabel(day.closed_on)} · {day.reason} <button className="button button-quiet" type="button" disabled={working} onClick={() => { if (window.confirm(`Remove the closure on ${dateLabel(day.closed_on)}?`)) void run(() => supabase!.rpc("set_booking_closure", { p_location_id: day.location_id, p_closed_on: day.closed_on, p_reason: day.reason, p_closed: false })); }}>Remove closure</button></li>)}</ul></Section>
    {import.meta.env.DEV && <Section number="03" title="Synthetic access test"><p className="lede">Local test only. This does not charge a card or confirm a real payment.</p><form className="inline-form booking-policy-form" onSubmit={grantMock}><div className="form-grid"><Field label="Access owner"><select value={testOwner} onChange={(event) => setTestOwner(event.target.value)}><option value="personal">Personal</option><option value="team">Team</option></select></Field>{testOwner === "team" ? <Field label="Test team"><select name="organization" required><option value="">Choose team</option>{organizations.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></Field> : <Field label="Test member"><select name="member" required><option value="">Select member</option>{state.profiles.map((person) => <option key={person.id} value={person.id}>{person.name || person.handle}</option>)}</select></Field>}<Field label="Test product"><select name="product" required value={testProduct} onChange={(event) => setTestProduct(event.target.value)}><option value="">Select product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Specific resource"><select name="resource" required><option value="">Choose a configured resource</option>{state.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></Field>{hourly ? <><Field label="Access start · IST"><input name="start" type="datetime-local" required /></Field><Field label="Access end · IST"><input name="end" type="datetime-local" required /></Field><label className="team-check"><input name="daytimeApproved" type="checkbox" /> Approve weekday daytime event</label></> : <Field label="Dates" hint="YYYY-MM-DD, separated by commas. Week uses its start date; month uses its first day."><input name="dates" required /></Field>}<Field label="Seats"><input name="seats" type="number" min="1" required defaultValue="1" /></Field><Field label="Discount percent"><input name="discount" type="number" min="0" max="100" required defaultValue="0" /></Field></div><label className="team-check"><input name="confirmed" type="checkbox" required /> This is synthetic local test data</label><button className="button button-primary" disabled={working}>Grant mock access</button></form></Section>}
    <Section number="04" title="Resource booking rules"><form className="inline-form booking-policy-form" onSubmit={(event) => { event.preventDefault(); const fields = new FormData(event.currentTarget); void run(() => supabase!.rpc("configure_resource_booking_policy", { p_resource_id: value(fields, "resource"), p_kind: value(fields, "kind") })); }}><div className="form-grid"><Field label="Policy resource"><select name="resource" required><option value="">Choose resource</option>{state.resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}</select></Field><Field label="Booking policy"><select name="kind" required defaultValue=""><option value="" disabled>Choose policy</option><option value="workspace">Workspace</option><option value="cabin">Cabin</option><option value="equipment">Equipment add-on</option><option value="event">Event space</option></select></Field></div><button className="button button-primary" disabled={working}>Save resource policy</button></form><p>Event bookings promise 35 seats, include four mics, speakers and a presentation screen, and reserve 20 minutes before and after. Weekday daytime events need lab-admin approval.</p></Section>
    <Section number="05" title="Recent access entitlements"><p>Showing up to 100 recent records. These records are separate from basic membership and team roles.</p><div className="table-wrap"><table><thead><tr><th>Holder</th><th>Product</th><th>Dates · IST</th><th>Status</th><th>Action</th></tr></thead><tbody>{entitlements.map((item) => <tr key={item.id}><td>{item.organization_id ? organizations.find((team) => team.id === item.organization_id)?.name ?? "Team" : state.profiles.find((person) => person.id === item.user_id)?.name ?? "Member"}</td><td>{products.find((product) => product.id === item.product_id)?.name}</td><td>{new Date(item.starts_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} – {new Date(item.ends_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td><td>{item.revoked_at ? "Revoked" : "Granted"}</td><td>{!item.revoked_at && <button className="button button-quiet" type="button" disabled={working} onClick={() => { if (window.confirm("Revoke this paid-access entitlement? Basic membership and team roles remain unchanged.")) void run(() => supabase!.rpc("revoke_paid_access", { p_entitlement_id: item.id })); }}>Revoke access</button>}</td></tr>)}</tbody></table></div></Section>
    <BookingInventoryAdmin />
    {error && <p className="form-error wrap" role="alert">{error}</p>}{message && <p className="success-message wrap" role="status">{message}</p>}
  </>;
}
