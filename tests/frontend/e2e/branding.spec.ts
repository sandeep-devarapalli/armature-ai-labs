import { expect, test } from "@playwright/test";
import manifest from "../../../public/brand/editorial-2026-09/manifest.json" with { type: "json" };

test("brand resources are discoverable, usable and downloadable", async ({ page, request, baseURL }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: baseURL
  });
  await page.goto("/");
  await page.locator("footer").getByRole("link", { name: "Brand assets" }).click();

  await expect(page).toHaveURL(/\/branding$/);
  await expect(page.getByRole("heading", { level: 1, name: "Brand resources" })).toBeVisible();
  await expect(page.getByText(manifest.copy.oneLine)).toBeVisible();
  await expect(page.getByText(manifest.copy.paragraph)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Logo system" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Usage and permissions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Helvetica Neue + Space Mono" })).toBeVisible();
  await expect(page.locator(".branding-permissions").getByRole("link", { name: "hello@armatureailabs.com" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");

  const squares = page.locator("#square-logos");
  await expect(squares.getByRole("heading", { name: "Square logos", exact: true })).toBeVisible();
  await expect(squares.locator("article")).toHaveCount(4);
  for (const kind of ["named", "icon"] as const) {
    for (const mode of ["light", "dark"] as const) {
      const title = `${kind === "named" ? "With name" : "Icon only"} · ${mode === "light" ? "white" : "black"} background`;
      await expect(squares.getByRole("heading", { name: title, exact: true })).toBeVisible();
      for (const format of ["png", "svg"] as const) {
        const path = `/brand/editorial-2026-09/logos/${kind === "named" ? "square-named" : "icon"}-${mode}-1024.${format}`;
        const link = squares.getByRole("link", { name: `Square logo ${title} · ${format.toUpperCase()}`, exact: true });
        await expect(link).toHaveAttribute("href", path);
        const response = await request.get(new URL(path, page.url()).href);
        expect(response.ok(), path).toBe(true);
        expect(response.headers()["content-type"], path).toContain(format === "png" ? "image/png" : "image/svg+xml");
        const bytes = await response.body();
        if (format === "png") {
          expect(bytes.subarray(1, 4).toString()).toBe("PNG");
          expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1024, 1024]);
        } else {
          expect(bytes.toString()).toContain('viewBox="0 0 1024 1024"');
          expect(bytes.toString()).not.toContain("<text");
        }
        const [download] = await Promise.all([page.waitForEvent("download"), link.click()]);
        expect(download.suggestedFilename()).toBe(path.split("/").pop());
      }
    }
  }

  const downloadLinks = page.locator('main a[download][href^="/brand/"]');
  expect(await downloadLinks.count()).toBeGreaterThanOrEqual(20);
  const downloads = await downloadLinks.evaluateAll((links) => links.map((link) => ({
    href: link.getAttribute("href"),
    download: link.getAttribute("download")
  })));
  expect(downloads.every(({ href, download }) => href?.startsWith("/brand/") && Boolean(download))).toBe(true);

  for (const [path, contentType] of [
    ["/brand/editorial-2026-09/logos/lockup-light-transparent-570.svg", "image/svg+xml"],
    ["/brand/editorial-2026-09/logos/mark-dark-transparent-512.svg", "image/svg+xml"],
    ["/brand/editorial-2026-09/logos/icon-dark-512.png", "image/png"],
    ["/brand/editorial-2026-09/armature-ai-labs-editorial-complete.zip", "application/zip"]
  ] as const) {
    const response = await request.get(new URL(path, page.url()).href);
    expect(response.ok(), path).toBe(true);
    expect(response.headers()["content-type"], path).toContain(contentType);
  }

  const usageNote = await request.get(new URL("/brand/editorial-2026-09/USAGE-AND-PERMISSIONS.md", page.url()).href);
  expect(usageNote.ok()).toBe(true);
  expect(await usageNote.text()).toContain("hello@armatureailabs.com");

  const [pack] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download complete pack" }).click()
  ]);
  expect(pack.suggestedFilename()).toBe("armature-ai-labs-editorial-complete.zip");

  await page.getByRole("button", { name: "Copy one-line description" }).click();
  await expect(page.locator(".branding-copy-status")).toHaveText("Description copied to the clipboard.");

  await page.getByRole("group", { name: "Asset background", exact: true }).getByRole("button", { name: "For dark surfaces" }).click();
  await expect(page.getByRole("link", { name: "App, profile and browser icons dark 512 px · PNG" })).toHaveAttribute("href", "/brand/editorial-2026-09/logos/icon-dark-512.png");
  await page.getByRole("combobox", { name: "App, profile and browser icons export size" }).selectOption("32-solid");
  await expect(page.getByRole("link", { name: "App, profile and browser icons dark 32 px · PNG" })).toHaveAttribute("href", "/brand/editorial-2026-09/logos/icon-dark-32.png");

  for (const theme of ["dark", "sepia", "light"] as const) {
    await page.getByRole("button", { name: `${theme} theme` }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.getByRole("heading", { level: 1, name: "Brand resources" })).toBeVisible();
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
});
