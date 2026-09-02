import { expect, test } from "@playwright/test";

test("brand resources are discoverable, usable and downloadable", async ({ page, request }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173"
  });
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Brand assets" }).click();

  await expect(page).toHaveURL(/\/branding$/);
  await expect(page.getByRole("heading", { level: 1, name: "Brand resources" })).toBeVisible();
  await expect(page.getByText("armature is a 3,500 sq ft physical AI and robotics lab in HSR Layout, Bengaluru.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logo system" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage and permissions" })).toBeVisible();

  const downloadLinks = page.locator('main a[download][href^="/brand/"]');
  expect(await downloadLinks.count()).toBeGreaterThanOrEqual(20);
  const downloads = await downloadLinks.evaluateAll((links) => links.map((link) => ({
    href: link.getAttribute("href"),
    download: link.getAttribute("download")
  })));
  expect(downloads.every(({ href, download }) => href?.startsWith("/brand/") && Boolean(download))).toBe(true);

  for (const [path, contentType] of [
    ["/brand/armature-lab/svg/armature-lab-lockup-h.svg", "image/svg+xml"],
    ["/brand/armature-lab/png/armature-lab-icon-512.png", "image/png"],
    ["/brand/armature-lab-assets.zip", "application/zip"]
  ] as const) {
    const response = await request.get(new URL(path, page.url()).href);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()["content-type"], path).toContain(contentType);
  }

  const [pack] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download complete pack" }).click()
  ]);
  expect(pack.suggestedFilename()).toBe("armature-lab-assets.zip");

  await page.getByRole("button", { name: "Copy one-line description" }).click();
  await expect(page.locator(".branding-copy-status")).toHaveText("Description copied to the clipboard.");

  for (const theme of ["dark", "sepia", "light"] as const) {
    await page.getByRole("button", { name: `${theme} theme` }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { level: 1, name: "Brand resources" })).toBeVisible();
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
