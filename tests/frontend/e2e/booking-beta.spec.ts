import { expect, test } from "@playwright/test";

test("retired booking beta takes visitors to current bookings", async ({ page }) => {
  for (const path of ["/booking-beta", "/booking-beta/"]) {
    await page.goto(path);
    const publicBookings = process.env.VITE_BASIC_ONBOARDING_ENABLED === "true";
    await expect(page).toHaveURL(publicBookings ? /\/bookings\/?$/ : /\/(bookings\/?|auth)$/);
    if (publicBookings) await expect(page.getByRole("heading", { name: "Book the lab." })).toBeVisible();
    await expect(page.getByText("Layout preview · availability not configured")).toHaveCount(0);
  }
});
