import { ecosystemChanges, ecosystemEditPending, ecosystemEditPendingMessage, EcosystemEditPendingError, emptyEcosystemListing, getEcosystemListings, hydrateEcosystemListing, submitEcosystemContribution, type EcosystemContribution } from "../../src/lib/ecosystem";
const invoke = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { functions: { invoke }, rpc, from } }));
const contribution: EcosystemContribution = { idempotencyKey: "synthetic", kind: "new", targetSlug: null, baseRevision: null, proposed: emptyEcosystemListing(), submitterName: "", submitterEmail: "", permissionToShare: true, creditMe: false, turnstileToken: "synthetic-token", companyFax: "" };
beforeEach(() => {
  invoke.mockReset(); rpc.mockReset(); from.mockReset().mockReturnValue(query);
  query.select.mockReset().mockReturnThis(); query.eq.mockReset().mockReturnThis(); query.order.mockReset().mockReturnThis(); query.range.mockReset();
});
it("loads more than 1,000 approved listings in ordered 500-row pages without truncation", async () => {
  const records = Array.from({ length: 1003 }, (_, i) => ({ slug: `fixture-${String(i).padStart(4, "0")}`, revision: 1, data: emptyEcosystemListing() }));
  query.range.mockImplementation(async (start: number, end: number) => ({ data: records.slice(start, end + 1), error: null }));
  const listings = await getEcosystemListings();
  expect(listings.map(({ slug }) => slug)).toEqual(records.map(({ slug }) => slug));
  expect(listings[1002].data.slug).toBe("fixture-1002");
  expect(query.range.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  expect(query.eq.mock.calls).toEqual(Array.from({ length: 3 }, () => ["published", true]));
  expect(query.order.mock.calls).toEqual(Array.from({ length: 3 }, () => ["slug"]));
  expect(from.mock.calls).toEqual(Array.from({ length: 3 }, () => ["ecosystem_listings"]));
});
it("never returns a misleading partial catalogue when a later page fails", async () => {
  const page = Array.from({ length: 500 }, (_, i) => ({ slug: `fixture-${i}`, revision: 1, data: emptyEcosystemListing() }));
  query.range.mockResolvedValueOnce({ data: page, error: null }).mockResolvedValueOnce({ data: null, error: { message: "Synthetic network failure" } });
  await expect(getEcosystemListings()).rejects.toThrow("The atlas could not be loaded");
  expect(query.range).toHaveBeenCalledTimes(2);
});
it("checks one final empty page when the catalogue exactly fills a page", async () => {
  query.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ slug: `fixture-${i}`, revision: 1, data: emptyEcosystemListing() })), error: null }).mockResolvedValueOnce({ data: [], error: null });
  await expect(getEcosystemListings()).resolves.toHaveLength(500);
  expect(query.range.mock.calls).toEqual([[0, 499], [500, 999]]);
});
it("hydrates legacy listings with guide defaults and preserves explicitly supplied metadata", () => {
  const { city: _city, guideCategories: _categories, googleMapsUrl: _maps, ...legacy } = emptyEcosystemListing();
  const hydrated = hydrateEcosystemListing({ slug: "legacy", revision: 1, data: legacy });
  expect(hydrated.data).toMatchObject({ city: "bangalore", guideCategories: [], googleMapsUrl: "" });
  expect(hydrated.data.coordinates).toBeUndefined();
  const proposed = { ...hydrated.data, guideCategories: ["workspaces"] as const, googleMapsUrl: "https://maps.app.goo.gl/synthetic" };
  expect(ecosystemChanges(hydrated.data, { ...proposed, guideCategories: [...proposed.guideCategories] })).toEqual(["guideCategories", "googleMapsUrl"]);
});
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
