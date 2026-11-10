import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { accountMembershipLevelsEnabled, useAccount } from "../context/AccountContext";
import { loadRazorpayCheckout, type CheckoutInstance } from "../lib/razorpay-checkout";
import { saleMode, saleRequest, type EquipmentSale } from "../lib/equipment-sale";
import { rentalMoney as money } from "../lib/rental-checkout";
import { BookingSteps } from "./BookingSteps";

const buySteps = ["Ask to buy", "Check the item in the lab with Armature", "Pay online within 30 minutes", "Collect it from the lab"];
const stepFor: Record<string, number> = { awaiting_check: 1, ready_to_pay: 2, payment_expired: 2, awaiting_payment: 2, paid: 3, refund_pending: 3, collected: 4 };
const statusText: Record<string, string> = { awaiting_check: "Waiting for the in-lab check", ready_to_pay: "Ready to pay",
  payment_expired: "Payment window closed", awaiting_payment: "Payment pending; check payment status", paid: "Paid · collect from the lab",
  collected: "Collected", refund_pending: "Refund approved · on its way", refunded: "Refunded", needs_review: "Armature is reviewing this payment",
  declined: "Request declined", cancelled: "Request cancelled" };
const closed = ["declined", "cancelled", "refunded", "collected"];

// Buy one item: ask, check it in the lab, pay inside the window staff open, then collect.
export function EquipmentBuy({ code, pricePaise, inStock }: { code: string; pricePaise: number; inStock: boolean }) {
  const { account, signedIn } = useAccount();
  const { pathname } = useLocation();
  if (!signedIn || !account?.user_id) return <Link className="button button-primary" to={"/auth?next=" + encodeURIComponent(pathname)}>Sign in to buy</Link>;
  const verified = accountMembershipLevelsEnabled(account) && ["verified", "premium"].includes(account.membership_level ?? "");
  return <BuyPanel key={account.user_id} memberId={account.user_id} code={code} pricePaise={pricePaise} inStock={inStock} canBuy={verified} />;
}

function BuyPanel({ memberId, code, pricePaise, inStock, canBuy }: { memberId: string; code: string; pricePaise: number; inStock: boolean; canBuy: boolean }) {
  const request = <T,>(body: object) => saleRequest<T>(body, memberId);
  const [sale, setSale] = useState<EquipmentSale | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [consent, setConsent] = useState(false), [checkoutOpen, setCheckoutOpen] = useState(false);
  const active = useRef(true), working = useRef(false), checkout = useRef<CheckoutInstance | null>(null);
  useEffect(() => { active.current = true; return () => { active.current = false; checkout.current?.close(); }; }, []);
  useEffect(() => {
    saleRequest<{ sales: EquipmentSale[] }>({ action: "list_own" }, memberId)
      .then(result => { if (active.current) setSale(result.sales.find(s => s.lines.some(l => l.code === code) && !closed.includes(s.status)) ?? null); })
      .catch(() => { /* A failed lookup leaves the Ask to buy button; the request itself reports duplicates. */ });
  }, [code, memberId]);
  async function run(action: () => Promise<void>) {
    if (!active.current || working.current) return;
    working.current = true; setBusy(true); setError("");
    try { await action(); } catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "The request could not be completed."); }
    finally { working.current = false; if (active.current) setBusy(false); }
  }
  const update = (next: EquipmentSale) => { if (active.current) { setSale(next); setConsent(false); } };
  async function pay(s: EquipmentSale) {
    const order = await request<{ keyId: string; orderId: string; amountPaise: number; currency: string }>({ action: "order", saleId: s.saleId, acceptedTerms: true });
    if (!active.current) return;
    if (!new RegExp("^rzp_" + saleMode + "_[A-Za-z0-9]+$").test(order.keyId) || !/^order_[A-Za-z0-9]+$/.test(order.orderId)
      || order.currency !== "INR" || order.amountPaise !== s.amountPaise) throw new Error("Payment order does not match the sale.");
    const Razorpay = await loadRazorpayCheckout();
    if (!active.current) return;
    const modal = new Razorpay({ key: order.keyId, order_id: order.orderId, amount: order.amountPaise, currency: "INR",
      name: "Armature AI Labs", description: s.lines.map(l => l.name).join(", "),
      handler: callback => {
        if (!active.current) return;
        setCheckoutOpen(false); checkout.current = null;
        void run(async () => update(await request<EquipmentSale>({ action: "verify", saleId: s.saleId, ...callback })));
      }, modal: { ondismiss: () => { checkout.current = null; if (active.current) setCheckoutOpen(false); } } });
    modal.on("payment.failed", () => { if (active.current) setError("Payment attempt failed. Check status before trying again."); });
    checkout.current = modal; setCheckoutOpen(true); modal.open();
  }
  const locked = busy || checkoutOpen;
  const expires = sale?.paymentExpiresAt ? new Date(sale.paymentExpiresAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) : "";
  return <div className="eq-buy-flow" aria-live="polite">
    <BookingSteps label="Buying steps" steps={buySteps} current={sale ? stepFor[sale.status] ?? 1 : 0} />
    {saleMode === "test" && <p role="status">Test purchases · no real item or charge.</p>}
    {!sale ? <>
      {!canBuy && <p className="eq-note">Verified membership is required. <Link to="/onboarding">Complete verification</Link>.</p>}
      <button type="button" className="button button-primary" disabled={locked || !canBuy || !inStock}
        onClick={() => void run(async () => update(await request<EquipmentSale>({ action: "request", items: [code] })))}>
        {inStock ? `Ask to buy · ${money(pricePaise)}` : "Out of stock"}</button>
      <p className="eq-note">Nothing is charged now. Armature shows you the item in the lab first; payment opens only after that check.</p>
    </> : <>
      <p>Status: <strong>{statusText[sale.status] ?? sale.status}</strong> · {money(sale.amountPaise)}</p>
      {sale.status === "awaiting_check" && <p className="eq-note">Visit the lab to check the item with Armature. <a href="mailto:hello@armatureailabs.com">Arrange a time</a>.</p>}
      {sale.status === "ready_to_pay" && <>
        <p className="eq-note">Payment is open until {expires}.</p>
        <label className="checkbox-field"><input type="checkbox" checked={consent} disabled={locked} onChange={event => setConsent(event.target.checked)} /> <span>I accept the <Link to="/terms">terms</Link> and <Link to="/refund-policy">refund policy</Link>: full refund until I collect the item, none after.</span></label>
        <button type="button" className="button button-primary" disabled={locked || !consent} onClick={() => void run(() => pay(sale))}>Pay {money(sale.amountPaise)}{saleMode === "test" ? " (test)" : ""}</button>
      </>}
      {sale.status === "payment_expired" && <p className="eq-note">The 30-minute payment window closed. Ask Armature to reopen it.</p>}
      {sale.status === "paid" && <p className="eq-note">Collect the item from the lab. You can still get a full refund until you collect it.</p>}
      {sale.status === "needs_review" && <p className="eq-note">Do not pay again. Armature will contact you.</p>}
      {["awaiting_check", "ready_to_pay", "payment_expired"].includes(sale.status) && !sale.hasOrder && !sale.orderPending && <details>
        <summary>Cancel this request</summary>
        <form className="ol-form" onSubmit={event => { event.preventDefault(); const reason = String(new FormData(event.currentTarget).get("reason") ?? "").trim();
          void run(async () => update(await request<EquipmentSale>({ action: "cancel", saleId: sale.saleId, confirmed: true, reason }))); }}>
          <label>Reason<textarea name="reason" minLength={10} maxLength={1000} required disabled={locked} /></label>
          <button className="button secondary" disabled={locked}>Cancel request</button>
        </form>
      </details>}
      <button type="button" className="button secondary" disabled={locked} onClick={() => void run(async () => update(await request<EquipmentSale>({ action: "status", saleId: sale.saleId })))}>Check status</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
