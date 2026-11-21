import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { DeskAgreementQueue } from "../../src/components/DeskAgreementQueue";
vi.mock("../../src/pages/MemberPages", () => ({ MfaPanel: () => <p>MFA setup</p> }));
vi.mock("../../src/components/ManualDeskAgreementReview", () => ({
  ManualDeskAgreementReview: ({ memberId, initialQuoteId }: { memberId: string; initialQuoteId: string }) => <p>Review binding {memberId} {initialQuoteId}</p>,
}));
it("loads staff requests explicitly and binds review to the selected customer's quote", async () => {
  const invoke = vi.fn().mockResolvedValueOnce({ data: { mode: "live", quotes: [{
    quoteId: "quote-fixture", memberId: "member-fixture", customerEmail: "buyer@example.test",
    chair: "S01", unit: "day", start: "2099-06-10", amountPaise: 35000,
  }], nextOffset: null }, error: null })
    .mockResolvedValueOnce({ data: null, error: new Error("MFA required") })
    .mockResolvedValueOnce({ data: { mode: "live", quoteId: "quote-fixture", memberId: "member-fixture", customerEmail: "buyer@example.test" }, error: null });
  render(<DeskAgreementQueue client={{ functions: { invoke } } as unknown as SupabaseClient} />);
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Desk booking requests", { selector: "summary" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh desk requests" }));
  const table = await screen.findByRole("table", { name: "Desk booking requests" });
  const row = within(table).getByRole("row", { name: /quote-fixture/ });
  expect(row).toHaveTextContent("Day pass · S01");
  expect(row).toHaveTextContent("Agreement pending");
  expect(screen.queryByText("buyer@example.test")).not.toBeInTheDocument();
  expect(screen.queryByText("MFA setup")).not.toBeInTheDocument();
  fireEvent.click(within(row).getByRole("button", { name: "Review quote-fixture" }));
  expect(screen.getByText("MFA setup")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open protected details" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("MFA");
  expect(screen.queryByText("buyer@example.test")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open protected details" }));
  expect(await screen.findByText("Review binding member-fixture quote-fixture")).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith("desk-checkout", { body: { action: "staff_overview", offset: 0 } });
});
it("shows no requests when the server denies staff access", async () => {
  const invoke = vi.fn().mockResolvedValue({ data: null, error: new Error("denied") });
  render(<DeskAgreementQueue client={{ functions: { invoke } } as unknown as SupabaseClient} />);
  fireEvent.click(screen.getByText("Desk booking requests", { selector: "summary" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh desk requests" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check your Admin session");
  expect(screen.queryByText(/Review binding/)).not.toBeInTheDocument();
});

it("keeps unpaid direct requests distinct from linked orders when loading more results", async () => {
  const quote = {
    memberId: "member-fixture", customerEmail: "buyer@example.test", chair: "S01",
    unit: "week", start: "2099-06-10", end: "2099-06-16", amountPaise: 175000, directCheckout: true,
  };
  const invoke = vi.fn()
    .mockResolvedValueOnce({ data: { mode: "live", directCheckout: true, quotes: [{ ...quote, quoteId: "pending" }], nextOffset: 50 }, error: null })
    .mockResolvedValueOnce({ data: { mode: "live", directCheckout: true, quotes: [{ ...quote, quoteId: "linked", hasOrder: true }], nextOffset: null }, error: null });
  render(<DeskAgreementQueue client={{ functions: { invoke } } as unknown as SupabaseClient} />);
  fireEvent.click(screen.getByText("Desk booking requests", { selector: "summary" }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh desk requests" }));
  fireEvent.click(await screen.findByRole("button", { name: "Load more desk requests" }));
  expect(await screen.findByText("Order linked · check payment status")).toBeInTheDocument();
  expect(screen.getByText("Awaiting direct checkout")).toBeInTheDocument();
  expect(invoke).toHaveBeenLastCalledWith("desk-checkout", { body: { action: "staff_overview", offset: 50 } });
});
