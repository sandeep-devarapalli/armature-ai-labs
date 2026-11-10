import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EquipmentSaleQueue } from "../../src/components/EquipmentSaleQueue";
vi.mock("../../src/pages/MemberPages", () => ({ MfaPanel: () => <p>MFA panel</p> }));
vi.mock("../../src/lib/equipment-sale", () => ({ saleMode: "live", saleFunction: "equipment-sale" }));

const saleId = "s0000000-0000-4000-8000-000000000002";
const base = { saleId, amountPaise: 400000, status: "awaiting_check", hasOrder: false, orderPending: false, reviewReason: null, memberId: "buyer",
  lines: [{ code: "camera", name: "USB camera", maker: "Waveshare", pricePaise: 400000 }] };
const invoke = vi.fn(), getSession = vi.fn(), getAssurance = vi.fn();
const client = { functions: { invoke }, auth: { getSession, mfa: { getAuthenticatorAssuranceLevel: getAssurance } } } as unknown as SupabaseClient;
beforeEach(() => { vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: { user: { id: "staff" }, access_token: "synthetic-token" } } });
  getAssurance.mockResolvedValue({ data: { currentLevel: "aal2" } });
});
afterEach(cleanup);
async function load(sales: object[]) {
  invoke.mockResolvedValueOnce({ data: { mode: "live", sales } });
  render(<EquipmentSaleQueue client={client} actorId="staff" onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByText("Equipment sales"));
  fireEvent.click(screen.getByRole("button", { name: "Load sales" }));
  await screen.findByRole("list", { name: "Equipment sales" });
}

it("needs an MFA session before loading sales", async () => {
  getAssurance.mockResolvedValueOnce({ data: { currentLevel: "aal1" } });
  render(<EquipmentSaleQueue client={client} actorId="staff" onBusyChange={vi.fn()} />);
  fireEvent.click(screen.getByText("Equipment sales"));
  fireEvent.click(screen.getByRole("button", { name: "Load sales" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("MFA");
  expect(invoke).not.toHaveBeenCalled();
});

it("marks the in-lab check only after staff confirm it", async () => {
  await load([base]);
  invoke.mockResolvedValueOnce({ data: { mode: "live", ...base, status: "ready_to_pay" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /checked this item/ }));
  fireEvent.click(screen.getByRole("button", { name: "Check done · open payment" }));
  expect(await screen.findByText(/Payment open/)).toBeInTheDocument();
  expect(invoke).toHaveBeenLastCalledWith("equipment-sale", { body: { action: "mark_checked", saleId, memberId: "buyer", itemChecked: true },
    headers: { Authorization: "Bearer synthetic-token" } });
});

it("marks a paid sale collected or approves a refund with a reason", async () => {
  await load([{ ...base, status: "paid" }]);
  invoke.mockResolvedValueOnce({ data: { mode: "live", ...base, status: "refund_pending" } });
  fireEvent.click(screen.getByText("Approve full refund"));
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Buyer changed their mind" } });
  fireEvent.click(screen.getByRole("button", { name: "Approve refund" }));
  expect(await screen.findByText(/Refund approved, issue it in Razorpay/)).toBeInTheDocument();
  expect(invoke.mock.calls.at(-1)![1].body).toEqual({ action: "approve_refund", saleId, memberId: "buyer", reason: "Buyer changed their mind" });
  expect(screen.queryByRole("button", { name: "Mark collected" })).not.toBeInTheDocument();
});

it("keeps staff from handling their own purchase", async () => {
  await load([{ ...base, memberId: "staff" }]);
  expect(screen.getByText("Another Admin must handle your own purchase.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Check done/ })).not.toBeInTheDocument();
});
