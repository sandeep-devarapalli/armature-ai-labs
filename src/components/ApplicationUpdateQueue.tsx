import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requestOnboardingDocument } from "../lib/onboarding";
import { OnboardingForm } from "../pages/OnboardingForm";
import type { OnboardingUpdate } from "./ApplicationUpdates";

export function ApplicationUpdateQueue({ client, userId, onBusyChange, blocked = false }: { client: SupabaseClient; userId: string; onBusyChange?: (busy: boolean) => void; blocked?: boolean }) {
  const [items, setItems] = useState<OnboardingUpdate[]>([]), [total, setTotal] = useState(0);
  const [page, setPage] = useState(1), [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [operationBusy, setOperationBusy] = useState(false);
  const controlsBlocked = operationBusy || blocked;
  const generation = useRef(0), heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { onBusyChange?.(operationBusy); }, [operationBusy, onBusyChange]);
  useEffect(() => () => { onBusyChange?.(false); }, [onBusyChange]);
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setError("");
    void (async () => {
      try {
        const session = await client.auth.getSession();
        if (current !== generation.current) return;
        if (session.error || session.data.session?.user.id !== userId) throw new Error("Your account changed. Reload the review queue.");
        const result = await client.rpc("list_onboarding_updates", { p_status: "pending", p_page: page }).setHeader("Authorization", `Bearer ${session.data.session.access_token}`);
        if (current !== generation.current) return;
        const latest = await client.auth.getSession();
        if (current !== generation.current) return;
        if (latest.error || latest.data.session?.user.id !== userId) throw new Error("Your account changed. Reload the review queue.");
        if (result.error) throw result.error;
        setItems(Array.isArray(result.data?.items) ? result.data.items : []); setTotal(result.data?.total || 0);
      } catch (failure) { if (current === generation.current) setError((failure as Error).message || "The update queue could not be loaded."); }
      finally { if (current === generation.current) setLoading(false); }
    })();
    return () => { generation.current++; };
  }, [client, userId, page, version]);
  useEffect(() => { if (selected) { heading.current?.focus(); heading.current?.scrollIntoView({ block: "start" }); } }, [selected]);
  return <section className="ol-history" aria-label="Pending application updates">
    <h2>Proposed application changes</h2><p>Review member corrections separately from identity approval. Current approved details stay active until an independent reviewer applies the changes.</p>
    <button type="button" className="button secondary" disabled={loading || controlsBlocked} onClick={() => setVersion(value => value + 1)}>Refresh proposed changes</button>
    {error && <p role="alert">{error}</p>}{loading && <p role="status">Loading proposed changes…</p>}
    {!loading && !error && <><p>{total} updates awaiting review.</p><ul>{items.map(item => <li key={item.id}>{item.previous_details.full_name} · {item.application_status || "application"} <button type="button" className="button secondary" disabled={controlsBlocked || item.user_id === userId} onClick={() => setSelected(item.user_id)}>Review proposed changes<span className="sr-only"> for {item.previous_details.full_name}</span></button>{item.user_id === userId && <span> An independent reviewer must review your own changes.</span>}</li>)}</ul>
      <div className="member-pagination"><button className="button secondary" disabled={controlsBlocked || page <= 1} onClick={() => { setPage(page - 1); setSelected(null); }}>Previous updates</button><span>Page {page} of {Math.max(1, Math.ceil(total / 20))}</span><button className="button secondary" disabled={controlsBlocked || page * 20 >= total} onClick={() => { setPage(page + 1); setSelected(null); }}>Next updates</button></div></>}
    {selected && <section aria-label="Selected application update"><h3 ref={heading} tabIndex={-1}>Review member changes</h3><button className="button secondary" disabled={controlsBlocked} onClick={() => setSelected(null)}>Close proposed changes</button><OnboardingForm key={`${userId}:${selected}`} client={client} initialUserId={selected} onBusyChange={setOperationBusy} onApplicationUpdate={() => setVersion(value => value + 1)} requestDocument={(id, file) => requestOnboardingDocument(client, import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY, id, file)} /></section>}
  </section>;
}
