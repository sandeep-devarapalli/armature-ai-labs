import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatPassDate } from "../lib/pass-requests";
import { loadRazorpayCheckout, type CheckoutInstance } from "../lib/razorpay-checkout";
import { supabase } from "../lib/supabase";

const mode = import.meta.env.VITE_GOLDEN_PASS_CHECKOUT_MODE === "test" ? "test" : "live";
const endpoint = mode === "test" ? "test-golden-pass-checkout" : "golden-pass-checkout";
const pricePaise = 10_000_000;
type Pass = {
  eligible: boolean; checkoutAvailable: boolean; status: "eligible" | "ineligible" | "order_pending" | "awaiting_payment" | "active" | "expired" | "refunded" | "needs_review";
  paymentConfirmationPending?: boolean; startsAt?: string; endsAt?: string; refundRequestedAt?: string; canRequestRefund?: boolean;
};
type Order = { orderId: string; keyId: string; amountPaise: number; currency: string };

async function request<T>(memberId: string, body: object): Promise<T> {
  const session = await supabase?.auth.getSession();
  if (!supabase || session?.error || session?.data.session?.user.id !== memberId) throw new Error("Sign in again to continue.");
  const { data, error } = await supabase.functions.invoke(endpoint, {
    body, headers: { Authorization: "Bearer " + session.data.session.access_token },
  });
  if (error || data?.mode !== mode) throw new Error("We couldn’t complete this action. Check your pass status before trying again.");
  return data as T;
}

export function GoldenPassCheckout({ memberId, application }: { memberId: string; application: React.ReactNode }) {
  const [pass, setPass] = useState<Pass | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [terms, setTerms] = useState(false);
  const active = useRef(false);
  const working = useRef(false);
  const checkout = useRef<CheckoutInstance | null>(null);

  useEffect(() => {
    active.current = true;
    void request<Pass>(memberId, { action: "status" })
      .then(value => { if (active.current) setPass(value); })
      .catch((reason: Error) => { if (active.current) setError(reason.message); });
    return () => { active.current = false; checkout.current?.close(); };
  }, [memberId]);

  async function run<T>(action: () => Promise<T>) {
    if (!active.current || working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try { await action(); }
    catch (reason) { if (active.current) setError(reason instanceof Error ? reason.message : "Checkout could not continue."); }
    finally { working.current = false; if (active.current) setBusy(false); }
  }

  const refresh = () => run(async () => {
    const result = await request<Pass>(memberId, { action: "status" });
    if (active.current) setPass(result);
  });

  async function openPayment() {
    if (!terms || checkout.current) return;
    await run(async () => {
      const order = await request<Order | Pass>(memberId, { action: "order", acceptedTerms: true });
      if (!("orderId" in order)) {
        if (active.current) setPass(order);
        return;
      }
      if (order.amountPaise !== pricePaise || order.currency !== "INR" || !/^order_[A-Za-z0-9]+$/.test(order.orderId)
        || !new RegExp(`^rzp_${mode}_[A-Za-z0-9]+$`).test(order.keyId)) throw new Error("The Razorpay order does not match this pass.");
      const Razorpay = await loadRazorpayCheckout();
      if (!active.current) return;
      const instance = new Razorpay({
        key: order.keyId, order_id: order.orderId, amount: order.amountPaise, currency: "INR",
        name: "Armature AI Labs", description: "Golden Pass · 12 months",
        handler: result => {
          checkout.current = null;
          void run(async () => {
            const status = await request<Pass>(memberId, { action: "verify", ...result });
            if (active.current) setPass(status);
          });
        },
        modal: { ondismiss: () => { checkout.current = null; if (active.current) void refresh(); } },
      });
      instance.on("payment.failed", () => {
        if (active.current) setError("Razorpay reported a failed attempt. Check your payment status before trying again.");
      });
      checkout.current = instance;
      try { instance.open(); } catch (reason) { checkout.current = null; throw reason; }
    });
  }

  if (pass?.status === "ineligible") return <><p>To pay online, complete <Link to="/onboarding">identity review</Link>. You can also submit a Golden Pass application for staff follow-up.</p>{application}</>;
  const canPay = pass?.checkoutAvailable && pass.eligible && !pass.paymentConfirmationPending && ["eligible", "order_pending", "awaiting_payment", "expired", "refunded"].includes(pass.status);
  const canRefund = pass?.canRequestRefund === true && !pass.refundRequestedAt;
  return <div className="pass-panel pass-application">
    {mode === "test" && <p role="status">Razorpay test mode. No real payment.</p>}
    {error && <p role="alert">{error}</p>}
    {!pass && !error && <p role="status">Checking your Golden Pass status…</p>}
    {pass?.status === "active" && <section>
      <h3>Golden Pass active</h3>
      {pass.startsAt && pass.endsAt && <p>{formatPassDate(pass.startsAt)} to {formatPassDate(pass.endsAt)} (end date exclusive)</p>}
    </section>}
    {pass?.refundRequestedAt && <p role="status">Refund requested on {formatPassDate(pass.refundRequestedAt)}. Staff will review it.</p>}
    {canRefund && <button type="button" className="button button-quiet" disabled={busy} onClick={() => void run(async () => {
      const result = await request<Pass>(memberId, { action: "request_refund" });
      if (active.current) setPass(result);
    })}>Request refund</button>}
    {pass?.eligible && !pass.checkoutAvailable && pass.status === "eligible" && <p>Online payment is currently unavailable. Check back or contact Armature.</p>}
    {pass?.paymentConfirmationPending && <p role="status">Razorpay received the payment. Wait for confirmation before paying again.</p>}
    {pass && !canPay && !pass.paymentConfirmationPending && ["needs_review", "order_pending", "awaiting_payment"].includes(pass.status) &&
      <p>Check your payment status or contact Armature before attempting another payment.</p>}
    {canPay && <>
      <h3>Continue to payment</h3>
      <p>Your account is eligible for direct checkout.</p>
      <label className="pass-consent"><input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)} />
        <span>I accept the <Link to="/terms">terms</Link> and <Link to="/refund-policy">refund policy</Link>.</span></label>
      <button className="button button-primary" type="button" onClick={() => void openPayment()} disabled={!terms || busy}>{pass.status === "order_pending" ? "Resume Razorpay checkout" : "Pay ₹1,00,000 with Razorpay"}</button>
      <p className="golden-payment-note">Your membership starts after Razorpay confirms payment.</p>
    </>}
    <button className="button button-quiet" type="button" onClick={() => void refresh()} disabled={busy}>Check pass status</button>
  </div>;
}
