import { fireEvent, render, screen } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { ManualDeskAgreementReview } from "../../src/components/ManualDeskAgreementReview";

const mock = vi.hoisted(() => ({
  listFactors: vi.fn(), getAuthenticatorAssuranceLevel: vi.fn(), enroll: vi.fn(), challengeAndVerify: vi.fn(),
}));
vi.mock("../../src/lib/supabase", () => ({ supabase: { auth: { mfa: mock } } }));
vi.mock("../../src/context/AppContext", () => ({ useApp: vi.fn(), resourceFor: vi.fn() }));

it("lets an agreement reviewer enroll and verify MFA without visiting the gated profile", async () => {
  mock.listFactors.mockResolvedValueOnce({ data: { totp: [] }, error: null })
    .mockResolvedValueOnce({ data: { totp: [{ id: "fixture-factor", status: "verified" }] }, error: null });
  mock.getAuthenticatorAssuranceLevel.mockResolvedValueOnce({ data: { currentLevel: "aal1" }, error: null })
    .mockResolvedValueOnce({ data: { currentLevel: "aal2" }, error: null });
  mock.enroll.mockResolvedValue({ data: { id: "fixture-factor", totp: { qr_code: "data:image/svg+xml,<svg/>", secret: "fixture-only" } }, error: null });
  mock.challengeAndVerify.mockResolvedValue({ error: null });
  const invoke = vi.fn();
  render(<ManualDeskAgreementReview client={{ functions: { invoke } } as unknown as SupabaseClient} memberId="buyer-fixture" />);
  fireEvent.click(screen.getByText("Review a desk agreement"));
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  fireEvent.change(await screen.findByLabelText("Six-digit authenticator code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  expect(await screen.findByText("This session is MFA verified.")).toBeInTheDocument();
  expect(mock.challengeAndVerify).toHaveBeenCalledWith({ factorId: "fixture-factor", code: "123456" });
  expect(invoke).not.toHaveBeenCalled();
});

it("links an existing provider order without resubmitting signature approval", async () => {
  mock.listFactors.mockResolvedValue({ data: { totp: [{ id: "factor", status: "verified" }] }, error: null });
  mock.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
  const quoteId = "a0000000-0000-4000-8000-000000000002";
  const data = { mode: "live", quoteId, chair: "S01", start: "2026-11-09", end: "2026-11-09", amountPaise: 35000,
    customerEmail: "buyer@example.test", staffEmail: "staff@example.test", agreementSigned: true, orderPending: true };
  const invoke = vi.fn().mockResolvedValueOnce({ data, error: null })
    .mockResolvedValueOnce({ data: { ...data, orderPending: false, recovered: true }, error: null });
  render(<ManualDeskAgreementReview client={{ functions: { invoke } } as unknown as SupabaseClient} memberId="buyer-fixture" initialQuoteId={quoteId} />);
  fireEvent.click(screen.getByText("Review a desk agreement"));
  fireEvent.click(screen.getByRole("button", { name: "Look up agreement" }));
  fireEvent.change(await screen.findByLabelText("Existing Razorpay order ID"), { target: { value: "order_Existing" } });
  fireEvent.click(screen.getByRole("button", { name: "Link existing order" }));
  expect(await screen.findByText("Agreement approved. Ask the customer to check their booking status.")).toBeInTheDocument();
  expect(invoke).toHaveBeenLastCalledWith("desk-checkout", { body: {
    action: "recover_order", memberId: "buyer-fixture", quoteId, orderId: "order_Existing",
  } });
});
