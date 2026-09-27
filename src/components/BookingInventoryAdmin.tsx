import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Field, Section } from "./Primitives";
import { useAccount } from "../context/AccountContext";
import { supabase } from "../lib/supabase";

type Resource = { id: string; name: string; active: boolean; reservable: boolean; capacity: number };
export function BookingInventoryAdmin() {
  const { account } = useAccount();
  const allowed = account?.role === "admin" || account?.role === "super_admin";
  const [resources, setResources] = useState<Resource[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const refresh = useCallback(async () => {
    if (!supabase || !allowed) return;
    const result = await supabase.from("resources").select("id,name,active,reservable,capacity").order("name");
    if (result.error) throw result.error;
    return result.data;
  }, [allowed]);
  useEffect(() => {
    let current = true;
    setResources([]);
    void refresh().then(data => { if (current) setResources(data ?? []); }).catch(reason => { if (current) setError(reason.message); });
    return () => { current = false; };
  }, [refresh]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!allowed || !supabase) return;
    const fields = new FormData(event.currentTarget);
    const resource = resources.find(item => item.id === fields.get("resource"));
    if (!resource) return;
    const enabled = fields.get("enabled") === "yes";
    if (!window.confirm(`${enabled ? "Enable" : "Disable"} new bookings for ${resource.name}? Existing reservations are retained and must be reviewed separately.`)) return;
    setWorking(true); setError(""); setMessage("");
    try {
      const result = await supabase.rpc("set_booking_resource_enabled", { p_resource_id: resource.id, p_enabled: enabled, p_reason: String(fields.get("reason")).trim() });
      if (result.error) throw result.error;
      setResources(await refresh() ?? []);
      setMessage(`${resource.name}: new bookings ${enabled ? "enabled" : "disabled"}. Existing reservations retained.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setWorking(false); }
  }
  if (!allowed) return null;
  return <Section number="06" title="Chairs, cabins and equipment availability">
    <p>Disable new bookings for maintenance or layout changes. Existing reservations stay in place for separate review. Holiday closures apply through the calendar above. A cabin is one whole-team resource, including all six chairs.</p>
    <form className="inline-form booking-policy-form" onSubmit={save}>
      <div className="form-grid">
        <Field label="Availability resource"><select name="resource" required disabled={working} defaultValue=""><option value="">Choose resource</option>{resources.map(item => <option key={item.id} value={item.id}>{item.name} · {item.active && item.reservable ? "Available for booking" : "Disabled"}</option>)}</select></Field>
        <Field label="New booking availability"><select name="enabled" disabled={working}><option value="no">Disable new bookings</option><option value="yes">Enable new bookings</option></select></Field>
        <Field label="Availability change reason"><input name="reason" required minLength={2} maxLength={300} disabled={working} /></Field>
      </div>
      <button className="button button-primary" disabled={working}>Save resource availability</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </Section>;
}
