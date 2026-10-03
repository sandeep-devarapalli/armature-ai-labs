import { ecosystemChanges, ecosystemEditPending, ecosystemEditPendingMessage, EcosystemEditPendingError, emptyEcosystemListing, getEcosystemListings, getEcosystemSubmissions, hydrateEcosystemListing, submitEcosystemContribution, type EcosystemContribution } from "../../src/lib/ecosystem";
const invoke = vi.hoisted(() => vi.fn());
const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), order: vi.fn(), range: vi.fn(), or: vi.fn(), limit: vi.fn() }));
vi.mock("../../src/lib/supabase", () => ({ supabase: { functions: { invoke }, rpc, from } }));
const contribution: EcosystemContribution = { idempotencyKey: "synthetic", kind: "new", targetSlug: null, baseRevision: null, proposed: emptyEcosystemListing(), submitterName: "", submitterEmail: "", permissionToShare: true, creditMe: false, turnstileToken: "synthetic-token", companyFax: "" };
beforeEach(() => {
  invoke.mockReset(); rpc.mockReset(); from.mockReset().mockReturnValue(query);
  query.select.mockReset().mockReturnThis(); query.eq.mockReset().mockReturnThis(); query.order.mockReset().mockReturnThis(); query.range.mockReset();
  query.or.mockReset().mockReturnThis(); query.limit.mockReset();
});
const reviewRows = (length: number) => Array.from({ length }, (_, i) => ({
  id: `10000000-0000-4000-8000-${String(length - i).padStart(12, "0")}`,
  created_at: "2026-10-03T08:00:00.123456+00:00", status: i % 2 ? "rejected" : "pending",
  proposed: { name: `Synthetic review ${i}`, primaryType: "vendor" },
  base_data: i ? null : { name: "Previous values", primaryType: "vendor" },
}));
it("loads every review beyond 1,000 rows with a stable timestamp and ID cursor", async () => {
  const records = reviewRows(1003);
  for (let i = 0; i < records.length; i += 500) query.limit.mockResolvedValueOnce({ data: records.slice(i, i + 500), error: null });
  const rows = await getEcosystemSubmissions();
  expect(rows.map(row => row.id)).toEqual(records.map(row => row.id));
  expect(rows.map(row => row.status)).toEqual(records.map(row => row.status));
  expect(new Set(rows.map(row => row.id)).size).toBe(1003);
  expect(query.or.mock.calls).toEqual([499, 999].map(i => [`created_at.lt.${records[i].created_at},and(created_at.eq.${records[i].created_at},id.lt.${records[i].id})`]));
  expect(query.order.mock.calls).toEqual(Array.from({ length: 3 }, () => [["created_at", { ascending: false }], ["id", { ascending: false }]]).flat());
  expect(query.limit.mock.calls).toEqual([[500], [500], [500]]);
  expect(query.eq).not.toHaveBeenCalled();
  expect(rows[1002].proposed.publicPhones).toEqual([]);
  expect(rows[0].base_data?.publicPhones).toEqual([]);
  expect(rows[1002].base_data).toBeNull();
});
it.each([0, 500, 1000])("finishes a review queue with exactly %i rows", async length => {
  const records = reviewRows(length);
  for (let i = 0; i < records.length; i += 500) query.limit.mockResolvedValueOnce({ data: records.slice(i, i + 500), error: null });
  query.limit.mockResolvedValueOnce({ data: [], error: null });
  await expect(getEcosystemSubmissions()).resolves.toHaveLength(length);
  expect(query.limit).toHaveBeenCalledTimes(length / 500 + 1);
});
it("does not return a partial review queue when a later batch fails", async () => {
  query.limit.mockResolvedValueOnce({ data: reviewRows(500), error: null }).mockResolvedValueOnce({ data: null, error: { message: "Synthetic failure" } });
  await expect(getEcosystemSubmissions()).rejects.toThrow("The review queue could not be loaded.");
});
it("keeps its boundary when a newer submission arrives between review pages", async () => {
  const records = reviewRows(503);
  query.limit.mockResolvedValueOnce({ data: records.slice(0, 500), error: null }).mockImplementationOnce(async () => {
    const withNewArrival = [{ ...records[0], id: "20000000-0000-4000-8000-000000000001" }, ...records];
    const cursor = query.or.mock.lastCall?.[0].match(/id\.lt\.([0-9a-f-]+)/)?.[1];
    return { data: withNewArrival.filter(row => row.id < cursor), error: null };
  });
  expect((await getEcosystemSubmissions()).map(row => row.id)).toEqual(records.map(row => row.id));
  expect(query.range).not.toHaveBeenCalled();
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
