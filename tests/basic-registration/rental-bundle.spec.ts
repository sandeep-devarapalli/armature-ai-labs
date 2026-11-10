import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

const camera = { product: "waveshare-ov5693", kind: "equipment", name: "OV5693 5MP USB Camera (A)", maker: "Waveshare", floor: null, billableSeats: null, extraSeats: 0,
  monthlyRentPaise: null, weekRentPaise: 100000, monthRentPaise: 200000, dayRentPaise: 20000, depositPaise: 0, availableFrom: null, status: "available", quantity: 1 };
const arm = { product: "thinkrobotics-so101", kind: "equipment", name: "SO-101 robotic arm", maker: "ThinkRobotics", floor: null, billableSeats: null, extraSeats: 0,
  monthlyRentPaise: null, weekRentPaise: 80000, monthRentPaise: 250000, dayRentPaise: null, depositPaise: 2500000, availableFrom: null, status: "available",
  quantity: 1, addonCodes: ["waveshare-ov5693"] };
const noScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

test("an arm rental can add the camera for the combined rent", async ({ page }, info) => {
  test.skip(process.env.VITE_RENTAL_CHECKOUT_ENABLED !== "true" || process.env.VITE_RENTAL_CHECKOUT_MODE !== "test", "Synthetic rental UI runs only on test-mode rental builds");
  const user = { id: "10000000-0000-4000-8000-000000000073", aud: "authenticated", role: "authenticated", email: "bundle-fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const sent: Record<string, unknown>[] = [];
  await page.addInitScript(({ user, key }) => localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, key: authStorageKey });
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Bundle Fixture", email: user.email, status: "approved", application_status: "approved", role: "member", membership_level: "verified", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: true } };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "user") data = user;
    else if (name === "test-rental-checkout") {
      const body = route.request().postDataJSON();
      if (body.product) sent.push(body);
      data = { mode: "test", ...(body.action === "availability" ? (body.product ? { available: true } : { products: [arm, camera] }) : {
        quoteId: "a0000000-0000-4000-8000-000000000073", product: arm.product, productName: arm.name, kind: "equipment", unit: "week",
        start: "2027-02-01", end: "2027-02-07", rentPaise: 180000, depositPaise: 2500000, amountPaise: 2680000, paymentAmountPaise: 180000,
        depositMethod: "bank_transfer", depositStatus: "pending", policyVersion: "rental-fixture", status: "awaiting_staff", agreementSigned: false,
        addons: [{ code: camera.product, name: camera.name, maker: camera.maker, rentPaise: 100000 }] }) };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/bookings?item=kit");
  await page.getByLabel("What would you like?").selectOption(arm.product);
  await page.getByLabel(/Add the Waveshare OV5693/).check();
  await expect(page.getByLabel("Rental period").locator("option")).toHaveText(["7 days · ₹1,800.00 rent", "30 days · ₹4,500.00 rent"]);
  await page.getByLabel("Start date", { exact: true }).fill("2027-02-01");
  await page.getByLabel(/Add the Waveshare OV5693/).scrollIntoViewIfNeeded();
  await noScroll(page);
  await page.screenshot({ path: info.outputPath("bundle-form.png") });
  await page.getByRole("button", { name: "Request agreement" }).click();
  await expect(page.getByRole("heading", { name: "SO-101 robotic arm + OV5693 5MP USB Camera (A)" })).toBeVisible();
  expect(sent.map(body => [body.action, body.addons])).toEqual([["availability", ["waveshare-ov5693"]], ["quote", ["waveshare-ov5693"]]]);
  await page.getByRole("heading", { name: /SO-101 robotic arm \+/ }).scrollIntoViewIfNeeded();
  await noScroll(page);
  await page.screenshot({ path: info.outputPath("bundle-quote.png") });
});
