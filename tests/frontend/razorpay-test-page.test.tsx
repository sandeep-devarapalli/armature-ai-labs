import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { TestOrder, TestQuote } from "../../supabase/functions/_shared/razorpay-test-types";
import type { TestCheckoutOptions } from "../../src/lib/razorpay-test";
import { RazorpayTestPage } from "../../src/pages/RazorpayTestPage";

const mock = vi.hoisted(() => ({ role: "admin", request: vi.fn(), load: vi.fn(), open: vi.fn(), close: vi.fn() }));
vi.mock("../../src/config/release", () => ({ razorpayTestAvailable: true }));
vi.mock("../../src/context/AccountContext", () => ({ useAccount: () => ({ account: { role: mock.role }, loading: false }) }));
vi.mock("../../src/lib/razorpay-test", async importOriginal => ({ ...await importOriginal<typeof import("../../src/lib/razorpay-test")>(), requestTestPayment: mock.request, loadTestCheckout: mock.load }));

const quote: TestQuote = { id: "quote-fixture", amountPaise: 100, currency: "INR", taxBasis: "synthetic_test_fixture", expiresAt: "2099-01-01T00:00:00Z", policyVersion: "2026-11-04-razorpay-test-v1" };
const order: TestOrder = { id: "internal-order", quoteId: quote.id, razorpayOrderId: "order_provider", amountPaise: 100, currency: "INR", state: "created", paymentId: null, refundedAmountPaise: 0, refunds: [] };
const reply = (values: object) => ({ mode: "test", paidAccessGranted: false, ...values });
let options: TestCheckoutOptions;
let failed: () => void;

beforeEach(() => {
  vi.clearAllMocks(); mock.role = "admin";
  mock.request.mockImplementation(async body => body.action === "create_fixture_quote" ? reply({ quote }) : reply({ keyId: "rzp_test_fixture", order }));
  mock.load.mockResolvedValue(class {
    constructor(value: TestCheckoutOptions) { options = value; }
    open = mock.open;
    close = mock.close;
    on(_event: string, handler: () => void) { failed = handler; }
  });
});

async function createOrder() {
  render(<MemoryRouter><RazorpayTestPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Prepare synthetic test quote" }));
  await screen.findByText("Synthetic integration fixture");
  const create = screen.getByRole("button", { name: "Create test order" });
  expect(create).toBeDisabled();
  for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
  fireEvent.click(create);
  await screen.findByText("created", { exact: true });
}

it("requires Admin access and performs no requests for membership-review staff", () => {
  mock.role = "membership_reviewer";
  render(<MemoryRouter><RazorpayTestPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Admin access required" })).toBeVisible();
  expect(mock.request).not.toHaveBeenCalled();
  expect(mock.load).not.toHaveBeenCalled();
});

it("requires unchecked policy and sharing acknowledgements and uses the server quote without a client price", async () => {
  await createOrder();
  expect(mock.request.mock.calls[1][0]).toEqual({ action: "create_order", quoteId: quote.id, idempotencyKey: expect.any(String), policyVersion: quote.policyVersion, acceptedPolicies: { terms: true, refund: true, shipping: true, privacy: true, paymentDataSharing: true } });
  expect(mock.request.mock.calls[1][0]).not.toHaveProperty("amountPaise");
  expect(mock.load).not.toHaveBeenCalled();
  expect(screen.getByText(/does not book inventory/)).toBeVisible();
});

it("opens only test checkout after an explicit click and waits for server verification", async () => {
  await createOrder();
  fireEvent.click(screen.getByRole("button", { name: "Open Razorpay test checkout" }));
  await waitFor(() => expect(mock.open).toHaveBeenCalledOnce());
  expect(options).toMatchObject({ key: "rzp_test_fixture", order_id: "order_provider", amount: 100, currency: "INR" });
  expect(options).not.toHaveProperty("prefill");
  mock.request.mockResolvedValue(reply({ order: { ...order, paymentId: "pay_provider", state: "authorized" } }));
  await act(async () => options.handler({ razorpay_order_id: "order_provider", razorpay_payment_id: "pay_provider", razorpay_signature: "signed-result" }));
  expect(mock.request).toHaveBeenLastCalledWith({ action: "verify", orderId: order.id, razorpayOrderId: "order_provider", paymentId: "pay_provider", signature: "signed-result" });
  expect(await screen.findByText("authorized", { exact: true })).toBeVisible();
  expect(screen.queryByText("captured", { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText("No", { exact: true })).toBeVisible();
});

it("keeps failed attempts recoverable and does not display provider error payloads", async () => {
  await createOrder();
  fireEvent.click(screen.getByRole("button", { name: "Open Razorpay test checkout" }));
  await waitFor(() => expect(mock.open).toHaveBeenCalled());
  act(() => failed());
  expect(screen.getByText(/test attempt failed/)).toBeVisible();
  expect(mock.request).toHaveBeenCalledTimes(2);
  expect(screen.getByText("created", { exact: true })).toBeVisible();
});

it("blocks a live key response before loading checkout", async () => {
  mock.request.mockImplementation(async body => body.action === "create_fixture_quote" ? reply({ quote }) : reply({ keyId: "rzp_live_forbidden", order }));
  render(<MemoryRouter><RazorpayTestPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Prepare synthetic test quote" }));
  await screen.findByText("Synthetic integration fixture");
  for (const checkbox of screen.getAllByRole("checkbox")) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Create test order" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Live payment keys are blocked");
  expect(mock.load).not.toHaveBeenCalled();
});

it("reserves a test refund and blocks a second request while it is pending", async () => {
  mock.request.mockImplementation(async body => {
    if (body.action === "create_fixture_quote") return reply({ quote });
    if (body.action === "create_order") return reply({ keyId: "rzp_test_fixture", order });
    if (body.action === "reconcile") return reply({ order: { ...order, state: "captured", paymentId: "pay_provider" } });
    return reply({ order: { ...order, state: "captured", paymentId: "pay_provider", refunds: [{ id: "refund-internal", razorpayRefundId: "rfnd_provider", amountPaise: 100, state: "pending" }] } });
  });
  await createOrder();
  fireEvent.click(screen.getByRole("button", { name: "Reconcile with Razorpay" }));
  await screen.findByText("captured", { exact: true });
  const refund = screen.getByRole("button", { name: "Refund remaining test amount" });
  fireEvent.click(refund);
  await screen.findByText(/test refund · pending/);
  expect(mock.request).toHaveBeenLastCalledWith({ action: "refund", orderId: order.id, amountPaise: 100, idempotencyKey: expect.any(String) });
  expect(refund).toBeDisabled();
});

it("recovers the existing held refund without supplying a new amount or idempotency key", async () => {
  const held = { ...order, state: "captured", paymentId: "pay_provider", refunds: [{ id: "existing-refund", razorpayRefundId: null, amountPaise: 100, state: "needs_review" }] };
  mock.request.mockImplementation(async body => {
    if (body.action === "create_fixture_quote") return reply({ quote });
    if (body.action === "create_order") return reply({ order });
    return reply({ order: body.action === "retry_refund" ? { ...held, refunds: [{ ...held.refunds[0], state: "pending" }] } : held });
  });
  await createOrder();
  fireEvent.click(screen.getByRole("button", { name: "Reconcile with Razorpay" }));
  const recover = await screen.findByRole("button", { name: "Reconcile and retry same test refund" });
  expect(screen.getByRole("button", { name: "Refund remaining test amount" })).toBeDisabled();
  fireEvent.click(recover);
  await screen.findByText(/test refund · pending/);
  expect(mock.request).toHaveBeenLastCalledWith({ action: "retry_refund", orderId: order.id, refundId: "existing-refund" });
  expect(screen.queryByRole("button", { name: "Reconcile and retry same test refund" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Refund remaining test amount" })).toBeDisabled();
});
