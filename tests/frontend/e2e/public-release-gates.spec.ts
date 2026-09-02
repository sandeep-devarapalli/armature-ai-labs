import { expect, test } from "@playwright/test";

test("public-first production gates operational routes", async ({ page }) => {
  await page.goto("/auth");
  const directRouteHeading = page.getByRole("heading", { level: 1 });
  await directRouteHeading.waitFor();
  test.skip(
    await directRouteHeading.textContent() !== "Operational access is opening soon.",
    "Production gating is intentionally disabled in an explicit demo build."
  );

  await page.goto("/");
  await expect(page.getByTitle("Sign in")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary navigation" }).locator('a[href="/financials"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kiosk" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request a component" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a workstation" })).toHaveCount(0);

  await page.goto("/maker-desk");
  await expect(page.getByRole("link", { name: /Sign in|Request secure storage|Build a pickup order|Rent a toolkit/ })).toHaveCount(0);

  await page.goto("/components");
  await expect(page.getByRole("link", { name: "Request a component" })).toHaveCount(0);

  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Join the lab. Book what you need." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create member account" })).toHaveCount(0);
  await expect(page.getByText("Online signup is not live yet")).toBeVisible();

  await page.goto("/membership");
  await expect(page).toHaveURL(/\/join$/);
  await expect(page.getByRole("heading", { name: "One membership journey" })).toBeVisible();

  for (const path of [
    "/auth",
    "/book",
    "/bookings",
    "/check-in",
    "/inventory",
    "/financials",
    "/admin/members",
    "/kiosk",
    "/components/request"
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "Operational access is opening soon." })
    ).toBeVisible();
  }
});

test("equipment page stays hidden", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Equipment", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "See the space" })).toHaveCount(0);

  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Mobile navigation" })
        .getByRole("link", { name: "Equipment", exact: true })
    ).toHaveCount(0);
  }

  await page.goto("/equipment");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "armature", exact: true })).toBeVisible();
});

test("public catalogs remain available", async ({ page }) => {
  await page.goto("/projects");
  await expect(
    page.getByRole("heading", { name: "Build what the lab needs next." })
  ).toBeVisible();

  await page.goto("/components");
  await expect(
    page.getByRole("heading", { name: "Know what the lab can build with." })
  ).toBeVisible();

  await page.goto("/maker-desk");
  await expect(
    page.getByRole("heading", { name: "Keep the project moving between bookings." })
  ).toBeVisible();
});

test("historical directory URLs load the React routes", async ({ page }) => {
  await page.goto("/projects/");
  await expect(
    page.getByRole("heading", { name: "Build what the lab needs next." })
  ).toBeVisible();

  await page.goto("/building-vision/");
  await expect(
    page.getByRole("heading", { name: "The building, without rebuilding it." })
  ).toBeVisible();
});

test("mobile public navigation remains usable with member controls disabled", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Mobile breakpoint only.");

  await page.goto("/");
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeHidden();

  const menuButton = page.getByRole("button", { name: "Open navigation" });
  await expect(menuButton).toBeVisible();
  await menuButton.click();

  const menu = page.getByRole("navigation", { name: "Mobile navigation" });
  await expect(menu).toBeVisible();
  await expect(menu.locator('a[href="/financials"]')).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Membership" })).toHaveAttribute("href", "/join");
  await expect(menu.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Components" })).toBeVisible();
});
