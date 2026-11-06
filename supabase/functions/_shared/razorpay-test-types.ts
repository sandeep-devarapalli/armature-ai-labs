export type TestOrderState = "creating" | "created" | "authorized" | "captured" | "needs_review" | "partially_refunded" | "refunded";
export type TestRefundState = "creating" | "pending" | "processed" | "failed" | "needs_review";

export interface TestQuote {
  id: string;
  amountPaise: number;
  currency: "INR";
  taxBasis: "synthetic_test_fixture";
  expiresAt: string;
  policyVersion: string;
}

export interface TestRefund {
  id: string;
  razorpayRefundId: string | null;
  amountPaise: number;
  state: TestRefundState;
}

export interface TestOrder {
  id: string;
  quoteId: string;
  razorpayOrderId: string | null;
  amountPaise: number;
  currency: "INR";
  state: TestOrderState;
  paymentId: string | null;
  refundedAmountPaise: number;
  refunds: TestRefund[];
}

export interface TestReply {
  mode: "test";
  paidAccessGranted: false;
  keyId?: string;
  quote?: TestQuote;
  order?: TestOrder;
}
