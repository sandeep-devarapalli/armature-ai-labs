import { expect, test } from "@playwright/test";

test("public HTML includes article content without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/blog/model-hardware-standard/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("MCP moment");
  await expect(page.locator("main")).toContainText("Hardware-in-the-loop");
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", "https://armatureailabs.com/blog/model-hardware-standard/");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.getByRole("link", { name: /Watch on YouTube/ })).toBeVisible();
  await context.close();
});

test("hydration preserves themes and route changes update search metadata", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|Minified React error/i.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    if (!localStorage.getItem("armature-theme")) localStorage.setItem("armature-theme", "light");
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "light theme", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("main")).toContainText("not yet available to book");
  await page.locator("footer").getByRole("link", { name: "Blog", exact: true }).click();
  await expect(page).toHaveTitle("The Lab Journal | Armature AI Labs");
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute("href", "https://armatureailabs.com/blog/");
  await page.locator('main a[href="/blog/model-hardware-standard/"]').first().click();
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(1);
  await page.getByRole("button", { name: "sepia theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
