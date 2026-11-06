import { requestTestPayment, validateTestReply } from "../../src/lib/razorpay-test";

const mock = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("../../src/config/release", () => ({ razorpayTestAvailable: true }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { functions: { invoke: mock.invoke } } }));

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

it("reports only the safe provider HTTP status after a rejected refund", async () => {
  mock.invoke.mockResolvedValue({ error: { context: Response.json({ mode: "test", paidAccessGranted: false, error: "provider_request_rejected", providerHttpStatus: 400, description: "private provider data" }) } });
  await expect(requestTestPayment({ action: "status", orderId: "fixture" })).rejects.toThrow("Razorpay rejected the test request (HTTP 400). Reconcile its status before retrying the same refund.");
});

it.each([
  { mode: "live", paidAccessGranted: false, error: "provider_request_rejected", providerHttpStatus: 400 },
  { mode: "test", paidAccessGranted: true, error: "provider_request_rejected", providerHttpStatus: 400 },
  { mode: "test", paidAccessGranted: false, error: "private provider data", providerHttpStatus: 400 },
  { mode: "test", paidAccessGranted: false, error: "provider_request_rejected", providerHttpStatus: "400 private provider data" },
  { mode: "test", paidAccessGranted: false, error: "provider_request_rejected", providerHttpStatus: 200 }
])("keeps untrusted error responses generic %#", async data => {
  mock.invoke.mockResolvedValue({ error: { message: "private provider data", context: Response.json(data) } });
  await expect(requestTestPayment({ action: "status", orderId: "fixture" })).rejects.toThrow("The test request could not be completed. Check its status before retrying a payment or refund.");
});
