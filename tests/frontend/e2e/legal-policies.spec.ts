import { expect, test } from "@playwright/test";
import { legalEntity } from "../../../src/data/legalEntity";

const labAddress = "1490, 11th Cross, 20th Main Rd, 1st Sector, HSR Layout, Bengaluru, Karnataka 560102";
const policies = [
  ["/contact", "Contact Us"],
  ["/terms", "Terms and Conditions"],
  ["/refund-policy", "Cancellation and Refund Policy"],
  ["/shipping-policy", "Shipping and Delivery Policy"],
  ["/privacy", "Your information, handled with care."]
] as const;
const legalLinks = [
  ["Contact", "/contact"], ["Terms and Conditions", "/terms"],
  ["Cancellation and Refund Policy", "/refund-policy"],
  ["Shipping and Delivery Policy", "/shipping-policy"], ["Privacy", "/privacy"]
] as const;

for (const [route, title] of policies) {
  test(`${route} loads directly with legal content and the shared footer`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
    await expect(page.locator("main")).toContainText(legalEntity.name);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://armatureailabs.com${route}/`);
    const footer = page.locator("footer");
    await expect(footer.getByText(labAddress, { exact: true })).toBeVisible();
    await expect(page.locator("main")).not.toContainText("560034");
    if (["/contact", "/shipping-policy", "/privacy"].includes(route)) {
      await expect(page.locator("main")).toContainText(labAddress);
    }
    for (const [name, href] of legalLinks) {
      await expect(footer.getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
    }
    expect(errors).toEqual([]);
  });
}

test("all policy content and links are delivered without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const [route, title] of policies) {
      const response = await page.goto(`${route}/`);
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
      await expect(page.locator("main")).toContainText(legalEntity.name);
      await expect(page.locator("footer").getByText(labAddress, { exact: true })).toBeVisible();
      await expect(page.locator("main")).not.toContainText("560034");
      for (const [name, href] of legalLinks) {
        await expect(page.locator("footer").getByRole("link", { name, exact: true })).toHaveAttribute("href", href);
      }
    }
  } finally {
    await context.close();
  }
});

test("policy pages fit mobile and desktop in light and dark themes", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, title] of policies) {
      await page.goto(route);
      for (const theme of ["light", "dark"]) {
        await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    }
  }
});

test("refund schedule scrolls within its container on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/refund-policy");
  const table = page.getByRole("table");
  await expect(table.getByRole("columnheader")).toHaveCount(3);
  await expect(table.getByRole("row")).toHaveCount(16);
  const dimensions = await table.evaluate((element) => {
    const container = element.parentElement!;
    return { tag: element.tagName, overflow: getComputedStyle(container).overflowX, width: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(dimensions.tag).toBe("TABLE");
  expect(["auto", "scroll"]).toContain(dimensions.overflow);
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("footer policy navigation updates content and page metadata", async ({ page }) => {
  await page.goto("/contact");
  for (const [route, heading] of policies) {
    const label = legalLinks.find(([, href]) => href === route)![0];
    await page.locator("footer").getByRole("link", { name: label, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page).toHaveTitle(`${route === "/privacy" ? "Privacy" : heading} | Armature AI Labs`);
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  }
});
