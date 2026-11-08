import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

test("rental staff review separates particulars and completed signatures", async ({ page }, info) => {
  test.skip(process.env.VITE_RENTAL_CHECKOUT_ENABLED !== "true", "Rental review is gated off");
  const mode = process.env.VITE_RENTAL_CHECKOUT_MODE === "test" ? "test" : "live";
  const endpoint = mode === "test" ? "test-rental-checkout" : "rental-checkout";
  const staffId = "10000000-0000-4000-8000-000000000061", memberId = "10000000-0000-4000-8000-000000000062";
  const quoteId = "a0000000-0000-4000-8000-000000000062";
  const user = { id: staffId, aud: "authenticated", role: "authenticated", email: "staff@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z", factors: [{ id: "factor", status: "verified", factor_type: "totp" }] };
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: staffId, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 36000, amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }] })).toString("base64url"), "synthetic-signature"].join(".");
  await page.addInitScript(({ user, key, token }) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, key: authStorageKey, token });
  const actions: string[] = [];
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: staffId, name: "Synthetic Reviewer", email: user.email, status: "approved", application_status: null, role: "admin", membership_level: "basic", membership_levels_enabled: true };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "list_basic_members") data = { items: [{ user_id: memberId, name: "Synthetic Renter", email: "renter@example.test", registered_at: "2026-09-01T00:00:00Z", status: "incomplete", application_status: null, role: "member", revision: null, photo_available: false, id_available: false, reviewed_at: null }], total: 1, counts: {} };
    else if (name === "user") data = user;
    else if (name === endpoint) {
      const body = route.request().postDataJSON(); actions.push(body.action);
      data = { mode, quoteId, product: "hiwonder", unit: "week", start: "2099-06-10", end: "2099-06-16", rentPaise: 105000, depositPaise: 2500000, amountPaise: 2605000, agreementHash: "a".repeat(64), policyVersion: "rental-fixture", agreementSigned: false, hasOrder: false, orderPending: false, preparedAt: null, approvedAt: null, status: "awaiting_staff", customerEmail: "renter@example.test", staffEmail: "signer@example.test" };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/admin/members");
  await page.getByRole("button", { name: "View Synthetic Renter" }).click();
  await page.getByText("Review a cabin or equipment agreement", { exact: true }).click();
  await page.getByLabel("Rental agreement reference").fill(quoteId);
  await page.getByRole("button", { name: "Find rental agreement" }).click();
  await expect(page.getByRole("heading", { name: "1. Confirm the final draft and particulars" })).toBeVisible();
  await expect(page.getByLabel("Reviewed unused-deposit terms")).toBeVisible();
  await expect(page.getByLabel("Executed-agreement records policy reference")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve rental agreement" })).toHaveCount(0);
  expect(actions).toEqual(["manual_review"]);
  await page.getByLabel("Reviewed unused-deposit terms").fill("Manual review required before the final terms are approved.");
  await page.getByLabel("Executed-agreement records policy reference").fill("Synthetic review reference, no production retention approval.");
  const review = page.locator("details").filter({ has: page.locator("summary", { hasText: "Review a cabin or equipment agreement" }) });
  await review.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  for (const box of await review.locator("input, textarea, button").evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right }; }))) {
    expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  await page.screenshot({ path: info.outputPath("rental-staff-review.png"), fullPage: true });
  await page.getByRole("heading", { name: "Hiwonder kit", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("rental-staff-viewport.png") });
});
