import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

const skip = () => test.skip(process.env.VITE_EQUIPMENT_SALE_ENABLED !== "true" || process.env.VITE_EQUIPMENT_SALE_MODE !== "test"
  || process.env.VITE_RENTAL_CHECKOUT_MODE !== "test", "Equipment sales run only on test-mode sale builds");
const buyerId = "10000000-0000-4000-8000-000000000071", staffId = "10000000-0000-4000-8000-000000000072";
const saleId = "s0000000-0000-4000-8000-000000000071";
const camera = { product: "waveshare-ov5693", kind: "equipment", name: "OV5693 5MP USB Camera (A)", floor: null, billableSeats: null, extraSeats: 0,
  monthlyRentPaise: null, weekRentPaise: 100000, monthRentPaise: 200000, dayRentPaise: 20000, depositPaise: 0, salePaise: 400000, availableFrom: null,
  status: "available", quantity: 2, freeUnits: 1, category: "Camera", maker: "Waveshare", version: "Auto-focus",
  images: [{ src: "/media/equipment/waveshare-ov5693-1.jpg", alt: "OV5693 camera" }] };
const sale = { mode: "test", saleId, amountPaise: 400000, status: "awaiting_check", createdAt: "2026-11-10T06:00:00Z", checkedAt: null, paymentExpiresAt: null,
  hasOrder: false, orderPending: false, refundedAmount: 0, refundApprovedAt: null, collectedAt: null, declineReason: null, reviewReason: null,
  lines: [{ code: "waveshare-ov5693", name: "OV5693 5MP USB Camera (A)", maker: "Waveshare", pricePaise: 400000 }] };
const noScroll = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);

test("a verified member asks to buy, then pays once staff open the window", async ({ page }, info) => {
  skip();
  const user = { id: buyerId, aud: "authenticated", role: "authenticated", email: "buyer@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  await page.addInitScript(({ user, key }) => localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, key: authStorageKey });
  let current: typeof sale | null = null;
  const sent: { action: string }[] = [];
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: buyerId, name: "Buyer Fixture", email: user.email, status: "approved", application_status: "approved", role: "member", membership_level: "verified", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: true } };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "user") data = user;
    else if (name === "test-rental-checkout") data = { mode: "test", products: [camera] };
    else if (name === "test-equipment-sale") {
      const body = route.request().postDataJSON(); sent.push(body);
      if (body.action === "request") current = { ...sale };
      data = body.action === "list_own" ? { mode: "test", sales: current ? [current] : [] } : current;
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/bookings/equipment/waveshare-ov5693");
  const ask = page.getByRole("button", { name: "Ask to buy · ₹4,000.00" });
  await ask.scrollIntoViewIfNeeded();
  await noScroll(page);
  await page.screenshot({ path: info.outputPath("buy-ask.png") });
  await ask.click();
  await expect(page.getByText("Waiting for the in-lab check")).toBeVisible();
  expect(sent.at(-1)).toEqual({ action: "request", items: ["waveshare-ov5693"] });
  await page.screenshot({ path: info.outputPath("buy-waiting.png") });
  current = { ...sale, status: "ready_to_pay", checkedAt: new Date().toISOString(), paymentExpiresAt: new Date(Date.now() + 25 * 60_000).toISOString() };
  await page.getByRole("button", { name: "Check status" }).click();
  const pay = page.getByRole("button", { name: "Pay ₹4,000.00 (test)" });
  await expect(pay).toBeDisabled();
  await page.getByLabel(/full refund until I collect the item/).check();
  await expect(pay).toBeEnabled();
  await noScroll(page);
  await page.screenshot({ path: info.outputPath("buy-pay.png") });
});

test("staff mark the in-lab check from the sale desk", async ({ page }, info) => {
  skip();
  const user = { id: staffId, aud: "authenticated", role: "authenticated", email: "staff@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z", factors: [{ id: "factor", status: "verified", factor_type: "totp" }] };
  const token = [Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"), Buffer.from(JSON.stringify({ sub: staffId, aal: "aal2", exp: Math.floor(Date.now() / 1000) + 36000, amr: [{ method: "totp", timestamp: Math.floor(Date.now() / 1000) }] })).toString("base64url"), "synthetic-signature"].join(".");
  await page.addInitScript(({ user, key, token }) => localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, key: authStorageKey, token });
  const sent: { action: string }[] = [];
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: staffId, name: "Synthetic Reviewer", email: user.email, status: "approved", application_status: null, role: "admin", membership_level: "basic", membership_levels_enabled: true };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "list_basic_members") data = { items: [], total: 0, counts: {} };
    else if (name === "user") data = user;
    else if (name === "test-equipment-sale") {
      const body = route.request().postDataJSON(); sent.push(body);
      data = body.action === "staff_queue" ? { mode: "test", sales: [{ ...sale, memberId: buyerId }] }
        : { ...sale, memberId: buyerId, status: "ready_to_pay", checkedAt: new Date().toISOString() };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/admin/members");
  await page.getByText("Equipment sales", { exact: true }).click();
  await page.getByRole("button", { name: "Load sales" }).click();
  await expect(page.getByText(/Waveshare OV5693 5MP USB Camera \(A\)/)).toBeVisible();
  await page.getByLabel("The buyer has checked this item in the lab").check();
  await page.getByRole("button", { name: "Check done · open payment" }).scrollIntoViewIfNeeded();
  await noScroll(page);
  await page.screenshot({ path: info.outputPath("sale-desk.png") });
  await page.getByRole("button", { name: "Check done · open payment" }).click();
  await expect(page.getByText(/Payment open/)).toBeVisible();
  expect(sent.at(-1)).toEqual({ action: "mark_checked", saleId, memberId: buyerId, itemChecked: true });
});
