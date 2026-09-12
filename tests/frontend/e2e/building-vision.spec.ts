import { expect, test } from "@playwright/test";
import release from "../../../src/data/buildingModelRelease.json" with { type: "json" };
import electrical from "../../../src/data/buildingElectricalS02.json" with { type: "json" };

test("R06 shows the FF02 glass enclosure with coordinated CAD while retaining earlier previews and lazy floor models", async ({ page }, testInfo) => {
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
  await page.getByLabel("Choose a room").selectOption("FF-02");
  await expect(page.getByRole("heading", { name: "Enclosure proposal C04 · Blender" })).toBeVisible();
  await expect(page.getByText(/Existing back and right masonry walls/)).toBeVisible();
  await expect(page.getByText(/three fixed windows/)).toHaveCount(0);
  const enclosurePreview = page.getByRole("link", { name: "Open FF-02 enclosure Blender render", exact: true }).locator("img");
  await enclosurePreview.scrollIntoViewIfNeeded();
  await expect.poll(() => enclosurePreview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  for (const theme of ["light", "dark", "sepia"]) {
    await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("heading", { name: "Enclosure proposal C04 · Blender" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`ff02-${theme}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  }
  await page.getByRole("button", { name: "light theme", exact: true }).click();
  await page.getByText("Glass roof and inside layout", { exact: true }).click();
  const enclosureViews = page.locator("details").filter({ has: page.getByText("Enclosure CAD views: exterior, cutaway and plan", { exact: true }) });
  if ((await enclosureViews.getAttribute("open")) === null) await enclosureViews.locator("summary").click();
  for (const label of ["Open FF-02 enclosure Blender render", "Open FF-02 glass roof render", "Open FF-02 inside layout render", "Open FF-02 enclosure CAD exterior", "Open FF-02 enclosure CAD cutaway", "Open FF-02 enclosure CAD plan"]) {
    const preview = page.getByRole("link", { name: label, exact: true }).locator("img");
    await preview.scrollIntoViewIfNeeded();
    await expect.poll(() => preview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect(preview).toHaveJSProperty("naturalWidth", Number(await preview.getAttribute("width")));
    await expect(preview).toHaveJSProperty("naturalHeight", Number(await preview.getAttribute("height")));
  }
  await expect(page.getByRole("link", { name: "FF-02 · enclosure FreeCAD", exact: true })).toHaveAttribute("href", release.enclosure.freecad);
  await expect(page.getByRole("link", { name: "FF-02 · enclosure STEP", exact: true })).toHaveAttribute("href", release.enclosure.step);
  for (const [url, signature] of [[release.enclosure.freecad, "PK"], [release.enclosure.step, "ISO-10303"]]) {
    const response = await page.request.get(url);
    expect(response.ok()).toBe(true);
    expect((await response.body()).toString("ascii", 0, signature.length)).toBe(signature);
  }
  const manifestResponse = await page.request.get(`${release.root}/release.json`);
  expect(manifestResponse.ok()).toBe(true);
  expect(manifestResponse.headers()["content-type"]).toContain("application/json");
  expect((await manifestResponse.json()).release).toBe(release.label);
  expect(models).toEqual([]);
  await page.getByRole("button", { name: "Open interactive 3D" }).click();
  await expect(page.getByRole("status").filter({ hasText: "3D model ready" })).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("model-viewer")).toHaveCount(1);
  expect([...new Set(models)]).toEqual([release.floors.first.model]);
  expect(release.floors.first.model).toBe("/building-models/r06/first-floor.glb");
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
  await expect(page.getByText("Showing 6 of 6 views")).toBeVisible();
  const gallery = page.locator(".building-vision-model-image img");
  await expect(gallery).toHaveCount(6);
  for (const image of await gallery.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const bounds = await image.boundingBox();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  }
  await page.getByRole("button", { name: "Ground floor", exact: true }).click();
  await expect(page.getByText("Showing 1 of 6 views")).toBeVisible();
  await expect(gallery).toHaveCount(1);
  await page.getByRole("button", { name: "First floor", exact: true }).click();
  await expect(page.getByText("Showing 5 of 6 views")).toBeVisible();
  await expect(gallery).toHaveCount(5);
  await expect(page.locator("#ff-02-enclosure img")).toHaveAttribute("src", release.enclosure.blender);
  for (const id of ["FF-03", "FF-04", "FF-06"] as const) {
    await expect(page.locator("#" + id.toLowerCase() + "-cabins img")).toHaveAttribute("src", release.roomPreviews[id].blender);
  }
  const footer = page.locator("footer");
  await expect(footer).toContainText("1490, 11th Cross, 20th Main, 1st Sector, HSR Layout, Bengaluru – 560034, Karnataka.");
  await expect(footer.getByRole("link", { name: "hello@armatureailabs.com" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test("S02 electrical and setup plan publishes both floors with schedules and native downloads", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/building-vision/");
  await page.getByRole("link", { name: "Electrical and setup plan", exact: true }).click();
  const section = page.locator("#electrical-plan");
  await expect(section.getByRole("heading", { name: "Electrical and setup plan.", exact: true })).toBeVisible();
  await expect(section).toContainText("Not a certified electrical design");
  await expect(section).toContainText(`${electrical.scenarios[0].kw} kW`);
  await expect(section).toContainText(`${electrical.totals.sockets6} × 6 A · ${electrical.totals.sockets16} × 16 A`);
  await expect(section).toContainText(`${electrical.totals.cameras} cameras, ${electrical.totals.accessDoors} access doors`);
  const floors = [["Ground floor", "ground", "GF"], ["First floor", "first", "FF"]] as const;
  for (const [label, key, prefix] of floors) {
    const tab = section.getByRole("button", { name: `${label} electrical plan`, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-pressed", "true");
    const link = section.getByRole("link", { name: `Open the ${label.toLowerCase()} electrical plan`, exact: true });
    await expect(link).toHaveAttribute("href", electrical.plans[key].svg);
    const image = link.locator("img");
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const bounds = await image.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    const rows = section.locator(".electrical-table tbody tr");
    await expect(rows).toHaveCount(electrical.rooms.filter((room) => room.floor === prefix).length);
    await expect(section.locator(".electrical-table caption")).toHaveText(`${label} schedule per room`);
  }
  const workshop = electrical.rooms.find((room) => room.id === "FF-02")!;
  const workshopRow = section.locator(".electrical-table tbody tr").filter({ hasText: "FF-02" });
  await expect(workshopRow.locator("td").nth(5)).toHaveText(String(workshop.sockets16));
  await expect(workshopRow.locator("td").nth(6)).toHaveText(String(workshop.typicalW));
  for (const [label, href] of [
    ["Ground floor · FreeCAD electrical", electrical.downloads.groundCad],
    ["First floor · FreeCAD electrical", electrical.downloads.firstCad],
    ["Ground floor · STEP symbols", electrical.downloads.groundStep],
    ["First floor · STEP symbols", electrical.downloads.firstStep],
    ["Contractor brief · Markdown", electrical.downloads.brief],
    ["Schedule · JSON", electrical.downloads.schedule],
    ["S02 manifest and checksums", electrical.downloads.manifest]
  ] as const) await expect(section.getByRole("link", { name: label, exact: true })).toHaveAttribute("href", href);
  const manifest = await page.request.get(electrical.downloads.manifest);
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).release).toBe("S02");
  await section.getByText("Load scenarios against 10 kW", { exact: true }).click();
  await expect(section.getByText("Phases at the design case.", { exact: true })).toBeVisible();
  await section.getByText("Backup power and house rules", { exact: true }).click();
  await expect(section).toContainText("3 kVA online double-conversion");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
