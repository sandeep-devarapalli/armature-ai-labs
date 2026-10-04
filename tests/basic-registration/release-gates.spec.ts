import { expect, test } from "@playwright/test";
import { backendOrigin } from "./backend-fixture";

test("basic registration opens independently while paid access remains closed", async ({ page }) => {
  await page.route(`${backendOrigin}/**`, route => route.abort());
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Create your basic membership." })).toBeVisible();
  await page.getByRole("link", { name: "Register for free" }).first().click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByRole("heading", { name: "Join Armature AI Labs." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your free account" })).toBeVisible();
  await expect(page.getByLabel("Email address", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Email me a secure link" })).toBeVisible();
  await expect(page.getByText("Complete your profile and identity review", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  for (const path of ["/book", "/bookings", "/dashboard", "/check-in", "/inventory", "/financials", "/kiosk", "/components/request"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Operational access is opening soon." })).toBeVisible();
  }
  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
  await expect(page.locator("main").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await page.goto("/onboarding-local");
  await expect(page.getByRole("heading", { name: "That bench is not on the floor plan." })).toBeVisible();
});
