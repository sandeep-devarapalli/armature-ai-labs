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
  fireEvent.click(screen.getByText("Review a desk pilot agreement"));
  fireEvent.click(await screen.findByRole("button", { name: "Set up authenticator" }));
  fireEvent.change(await screen.findByLabelText("Six-digit authenticator code"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Finish setup" }));
  expect(await screen.findByText("This session is MFA verified.")).toBeInTheDocument();
  expect(mock.challengeAndVerify).toHaveBeenCalledWith({ factorId: "fixture-factor", code: "123456" });
  expect(invoke).not.toHaveBeenCalled();
});
