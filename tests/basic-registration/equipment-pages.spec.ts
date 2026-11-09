import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

test("equipment list and item pages lead to the rental checkout", async ({ page }, info) => {
  test.skip(process.env.VITE_RENTAL_CHECKOUT_ENABLED !== "true" || process.env.VITE_RENTAL_CHECKOUT_MODE !== "test", "Equipment pages run only on test-mode rental builds");
  const user = { id: "10000000-0000-4000-8000-000000000053", aud: "authenticated", role: "authenticated", email: "equipment-fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const products = [
    { product: "hiwonder", kind: "equipment", name: "Hiwonder SO-101 arm kit", floor: null, billableSeats: null, extraSeats: 0, monthlyRentPaise: null,
      weekRentPaise: 105000, monthRentPaise: 390000, depositPaise: 2500000, salePaise: 5500000, availableFrom: null, status: "available", quantity: 1, freeUnits: 1,
      category: "Robot arm", maker: "Hiwonder", version: "Advanced Kit", summary: "A leader and follower arm pair with two cameras.",
      images: [{ src: "/media/equipment/hiwonder-so101-1.jpg", alt: "Hiwonder SO-101 leader and follower arms" }, { src: "/media/equipment/hiwonder-so101-box.jpg", alt: "Hiwonder SO-101 box" }],
      highlights: ["Arrives assembled; no build time"], specs: [["Degrees of freedom", "6 per arm"], ["Follower servos", "6 × HX-30HM bus servo, 30 kg·cm, magnetic encoder"]],
      parts: [["Leader arm, assembled", "1"], ["USB cable", "4"]], partsNote: "Staff check every part at handover and return.",
      sourceLabel: "Hiwonder product page", sourceUrl: "https://www.hiwonder.com/" },
    { product: "waveshare-ov5693", kind: "equipment", name: "OV5693 5MP USB Camera (A)", floor: null, billableSeats: null, extraSeats: 0, monthlyRentPaise: null,
      weekRentPaise: 100000, monthRentPaise: 200000, dayRentPaise: 20000, depositPaise: 0, availableFrom: null, status: "available", quantity: 2, freeUnits: 0,
      category: "Camera", maker: "Waveshare", images: [{ src: "/media/equipment/waveshare-ov5693-1.jpg", alt: "OV5693 camera" }] },
  ];
  await page.addInitScript(({ user, key }) => localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, key: authStorageKey });
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Equipment Fixture", email: user.email, status: "approved", application_status: "approved", role: "member", membership_level: "verified", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: true } };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "user") data = user;
    else if (name === "test-rental-checkout") data = { mode: "test", products };
    await route.fulfill({ json: data });
  });
  const width = page.viewportSize()!.width;
  await page.goto("/bookings/equipment");
  await expect(page.getByRole("link", { name: /OV5693.*Out of stock/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath("equipment-list.png"), fullPage: true });
  await page.getByRole("link", { name: /Hiwonder SO-101 arm kit/ }).click();
  await expect(page.getByRole("heading", { name: "Hiwonder SO-101 arm kit" })).toBeVisible();
  await expect(page.getByRole("row", { name: "Refundable deposit ₹25,000" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath("equipment-detail.png"), fullPage: true });
  await page.getByRole("link", { name: "Request to rent" }).click();
  await expect(page).toHaveURL(/\/bookings\?item=kit&product=hiwonder#steps$/);
  await expect(page.getByRole("list", { name: "Rental booking steps" })).toBeVisible();
});
