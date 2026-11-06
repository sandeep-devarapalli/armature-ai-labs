export interface CheckoutResult {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface CheckoutOptions {
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

export type CheckoutConstructor = new (options: CheckoutOptions) => CheckoutInstance;
declare global { interface Window { Razorpay?: CheckoutConstructor } }
let checkoutScript: Promise<CheckoutConstructor> | undefined;

export function loadRazorpayCheckout(): Promise<CheckoutConstructor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (checkoutScript) return checkoutScript;
  checkoutScript = new Promise<CheckoutConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => fail(), 15000);
    function fail() {
      window.clearTimeout(timeout);
      script.remove();
      checkoutScript = undefined;
      reject(new Error("Razorpay checkout could not load. No payment was started."));
    }
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.Razorpay) resolve(window.Razorpay); else fail();
    };
    document.head.append(script);
  });
  return checkoutScript;
}
