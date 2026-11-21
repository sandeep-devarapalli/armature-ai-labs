import { expect, test } from "@playwright/test";

test("retired booking beta takes visitors to current bookings", async ({ page }) => {
  for (const path of ["/booking-beta", "/booking-beta/"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/bookings\/?$/);
    await expect(page.getByText("Layout preview · availability not configured")).toHaveCount(0);
  }
});
