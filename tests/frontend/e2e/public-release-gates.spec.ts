import { expect, test } from "@playwright/test";
import { legalEntity } from "../../../src/data/legalEntity";

test("footer publishes direct contact links", async ({ page }) => {
  await page.goto("/");
  const footer = page.locator("footer");
  const social = footer.getByRole("navigation", { name: "Follow the lab" });

  await expect(footer.getByText("1490, 11th Cross, 20th Main Rd, 1st Sector, HSR Layout, Bengaluru, Karnataka 560102", { exact: true })).toBeVisible();
  await expect(footer).not.toContainText("560034");

  await expect(footer.getByRole("link", { name: "hello@armatureailabs.com" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");
  await expect(footer.getByRole("link", { name: legalEntity.phone, exact: true })).toHaveAttribute("href", `tel:${legalEntity.phone.replace(/\s/g, "")}`);
  for (const [name, href] of [
    ["GitHub", "https://github.com/armature-ai-labs"],
    ["YouTube", "https://www.youtube.com/@armatureailabs"],
    ["Instagram", "https://www.instagram.com/armatureailabs/"],
    ["X", "https://x.com/armatureailabs"],
    ["LinkedIn", "https://www.linkedin.com/company/armature-ai-labs/"],
    ["Discord", "https://discord.gg/qGNXGmF8z"]
  ]) {
    const link = social.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", href);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noreferrer");
  }
  await expect(footer.getByRole("link", { name: "Docs", exact: true })).toHaveAttribute("href", "https://github.com/sandeep-devarapalli/armature-ai-labs/tree/main/docs");
});

test("landing and membership pages publish verified community links", async ({ page }) => {
  await page.goto("/");
  const homeHero = page.locator(".home-hero");
  const github = homeHero.getByRole("link", { name: "Explore on GitHub" });
  await expect(homeHero.getByRole("heading", { name: "Open source" })).toBeVisible();
  await expect(github).toHaveAttribute("href", "https://github.com/armature-ai-labs");
  await expect(github).toHaveAttribute("target", "_blank");
  await expect(github).toHaveAttribute("rel", "noreferrer");

  await page.goto("/join");
  const joinHero = page.locator("main");
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
  test.skip(process.env.VITE_DEMO_MODE === "true", "Explicit demo build.");
  const basicEnabled = process.env.VITE_BASIC_ONBOARDING_ENABLED === "true";
  const deskEnabled = basicEnabled && process.env.VITE_DESK_CHECKOUT_ENABLED === "true";
  await page.goto("/auth");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    basicEnabled ? "Join Armature AI Labs." : "Operational access is opening soon."
  );

  await page.goto("/");
  if (!basicEnabled) await expect(page.getByTitle("Sign in")).toHaveCount(0);
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

  if (!basicEnabled) {
    await page.goto("/join");
    await expect(page.getByRole("heading", { name: "Build with us. Enquire about membership." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Create member account" })).toHaveCount(0);
    await expect(page.getByText("Pre-launch · enquiries only")).toBeVisible();
    await expect(page.getByRole("link", { name: "Email the lab" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");

    await page.goto("/membership");
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByRole("heading", { name: "One membership journey" })).toBeVisible();
  }

  if (basicEnabled) {
    await page.goto("/admin/members");
    await expect(page.getByRole("heading", { name: "Members", exact: true })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  }

  if (basicEnabled) {
    await page.goto("/bookings/?item=guest#steps");
    await expect(page.getByRole("heading", { name: "Guest Pass", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in by email", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit guest request" })).toHaveCount(0);
    if (!deskEnabled) await expect(page.getByRole("button", { name: "Choose a desk pass", exact: true })).toHaveCount(0);
  }

  if (deskEnabled) {
    await page.goto("/bookings?item=desk");
    await expect(page.getByRole("heading", { name: "Book the lab.", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in to book", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay with Razorpay", exact: true })).toHaveCount(0);
  }

  for (const path of [
    "/book",
    ...(!basicEnabled ? ["/bookings", "/golden-pass", "/admin/passes"] : []),
    "/check-in",
    "/inventory",
    "/financials",
    ...(!basicEnabled ? ["/admin/members"] : []),
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
  await expect(page.getByRole("heading", { name: /A place to build\s*physical intelligence\./ })).toBeVisible();
});

test("public catalogs remain available", async ({ page }) => {
  await page.goto("/projects");
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true })
  ).toBeVisible();

  await page.goto("/components");
  await expect(
    page.getByRole("heading", { name: "Equipment & Components." })
  ).toBeVisible();

  await page.goto("/maker-desk");
  await expect(
    page.getByRole("heading", { name: "Keep the project moving between bookings." })
  ).toBeVisible();
});

test("historical directory URLs load the React routes", async ({ page }) => {
  await page.goto("/projects/");
  await expect(
    page.getByRole("heading", { name: "Projects", exact: true })
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

  const coursesLink = page.getByRole("navigation", { name: "Quick navigation" }).getByRole("link", { name: "Courses", exact: true });
  await expect(coursesLink).toBeVisible();
  await expect(coursesLink).toHaveAttribute("href", "https://courses.armatureailabs.com/");
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
