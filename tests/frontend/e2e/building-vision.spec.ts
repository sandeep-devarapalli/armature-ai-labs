import { expect, test } from "@playwright/test";

test("building vision presents the canonical 21-image set without overflow", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:4173"
  });
  await page.goto("/building-vision");

  await expect(page.getByRole("heading", { name: "The building, without rebuilding it." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Showing 21 of 21 views")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The complete 21-view Building Vision." })).toBeVisible();
  await expect(page.getByText(/Latest approved Blender → coordinated CAD → aligned concept photos/)).toBeVisible();
  await expect(page.locator(".building-vision-room figcaption").filter({ hasText: "Earlier appearance reference" })).toHaveCount(21);

  const conceptImages = page.locator(".building-vision-reference-image img");
  await expect(conceptImages).toHaveCount(21);
  await expect(conceptImages.first()).toHaveAttribute("loading", "lazy");
  await expect(conceptImages.first()).toHaveAttribute("width", "1086");
  await expect(conceptImages.first()).toHaveAttribute("height", "1448");

  const imagePaths = await conceptImages.evaluateAll((images) => images.map((image) =>
    new URL((image as HTMLImageElement).src).pathname
  ));
  expect(new Set(imagePaths).size).toBe(21);
  expect(imagePaths.every((path) => path.startsWith("/building-vision/rework-v2/"))).toBe(true);
  expect(imagePaths.some((path) => path.includes("/before/") || path.includes("/after/"))).toBe(false);
  expect(imagePaths.map((path) => decodeURIComponent(path))).toEqual([
    "/building-vision/rework-v2/00 - Exterior Building Frontage.png",
    "/building-vision/rework-v2/01 - Ground Floor Entrance and Reception.png",
    "/building-vision/rework-v2/02 - Ground Floor Coworking Commons - Wide View.png",
    "/building-vision/rework-v2/03 - Ground Floor Coworking - Curved Workbar Overview.png",
    "/building-vision/rework-v2/04 - Ground Floor Coworking - Curved Workbar Window Run.png",
    "/building-vision/rework-v2/05 - Ground Floor Coworking - Straight Workbar Wall Run.png",
    "/building-vision/rework-v2/06 - Ground Floor Presentation Area - Audience View.png",
    "/building-vision/rework-v2/07 - Ground Floor Two-Person Video Meeting Room.png",
    "/building-vision/rework-v2/08 - Ground Floor Open Workspace with Attached Washroom.png",
    "/building-vision/rework-v2/09 - Ground Floor Enclosed Balcony - Doorway View.png",
    "/building-vision/rework-v2/10 - Ground Floor Enclosed Balcony - Long View.png",
    "/building-vision/rework-v2/11 - Ground Floor Glass Stair Partition.png",
    "/building-vision/rework-v2/12 - Ground Floor Kitchen.png",
    "/building-vision/rework-v2/13 - First Floor Glass Stair Partition.png",
    "/building-vision/rework-v2/14 - First Floor Enclosed Right Balcony - Door View.png",
    "/building-vision/rework-v2/15 - First Floor Enclosed Right Balcony - Curved Perimeter View.png",
    "/building-vision/rework-v2/16 - First Floor Workspace - Window Wall and Glass Door View.png",
    "/building-vision/rework-v2/17 - First Floor Workspace - Three-Desk and Dresser View.png",
    "/building-vision/rework-v2/18 - First Floor Workspace - Cabinet and Desk View.png",
    "/building-vision/rework-v2/19 - First Floor Workspace - Storage Wall Entry View.png",
    "/building-vision/rework-v2/20 - First Floor Workspace - Storage Wall and Balcony View.png"
  ]);

  const modelImages = page.locator(".building-vision-model-image img");
  await expect(modelImages).toHaveCount(6);
  const stair = page.locator("#first-floor-glass-stair-partition");
  await expect(stair.locator(".building-vision-model-image img")).toHaveAttribute("src", "/building-vision/model-aligned-r01/ff04-stair.png");
  await expect(stair.locator(".building-vision-reference")).not.toHaveAttribute("open", "");
  await stair.locator("summary").click();
  await expect(stair.locator(".building-vision-reference-image img")).toBeVisible();
  await stair.locator("summary").click();
  await expect(stair.locator(".building-vision-reference-image img")).not.toBeVisible();
  for (const image of await modelImages.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await expect.poll(() => image.evaluate((node) => {
      const imageBounds = node.getBoundingClientRect();
      const frameBounds = node.parentElement!.getBoundingClientRect();
      return imageBounds.width > 0 && imageBounds.left >= frameBounds.left && imageBounds.right <= frameBounds.right && frameBounds.right <= innerWidth;
    })).toBe(true);
  }

  await page.getByRole("button", { name: "Frontage", exact: true }).click();
  await expect(page.getByText("Showing 1 of 21 views")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Exterior building frontage" })).toBeVisible();
  await expect(page.getByText("Updated Armature AI Labs identity, weighted café umbrellas, loose tables and chairs, and planted pots; remove visual clutter and cycles from this presentation view.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground floor entrance and reception" })).toHaveCount(0);

  await page.getByRole("button", { name: "Ground floor", exact: true }).click();
  await expect(page.getByText("Showing 12 of 21 views")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground floor entrance and reception" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground floor presentation area — audience view" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ground floor kitchen" })).toBeVisible();
  await expect(page.locator("#ground-floor-coworking-commons-wide-view")).toContainText("nine 2 ft 6 in square T01 modules, 17 counter chairs and 21 table chairs");
  await expect(page.locator("#ground-floor-coworking-curved-workbar-overview")).toContainText("selected counter is 17 in deep");
  await expect(page.locator("#ground-floor-presentation-area-audience-view")).toContainText("four individual lounge chairs, not a couch");
  await expect(page.locator("#ground-floor-open-workspace-attached-washroom")).toContainText("three- or four-person cabin remains unselected and is not added to issued R01");
  await expect(page.locator("#ground-floor-glass-stair-partition")).toContainText("left flat nominal 3 ft access door");
  await expect(page.getByText("GF08 enclosed balcony café and work seating — AC undecided")).toBeVisible();
  await expect(page.getByText("Existing marble and border pattern, plumbing wall, counters, cupboards, windows, doors, ceiling and service points.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "First floor glass stair partition" })).toHaveCount(0);

  await page.getByRole("button", { name: "First floor", exact: true }).click();
  await expect(page.getByText("Showing 8 of 21 views")).toBeVisible();
  await expect(page.getByRole("heading", { name: "First floor glass stair partition" })).toBeVisible();
  await expect(page.locator("#first-floor-glass-stair-partition")).toContainText("central flat nominal 3 ft access door");
  await expect(page.locator("#first-floor-enclosed-right-balcony-door-view")).toContainText("workshop and new weatherproof cover are not implemented in issued R01");
  await expect(page.locator("#first-floor-workspace-three-desks-dresser")).toContainText("Option B is not issued in R01");
  await expect(page.locator("#first-floor-workspace-three-desks-dresser")).toContainText("dresser and mirror must stay");
  await expect(page.locator("#first-floor-workspace-storage-wall-entry")).toContainText("Image-to-room registration is pending");
  await expect(page.getByRole("heading", { name: "First floor workspace — storage wall and balcony view" })).toBeVisible();
  await expect(page.getByText("Retained full-height storage, acoustic carpet, refreshed warm-white walls, open central floor area and a clearly visible balcony opening.")).toBeVisible();
  await expect(page.getByText("All cabinets and cupboards, balcony opening, door position, windows, wall proportions, services and an unobstructed route outdoors.")).toBeVisible();

  await expect(page.getByRole("heading", { name: "Use Codex or Claude to propose a revision." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Repository and working references." })).toBeVisible();
  await expect(page.getByRole("link", { name: /GitHub repository/ })).toHaveAttribute(
    "href",
    "https://github.com/sandeep-devarapalli/armature-ai-labs"
  );
  await expect(page.getByRole("link", { name: /Agent instructions/ })).toHaveAttribute(
    "href",
    "https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/AGENTS.md"
  );
  await expect(page.getByRole("link", { name: /Design system/ })).toHaveAttribute(
    "href",
    "https://github.com/sandeep-devarapalli/armature-ai-labs/blob/main/DESIGN.md"
  );
  await expect(page.getByText("/Users/dev/Downloads/Armature Lab Building rework project/Armature Lab Building rework v2/", { exact: true })).toBeVisible();
  await expect(page.getByText("public/building-vision/rework-v2/", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start the agent in this project." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Keep one coordinated image set." })).toBeVisible();
  await expect(page.getByText("Ready-to-paste prompt")).toBeVisible();
  await expect(page.getByText("Keep the canonical Building Vision set at exactly 21 PNGs", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "Copy prompt" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Set rule: Keep the canonical Building Vision set at exactly 21 PNGs"
  );
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(
    "Design authority: Latest approved Blender first, coordinated CAD second"
  );

  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth
  )).toBe(false);
  expect(await page.locator(".building-vision-room").evaluateAll((rooms) =>
    rooms.some((room) => {
      const bounds = room.getBoundingClientRect();
      return bounds.left < -1 || bounds.right > window.innerWidth + 1;
    })
  )).toBe(false);
});
