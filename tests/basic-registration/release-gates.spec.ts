import { expect, test } from "@playwright/test";

test("basic registration opens independently while paid access remains closed", async ({ page }) => {
  await page.route("https://reserved.invalid/**", route => route.abort());
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Create your basic membership." })).toBeVisible();
  await page.getByRole("link", { name: "Register for free" }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("link", { name: "Sign in with your email" })).toBeVisible();
  await expect(page.getByText("Staff approval verifies your registration", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Sign in with your email" }).click();
  await expect(page.getByRole("heading", { name: "Create your member account." })).toBeVisible();
  await expect(page.getByText("Use a secure email link for free registration", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  for (const path of ["/book", "/bookings", "/dashboard", "/check-in", "/inventory", "/financials", "/admin/members", "/kiosk", "/components/request"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Operational access is opening soon." })).toBeVisible();
  }
  await page.goto("/onboarding-local");
  await expect(page.getByRole("heading", { name: "That bench is not on the floor plan." })).toBeVisible();
});
