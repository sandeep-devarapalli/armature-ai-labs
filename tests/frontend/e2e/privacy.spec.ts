import { expect, test } from "@playwright/test";

test("privacy is discoverable, readable in every theme and explains registration and document retention", async ({ page }) => {
  await page.goto("/join/");
  await page.locator("footer").getByRole("link", { name: "Privacy", exact: true }).click();
  await expect(page).toHaveTitle("Privacy | Armature AI Labs");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://armatureailabs.com/privacy/");
  await expect(page.getByRole("heading", { name: "Basic membership and identity review" })).toBeVisible();
  await expect(page.locator("main")).toContainText("Jayasri Nageshwara Rao and Partners LLP");
  await expect(page.locator("main")).toContainText("2026-09-26-release-1");
  await expect(page.locator("main")).toContainText("30 days after upload");
  await expect(page.locator("main")).toContainText("not covered by the 30-day upload cleanup");
  await expect(page.locator('main a[href="mailto:privacy@armatureailabs.com"]').first()).toBeVisible();
  await expect(page.locator('main input[type="file"]')).toHaveCount(0);
  for (const theme of ["light", "dark", "sepia"]) {
    await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("privacy notice and metadata are available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/privacy/");
  await expect(page.getByRole("heading", { name: "Who is responsible" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow, max-image-preview:large");
  await context.close();
});
