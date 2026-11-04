import { validateTestReply } from "../../src/lib/razorpay-test";

describe("test payment response boundary", () => {
  it.each([
    { mode: "live", paidAccessGranted: false },
    { mode: "test", paidAccessGranted: true },
    { mode: "test", paidAccessGranted: false, keyId: "rzp_live_forbidden" },
    { mode: "test", paidAccessGranted: false, quote: { amountPaise: 1.5, currency: "INR", taxBasis: "synthetic_test_fixture" } },
    { mode: "test", paidAccessGranted: false, order: { amountPaise: 100, currency: "USD" } },
    { mode: "test", paidAccessGranted: false, quote: { amountPaise: 100, currency: "INR", taxBasis: "not_configured_pre_tax_only" } }
  ])("rejects unsafe or non-fixture responses %#", value => {
    expect(() => validateTestReply(value)).toThrow();
  });

  it("accepts the server-owned INR test fixture", () => {
    expect(validateTestReply({ mode: "test", paidAccessGranted: false, quote: { amountPaise: 100, currency: "INR", taxBasis: "synthetic_test_fixture" } })).toHaveProperty("mode", "test");
  });
});
