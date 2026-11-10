import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MfaPanel } from "../pages/MemberPages";
import { saleFunction, saleMode, type EquipmentSale } from "../lib/equipment-sale";
import { rentalMoney as money } from "../lib/rental-checkout";

type Sale = EquipmentSale & { memberId: string };
const statusLabels: Record<string, string> = { awaiting_check: "Waiting for the in-lab check", ready_to_pay: "Payment open", payment_expired: "Payment window closed",
  awaiting_payment: "Order created, awaiting payment", paid: "Paid, not collected", collected: "Collected", refund_pending: "Refund approved, issue it in Razorpay",
  refunded: "Refunded", needs_review: "Payment needs staff review", declined: "Declined", cancelled: "Cancelled by buyer" };

// Staff desk for in-lab sales: mark the check done, reopen payment, decline, mark collected, approve a refund before collection.
export function EquipmentSaleQueue({ client, actorId, blocked, onBusyChange }: {
  client: SupabaseClient; actorId: string; blocked?: boolean; onBusyChange: (busy: boolean) => void;
}) {
  const [sales, setSales] = useState<Sale[]>([]), [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const active = useRef(false), working = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; if (working.current) onBusyChange(false); }; }, [onBusyChange]);
  async function call(action: string, sale?: Sale, fields: Record<string, unknown> = {}) {
    if (working.current || blocked) return;
    working.current = true; setBusy(true); onBusyChange(true); setError("");
    try {
      const [session, assurance] = await Promise.all([client.auth.getSession(), client.auth.mfa.getAuthenticatorAssuranceLevel()]);
      if (!active.current) return;
      if (session.error || session.data.session?.user.id !== actorId || !session.data.session.access_token
        || assurance.error || assurance.data.currentLevel !== "aal2") throw new Error("Verify the current Admin session with MFA, then try again.");
      if (sale && sale.memberId === actorId) throw new Error("Another Admin must handle your own purchase.");
      const body = { action, ...(sale ? { saleId: sale.saleId, memberId: sale.memberId } : {}), ...fields };
      const { data, error: failure } = await client.functions.invoke(saleFunction, { body, headers: { Authorization: `Bearer ${session.data.session.access_token}` } });
      if (!active.current) return;
      if (!sale) {
        if (failure || data?.mode !== saleMode || !Array.isArray(data.sales)) throw new Error("Sales could not be loaded.");
        setSales(data.sales); setLoaded(true); return;
      }
      if (failure || data?.mode !== saleMode || data?.saleId !== sale.saleId) throw new Error("The action could not be confirmed. Reload sales before retrying.");
      setSales(current => current.map(item => item.saleId === sale.saleId ? { ...item, ...data } : item));
    } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "The action could not be completed."); }
    finally { working.current = false; if (active.current) { setBusy(false); onBusyChange(false); } }
  }
  const withReason = (action: string, sale: Sale) => (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); void call(action, sale, { reason: String(new FormData(event.currentTarget).get("reason") ?? "").trim() });
  };
  const disabled = busy || blocked;
  const reasonForm = (action: string, sale: Sale, label: string) => <form className="ol-form" onSubmit={withReason(action, sale)}>
    <label>Reason<textarea name="reason" minLength={10} maxLength={1000} required disabled={disabled} /></label>
    <button className="button secondary" disabled={disabled}>{label}</button>
  </form>;
  return <details className="member-confirm"><summary>Equipment sales</summary>
    <p>Show the buyer the item in the lab, then mark the check done; that opens a 30-minute payment window for that buyer only. Refunds are full until collection and not allowed after. Use a separate Admin account with MFA.</p>
    <MfaPanel mode="supabase" />
    <button className="button secondary" disabled={disabled} onClick={() => void call("staff_queue", undefined, { offset: 0 })}>Load sales</button>
    {loaded && !sales.length && <p>No sales yet.</p>}
    {loaded && sales.length > 0 && <ul aria-label="Equipment sales">{sales.map(sale => {
      const own = sale.memberId === actorId;
      return <li key={sale.saleId}>
        <p><strong>{sale.lines.map(l => [l.maker, l.name].filter(Boolean).join(" ")).join(" + ")}</strong> · {money(sale.amountPaise)} · {statusLabels[sale.status] ?? sale.status}</p>
        {sale.reviewReason && <p>Review: {sale.reviewReason}</p>}
        {own ? <p>Another Admin must handle your own purchase.</p> : <>
          {sale.status === "awaiting_check" && <form className="ol-form" onSubmit={event => { event.preventDefault(); void call("mark_checked", sale, { itemChecked: true }); }}>
            <label className="checkbox-field"><input type="checkbox" required disabled={disabled} /> The buyer has checked this item in the lab</label>
            <button className="button" disabled={disabled}>Check done · open payment</button>
          </form>}
          {sale.status === "payment_expired" && <button className="button secondary" disabled={disabled} onClick={() => void call("reopen_payment", sale)}>Reopen payment</button>}
          {["awaiting_check", "ready_to_pay", "payment_expired"].includes(sale.status) && !sale.hasOrder && !sale.orderPending
            && <details><summary>Decline</summary>{reasonForm("decline", sale, "Decline request")}</details>}
          {sale.status === "paid" && <>
            <button className="button" disabled={disabled} onClick={() => void call("mark_collected", sale)}>Mark collected</button>
            <details><summary>Approve full refund</summary>{reasonForm("approve_refund", sale, "Approve refund")}</details>
          </>}
        </>}
      </li>;
    })}</ul>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
