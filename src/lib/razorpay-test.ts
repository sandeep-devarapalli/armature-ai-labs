import type { TestReply } from "../../supabase/functions/_shared/razorpay-test-types";
import { razorpayTestAvailable } from "../config/release";
import { supabase } from "./supabase";

export type TestPaymentRequest =
  | { action: "create_fixture_quote" }
  | { action: "create_order"; quoteId: string; idempotencyKey: string; policyVersion: string; acceptedPolicies: { terms: boolean; privacy: boolean; refund: boolean; shipping: boolean; paymentDataSharing: boolean } }
  | { action: "verify"; orderId: string; razorpayOrderId: string; paymentId: string; signature: string }
  | { action: "status" | "reconcile"; orderId: string }
  | { action: "refund"; orderId: string; amountPaise: number; idempotencyKey: string }
  | { action: "retry_refund"; orderId: string; refundId: string };

export function validateTestReply(value: unknown): TestReply {
  const data = value as TestReply | null;
  if (!data || data.mode !== "test" || data.paidAccessGranted !== false) throw new Error("The server did not return a test-only response.");
  if (data.keyId && !/^rzp_test_[a-z0-9]+$/i.test(data.keyId)) throw new Error("Live payment keys are blocked.");
  for (const item of [data.quote, data.order]) {
    if (item && (item.currency !== "INR" || !Number.isSafeInteger(item.amountPaise) || item.amountPaise < 100)) throw new Error("The test amount is invalid.");
  }
  if (data.quote && data.quote.taxBasis !== "synthetic_test_fixture") throw new Error("Only the synthetic test quote is supported.");
  return data;
}

export async function requestTestPayment(body: TestPaymentRequest): Promise<TestReply> {
  if (!razorpayTestAvailable || !supabase) throw new Error("The payment test environment is disabled.");
  const { data, error } = await supabase.functions.invoke("razorpay-test", { body });
  if (error) {
    if (error.context instanceof Response) {
      let failure = null;
      try { failure = await error.context.clone().json(); } catch { /* Keep malformed responses generic. */ }
      if (failure?.mode === "test" && failure.paidAccessGranted === false && failure.error === "provider_request_rejected"
        && Number.isInteger(failure.providerHttpStatus) && failure.providerHttpStatus >= 400 && failure.providerHttpStatus <= 599) {
        throw new Error(`Razorpay rejected the test request (HTTP ${failure.providerHttpStatus}). Reconcile its status before retrying the same refund.`);
      }
    }
    throw new Error("The test request could not be completed. Check its status before retrying a payment or refund.");
  }
  return validateTestReply(data);
}

export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface TestCheckoutOptions {
  key: string;
  order_id: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  handler: (result: CheckoutResult) => void;
  modal: { ondismiss: () => void };
}

export interface CheckoutInstance {
  open: () => void;
  close: () => void;
  on: (event: "payment.failed", callback: () => void) => void;
}

export type CheckoutConstructor = new (options: TestCheckoutOptions) => CheckoutInstance;
declare global { interface Window { Razorpay?: CheckoutConstructor } }
let checkoutScript: Promise<CheckoutConstructor> | undefined;

export function loadTestCheckout(): Promise<CheckoutConstructor> {
  if (!razorpayTestAvailable) return Promise.reject(new Error("The payment test environment is disabled."));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<CheckoutConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => fail(), 15000);
    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      checkoutScript = undefined;
      reject(new Error("Razorpay test checkout could not load. No payment was started."));
    }
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.armatureRazorpayTest = "true";
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.Razorpay) resolve(window.Razorpay); else fail();
    };
    document.head.append(script);
  });
  return checkoutScript;
}
