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

async function fixtures(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("armature-theme", "light");
    Object.assign(window, { turnstile: { render(element: HTMLElement, options: { callback: (token: string) => void }) { element.textContent = "Synthetic verification fixture"; options.callback("synthetic-test-token"); return "synthetic-widget"; }, remove() {} } });
  });
  await page.route("https://challenges.cloudflare.com/turnstile/**", (route) => route.fulfill({ contentType: "application/javascript", body: "/* UI test challenge fixture, not a real verification. */" }));
  await page.route("https://tiles.openfreemap.org/styles/liberty", (route) => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: "synthetic-background", type: "background", paint: { "background-color": "#eeeeec" } }] } }));
  await page.route("**/rest/v1/ecosystem_listings?*", (route) => route.fulfill({ json: [fixture] }));
  await page.route("**/rest/v1/rpc/ecosystem_edit_pending", (route) => route.fulfill({ json: false }));
}

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
  await page.getByRole("button", { name: "build", exact: true }).click();
  await expect(page).toHaveURL(/need=build/);
  await page.getByRole("button", { name: "Research & ecosystem", exact: true }).click();
  await expect(page).toHaveURL(/type=research-ecosystem/);
  await page.goBack(); await expect(page.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goForward(); await expect(page.getByRole("button", { name: "Research & ecosystem", exact: true })).toHaveAttribute("aria-pressed", "true");
  for (const theme of ["light", "dark", "sepia"]) {
    await page.evaluate((value) => { document.documentElement.dataset.theme = value; window.scrollTo({ top: 0, behavior: "instant" }); }, theme);
    await expect(page.getByRole("heading", { name: "Bengaluru, for builders." })).toBeVisible();
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
  const listButton = page.getByRole("button", { name: "List", exact: true });
  if (await listButton.isVisible()) { await tabTo(page, listButton); await page.keyboard.press("Enter"); }
  await tabTo(page, page.getByRole("button", { name: "Suggest an edit / Add details for Synthetic Workshop" }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Suggest an edit to Synthetic Workshop" })).toBeInViewport();
  await expect(page.getByLabel("Organisation, place or resource name *")).toHaveValue("Synthetic Workshop");
});
