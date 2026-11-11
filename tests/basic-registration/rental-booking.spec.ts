import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

for (const product of ["cabin101", "hiwonder"]) test(`synthetic ${product} guided signing and payment UI`, async ({ page }, info) => {
  test.skip(process.env.VITE_RENTAL_CHECKOUT_ENABLED !== "true" || process.env.VITE_RENTAL_CHECKOUT_MODE !== "test", "Synthetic payment UI runs only on test-mode rental builds");
  const user = { id: "10000000-0000-4000-8000-000000000052", aud: "authenticated", role: "authenticated", email: "rental-fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const quote = { quoteId: "a0000000-0000-4000-8000-000000000052", product, unit: product === "cabin101" ? "month" : "week",
    start: "2027-02-01", end: product === "cabin101" ? "2027-02-28" : "2027-02-07",
    rentPaise: 5000, depositPaise: 10000, amountPaise: 15000, paymentAmountPaise: 5000,
    refundAccount: { version: 1, accountName: "Synthetic Renter", bankName: "Synthetic Bank", ifsc: "TEST0000001", last4: "0001", verifiedAt: null, ownershipConfirmed: true },
    depositMethod: "bank_transfer", depositStatus: "pending", testFixture: true, bankInstructions: null, policyVersion: "rental-fixture", status: "draft", agreementSigned: false };
  const products = [
    { product: "cabin101", kind: "cabin", name: "Cabin 101", floor: "Ground floor", billableSeats: null, extraSeats: 0, monthlyRentPaise: 4000000, weekRentPaise: null, monthRentPaise: null, depositPaise: 8000000, availableFrom: "2027-02-01", status: "available", quantity: 1 },
    { product: "hiwonder", kind: "equipment", name: "Hiwonder robotics kit", floor: null, billableSeats: null, extraSeats: 0, monthlyRentPaise: null, weekRentPaise: 105000, monthRentPaise: 390000, depositPaise: 2500000, availableFrom: null, status: "available", quantity: 1 },
  ];
  const actions: string[] = [];
  let depositSubmitted = false;
  let accountSaved = false;
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
      const body = route.request().postDataJSON(); const { action } = body;
      if (!(action === "availability" && body.product === undefined)) actions.push(action);
      if (action === "submit_deposit_reference") depositSubmitted = true;
      if (action === "save_refund_account") accountSaved = true;
      data = { mode: "test", ...(action === "availability" ? (body.product ? { available: true } : { products }) : action === "status"
        ? { ...quote, refundAccount: accountSaved ? quote.refundAccount : null, status: depositSubmitted ? "approved" : "awaiting_deposit", depositStatus: depositSubmitted ? "verified" : "pending", agreementSigned: true, approvedAt: new Date().toISOString() }
        : action === "save_refund_account" ? { ...quote, status: "awaiting_deposit", agreementSigned: true }
        : action === "submit_deposit_reference" ? { ...quote, status: "awaiting_deposit", depositStatus: "submitted", depositReference: "STAGING-BANK-100", agreementSigned: true }
        : action === "order" ? { keyId: "rzp_test_Fixture", orderId: "order_Fixture", amountPaise: quote.rentPaise, currency: "INR" }
        : action === "verify" ? { ...quote, status: "confirmed", depositStatus: "verified", agreementSigned: true } : { ...quote, refundAccount: null }) };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/bookings?item=kit");
  await expect(page.getByRole("list", { name: "Rental booking steps" })).toBeVisible();
  await page.getByLabel("What would you like?").selectOption(product);
  await page.getByLabel("Start date", { exact: true }).fill("2027-02-01");
  if (product === "cabin101") await page.getByLabel("Last day of the final month").fill("2027-02-28");
  await page.getByRole("button", { name: "Request agreement" }).click();
  await expect(page.getByRole("button", { name: "Copy full reference" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay with Razorpay/ })).toHaveCount(0);
  expect(actions).toEqual(["availability", "quote"]);
  await page.getByRole("button", { name: "Check agreement or payment status" }).click();
  await expect(page.getByLabel("Account holder name")).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay rent/ })).toHaveCount(0);
  await page.getByLabel("Account holder name").fill("Synthetic Renter");
  await page.getByLabel("Bank name", { exact: true }).fill("Synthetic Bank");
  await page.getByLabel("Account number", { exact: true }).fill("000000000001");
  await page.getByLabel("Confirm account number").fill("000000000001");
  await page.getByLabel("IFSC", { exact: true }).fill("TEST0000001");
  await page.getByRole("checkbox", { name: /This account belongs/ }).check();
  await page.getByRole("button", { name: "Save refund account securely" }).click();
  await expect(page.getByText("Ending 0001", { exact: true })).toBeVisible();
  await expect(page.getByText("000000000001", { exact: true })).toHaveCount(0);
  await page.getByLabel("Simulated bank transfer reference").fill("STAGING-BANK-100");
  await page.getByRole("button", { name: "Submit deposit reference for review" }).click();
  await expect(page.getByText("STAGING-BANK-100", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Pay rent/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Check agreement or payment status" }).click();
  await expect(page.getByText("Staff verified the bank deposit.", { exact: false })).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Pay rent with Razorpay Test Mode" }).click();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  expect(actions).toEqual(["availability", "quote", "status", "save_refund_account", "submit_deposit_reference", "status", "order", "verify"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  const notice = page.getByRole("button", { name: "Dismiss update notice" });
  if (await notice.isVisible()) await notice.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath(`rental-${product}.png`), fullPage: true });
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Your booking" }) }).last()
    .screenshot({ path: info.outputPath(`rental-${product}-booking.png`) });
});
