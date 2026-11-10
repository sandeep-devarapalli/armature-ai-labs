import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EquipmentBuy } from "../../src/components/EquipmentBuy";

const mock = vi.hoisted(() => ({ request: vi.fn(), verified: true, signedIn: true, checkout: vi.fn(), open: vi.fn() }));
vi.mock("../../src/context/AccountContext", () => ({ accountMembershipLevelsEnabled: () => true,
  useAccount: () => ({ account: mock.signedIn ? { user_id: "buyer", membership_level: mock.verified ? "verified" : "basic" } : null, signedIn: mock.signedIn }) }));
vi.mock("../../src/lib/equipment-sale", () => ({ saleMode: "test", saleRequest: mock.request }));
vi.mock("../../src/lib/razorpay-checkout", () => ({ loadRazorpayCheckout: async () => class {
  constructor(options: unknown) { mock.checkout(options); }
  on() {} close() {} open() { mock.open(); }
} }));

const sale = { saleId: "s0000000-0000-4000-8000-000000000001", amountPaise: 400000, status: "awaiting_check", createdAt: "", checkedAt: null,
  paymentExpiresAt: null, hasOrder: false, orderPending: false, refundedAmount: 0, refundApprovedAt: null, collectedAt: null, declineReason: null, reviewReason: null,
  lines: [{ code: "camera", name: "USB camera", maker: "Waveshare", pricePaise: 400000 }] };
const current = () => screen.queryByRole("listitem", { current: "step" })?.textContent;
const show = (inStock = true) => render(<MemoryRouter initialEntries={["/bookings/equipment/camera"]}><EquipmentBuy code="camera" pricePaise={400000} inStock={inStock} /></MemoryRouter>);
beforeEach(() => { vi.clearAllMocks(); mock.verified = true; mock.signedIn = true;
  mock.request.mockImplementation(async body => body.action === "list_own" ? { sales: [] } : sale); });
afterEach(cleanup);

it("asks signed-out visitors to sign in to buy", () => {
  mock.signedIn = false; show();
  expect(screen.getByRole("link", { name: "Sign in to buy" })).toHaveAttribute("href", "/auth?next=%2Fbookings%2Fequipment%2Fcamera");
});

it("asks to buy without charging, then waits for the in-lab check", async () => {
  show();
  await waitFor(() => expect(mock.request).toHaveBeenCalledWith({ action: "list_own" }, "buyer"));
  expect(current()).toBe("1Ask to buy");
  fireEvent.click(screen.getByRole("button", { name: "Ask to buy · ₹4,000.00" }));
  expect(await screen.findByText("Waiting for the in-lab check")).toBeInTheDocument();
  expect(mock.request).toHaveBeenCalledWith({ action: "request", items: ["camera"] }, "buyer");
  expect(current()).toBe("2Check the item in the lab with Armature");
});

it("blocks buying when out of stock or unverified", async () => {
  show(false);
  expect(await screen.findByRole("button", { name: "Out of stock" })).toBeDisabled();
  cleanup(); mock.verified = false; show();
  expect(screen.getByRole("button", { name: /Ask to buy/ })).toBeDisabled();
  expect(screen.getByText(/Verified membership is required/)).toBeInTheDocument();
});

it("resumes an open request and pays only the checked amount after consent", async () => {
  const ready = { ...sale, status: "ready_to_pay", paymentExpiresAt: new Date(Date.now() + 20 * 60_000).toISOString() };
  mock.request.mockImplementation(async body => body.action === "list_own" ? { sales: [ready] }
    : body.action === "order" ? { keyId: "rzp_test_Synthetic", orderId: "order_Synthetic", amountPaise: 400000, currency: "INR" } : ready);
  show();
  const pay = await screen.findByRole("button", { name: "Pay ₹4,000.00 (test)" });
  expect(current()).toBe("3Pay online within 30 minutes");
  expect(pay).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(pay);
  await waitFor(() => expect(mock.open).toHaveBeenCalled());
  expect(mock.request).toHaveBeenCalledWith({ action: "order", saleId: sale.saleId, acceptedTerms: true }, "buyer");
  expect(mock.checkout).toHaveBeenCalledWith(expect.objectContaining({ order_id: "order_Synthetic", amount: 400000 }));
});

it("refuses a payment order that does not match the sale", async () => {
  const ready = { ...sale, status: "ready_to_pay", paymentExpiresAt: new Date(Date.now() + 20 * 60_000).toISOString() };
  mock.request.mockImplementation(async body => body.action === "list_own" ? { sales: [ready] }
    : body.action === "order" ? { keyId: "rzp_test_Synthetic", orderId: "order_Synthetic", amountPaise: 100, currency: "INR" } : ready);
  show();
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Pay/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("does not match");
  expect(mock.open).not.toHaveBeenCalled();
});

it("tells a paid buyer to collect and lets an unpaid buyer cancel", async () => {
  mock.request.mockImplementation(async body => body.action === "list_own" ? { sales: [{ ...sale, status: "paid" }] } : sale);
  show();
  expect(await screen.findByText(/Collect the item from the lab/)).toBeInTheDocument();
  expect(screen.queryByText("Cancel this request")).not.toBeInTheDocument();
  cleanup();
  mock.request.mockImplementation(async body => body.action === "list_own" ? { sales: [sale] } : { ...sale, status: "cancelled" });
  show();
  fireEvent.click(await screen.findByText("Cancel this request"));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Found one elsewhere" } });
  fireEvent.click(screen.getByRole("button", { name: "Cancel request" }));
  expect(await screen.findByText("Request cancelled")).toBeInTheDocument();
  expect(mock.request).toHaveBeenCalledWith({ action: "cancel", saleId: sale.saleId, confirmed: true, reason: "Found one elsewhere" }, "buyer");
});
