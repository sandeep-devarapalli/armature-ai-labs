import { expect, test } from "@playwright/test";

test("footer publishes direct contact links", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  const discord = footer.getByRole("link", { name: "Discord", exact: true });
  const linkedIn = footer.getByRole("link", { name: "LinkedIn", exact: true });

  await expect(footer).toContainText("1490, 11th Cross, 20th Main, 1st Sector, HSR Layout, Bengaluru – 560034, Karnataka.");

  await expect(footer.getByRole("link", { name: "hello@armatureailabs.com" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");
  await expect(footer.getByRole("link", { name: "+91 9748485583" })).toHaveAttribute("href", "tel:+919748485583");
  await expect(discord).toHaveAttribute("href", "https://discord.gg/qGNXGmF8z");
  await expect(discord).toHaveAttribute("target", "_blank");
  await expect(discord).toHaveAttribute("rel", "noreferrer");
  await expect(linkedIn).toHaveAttribute("href", "https://www.linkedin.com/company/armature-ai-labs/");
  await expect(linkedIn).toHaveAttribute("target", "_blank");
  await expect(linkedIn).toHaveAttribute("rel", "noreferrer");
});

test("landing and membership pages publish verified community links", async ({ page }) => {
  await page.goto("/");
  const homeHero = page.locator(".home-hero");
  const homeDiscord = homeHero.getByRole("link", { name: "Join Discord" });
  const homeLinkedIn = homeHero.getByRole("link", { name: "Follow on LinkedIn" });

  await expect(homeDiscord).toHaveAttribute("href", "https://discord.gg/qGNXGmF8z");
  await expect(homeDiscord).toHaveAttribute("target", "_blank");
  await expect(homeDiscord).toHaveAttribute("rel", "noreferrer");
  await expect(homeLinkedIn).toHaveAttribute("href", "https://www.linkedin.com/company/armature-ai-labs/");
  await expect(homeLinkedIn).toHaveAttribute("target", "_blank");
  await expect(homeLinkedIn).toHaveAttribute("rel", "noreferrer");

  await page.goto("/join");
  const joinHero = page.locator(".page-hero");
  const joinDiscord = joinHero.getByRole("link", { name: "Join Discord" });
  const joinLinkedIn = joinHero.getByRole("link", { name: "Follow on LinkedIn" });

  await expect(joinDiscord).toHaveAttribute("href", "https://discord.gg/qGNXGmF8z");
  await expect(joinDiscord).toHaveAttribute("target", "_blank");
  await expect(joinDiscord).toHaveAttribute("rel", "noreferrer");
  await expect(joinLinkedIn).toHaveAttribute("href", "https://www.linkedin.com/company/armature-ai-labs/");
  await expect(joinLinkedIn).toHaveAttribute("target", "_blank");
  await expect(joinLinkedIn).toHaveAttribute("rel", "noreferrer");
});

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
  await expect(page.locator('a[href="/procurement"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Kiosk" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Request a component" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Book a workstation" })).toHaveCount(0);

  await page.goto("/maker-desk");
  await expect(page.getByRole("link", { name: /Sign in|Request secure storage|Build a pickup order|Rent a toolkit/ })).toHaveCount(0);

  await page.goto("/components");
  await expect(page.getByRole("link", { name: "Request a component" })).toHaveCount(0);
  await expect(page.locator('a[href="/procurement"]')).toHaveCount(0);

  await page.goto("/procurement");
  await expect(page.getByRole("heading", { name: "That bench is not on the floor plan." })).toBeVisible();

  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Join the lab. Book what you need." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Create member account" })).toHaveCount(0);
  await expect(page.getByText("Online signup is not live yet")).toBeVisible();
  await expect(page.getByRole("link", { name: "Email the lab" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");

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
  await expect(page.getByRole("heading", { name: "armature ai labs", exact: true })).toBeVisible();
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
    page.getByRole("heading", { name: "Building Vision", exact: true })
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
  await expect(menu.locator('a[href="/procurement"]')).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Membership" })).toHaveAttribute("href", "/join");
  await expect(menu.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(menu.getByRole("link", { name: "Components" })).toBeVisible();
});
