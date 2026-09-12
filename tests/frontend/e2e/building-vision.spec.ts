import { expect, test } from "@playwright/test";
import release from "../../../src/data/buildingModelRelease.json" with { type: "json" };

test("R04 updates FF03 while retaining R03 previews and lazy floor models", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const models: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith(".glb")) models.push(new URL(request.url()).pathname); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/building-vision/");
  await expect(page.getByRole("button", { name: "Open interactive 3D" })).toBeVisible();
  await page.getByRole("button", { name: "First floor model", exact: true }).click();
  await expect(page.getByLabel("Choose a room")).toHaveValue("FF-03");
  expect(models).toEqual([]);
  await expect(page.getByRole("link", { name: "Full first floor · FreeCAD", exact: true })).toHaveAttribute("href", release.downloads.firstCad.url);
  for (const id of ["FF-03", "FF-04", "FF-06"]) {
    await page.getByLabel("Choose a room").selectOption(id);
    const wireframe = page.locator("details").filter({ has: page.getByText("Unsectioned CAD wireframe · SVG reference", { exact: true }) });
    if ((await wireframe.getAttribute("open")) === null) await wireframe.locator("summary").click();
    for (const label of [`Open ${id} Blender render`, `Open ${id} native CAD render`, `Open ${id} plan preview`]) {
      const preview = page.getByRole("link", { name: label, exact: true }).locator("img");
      await preview.scrollIntoViewIfNeeded();
      await expect.poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
  }
  expect(models).toEqual([]);
  await page.getByRole("button", { name: "Open interactive 3D" }).click();
  await expect(page.getByRole("status").filter({ hasText: "3D model ready" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("model-viewer")).toHaveCount(1);
  expect([...new Set(models)]).toEqual([release.floors.first.model]);
  await page.locator(".building-model-stage").screenshot({ path: testInfo.outputPath("first-floor-viewer.png") });
  await page.getByRole("button", { name: "Top view", exact: true }).click();
  await page.getByRole("button", { name: "Reset view", exact: true }).click();
  await page.getByRole("button", { name: "Ground floor model", exact: true }).click();
  await expect(page.locator("model-viewer")).toHaveCount(0);
  await page.getByRole("button", { name: "Open interactive 3D" }).click();
  await expect(page.getByRole("status").filter({ hasText: "3D model ready" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("model-viewer")).toHaveCount(1);
  expect([...new Set(models)]).toEqual([release.floors.first.model, release.floors.ground.model]);
  await page.locator(".building-model-stage").screenshot({ path: testInfo.outputPath("ground-floor-viewer.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});

test("a failed model request retains previews and native downloads", async ({ page }) => {
  await page.route("**/*.glb", (route) => route.abort("failed"));
  await page.goto("/building-vision/");
  await page.getByRole("button", { name: "Open interactive 3D" }).click();
  await expect(page.getByRole("status").filter({ hasText: "3D could not load" })).toBeVisible();
  await page.getByText("Static Blender preview", { exact: true }).click();
  await expect(page.getByAltText("Ground floor static Blender preview")).toBeVisible();
  await expect(page.getByRole("link", { name: "Full ground floor · FreeCAD", exact: true })).toHaveAttribute("href", release.downloads.groundCad.url);
  await page.getByRole("button", { name: "Close 3D · return to preview" }).click();
  await expect(page.locator("model-viewer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open interactive 3D" })).toBeVisible();
});

test("building vision shows current layouts with a simple gallery and full contact address", async ({ page }) => {
  await page.goto("/building-vision/");
  await expect(page.getByRole("heading", { name: "Building Vision", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Building views.", exact: true })).toBeVisible();
  for (const text of [
    "One building, four coordinated decisions.",
    "Earlier concept image",
    "The complete 21-view Building Vision.",
    "Use these numbers for discussion",
    "Use Codex or Claude to propose a revision.",
    "Ready-to-paste prompt"
  ]) await expect(page.getByText(text, { exact: false })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Copy prompt" })).toHaveCount(0);
  await expect(page.locator(".building-vision-reference")).toHaveCount(0);
  await expect(page.getByText("Showing 5 of 5 views")).toBeVisible();
  const gallery = page.locator(".building-vision-model-image img");
  await expect(gallery).toHaveCount(5);
  for (const image of await gallery.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const bounds = await image.boundingBox();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  await page.getByRole("button", { name: "Ground floor", exact: true }).click();
  await expect(page.getByText("Showing 1 of 5 views")).toBeVisible();
  await expect(gallery).toHaveCount(1);
  await page.getByRole("button", { name: "First floor", exact: true }).click();
  await expect(page.getByText("Showing 4 of 5 views")).toBeVisible();
  await expect(gallery).toHaveCount(4);
  for (const id of ["FF-03", "FF-04", "FF-06"] as const) {
    await expect(page.locator("#" + id.toLowerCase() + "-cabins img")).toHaveAttribute("src", release.roomPreviews[id].blender);
  }
  const footer = page.locator("footer");
  await expect(footer).toContainText("1490, 11th Cross, 20th Main, 1st Sector, HSR Layout, Bengaluru – 560034, Karnataka.");
  await expect(footer.getByRole("link", { name: "hello@armatureailabs.com" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
