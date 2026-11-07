import { fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { DeskAgreementQueue } from "../../src/components/DeskAgreementQueue";
vi.mock("../../src/pages/MemberPages", () => ({ MfaPanel: () => <p>MFA setup</p> }));
vi.mock("../../src/components/ManualDeskAgreementReview", () => ({
  ManualDeskAgreementReview: ({ memberId, initialQuoteId }: { memberId: string; initialQuoteId: string }) => <p>Review binding {memberId} {initialQuoteId}</p>,
}));
it("loads staff requests explicitly and binds review to the selected customer's quote", async () => {
  const invoke = vi.fn().mockResolvedValue({ data: { mode: "live", quotes: [{
    quoteId: "quote-fixture", memberId: "member-fixture", customerEmail: "buyer@example.test",
    chair: "S01", unit: "day", start: "2099-06-10", amountPaise: 35000,
  }], nextOffset: null }, error: null });
  render(<DeskAgreementQueue client={{ functions: { invoke } } as unknown as SupabaseClient} />);
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Desk agreement requests"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh desk requests" }));
  fireEvent.click(await screen.findByRole("button", { name: "Review quote-fixture" }));
  expect(screen.getByText("Review binding member-fixture quote-fixture")).toBeInTheDocument();
  expect(invoke).toHaveBeenCalledWith("desk-checkout", { body: { action: "staff_queue", offset: 0 } });
});
it("shows no requests when the server denies staff access", async () => {
  const invoke = vi.fn().mockResolvedValue({ data: null, error: new Error("denied") });
  render(<DeskAgreementQueue client={{ functions: { invoke } } as unknown as SupabaseClient} />);
  fireEvent.click(screen.getByText("Desk agreement requests"));
  fireEvent.click(screen.getByRole("button", { name: "Refresh desk requests" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Verify your Admin session with MFA");
  expect(screen.queryByText(/Review binding/)).not.toBeInTheDocument();
});
