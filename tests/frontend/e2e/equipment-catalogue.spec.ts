import { expect, test } from "@playwright/test";

const guides = [
  { slug: "bambu-lab-p2s", title: "Bambu Lab P2S", feature: "Quick-swap hotend" },
  { slug: "jetson-orin-nano", title: "Jetson Orin Nano Super · 8 GB", feature: "Display connection" }
];

for (const guide of guides) {
  test(`${guide.title} has a production-safe reference and an optional rendered model`, async ({ page }) => {
    const referenceRequests: string[] = [];
    page.on("request", request => {
      if (request.url().includes("equipment-reference-preview")) referenceRequests.push(request.url());
    });
    await page.goto(`/components/${guide.slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(guide.title);
    const gallery = page.locator(".equipment-gallery");
    await expect(gallery.getByRole("img", { name: `${guide.title} schematic illustration` })).toBeVisible();
    await expect(gallery.locator("img")).toHaveCount(0);
    await expect(gallery.locator("canvas")).toHaveCount(0);
    await expect(page.getByText("Planned · not bookable", { exact: true })).toBeVisible();

    await gallery.getByRole("button", { name: "Explore in 3D", exact: true }).click();
    const canvas = gallery.locator("canvas");
    await expect(canvas).toBeVisible();
    await expect(canvas).toHaveAttribute("data-frames", /^[1-9]\d*$/);
    // Read a screenshot rather than a cleared WebGL drawing buffer.
    const pixels = await canvas.screenshot();
    const variedPixels = await page.evaluate(async bytes => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      const sample = document.createElement("canvas");
      sample.width = 80; sample.height = 80;
      const context = sample.getContext("2d")!;
      context.drawImage(bitmap, 0, 0, 80, 80); bitmap.close();
      const data = context.getImageData(0, 0, 80, 80).data;
      const background = [data[0], data[1], data[2]];
      let changed = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (Math.abs(data[i] - background[0]) + Math.abs(data[i + 1] - background[1]) + Math.abs(data[i + 2] - background[2]) > 40) changed++;
      }
      return changed;
    }, Array.from(pixels));
    expect(variedPixels).toBeGreaterThan(200);
    await gallery.getByRole("button", { name: guide.feature, exact: true }).click();
    await expect(page.locator(".equipment-feature")).not.toBeEmpty();
    const frames = await canvas.getAttribute("data-frames");
    await page.waitForTimeout(500);
    await expect(canvas).toHaveAttribute("data-frames", frames!);
    await gallery.getByRole("button", { name: "Product reference", exact: true }).click();
    await expect(gallery.locator("canvas")).toHaveCount(0);
    expect(referenceRequests).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("catalogue search carries an unmatched request to the real wishlist without seeded votes", async ({ page }) => {
  await page.goto("/components");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Equipment & Components.");
  await expect(page.locator('a[href="/components/bambu-lab-p2s"]').first()).toBeVisible();
  const query = "Unlisted optical bench 7291";
  await page.getByRole("textbox", { name: "Search equipment and components", exact: true }).fill(query);
  await expect(page.getByText("No components match", { exact: true })).toBeVisible();
  const sidebar = page.getByRole("complementary", { name: "Equipment wishlist" });
  await expect(sidebar.getByText("Loading equipment requests…")).toHaveCount(0);
  await expect(sidebar.locator("li")).toHaveCount(0);
  await expect(sidebar.getByRole("link", { name: "Request this equipment" })).toHaveAttribute("href", `/components/wishlist?name=${encodeURIComponent(query)}`);
});

test("printer session planning rejects slots beyond workspace access without creating a booking", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.method() === "POST" && /reserve|booking|payment/i.test(request.url())) writes.push(request.url());
  });
  await page.goto("/components/bambu-lab-p2s");
  const panel = page.getByRole("region", { name: "Equipment access planning" });
  await panel.getByLabel("Start time · IST").selectOption("16");
  await panel.getByLabel("Slot duration").selectOption("90");
  await expect(panel.getByRole("alert")).toContainText("ends after standard workspace access at 17:00");
  await expect(panel.getByRole("button", { name: "Review planned session" })).toBeDisabled();
  await panel.getByLabel("Slot duration").selectOption("60");
  await panel.getByRole("button", { name: "Review planned session" }).click();
  await expect(panel.getByRole("status")).toContainText("No reservation or payment created");
  await expect(panel.getByRole("status")).toContainText("16:00–17:00 IST");
  expect(writes).toEqual([]);
});
