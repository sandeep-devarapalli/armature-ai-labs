import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PageHeader, Section, Field } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";
import { labInstant } from "../lib/bookingTime";
import "./AdminEquipmentPage.css";

type Rate = { id: string; charge_unit: "hour" | "day"; price_paise: number; tax_bps: number | null; valid_from: string; valid_until: string | null };
type KitItem = { name: string; quantity: number };
type Unit = { id: string; resource_id: string; asset_unit_id: string; name: string; asset_tag: string; component_slug: string; commissioned: boolean; inventory_location_id: string; location_name: string; lab_location_id: string; kit_contents: KitItem[]; maintenance: boolean; maintenance_note: string | null; rates: Rate[] };
type Snapshot = { workspaceProducts: { id: string; name: string; tax_bps: number | null }[]; units: Unit[]; assets: { id: string; asset_tag: string; component_slug: string; status: string }[]; resources: { id: string; name: string; location_id: string }[]; locations: { id: string; name: string; lab_location_id: string }[] };
const empty: Snapshot = { workspaceProducts: [], units: [], assets: [], resources: [], locations: [] };
const client = supabase as SupabaseClient | null;
const price = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const when = (instant: string) => new Date(instant).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();

export function AdminEquipmentPage() {
  const { account, loading } = useAccount();
  if (loading) return <p role="status">Checking equipment administration access…</p>;
  if (!account || !["admin", "super_admin"].includes(account.role)) return <PageHeader meta="Equipment operations" title="Admin access required" description="Only website Admins and Super admins can manage equipment. Membership-review Staff and team admins cannot change inventory or rates." />;
  return <EquipmentOperations key={account.user_id} />;
}

function EquipmentOperations() {
  const [data, setData] = useState<Snapshot>(empty);
  const [selected, setSelected] = useState("");
  const [kit, setKit] = useState<KitItem[]>([]);
  const [location, setLocation] = useState("");
  const [maintenance, setMaintenance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const unit = data.units.find(item => item.id === selected);
  async function read() {
    if (!client) throw new Error("Equipment administration requires the connected backend.");
    const [result, products] = await Promise.all([client.rpc("admin_list_equipment_operations"), client.from("booking_products").select("id,name,tax_bps").in("kind", ["workspace", "cabin"])]);
    if (result.error || products.error) throw result.error ?? products.error;
    return { ...result.data, workspaceProducts: products.data ?? [] } as Snapshot;
  }
  useEffect(() => {
    let active = true;
    void read().then(value => { if (active) setData(value); }).catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setKit(unit?.kit_contents ?? []); setLocation(unit?.inventory_location_id ?? ""); setMaintenance(unit?.maintenance ?? false); }, [unit]);
  async function mutate(name: string, args: Record<string, unknown>, confirmation: string) {
    if (!client || !window.confirm(confirmation)) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await client.rpc(name, args);
      if (result.error) throw result.error;
      setData(await read()); setMessage("Equipment update saved and audited.");
    } catch (failure) { setError((failure as Error).message || "Equipment update failed."); }
    finally { setBusy(false); }
  }
  function commission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget);
    const asset = data.assets.find(item => item.id === field(fields, "asset"));
    const resource = data.resources.find(item => item.id === field(fields, "resource"));
    if (!asset || !resource) return;
    void mutate("configure_equipment_rental_unit", { p_asset_unit_id: asset.id, p_resource_id: resource.id, p_commissioned: fields.get("commissioned") === "yes", p_reason: field(fields, "reason") }, `Link physical asset ${asset.asset_tag} to ${resource.name} and ${fields.get("commissioned") === "yes" ? "commission it" : "keep it uncommissioned"}? This does not activate payment processing.`);
  }
  function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!unit) return;
    const fields = new FormData(event.currentTarget);
    void mutate("admin_update_equipment_unit", { p_unit_id: unit.id, p_inventory_location_id: location, p_kit_contents: kit, p_maintenance: maintenance, p_note: field(fields, "reason") }, `Update ${unit.asset_tag}: ${maintenance ? "place in maintenance" : "release from maintenance"}, location ${data.locations.find(item => item.id === location)?.name}, and ${kit.length} kit items? Existing bookings require separate review.`);
  }
  function approveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!unit) return;
    const fields = new FormData(event.currentTarget), rupees = Number(field(fields, "price")), tax = Number(field(fields, "tax"));
    if (!field(fields, "tax") || !Number.isFinite(tax) || tax < 0 || tax > 100 || !Number.isFinite(rupees) || rupees <= 0) { setError("Enter a positive price and an explicitly approved tax percentage, including 0 only when approved."); return; }
    let starts: string;
    try { starts = labInstant(field(fields, "starts")).toISOString(); } catch (failure) { setError((failure as Error).message); return; }
    const prior = field(fields, "previous");
    const charge = unit.rates.find(rate => rate.id === prior)?.charge_unit ?? field(fields, "charge");
    const args = prior ? { p_current_rate_id: prior, p_price_paise: Math.round(rupees * 100), p_tax_bps: Math.round(tax * 100), p_effective_from: starts, p_valid_until: null, p_reason: field(fields, "reason") } : { p_unit_id: unit.id, p_charge_unit: charge, p_price_paise: Math.round(rupees * 100), p_tax_bps: Math.round(tax * 100), p_valid_from: starts, p_valid_until: null, p_reason: field(fields, "reason") };
    void mutate(prior ? "admin_replace_equipment_rate" : "admin_approve_equipment_rate", args, `Approve ${price(Math.round(rupees * 100))}/${charge} + ${tax}% tax for ${unit.asset_tag}, starting ${when(starts)} IST? Uncaptured quotes crossing the new rate boundary must be quoted again. Captured reservations retain their recorded price.`);
  }
  function workspaceTax(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const fields = new FormData(event.currentTarget), product = data.workspaceProducts.find(item => item.id === field(fields, "product"));
    const tax = Number(field(fields, "tax"));
    if (!product || !field(fields, "tax") || !Number.isFinite(tax) || tax < 0 || tax > 100) return;
    void mutate("configure_workspace_tax", { p_product_id: product.id, p_tax_bps: Math.round(tax * 100), p_reason: field(fields, "reason") }, `Set the approved tax for ${product.name} to ${tax}%? This does not activate sales or payments.`);
  }
  return <>
    <PageHeader meta="Admin · local rental preparation" title="Equipment operations" description="Manage recorded physical assets, kit contents, maintenance and approved rental rates. Catalogue plans do not create stock. Payment providers and production booking release remain on hold." />
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <Section number="01" title="Physical rental units"><div className="admin-equipment-grid">{data.units.map(item => <button className="admin-equipment-unit" type="button" key={item.id} aria-pressed={selected === item.id} disabled={busy} onClick={() => setSelected(item.id)}><strong>{item.name}</strong><span>{item.asset_tag} · {item.component_slug}</span><span>{item.location_name || "Location not recorded"}</span><span>{item.commissioned ? "Commissioned" : "Not commissioned"} · {item.maintenance ? "Maintenance" : "Not in maintenance"}</span></button>)}</div>{!data.units.length && <p>No physical rental units are configured. Record actual stock before commissioning; planned catalogue quantities are not inventory.</p>}</Section>
    <Section number="02" title="Link a recorded asset"><form className="inline-form" onSubmit={commission}><fieldset disabled={busy}><legend>Commissioning</legend><div className="form-grid"><Field label="Recorded physical asset"><select name="asset" required defaultValue=""><option value="">Choose an existing asset</option>{data.assets.map(item => <option key={item.id} value={item.id}>{item.asset_tag} · {item.component_slug} · {item.status}</option>)}</select></Field><Field label="Equipment resource"><select name="resource" required defaultValue=""><option value="">Choose an existing resource</option>{data.resources.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="Commissioning decision"><select name="commissioned"><option value="no">Not commissioned</option><option value="yes">Commissioned after physical checks</option></select></Field><Field label="Commissioning reason"><input name="reason" required minLength={2} maxLength={1000} /></Field></div><button className="button button-primary">Review commissioning change</button></fieldset></form></Section>
    {unit && <><Section number="03" title={`Kit and maintenance · ${unit.asset_tag}`}><form className="inline-form" onSubmit={update}><fieldset disabled={busy}><legend>Physical unit details</legend><Field label="Recorded location"><select value={location} required onChange={event => setLocation(event.target.value)}><option value="">Choose a location</option>{data.locations.filter(item => item.lab_location_id === unit.lab_location_id).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><label className="admin-equipment-check"><input type="checkbox" checked={maintenance} onChange={event => setMaintenance(event.target.checked)} />Maintenance: prevent new rentals</label><p>Existing reservations remain recorded and must be resolved separately. Releasing maintenance leaves the unit uncommissioned until physical checks and an explicit commissioning decision. {unit.maintenance_note}</p><h3>Kit contents</h3>{kit.map((item, index) => <div className="admin-equipment-kit" key={index}><Field label={`Item ${index + 1}`}><input required maxLength={160} value={item.name} onChange={event => setKit(current => current.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} /></Field><Field label={`Quantity ${index + 1}`}><input type="number" min={1} max={999} required value={item.quantity} onChange={event => setKit(current => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></Field><button type="button" className="button button-quiet" onClick={() => setKit(current => current.filter((_, i) => i !== index))}>Remove item {index + 1}</button></div>)}<button type="button" className="button button-quiet" disabled={kit.length >= 50} onClick={() => setKit(current => [...current, { name: "", quantity: 1 }])}>Add kit item</button><Field label="Unit update reason"><input name="reason" required minLength={2} maxLength={1000} /></Field><button className="button button-primary">Review unit update</button></fieldset></form></Section>
    <Section number="04" title="Approved rate versions"><div className="table-wrap"><table><thead><tr><th>Rate</th><th>Tax</th><th>Valid from · IST</th><th>Valid until · IST</th></tr></thead><tbody>{unit.rates.map(rate => <tr key={rate.id}><td>{price(rate.price_paise)}/{rate.charge_unit}</td><td>{rate.tax_bps === null ? "Unconfigured" : `${rate.tax_bps / 100}%`}</td><td>{when(rate.valid_from)}</td><td>{rate.valid_until ? when(rate.valid_until) : "Open ended"}</td></tr>)}</tbody></table></div>{!unit.rates.length && <p>No approved rates. Equipment cannot be quoted until price and tax are explicitly configured.</p>}<form className="inline-form" onSubmit={approveRate}><fieldset disabled={busy}><legend>Approve a new rate version</legend><Field label="Previous rate version"><select name="previous" defaultValue=""><option value="">First rate for a new charging period</option>{unit.rates.map(rate => <option key={rate.id} value={rate.id}>{price(rate.price_paise)}/{rate.charge_unit} · {when(rate.valid_from)}</option>)}</select></Field><div className="form-grid"><Field label="Rate unit · first rate only"><select name="charge"><option value="hour">Hour</option><option value="day">Day</option></select></Field><Field label="Price before tax · INR"><input name="price" type="number" min="0.01" step="0.01" required /></Field><Field label="Approved tax · percent"><input name="tax" type="number" min="0" max="100" step="0.01" required /></Field><Field label="Effective from · IST"><input name="starts" type="datetime-local" required /></Field><Field label="Rate approval reason"><input name="reason" required minLength={2} maxLength={1000} /></Field></div><p>A new version replaces the previous rate for this unit and charging period from the chosen time. Consumables are separate; no student discount applies to equipment.</p><button className="button button-primary">Review rate approval</button></fieldset></form></Section></>}
    <Section number="05" title="Workspace tax configuration"><p>Unconfigured tax blocks a combined equipment and workspace quote. Enter zero only when that treatment has been approved.</p><form className="inline-form" onSubmit={workspaceTax}><fieldset disabled={busy}><legend>Approved workspace tax</legend><div className="form-grid"><Field label="Workspace product"><select name="product" defaultValue="" required><option value="">Choose a product</option>{data.workspaceProducts.map(product => <option key={product.id} value={product.id}>{product.name} · {product.tax_bps === null ? "Tax unconfigured" : `${product.tax_bps / 100}%`}</option>)}</select></Field><Field label="Workspace tax · percent"><input name="tax" type="number" required min="0" max="100" step="0.01" /></Field><Field label="Workspace tax reason"><input name="reason" required minLength={2} maxLength={1000} /></Field></div><button className="button button-primary">Review workspace tax</button></fieldset></form></Section>
  </>;
}
