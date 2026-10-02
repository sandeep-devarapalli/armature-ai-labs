import { ecosystemEditPending, ecosystemEditPendingMessage, EcosystemEditPendingError, emptyEcosystemListing, submitEcosystemContribution, type EcosystemContribution } from "../../src/lib/ecosystem";
const invoke = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
vi.mock("../../src/lib/supabase", () => ({ supabase: { functions: { invoke }, rpc } }));
const contribution: EcosystemContribution = { idempotencyKey: "synthetic", kind: "new", targetSlug: null, baseRevision: null, proposed: emptyEcosystemListing(), submitterName: "", submitterEmail: "", permissionToShare: true, creditMe: false, turnstileToken: "synthetic-token", companyFax: "" };
beforeEach(() => { invoke.mockReset(); rpc.mockReset(); });
it.each([[429, "Too many submissions. Please try again in an hour."], [409, "This listing changed. Reload it before suggesting an edit."]])("shows a bounded actionable message for HTTP %s", async (status, message) => {
  invoke.mockResolvedValue({ data: null, error: { message: "Raw provider information must never appear", context: new Response(JSON.stringify({ message }), { status }) } });
  await expect(submitEcosystemContribution(contribution)).rejects.toThrow(`${message} Your draft is still here.`);
  expect(contribution.proposed).toEqual(emptyEcosystemListing());
});
it("does not show raw provider errors or an oversized response message", async () => {
  invoke.mockResolvedValue({ data: null, error: { message: "provider-secret", context: new Response(JSON.stringify({ message: "s".repeat(241) }), { status: 503 }) } });
  await expect(submitEcosystemContribution(contribution)).rejects.toThrow("Your submission was not confirmed. Your draft is still here; please retry.");
});
it("requires a saved receipt rather than an optimistic ok response", async () => {
  invoke.mockResolvedValueOnce({ data: { ok: true }, error: null }).mockResolvedValueOnce({ data: { saved: true, receipt: "synthetic-receipt" }, error: null });
  await expect(submitEcosystemContribution(contribution)).rejects.toThrow("Your submission was not confirmed.");
  await expect(submitEcosystemContribution(contribution)).resolves.toBe("synthetic-receipt");
});
it("checks only the public boolean edit status and fails closed on invalid or failed results", async () => {
  rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({ data: false, error: { message: "private error" } });
  await expect(ecosystemEditPending("test-listing")).resolves.toBe(true);
  expect(rpc).toHaveBeenCalledWith("ecosystem_edit_pending", { p_slug: "test-listing" });
  await expect(ecosystemEditPending("test-listing")).resolves.toBe(false);
  await expect(ecosystemEditPending("test-listing")).rejects.toThrow("We could not check");
  await expect(ecosystemEditPending("test-listing")).rejects.toThrow("We could not check");
});
it("recognises a racing pending edit without instructing the user to reload or clearing the retry key", async () => {
  invoke.mockResolvedValueOnce({ data: null, error: { context: new Response(JSON.stringify({ code: "edit_pending", message: ecosystemEditPendingMessage }), { status: 409 }) } }).mockResolvedValueOnce({ data: { saved: true, receipt: "same-retry-receipt" }, error: null });
  await expect(submitEcosystemContribution(contribution)).rejects.toBeInstanceOf(EcosystemEditPendingError);
  await expect(submitEcosystemContribution(contribution)).resolves.toBe("same-retry-receipt");
  expect(invoke.mock.calls[1][1].body.idempotencyKey).toBe(invoke.mock.calls[0][1].body.idempotencyKey);
});
