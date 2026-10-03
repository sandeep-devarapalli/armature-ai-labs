import { expect, test, type Page, type Locator } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";

const baseUrl = process.env.ECOSYSTEM_TEST_BASE_URL;
if (baseUrl) test.use({ baseURL: baseUrl });
const evidence = process.env.ECOSYSTEM_EVIDENCE_DIR || resolve(tmpdir(), "builder-atlas-review");
test.beforeAll(async () => { await mkdir(evidence, { recursive: true }); });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { const values: string[] = []; errors.set(page, values); page.on("pageerror", error => values.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });
const fixture = { slug: "synthetic-workshop", revision: 2, data: { slug: "synthetic-workshop", name: "Synthetic Workshop", summary: "A synthetic hardware workshop fixture for UI verification only.", entityType: "Research & ecosystem", primaryType: "research-ecosystem", alsoListedAs: [], needs: ["build", "learn"], sectors: ["Hardware & sensing"], subcategory: "Makerspace", locality: "Bengaluru", locationPrecision: "City-level", confidence: "Medium", locationConfidence: "Medium", websiteUrl: "https://example.test/workshop", sourceUrl: "https://example.test/source", provenance: "Synthetic test fixture", verifiedAt: "2026-10-02", publicPhones: [{ label: "Reception", number: "+91 9876543210" }], publicEmail: "", accessNote: "Synthetic access note", tips: "", engageHow: "", salesChannel: "", priceLevel: "", minOrder: "", pricingModel: "", turnaround: "", credit: null } };

async function fixtures(page: Page, listings = [fixture]) {
  await page.addInitScript(() => {
    localStorage.setItem("armature-theme", "light");
    Object.assign(window, { turnstile: { render(element: HTMLElement, options: { callback: (token: string) => void }) { element.textContent = "Synthetic verification fixture"; options.callback("synthetic-test-token"); return "synthetic-widget"; }, remove() {} } });
  });
  await page.route("https://challenges.cloudflare.com/turnstile/**", (route) => route.fulfill({ contentType: "application/javascript", body: "/* UI test challenge fixture, not a real verification. */" }));
  await page.route("https://tiles.openfreemap.org/styles/liberty", (route) => route.fulfill({ json: { version: 8, sources: { "synthetic-attribution": { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: '<a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>' } }, layers: [{ id: "synthetic-background", type: "background", paint: { "background-color": "#eeeeec" } }, { id: "synthetic-attribution", type: "circle", source: "synthetic-attribution" }] } }));
  await page.route("**/rest/v1/ecosystem_listings?*", (route) => route.fulfill({ json: listings }));
  await page.route("**/rest/v1/rpc/ecosystem_edit_pending", (route) => route.fulfill({ json: false }));
}

test("selected favicon pin renders in every theme and survives icon failure", async ({ page }, testInfo) => {
  const mapped = { ...fixture, data: { ...fixture.data, name: "Armature AI Labs", websiteUrl: "https://armatureailabs.com/", coordinates: [77.6, 12.97] } };
  await fixtures(page, [mapped]);
  await page.goto(`/ecosystem?focus=${fixture.slug}`);
  const marker = page.getByRole("img", { name: "Selected place: Armature AI Labs" });
  await expect(marker).toBeVisible();
  const icon = marker.locator("img");
  await expect(icon).toBeVisible();
  expect(await icon.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  for (const theme of ["light", "dark", "sepia"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await expect(marker).toBeInViewport();
    const label = (await marker.locator(".ecosystem-marker-label").boundingBox())!;
    const pin = (await marker.locator(".ecosystem-favicon-pin").boundingBox())!;
    expect(pin.y).toBeGreaterThan(label.y + label.height);
    if (testInfo.project.name === "mobile") {
      const topics = (await page.getByRole("navigation", { name: "Explore by topic" }).boundingBox())!;
      expect(label.y).toBeGreaterThan(topics.y + topics.height);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(evidence, `favicon-pin-${theme}-${testInfo.project.name}.png`) });
  }
  await page.getByRole("button", { name: "Close listing details" }).click();
  await expect(marker).toHaveCount(0);
  await page.route("**/brand/editorial-2026-09/logos/icon-dark-48.svg", route => route.fulfill({ status: 404, body: "" }));
  await page.goto(`/ecosystem?focus=${fixture.slug}`);
  await expect(marker).toBeVisible();
  await expect(marker.locator("img")).toHaveCount(0);
  await expect(marker.locator(".ecosystem-pin-fallback")).toBeVisible();
});

test("admin rejection explains missing notes and preserves an update after a failed save", async ({ page }, testInfo) => {
  await fixtures(page);
  const userId = "10000000-0000-4000-8000-000000000001";
  await page.addInitScript((id) => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem("sb-ecosystem-fixture-auth-token", JSON.stringify({
      access_token: `${btoa('{"alg":"HS256","typ":"JWT"}')}.${btoa(JSON.stringify({ sub: id, exp: expiresAt }))}.synthetic`,
      refresh_token: "synthetic-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: expiresAt,
      user: { id, aud: "authenticated", email: "admin@example.test", role: "authenticated", app_metadata: {}, user_metadata: {} },
    }));
  }, userId);
  const proposed = { ...fixture.data, summary: "Synthetic unsupported update. ".repeat(20), accessNote: "Synthetic changed access detail. ".repeat(15), tips: "Synthetic unsupported tip. ".repeat(15) };
  let status = "pending";
  const attempts: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/review_ecosystem_submission")) {
      attempts.push(route.request().postDataJSON());
      if (attempts.length === 1) return route.fulfill({ status: 503, json: { message: "Synthetic service failure" } });
      status = "rejected";
      return route.fulfill({ json: null });
    }
    if (path.endsWith("/rpc/get_basic_account_summary")) return route.fulfill({ json: { user_id: userId, name: "Synthetic admin", email: "admin@example.test", status: "approved", role: "admin" } });
    if (path.endsWith("/staff_roles")) return route.fulfill({ json: [{ role: "admin" }] });
    if (path.endsWith("/ecosystem_submissions")) return route.fulfill({ json: [{ id: "synthetic-update-receipt", kind: "update", target_slug: fixture.slug, base_revision: 2, proposal_revision: 1, base_data: fixture.data, proposed, status, reviewer_notes: null, contacts_permission: true, created_at: "2026-10-02T00:00:00Z" }] });
    if (path.endsWith("/ecosystem_listings")) return route.fulfill({ json: [{ ...fixture, revision: 3 }] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/ecosystem");
  await page.getByRole("button", { name: /Synthetic Workshop Suggested edit/ }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Workshop", exact: true })).toBeFocused();
  await page.getByRole("button", { name: /Synthetic Workshop Suggested edit/ }).click();
  await expect(page.getByRole("heading", { name: "Synthetic Workshop", exact: true })).toBeFocused();
  const notes = page.getByLabel("Private review notes");
  await expect(notes).toHaveAccessibleDescription(/A note is required for Reject or Needs information/);
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(notes).toBeFocused();
  await expect(notes).toBeInViewport();
  await expect(page.getByRole("alert")).toBeInViewport();
  expect(attempts).toHaveLength(0);
  await page.screenshot({ path: resolve(evidence, `fixture-reject-notes-${testInfo.project.name}.png`) });
  await notes.fill("Synthetic reason: the supplied source does not support this update.");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("The review was not saved");
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByRole("alert")).toBeInViewport();
  await expect(notes).toHaveValue("Synthetic reason: the supplied source does not support this update.");
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Rejected. No public information changed." })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual({ p_submission_id: "synthetic-update-receipt", p_decision: "rejected", p_expected_revision: 3, p_expected_proposal_revision: 1, p_reviewer_notes: "Synthetic reason: the supplied source does not support this update." });
  await page.getByLabel("Review status").selectOption("rejected");
  await expect(page.getByRole("button", { name: /Synthetic Workshop Suggested edit · rejected/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("database-backed map filters, selects and restores a listing on reload", async ({ page }) => {
  const mappedFixture = { ...fixture, data: { ...fixture.data, coordinates: [77.6, 12.97], locationPrecision: "Locality-level" } };
  await fixtures(page, [mappedFixture, { ...fixture, slug: "synthetic-drone", data: { ...fixture.data, slug: "synthetic-drone", name: "Synthetic Drone", primaryType: "startup", sectors: ["Drones & aerospace"], needs: ["build"] } }]);
  await page.goto("/ecosystem");
  await expect(page.getByText("2 results · 1 on map")).toBeVisible();
  await expect(page.locator(".ecosystem-map-shell")).toHaveAttribute("data-map-state", "ready", { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "© OpenStreetMap", includeHidden: true })).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  await expect(page.getByRole("link", { name: "Contribute through GitHub" })).toHaveAttribute("href", "https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/docs/ecosystem-contributions.md");
  await page.getByText("More filters", { exact: true }).click();
  await page.getByRole("button", { name: "learn", exact: true }).click();
  await expect(page.getByText("1 results · 1 on map")).toBeVisible();
  await page.getByRole("button", { name: "learn", exact: true }).click();
  await page.getByRole("button", { name: "Research & ecosystem", exact: true }).click();
  await expect(page.getByText("1 results · 1 on map")).toBeVisible();
  await page.getByRole("button", { name: "Research & ecosystem", exact: true }).click();
  await page.getByRole("combobox", { name: "Sector", exact: true }).selectOption("Hardware & sensing");
  await expect(page.getByText("1 results · 1 on map")).toBeVisible();
  await page.getByRole("combobox", { name: "Sector", exact: true }).selectOption("");
  await page.getByRole("searchbox").fill("Synthetic Workshop");
  await expect(page.locator(".atlas-listing")).toHaveCount(1);
  await page.locator(".atlas-listing").click();
  await expect(page).toHaveURL(/focus=synthetic-workshop/);
  const details = page.getByRole("article", { name: "Synthetic Workshop details" });
  await expect(details).toContainText("Bengaluru");
  await expect(details.getByRole("link", { name: "Public source", exact: true })).toHaveAttribute("href", fixture.data.sourceUrl);
  await expect(page.getByText(/Record confidence|Workbook trail|Robotics lead workbook|directory record/i)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Synthetic Workshop", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close listing details" }).click();
  await expect(page).not.toHaveURL(/focus=/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("mobile atlas filters and contribution fields avoid automatic input zoom", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await fixtures(page);
  await page.goto("/ecosystem?contribute=research-ecosystem&edit=synthetic-workshop");
  await expect(page.getByLabel("Phone 1", { exact: true })).toBeVisible();
  const sizes = await page.locator('.builder-atlas input:not([type="checkbox"]), .builder-atlas select, .builder-atlas textarea').evaluateAll(controls => controls.map(control => ({ label: control.getAttribute("aria-label") || control.closest("label")?.textContent, size: parseFloat(getComputedStyle(control).fontSize) })));
  expect(sizes.filter(control => control.size < 16)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("edit availability fails closed, shows a pending review, and unlocks only after checking again", async ({ page }, testInfo) => {
  await fixtures(page);
  let availability: "error" | "pending" | "open" = "error";
  await page.route("**/rest/v1/rpc/ecosystem_edit_pending", route => route.fulfill(availability === "error" ? { status: 503, json: { message: "Synthetic status failure" } } : { json: availability === "pending" }));
  await page.goto("/ecosystem?contribute=research-ecosystem&edit=synthetic-workshop");
  const notice = page.getByRole("alert", { name: "Listing edit availability" });
  await expect(notice).toContainText("We could not check whether this listing can be edited");
  await expect(page.getByLabel("Organisation, place or resource name *")).toHaveCount(0);
  availability = "pending";
  await page.getByRole("button", { name: "Retry status check" }).click();
  await expect(notice).toContainText("An update is awaiting admin review. You can suggest another edit after it is approved or rejected.");
  await expect(notice).toBeFocused();
  await expect(notice).toBeInViewport();
  await expect(page.getByRole("button", { name: "Submit for admin review" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: resolve(evidence, `fixture-pending-edit-${testInfo.project.name}.png`) });
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(notice).toContainText("This listing is under review");
  availability = "open";
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByLabel("Organisation, place or resource name *")).toHaveValue("Synthetic Workshop");
  await expect(page.getByLabel("Phone 1", { exact: true })).toHaveValue("+91 9876543210");
});

test("a pending edit race preserves the draft and retries with the same request key", async ({ page }) => {
  await fixtures(page);
  const attempts: Record<string, unknown>[] = [];
  await page.route("**/functions/v1/submit-ecosystem", async route => {
    attempts.push(route.request().postDataJSON());
    await route.fulfill(attempts.length === 1 ? { status: 409, json: { code: "edit_pending", message: "An update is awaiting admin review. You can suggest another edit after it is approved or rejected." } } : { json: { saved: true, receipt: "synthetic-race-retry-receipt" } });
  });
  await page.goto("/ecosystem?contribute=research-ecosystem&edit=synthetic-workshop");
  await page.getByLabel("What does it build or offer? *").fill("Synthetic draft preserved while another update is reviewed.");
  await page.getByLabel("Your name", { exact: true }).fill("Private synthetic name");
  await page.getByLabel(/I have permission/).check();
  await page.getByRole("button", { name: "Submit for admin review" }).click();
  await expect(page.getByRole("alert", { name: "Listing edit availability" })).toContainText("This listing is under review");
  await expect(page.getByRole("button", { name: "Submit for admin review" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Submitted for admin review" })).toHaveCount(0);
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Private synthetic name");
  await expect(page.getByLabel("What does it build or offer? *")).toHaveValue("Synthetic draft preserved while another update is reviewed.");
  await page.getByRole("button", { name: "Submit for admin review" }).click();
  await expect(page.getByText("synthetic-race-retry-receipt")).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1].idempotencyKey).toBe(attempts[0].idempotencyKey);
  expect(attempts[1].baseRevision).toBe(2);
});

test("anonymous edit has complete prefill and a saved-receipt confirmation on desktop and mobile", async ({ page }, testInfo) => {
  await fixtures(page);
  let body: Record<string, unknown> | undefined;
  await page.route("**/functions/v1/submit-ecosystem", async (route) => { body = route.request().postDataJSON(); await route.fulfill({ json: { saved: true, receipt: "synthetic-ui-receipt" } }); });
  await page.goto("/ecosystem?contribute=research-ecosystem&edit=synthetic-workshop");
  await expect(page.getByRole("heading", { name: "Suggest an edit to Synthetic Workshop" })).toBeVisible();
  await expect(page.getByLabel("Phone 1", { exact: true })).toHaveValue("+91 9876543210");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel(/Credit me publicly/)).not.toBeChecked();
  await page.getByRole("button", { name: "Add a phone number" }).click();
  await page.getByLabel("Phone 2", { exact: true }).fill("+91 9876543211");
  await page.getByLabel("Phone 2 label", { exact: true }).fill("Workshop");
  await page.getByLabel(/I have permission/).check();
  for (const theme of ["light", "dark", "sepia"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; window.scrollTo({ top: 0, behavior: "instant" }); }, theme);
    await page.screenshot({ path: resolve(evidence, `fixture-form-${theme}-${testInfo.project.name}.png`), fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; });
  await page.getByRole("button", { name: "Submit for admin review" }).click();
  await expect(page.getByRole("heading", { name: "Submitted for admin review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submitted for admin review" })).toBeFocused();
  await expect(page.getByRole("heading", { name: "Submitted for admin review" })).toBeInViewport();
  await expect.poll(async () => (await page.getByRole("heading", { name: "Submitted for admin review" }).boundingBox())?.y ?? 0).toBeGreaterThan(90);
  await expect(page.getByText("synthetic-ui-receipt")).toBeVisible();
  expect(body?.kind).toBe("update"); expect(body?.baseRevision).toBe(2);
  expect((body?.proposed as { publicPhones: unknown[] }).publicPhones).toHaveLength(2);
  await expect(page.locator(".atlas-directory")).not.toContainText("9876543211");
  await page.screenshot({ path: resolve(evidence, `fixture-confirmation-${testInfo.project.name}.png`) });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("unconfirmed response preserves the draft and never displays success", async ({ page }) => {
  await fixtures(page);
  await page.route("**/functions/v1/submit-ecosystem", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto("/ecosystem?contribute=research-ecosystem&edit=synthetic-workshop");
  await page.getByLabel(/I have permission/).check();
  await page.getByRole("button", { name: "Submit for admin review" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Your submission was not confirmed" })).toBeVisible();
  await expect(page.getByLabel("Phone 1", { exact: true })).toHaveValue("+91 9876543210");
  await expect(page.getByRole("heading", { name: "Submitted for admin review" })).toHaveCount(0);
});

test("public source and filtered URL survive browser back and forward", async ({ page }, testInfo) => {
  await fixtures(page); await page.goto("/ecosystem?focus=synthetic-workshop");
  await expect(page.getByRole("heading", { name: "Synthetic Workshop", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Public source", exact: true })).toHaveAttribute("href", fixture.data.sourceUrl);
  await page.getByRole("button", { name: "Close listing details" }).click();
  await page.getByText("More filters", { exact: true }).click();
  await page.getByRole("button", { name: "build", exact: true }).click();
  await expect(page).toHaveURL(/need=build/);
  await page.getByRole("button", { name: "Research & ecosystem", exact: true }).click();
  await expect(page).toHaveURL(/type=research-ecosystem/);
  await page.goBack(); await expect(page.getByRole("button", { name: "Research & ecosystem", exact: true })).toHaveAttribute("aria-pressed", "false");
  await page.goForward(); await expect(page.getByRole("button", { name: "Research & ecosystem", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const theme of ["light", "dark", "sepia"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; window.scrollTo({ top: 0, behavior: "instant" }); }, theme);
    await page.locator(".atlas-directory").evaluate(element => { element.scrollTop = 0; });
    await expect(page.getByRole("heading", { name: "Bangalore starter guide" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(evidence, `fixture-map-${theme}-${testInfo.project.name}.png`), fullPage: true });
  }
});

async function tabTo(page: Page, target: Locator) {
  for (let step = 0; step < 100; step++) {
    if (await target.evaluate(element => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("submit and edit actions are keyboard reachable and reveal the full form", async ({ page }) => {
  await fixtures(page); await page.goto("/ecosystem");
  await expect(page.getByText("1 results · 0 on map")).toBeVisible();
  await tabTo(page, page.getByRole("button", { name: "Submit a startup or place", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Submit a startup or place" })).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Submit a startup or place" })).toBeFocused();
  await tabTo(page, page.getByLabel("Organisation, place or resource name *"));
  await expect(page.getByLabel("Organisation, place or resource name *")).toBeFocused();
  await page.getByRole("button", { name: "Back to the atlas", exact: true }).click();
  await tabTo(page, page.locator("#chapter-work-meet").getByRole("button", { name: "Suggest an edit / Add details for Synthetic Workshop" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Suggest an edit to Synthetic Workshop" })).toBeInViewport();
  await expect(page.getByLabel("Organisation, place or resource name *")).toHaveValue("Synthetic Workshop");
});

test("duplicate suggestions preserve a draft, gate pending edits and prefill an allowed edit", async ({ page }, testInfo) => {
  await fixtures(page);
  let pending = true;
  await page.route("**/rest/v1/rpc/ecosystem_edit_pending", route => route.fulfill({ json: pending }));
  await page.goto("/ecosystem?contribute=startup");
  await page.getByLabel("Organisation, place or resource name *").fill("Synthetic Workshop");
  const matches = page.getByRole("region", { name: "Possible existing listings" });
  await expect(matches).toContainText("Same name");
  await expect(matches.getByRole("link", { name: /View listing/ })).toHaveAttribute("href", "/ecosystem?focus=synthetic-workshop");
  await page.getByLabel("Your name", { exact: true }).fill("Private synthetic draft");
  await matches.getByRole("button", { name: "Suggest an edit to Synthetic Workshop" }).click();
  await expect(matches.getByRole("alert")).toContainText("will be discarded");
  await page.getByRole("button", { name: "Keep my draft" }).click();
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Private synthetic draft");
  await matches.getByRole("button", { name: "Suggest an edit to Synthetic Workshop" }).click();
  await page.getByRole("button", { name: "Discard draft and suggest edit" }).click();
  await expect(matches.getByRole("alert")).toContainText("An update is awaiting admin review");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Private synthetic draft");
  for (const theme of ["light", "dark", "sepia"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await matches.scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(evidence, `fixture-duplicates-${theme}-${testInfo.project.name}.png`) });
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  pending = false;
  await page.getByRole("button", { name: "Discard draft and suggest edit" }).click();
  await expect(page.getByRole("heading", { name: "Suggest an edit to Synthetic Workshop" })).toBeVisible();
  await expect(page.getByLabel("Phone 1", { exact: true })).toHaveValue("+91 9876543210");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel(/I have permission/)).not.toBeChecked();
});

test("newly published duplicate requires acknowledgement before a distinct new submission", async ({ page }, testInfo) => {
  await fixtures(page, []);
  let nowPublished = false;
  let privateQueueRequests = 0;
  const attempts: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/ecosystem_listings?*", route => route.fulfill({ json: nowPublished ? [fixture] : [] }));
  await page.route("**/rest/v1/ecosystem_submissions?*", route => { privateQueueRequests++; return route.fulfill({ json: [] }); });
  await page.route("**/functions/v1/submit-ecosystem", async route => { attempts.push(route.request().postDataJSON()); await route.fulfill({ json: { saved: true, receipt: "synthetic-distinct-receipt" } }); });
  await page.goto("/ecosystem?contribute=startup");
  await page.getByLabel("Organisation, place or resource name *").fill("Synthetic Workshop");
  await page.getByLabel("What does it build or offer? *").fill("A different organisation with a similar name, synthetic test only.");
  await page.getByLabel("Website or public profile").fill("https://distinct.example.test/");
  await page.getByLabel("Source link for review *").fill("https://distinct.example.test/about");
  await page.getByLabel("Public Google Maps place link (optional)").fill("https://maps.app.goo.gl/synthetic");
  await page.getByLabel("Workspaces", { exact: true }).check();
  await page.getByLabel(/I have permission/).check();
  nowPublished = true;
  await page.getByRole("button", { name: "Submit for admin review" }).click();
  const matches = page.getByRole("region", { name: "Possible existing listings" });
  await expect(matches).toBeFocused();
  await expect(matches).toBeInViewport();
  expect(attempts).toHaveLength(0);
  await page.getByLabel("This is a different organisation").check();
  await page.getByRole("button", { name: "Submit for admin review" }).click();
  await expect(page.getByText("synthetic-distinct-receipt")).toBeVisible();
  expect(attempts).toHaveLength(1);
  expect(attempts[0].kind).toBe("new");
  expect(attempts[0].proposed).toMatchObject({ googleMapsUrl: "https://maps.app.goo.gl/synthetic", guideCategories: ["workspaces"] });
  expect(privateQueueRequests).toBe(0);
  await page.screenshot({ path: resolve(evidence, `fixture-distinct-confirmation-${testInfo.project.name}.png`) });
});

test("guide disclosures and scroll position survive details, with public Maps links and theme parity", async ({ page }, testInfo) => {
  const mapsUrl = "https://maps.app.goo.gl/synthetic-place";
  const mapsFixture = { ...fixture, data: { ...fixture.data, googleMapsUrl: mapsUrl } };
  await fixtures(page, [mapsFixture]);
  await page.goto("/ecosystem");
  const guide = page.getByRole("complementary", { name: "Ecosystem listings" });
  const reading = guide.locator("#chapter-work-meet .atlas-guide-reading");
  const filters = guide.locator(".atlas-filter-disclosure");
  await expect(guide.getByRole("heading", { name: "Bangalore starter guide" })).toBeVisible();
  await filters.locator("summary").click();
  await reading.locator("summary").click();
  await expect(filters).toHaveAttribute("open", "");
  await expect(reading).toHaveAttribute("open", "");
  const card = guide.locator(":scope > .atlas-card .atlas-listing");
  await card.scrollIntoViewIfNeeded();
  const savedScroll = await guide.evaluate(element => element.scrollTop);
  expect(savedScroll).toBeGreaterThan(0);
  await card.click();
  const detail = page.getByRole("article", { name: "Synthetic Workshop details" });
  await expect(detail).toBeFocused();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
  await expect(detail.getByRole("link", { name: "Directions", exact: true })).toHaveAttribute("href", mapsUrl);
  await expect(detail.getByRole("link", { name: "Open in Google Maps", exact: true })).toHaveAttribute("href", mapsUrl);
  await expect(detail.getByRole("link", { name: "+91 9876543210", exact: true })).toHaveAttribute("href", "tel:+919876543210");
  await expect(detail).toContainText("No confirmed map pin");
  await page.getByRole("button", { name: "Close listing details" }).click();
  await expect(guide).toBeFocused();
  await expect(filters).toHaveAttribute("open", "");
  await expect(reading).toHaveAttribute("open", "");
  await expect.poll(async () => Math.abs(await guide.evaluate(element => element.scrollTop) - savedScroll)).toBeLessThan(2);
  await filters.locator("summary").click();
  await reading.locator("summary").click();
  for (const theme of ["light", "dark", "sepia"]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; window.scrollTo({ top: 0, behavior: "instant" }); }, theme);
    await guide.evaluate(element => { element.scrollTop = 0; });
    await expect(page.locator("header").first()).toBeVisible();
    await expect(page.locator(".builder-atlas")).not.toContainText(/Advertising space|Advertise here|Place a bid|Ad enquiry/i);
    await page.screenshot({ path: resolve(evidence, `fixture-guide-overview-${theme}-${testInfo.project.name}.png`) });
    await guide.locator("#chapter-work-meet .atlas-listing").click();
    await expect(detail).toBeFocused();
    await expect(detail.getByRole("heading", { name: "Synthetic Workshop" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: resolve(evidence, `fixture-guide-detail-${theme}-${testInfo.project.name}.png`) });
    await page.getByRole("button", { name: "Close listing details" }).click();
  }
});

test("360px guide sheet expands, collapses and restores after showing more map", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await fixtures(page);
  await page.goto("/ecosystem");
  const panel = page.locator(".atlas-panel");
  const guide = page.getByRole("complementary", { name: "Ecosystem listings" });
  await expect(guide.getByRole("heading", { name: "Bangalore starter guide" })).toBeVisible();
  const initialHeight = (await panel.boundingBox())!.height;
  await page.getByRole("button", { name: "Expand details & guide" }).click();
  await expect(page.getByRole("button", { name: "Show more map" })).toHaveAttribute("aria-expanded", "true");
  expect((await panel.boundingBox())!.height).toBeGreaterThan(initialHeight);
  const topics = (await page.getByRole("navigation", { name: "Explore by topic" }).boundingBox())!;
  expect((await panel.boundingBox())!.y).toBeGreaterThanOrEqual(topics.y + topics.height);
  await page.screenshot({ path: resolve(evidence, `fixture-sheet-expanded-${testInfo.project.name}.png`) });
  await page.getByRole("button", { name: "Show more map" }).click();
  await expect(page.getByRole("button", { name: "Expand details & guide" })).toHaveAttribute("aria-expanded", "false");
  expect((await panel.boundingBox())!.height).toBeCloseTo(initialHeight, 0);
  await page.getByRole("button", { name: "Collapse guide" }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole("button", { name: "Show guide" })).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Show guide" }).click();
  await expect(panel).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand map" })).toHaveAttribute("aria-expanded", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
