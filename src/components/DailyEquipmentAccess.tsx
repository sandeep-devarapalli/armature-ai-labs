import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import "./DailyEquipmentAccess.css";
import { Section } from "./Primitives";
import { useAccount } from "../context/AccountContext";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";

type DailyUse = { order_id: string; booking_id: string; resource_id: string; name: string; dates: string[]; active_session: null | { id: string; use_date: string; checked_in_at: string } };
type Code = { token: string; expiresAt: string; action: "check_in" | "check_out"; orderId: string; name: string };
export function DailyEquipmentAccess({ resetSignal, onCodeCreated, onBookingsLoaded }: { resetSignal: number; onCodeCreated: () => void; onBookingsLoaded?: (ids: string[] | null) => void }) {
  const { account } = useAccount();
  const { createCheckinIntent, online } = useApp();
  const [items, setItems] = useState<DailyUse[]>([]);
  const [code, setCode] = useState<Code | null>(null);
  const [image, setImage] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; return () => { generation.current += 1; }; }, [account?.user_id]);
  const refresh = useCallback(async () => {
    if (!supabase || !account) return;
    const request = generation.current;
    const result = await (supabase as SupabaseClient).rpc("get_my_equipment_daily_use");
    if (request !== generation.current) return;
    if (result.error) { onBookingsLoaded?.(null); throw result.error; }
    setItems(result.data ?? []); onBookingsLoaded?.((result.data as DailyUse[]).map(item => item.booking_id));
    setCode(current => {
      if (!current) return null;
      const item = (result.data as DailyUse[]).find(row => row.order_id === current.orderId);
      if (!item || (current.action === "check_in" ? Boolean(item.active_session) : !item.active_session)) return null;
      return current;
    });
  }, [account?.user_id, onBookingsLoaded]);
  useEffect(() => { generation.current += 1; setCode(null); setImage(""); setBusy(false); }, [resetSignal]);
  useEffect(() => {
    setItems([]); setCode(null); setBusy(false); setError(""); onBookingsLoaded?.(null);
    void refresh().catch(reason => setError(reason.message));
  }, [refresh]);
  useEffect(() => {
    if (!code) { setImage(""); return; }
    let active = true;
    void QRCode.toDataURL(`armature://check-in?token=${code.token}`, { width: 320, margin: 2 }).then(value => { if (active) setImage(value); });
    const tick = () => { const remaining = Math.max(0, Math.ceil((Date.parse(code.expiresAt) - Date.now()) / 1000)); setSeconds(remaining); if (!remaining) { setCode(null); setError("Equipment code expired. Generate a fresh code."); } };
    tick(); const clock = window.setInterval(tick, 1000);
    const poll = window.setInterval(() => { void refresh().catch(reason => setError(reason.message)); }, 5000);
    return () => { active = false; clearInterval(clock); clearInterval(poll); };
  }, [code, refresh]);
  async function generate(item: DailyUse) {
    if (!online) return;
    setBusy(true); setError(""); setCode(null);
    const request = generation.current;
    try {
      const action = item.active_session ? "check_out" : "check_in";
      const result = await createCheckinIntent(item.booking_id, action);
      if (request !== generation.current) return;
      onCodeCreated();
      setCode({ ...result, action, orderId: item.order_id, name: item.name });
    } catch (reason) { if (request === generation.current) setError((reason as Error).message || "Equipment code could not be created."); }
    finally { if (request === generation.current) setBusy(false); }
  }
  return <Section number="03" title="Daily equipment use">
    <p>Start and end each day's equipment use separately from your lab attendance. Equipment stays in the lab overnight; ending today's use does not cancel your remaining rental dates. Present the one-use code at the trusted kiosk.</p>
    <p>Daily use is 09:00–17:00 IST on your booked dates, subject to current workspace access, training and operational checks. An active session can still be returned after its use window.</p>
    <button className="button button-quiet" type="button" disabled={!online || busy} onClick={() => { void refresh().catch(reason => setError(reason.message)); }}>Refresh equipment sessions</button>
    {!items.length && <p>No daily equipment rentals are assigned to your account.</p>}
    <div className="daily-equipment-grid">{items.map(item => <article key={item.order_id}><h3>{item.name}</h3><p>{item.dates.join(", ")}</p><p>{item.active_session ? `In use since ${new Date(item.active_session.checked_in_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST` : "No equipment session is open"}</p><button className="button button-primary" type="button" disabled={!online || busy} onClick={() => void generate(item)}>{item.active_session ? "Generate equipment return code" : "Generate daily equipment use code"}</button></article>)}</div>
    {error && <p role="alert">{error}</p>}
    {code && <div className="qr-layout"><div className="qr-frame">{image && seconds > 0 && <img src={image} alt={`One-use equipment ${code.action === "check_in" ? "use" : "return"} code`} />}</div><div><h3>{code.name} · {code.action === "check_in" ? "start today's use" : "end today's use"}</h3><p role="status">{seconds > 0 ? `${seconds} seconds remaining. Generating a new lab or equipment code replaces this one.` : "Code expired. Generate a fresh equipment code."}</p></div></div>}
  </Section>;
}
