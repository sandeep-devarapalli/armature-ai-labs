import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

for (const product of ["cabin101", "hiwonder"]) test(`synthetic ${product} guided signing and payment UI`, async ({ page }, info) => {
  test.skip(process.env.VITE_RENTAL_CHECKOUT_ENABLED !== "true", "Rental interface is gated off in this build");
  const user = { id: "10000000-0000-4000-8000-000000000052", aud: "authenticated", role: "authenticated", email: "rental-fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const quote = { quoteId: "a0000000-0000-4000-8000-000000000052", product, unit: product === "cabin101" ? "month" : "week",
    start: "2027-02-01", end: product === "cabin101" ? "2027-02-28" : "2027-02-07",
    rentPaise: product === "cabin101" ? 4000000 : 105000, depositPaise: product === "cabin101" ? 8000000 : 2500000,
    amountPaise: product === "cabin101" ? 12000000 : 2605000, policyVersion: "rental-fixture", status: "draft", agreementSigned: false };
  const actions: string[] = [];
  await page.addInitScript(({ user, key }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user }));
    (window as unknown as { Razorpay: unknown }).Razorpay = class {
      options: { handler: (result: object) => void };
      constructor(options: { handler: (result: object) => void }) { this.options = options; }
      on() {} close() {}
      open() { setTimeout(() => this.options.handler({ razorpay_order_id: "order_Fixture", razorpay_payment_id: "pay_Fixture", razorpay_signature: "synthetic" }), 10); }
    };
  }, { user, key: authStorageKey });
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Rental Fixture", email: user.email, status: "approved", application_status: "approved", role: "member", membership_level: "verified", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: true } };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "user") data = user;
    else if (name === "test-rental-checkout") {
      const { action } = route.request().postDataJSON(); actions.push(action);
      data = { mode: "test", ...(action === "availability" ? { available: true } : action === "status"
        ? { ...quote, status: "approved", agreementSigned: true, approvedAt: new Date().toISOString() }
        : action === "order" ? { keyId: "rzp_test_Fixture", orderId: "order_Fixture", amountPaise: quote.amountPaise, currency: "INR" }
        : action === "verify" ? { ...quote, status: "confirmed", agreementSigned: true } : quote) };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/bookings/rentals");
  await expect(page.getByRole("list", { name: "Rental booking steps" })).toBeVisible();
  await page.getByLabel("What would you like?").selectOption(product);
  await page.getByLabel("Start date", { exact: true }).fill("2027-02-01");
  if (product === "cabin101") await page.getByLabel("Last day of the final month").fill("2027-02-28");
  await page.getByRole("button", { name: "Request agreement" }).click();
  await expect(page.getByRole("heading", { name: "Review and signing" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay with Razorpay/ })).toHaveCount(0);
  expect(actions).toEqual(["availability", "quote"]);
  await page.getByRole("button", { name: "Check agreement or payment status" }).click();
  await expect(page.getByText("Both signatures were reviewed.", { exact: false })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Pay with Razorpay Test Mode" }).click();
  await expect(page.getByText("Reservation confirmed", { exact: true })).toBeVisible();
  expect(actions).toEqual(["availability", "quote", "status", "order", "verify"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const notice = page.getByRole("button", { name: "Dismiss update notice" });
  if (await notice.isVisible()) await notice.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`rental-${product}.png`), fullPage: true });
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Your booking" }) })
    .screenshot({ path: info.outputPath(`rental-${product}-booking.png`) });
});
