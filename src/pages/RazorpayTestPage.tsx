import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type { TestOrder, TestQuote, TestReply } from "../../supabase/functions/_shared/razorpay-test-types";
import { PageHeader, Section } from "../components/Primitives";
import { useAccount } from "../context/AccountContext";
import { razorpayTestAvailable } from "../config/release";
import { loadTestCheckout, requestTestPayment, validateTestReply, type CheckoutInstance, type CheckoutResult, type TestPaymentRequest } from "../lib/razorpay-test";
import "./RazorpayTestPage.css";

const money = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);

export function RazorpayTestPage() {
  const { account, loading } = useAccount();
  const [quote, setQuote] = useState<TestQuote | null>(null);
  const [order, setOrder] = useState<TestOrder | null>(null);
  const [keyId, setKeyId] = useState("");
  const [policies, setPolicies] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const orderKey = useRef<string | null>(null);
  const refundKey = useRef<string | null>(null);
  const checkout = useRef<CheckoutInstance | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; checkout.current?.close(); }; }, []);

  const allowed = account && ["admin", "super_admin"].includes(account.role);
  const apply = (reply: TestReply) => {
    const checked = validateTestReply(reply);
    if (checked.quote) { setQuote(checked.quote); orderKey.current = null; }
    if (checked.order) setOrder(checked.order);
    if (checked.keyId) setKeyId(checked.keyId);
  };
  async function run(body: TestPaymentRequest, notice: string) {
    setBusy(true); setError(""); setMessage("");
    try {
      const reply = await requestTestPayment(body);
      if (mounted.current) { apply(reply); setMessage(notice); }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "The test request failed.");
    } finally { if (mounted.current) setBusy(false); }
  }
  async function openCheckout() {
    if (!order?.razorpayOrderId || !/^rzp_test_[a-z0-9]+$/i.test(keyId) || order.state !== "created") {
      setError("A server-created test order and test key are required."); return;
    }
    setBusy(true); setError(""); setMessage("");
    try {
      const Constructor = await loadTestCheckout();
      if (!mounted.current) return;
      const current = order;
      const instance = new Constructor({
        key: keyId, order_id: current.razorpayOrderId!, amount: current.amountPaise, currency: "INR",
        name: "Armature AI Labs TEST", description: "Synthetic payment test. No booking or paid access.",
        handler: (result: CheckoutResult) => {
          if (mounted.current) setCheckoutOpen(false);
          void run({ action: "verify", orderId: current.id, razorpayOrderId: result.razorpay_order_id, paymentId: result.razorpay_payment_id, signature: result.razorpay_signature }, "Server verification finished. No booking or paid access was granted.");
        },
        modal: { ondismiss: () => { if (mounted.current) { setCheckoutOpen(false); setMessage("Checkout closed. Refresh the server status before another attempt."); } } }
      });
      instance.on("payment.failed", () => { if (mounted.current) setMessage("The test attempt failed. The order may still accept another attempt; reconcile its status first."); });
      checkout.current = instance;
      setCheckoutOpen(true);
      instance.open();
    } catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : "Test checkout could not start."); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (loading) return <p role="status">Checking payment test access…</p>;
  if (!razorpayTestAvailable) return <PageHeader title="Payment testing is disabled." description="Live payment collection remains disabled. This page opens only in an explicitly configured test environment." />;
  if (!allowed) return <PageHeader title="Admin access required" description="Only Admins and Super admins can run payment integration tests." />;
  const locked = busy || checkoutOpen;
  const refundable = order && ["captured", "partially_refunded"].includes(order.state)
    && !order.refunds.some(item => ["creating", "pending", "needs_review"].includes(item.state))
    ? order.amountPaise - order.refundedAmountPaise : 0;
  return <div className="razorpay-test-page">
    <PageHeader meta="Administration · TEST MODE" title="Payment integration test" description="Simulated Razorpay payments using a synthetic test quote. This does not book inventory, buy a service, grant Premium membership or enable live payments." />
    <Section number="01" title="Prepare the test">
      <p className="test-payment-notice">Use only Razorpay’s published test details. Do not enter real card credentials, government IDs or customer information.</p>
      <button className="button" disabled={locked || Boolean(order)} onClick={() => void run({ action: "create_fixture_quote" }, "Synthetic test quote prepared by the server.")}>Prepare synthetic test quote</button>
      {quote && <div className="test-payment-quote">
        <h3>Synthetic integration fixture</h3>
        <p>{money(quote.amountPaise)} · INR · simulated zero-tax fixture. This is not a commercial price or tax calculation.</p>
        <p>Quote expires {new Date(quote.expiresAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST.</p>
        <fieldset disabled={locked || Boolean(order)}><legend>Test checkout acknowledgements</legend>
          <label><input type="checkbox" checked={policies} onChange={event => setPolicies(event.target.checked)} />I have reviewed the draft <Link to="/terms" target="_blank">Terms</Link>, <Link to="/refund-policy" target="_blank">Cancellation and Refund Policy</Link>, and <Link to="/shipping-policy" target="_blank">Shipping and Delivery Policy</Link>.</label>
          <label><input type="checkbox" checked={privacy} onChange={event => setPrivacy(event.target.checked)} />I have read the <Link to="/privacy" target="_blank">Privacy Policy</Link> for this test.</label>
          <label><input type="checkbox" checked={sharing} onChange={event => setSharing(event.target.checked)} />I agree to share the synthetic checkout details I enter with Razorpay for this test payment, status verification and refund processing.</label>
        </fieldset>
        <button className="button" disabled={locked || Boolean(order) || !policies || !privacy || !sharing || Date.parse(quote.expiresAt) <= Date.now()} onClick={() => {
          orderKey.current ??= crypto.randomUUID();
          void run({ action: "create_order", quoteId: quote.id, idempotencyKey: orderKey.current, policyVersion: quote.policyVersion, acceptedPolicies: { terms: policies, refund: policies, shipping: policies, privacy, paymentDataSharing: sharing } }, "Test order created. The server controls its amount.");
        }}>Create test order</button>
      </div>}
    </Section>
    {order && <Section number="02" title="Server payment status">
      <dl className="test-payment-status"><div><dt>Order</dt><dd>{order.id}</dd></div><div><dt>State</dt><dd>{order.state.replaceAll("_", " ")}</dd></div><div><dt>Test amount</dt><dd>{money(order.amountPaise)}</dd></div><div><dt>Refunded</dt><dd>{money(order.refundedAmountPaise)}</dd></div><div><dt>Paid access granted</dt><dd>No</dd></div></dl>
      <div className="button-row">
        <button className="button" disabled={locked || order.state !== "created" || !keyId} onClick={() => void openCheckout()}>Open Razorpay test checkout</button>
        <button className="button secondary" disabled={locked} onClick={() => void run({ action: "status", orderId: order.id }, "Stored test status refreshed.")}>Refresh server status</button>
        <button className="button secondary" disabled={locked} onClick={() => void run({ action: "reconcile", orderId: order.id }, "Test status reconciled with Razorpay.")}>Reconcile with Razorpay</button>
        <button className="button secondary" disabled={locked || !refundable} onClick={() => {
          refundKey.current ??= crypto.randomUUID();
          void run({ action: "refund", orderId: order.id, amountPaise: refundable, idempotencyKey: refundKey.current }, "Test refund submitted. Reconcile until Razorpay confirms its final status.");
        }}>Refund remaining test amount</button>
      </div>
      <p>Before refund testing, check that Razorpay’s Test Mode balance covers the refund after fees. A captured ₹1 test payment can leave less than ₹1 available.</p>
      {order.refunds.length > 0 && <ul>{order.refunds.map(refund => <li key={refund.id}>
        {money(refund.amountPaise)} test refund · {refund.state.replaceAll("_", " ")}
        {refund.state === "needs_review" && <button className="button secondary" disabled={locked} onClick={() => void run({ action: "retry_refund", orderId: order.id, refundId: refund.id }, "Existing test refund reconciled and retried only if needed. Reconcile until its final status is confirmed.")}>Reconcile and retry same test refund</button>}
      </li>)}</ul>}
      <p>Only captured funds count as a completed test payment. An authorised payment is still pending capture. No state on this page grants real booking or membership access.</p>
    </Section>}
    <div className="wrap test-payment-feedback">{busy && <p role="status">Working with the test payment server…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}</div>
  </div>;
}
