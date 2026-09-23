import { expect, test } from "@playwright/test";
import { initialDemoState } from "../../../src/data/demo";

async function signInDemo(page: import("@playwright/test").Page) {
  await page.goto("/auth");
  await page.getByRole("button", { name: "Open the local member demo" }).click();
  await expect(page.getByRole("heading", { name: /Good to see you/ })).toBeVisible();
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
}

async function expectMobileFormsAvoidZoom(page: import("@playwright/test").Page) {
  const formFontSizes = await page.locator(
    'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), textarea, select'
  ).evaluateAll((controls) => controls.map((control) =>
    Number.parseFloat(getComputedStyle(control).fontSize)
  ));
  expect(formFontSizes.every((size) => size >= 16)).toBe(true);
}

test("the demo kiosk route also recovers from a retired chunk", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser covers the sibling router boundary.");
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  let documentRequests = 0;
  let chunkRequests = 0;

  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests += 1;
  });
  await page.route(/\/assets\/KioskPage-[^/]+\.js(?:\?.*)?$/, async (route) => {
    chunkRequests += 1;
    await route.fulfill({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "Asset not found."
    });
  });

  await page.goto("/kiosk");

  if (await page.getByRole("heading", { name: "Operational access is opening soon." }).isVisible()) {
    await context.close();
    test.skip(true, "The production build intentionally gates the kiosk bundle.");
  }

  await expect(page.getByRole("heading", { name: "This page did not load." })).toBeVisible();
  await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
  expect(documentRequests).toBe(2);
  expect(chunkRequests).toBe(2);
  await context.close();
});

test("home metrics keep equal inset spacing", async ({ page, isMobile }) => {
  await page.goto("/");
  const metrics = page.locator(".metrics-strip .metric");
  await expect(metrics.first()).toContainText("3,500 sq ft");
  const insets = await metrics.evaluateAll((items) => items.map((item) => ({
    left: parseFloat(getComputedStyle(item).paddingLeft),
    right: parseFloat(getComputedStyle(item).paddingRight)
  })));
  for (const inset of insets) {
    expect(inset.left).toBe(isMobile ? 12 : 22);
    expect(inset.right).toBe(inset.left);
  }
  await expectNoHorizontalOverflow(page);
});

test("public projects and three themes remain usable", async ({ page }) => {
  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
  await expect(page.getByText("LeRobot + SO-ARM101").first()).toBeVisible();
  await page.getByRole("button", { name: "dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "sepia theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
  await page.getByRole("button", { name: "light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("Who We Are and Meet the Team have distinct direct routes and usable artwork", async ({ page, request }) => {
  const aboutHtml = await (await request.get("/about/")).text();
  expect(aboutHtml).toContain("Who We Are · Armature AI Labs");
  expect(aboutHtml).toContain('rel="canonical" href="https://armatureailabs.com/about/"');
  expect(aboutHtml).toContain("/about/who-we-are-social.png");
  const teamHtml = await (await request.get("/team/")).text();
  expect(teamHtml).toContain("Meet the Team · Armature AI Labs");

  await page.goto("/about/");
  await expect(page.getByRole("heading", { name: "Who We Are" })).toBeVisible();
  await expect(page.getByText("not a completed Armature AI Labs facility.")).toBeVisible();
  const hero = page.getByAltText(/Conceptual axonometric drawing/);
  await expect.poll(() => hero.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBe(1774);
  await page.getByRole("button", { name: "light theme" }).click();
  await expect(hero).toHaveAttribute("src", "/about/lab-light.webp");
  await page.getByRole("button", { name: "dark theme" }).click();
  await expect(hero).toHaveAttribute("src", "/about/lab-dark.webp");
  await expectNoHorizontalOverflow(page);

  await page.getByRole("link", { name: "Meet the Team", exact: true }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole("heading", { name: "Meet the Team" })).toBeVisible();
  await expect(page.getByText("The people behind Armature AI Labs will be introduced here as their profiles are ready.")).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("MHS cover is static in the journal and controllable on the article", async ({ page, request }) => {
  const html = await (await request.get("/blog/model-hardware-standard/")).text();
  expect(html).toContain('property="og:image" content="https://armatureailabs.com/blog-covers/mhs-common-interface.png"');
  expect(html).toContain('"@type":"BlogPosting"');

  await page.goto("/blog/");
  const thumbnail = page.locator(".post-cover img");
  await expect(thumbnail).toBeVisible();
  await expect.poll(() => thumbnail.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1672);
  await expect(page.locator(".mhs-cover-motion")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto("/blog/model-hardware-standard/");
  const cover = page.locator(".mhs-cover-art");
  await expect(cover.locator("img")).toBeVisible();
  await expect(cover).toHaveAttribute("data-playing", "true");
  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(cover).toHaveAttribute("data-playing", "false");
  await page.getByRole("button", { name: "Play motion" }).click();
  await expect(cover).toHaveAttribute("data-playing", "true");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(cover).toHaveAttribute("data-playing", "false");
  await expect(page.getByRole("button", { name: "Still image (reduced motion)" })).toBeDisabled();
  await expectNoHorizontalOverflow(page);
});

for (const palette of [
  { theme: "light", link: "rgb(153, 86, 0)", hover: "rgb(120, 68, 0)", ink: "rgb(17, 17, 16)", paper: "rgb(255, 255, 255)", panel: "rgb(245, 245, 243)" },
  { theme: "dark", link: "rgb(217, 154, 80)", hover: "rgb(234, 183, 121)", ink: "rgb(246, 246, 242)", paper: "rgb(17, 17, 16)", panel: "rgb(34, 34, 32)" },
  { theme: "sepia", link: "rgb(120, 68, 0)", hover: "rgb(96, 54, 0)", ink: "rgb(37, 26, 12)", paper: "rgb(240, 228, 201)", panel: "rgb(232, 215, 179)" }
]) {
  test(`Copper hyperlinks remain readable in the ${palette.theme} theme`, async ({ page, isMobile }) => {
    await page.goto("/");
    await page.getByRole("button", { name: `${palette.theme} theme` }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", palette.theme);
    const brand = page.locator(".topbar .brand-link");
    await expect(brand).toHaveCSS("color", palette.ink);
    await brand.hover();
    await expect(brand).toHaveCSS("color", palette.ink);

    const primary = page.locator(".home-hero a.button-primary").first();
    await expect(primary).toHaveCSS("color", "rgb(17, 17, 16)");
    await expect(primary).toHaveCSS("background-color", "rgb(246, 246, 242)");
    await primary.hover();
    await expect(primary).toHaveCSS("color", "rgb(246, 246, 242)");
    await expect(primary).toHaveCSS("background-color", "rgb(17, 17, 16)");
    const quiet = page.locator(".home-hero a.button-quiet").first();
    await quiet.hover();
    await expect(quiet).toHaveCSS("color", "rgb(234, 183, 121)");
    await expect(quiet).toHaveCSS("background-color", "rgb(34, 34, 32)");
    await page.mouse.move(0, 0);

    const modelLink = page.locator(".ink-surface .lab-model-grid figcaption a").first();
    await expect(modelLink).toHaveCSS("color", "rgb(217, 154, 80)");
    await modelLink.hover();
    await expect(modelLink).toHaveCSS("color", "rgb(234, 183, 121)");
    await page.mouse.move(0, 0);
    const email = page.locator('footer a[href="mailto:hello@armatureailabs.com"]');
    const wordmark = page.locator(".footer-wordmark");
    await expect(wordmark).toHaveText("Armature AI Labs");
    await expect(wordmark).toHaveCSS("color", palette.ink);
    await expect(wordmark).toHaveCSS("white-space", "nowrap");
    expect(await wordmark.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const container = element.parentElement!.getBoundingClientRect();
      return text.left >= container.left && text.right <= container.right && text.bottom <= container.bottom;
    })).toBe(true);
    await expect(email).toHaveCSS("color", palette.link);
    await email.hover();
    await expect(email).toHaveCSS("color", palette.hover);
    await expectNoHorizontalOverflow(page);

    await page.mouse.move(0, 0);
    await page.goto("/blog/");
    await expect(page.locator(".footer-wordmark")).toHaveText("Armature AI Labs");
    await expect(page.locator("html")).toHaveAttribute("data-theme", palette.theme);
    const title = page.locator(".post-summary h2 a");
    await expect(title).toHaveCSS("color", palette.link);
    await expect(title.locator(".muted")).toHaveCSS("color", palette.link);
    await title.hover();
    await expect(title).toHaveCSS("color", palette.hover);
    await expect(title.locator(".muted")).toHaveCSS("color", palette.hover);
    await title.click();
    await page.mouse.move(0, 0);
    await expect(page).toHaveURL(/\/blog\/model-hardware-standard\/$/);
    if (isMobile) await page.locator(".mobile-toc summary").click();
    const contents = page.locator(isMobile ? ".mobile-toc li a" : ".toc li a").first();
    await expect(contents).toHaveCSS("color", palette.link);
    await contents.hover();
    await expect(contents).toHaveCSS("color", palette.hover);
    await page.mouse.move(0, 0);
    const citation = page.locator(".article-body .citation").first();
    await expect(citation).toHaveCSS("color", palette.link);
    await expect(citation).toHaveCSS("text-decoration-line", "underline");
    await page.keyboard.press("Tab");
    await citation.focus();
    await expect(citation).toHaveCSS("outline-color", palette.link);
    await expect(citation).not.toHaveCSS("outline-style", "none");
    await citation.hover();
    await expect(citation).toHaveCSS("color", palette.hover);
    await expectNoHorizontalOverflow(page);

    await page.mouse.move(0, 0);
    await page.goto("/branding/");
    await expect(page.locator("html")).toHaveAttribute("data-theme", palette.theme);
    const download = page.locator(".branding-download-links a").first();
    await expect(download).toHaveCSS("color", palette.link);
    await expect(download).toHaveAttribute("download", /\.png$/);
    await download.hover();
    await expect(download).toHaveCSS("color", palette.hover);
    await expect(download).toHaveCSS("background-color", palette.panel);
    await expectNoHorizontalOverflow(page);
  });
}

test("project discovery combines filters and preserves BRIDGE through reload and build-list navigation", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("group", { name: "Filter by topic" }).getByRole("button", { name: /^Robotics/ }).click();
  const filtersToggle = page.getByRole("button", { name: /^Filters/ });
  if (await filtersToggle.isVisible()) await filtersToggle.click();
  await page.getByRole("combobox", { name: "Category", exact: true }).selectOption("Humanoid Robots");
  await page.getByLabel("Build status").selectOption("Research Track");
  await page.getByRole("searchbox", { name: "Search projects" }).fill("BRIDGE");
  await page.getByLabel("Sort by").selectOption("name");
  await expect(page.locator("#project-grid .project-card")).toHaveCount(1);
  await expect(page.locator(".project-results-bar")).toContainText("1 of");
  await expect(page).toHaveURL(/category=Humanoid\+Robots/);
  await page.reload();
  await expect(page.getByRole("searchbox", { name: "Search projects" })).toHaveValue("BRIDGE");
  await expect(page.getByLabel("Sort by")).toHaveValue("name");
  const bridge = page.locator("#bridge-humanoid");
  await expect(bridge.getByRole("heading", { name: "BRIDGE Humanoid" })).toBeVisible();
  await expect(bridge).toContainText("release pending");
  await expect(bridge.getByRole("link", { name: "Project source" })).toHaveAttribute("href", "https://sites.google.com/view/bridgerobot");
  const cover = bridge.getByRole("img");
  await cover.scrollIntoViewIfNeeded();
  await expect.poll(() => cover.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await bridge.getByRole("link", { name: "Build components" }).click();
  await expect(page).toHaveURL(/\/components\?project=bridge-humanoid$/);
  await expect(page.getByRole("heading", { name: "Build list for BRIDGE Humanoid." })).toBeVisible();
  await page.goBack();
  await expect(page.locator("#project-grid .project-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await expectNoHorizontalOverflow(page);
});

test("project discovery recovers from conflicting and invalid filters and sorts results", async ({ page }) => {
  await page.goto("/projects?layer=unknown&category=missing&sort=invalid");
  const cards = page.locator("#project-grid .project-card");
  await expect(cards.first()).toBeVisible();
  const total = await cards.count();
  await page.getByRole("searchbox", { name: "Search projects" }).fill("STM32 ROS");
  await expect(page.locator("#orion-quadruped")).toBeVisible();
  const filtersToggle = page.getByRole("button", { name: /^Filters/ });
  if (await filtersToggle.isVisible()) await filtersToggle.click();
  await page.getByRole("combobox", { name: "Priority", exact: true }).selectOption("P0");
  await expect(cards).toHaveCount(0);
  await expect(page.getByText("No projects match these filters.")).toBeVisible();
  await page.getByRole("button", { name: "Remove P0", exact: true }).click();
  await expect(page.locator("#orion-quadruped")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search projects" }).fill("no-such-armature-project");
  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(cards).toHaveCount(total);
  await page.getByLabel("Sort by").selectOption("name");
  const names = await cards.locator("h3").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  await page.goBack();
  await expect(page.getByLabel("Sort by")).toHaveValue("");
  await page.locator("#p0-builds").getByRole("link", { name: /Local Dataset NAS/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox", { name: "Search projects" })).toBeFocused();
  await expect(page.getByRole("searchbox", { name: "Search projects" })).toHaveValue("Local Dataset NAS");
  await expect(page.locator("#local-dataset-nas").getByRole("heading")).toHaveText("Local Dataset NAS");
  await expectNoHorizontalOverflow(page);
});

test("ecosystem map filters and preserves a selected organization", async ({ page }) => {
  await page.goto("/ecosystem");
  await expect(page.getByRole("heading", { name: "Robotics, mapped." })).toBeVisible();
  await expect(page.getByText("51 organizations")).toBeVisible();
  await expect(page.locator(".ecosystem-method h2")).toHaveText("Built to be useful.");
  await expect(page.locator(".ecosystem-method").getByText("Contribute on GitHub")).toHaveAttribute(
    "href",
    "https://github.com/sandeep-devarapalli/armature-ai-labs"
  );
  await expect(page.getByText("Robotics lead workbook")).toHaveCount(0);
  await expect(page.getByText("directory record")).toHaveCount(0);
  const resultCount = page.locator(".ecosystem-directory-heading > .mono");
  await expect(page.locator(".ecosystem-map-shell")).toHaveAttribute(
    "data-map-state",
    "ready",
    { timeout: 15_000 }
  );

  const directorySwitch = page.getByRole("button", { name: "List", exact: true });
  await page.getByRole("button", { name: "Learning & training", exact: true }).click();
  if (await directorySwitch.isVisible()) await directorySwitch.click();
  await expect(resultCount).toHaveText("1 result");
  await expect(page.getByRole("button", { name: /LSCL Robotics/ })).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();

  await page.getByPlaceholder("Search teams, founders, or places").fill("Bellatrix");
  if (await directorySwitch.isVisible()) await directorySwitch.click();
  await expect(resultCount).toHaveText("1 result");
  await page.getByRole("button", { name: /Bellatrix Aerospace/ }).click();
  await expect(page).toHaveURL(/focus=bellatrix-aerospace/);
  await expect(page.getByRole("heading", { name: "Bellatrix Aerospace" })).toBeVisible();
  const organizationDetails = page.getByRole("complementary", { name: "Organization details" });
  await expect(organizationDetails.getByText("Sankey Road, Bengaluru")).toBeVisible();
  await expect(organizationDetails.getByRole("link", { name: "View source" })).toBeVisible();
  await expect(organizationDetails.getByText("Record confidence")).toHaveCount(0);
  await expect(organizationDetails.getByText("Workbook trail")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Bellatrix Aerospace" })).toBeVisible();
  await page.getByRole("button", { name: "Close organization details" }).click();
  await expect(page).not.toHaveURL(/focus=/);

  await page.getByRole("button", { name: "Drones & aerospace", exact: true }).click();
  if (await directorySwitch.isVisible()) await directorySwitch.click();
  await expect(page.getByText(/results?/).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("q8bot uses official media and a project-linked build list", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#q8bot");

  await expect(card.getByRole("heading", { name: "Q8bot" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/q8bot-official.jpg");
  await expect(card.getByRole("link", { name: "Image: Q8bot · Yufeng (Eric) Wu" })).toHaveAttribute(
    "href",
    "https://github.com/EricYufengWu/q8bot"
  );
  await expect(card.getByText("7 required")).toBeVisible();
  await expect(card.getByText("1 optional")).toBeVisible();

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for Q8bot." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Q8bot v2.5 assembled center PCB" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DYNAMIXEL XL330-M077-T" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Protected 14500 1000mAh Li-ion cells" })).toBeVisible();
});

test("Indystry projects use official media and source-backed build lists", async ({ page }) => {
  await page.goto("/projects");
  const weatherCard = page.locator("#diy-weather-station");

  await expect(weatherCard.getByRole("heading", { name: "DIY Weather Station" })).toBeVisible();
  await expect(weatherCard.locator("img")).toHaveAttribute("src", "/project-images/diy-weather-station-official.jpg");
  await expect(weatherCard.getByRole("link", { name: "Image: Nikodem Bartnik · DIY Weather Station" })).toHaveAttribute(
    "href",
    "https://github.com/NikodemBartnik/DIY-Weather-Station/blob/main/server/app/static/images/diy_weather_station.jpg"
  );
  await expect(weatherCard.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://weather.indystry.cc/"
  );
  await expect(weatherCard.getByText("7 required")).toBeVisible();
  await expect(weatherCard.getByText("0 optional")).toBeVisible();

  await weatherCard.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for DIY Weather Station." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DIY Weather Station Pico W controller" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DIY Weather Station sensor set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DIY Weather Station solar power stack" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "DIY Weather Station dashboard server" })).toBeVisible();

  await page.goto("/projects");
  const millCard = page.locator("#indymill");

  await expect(millCard.getByRole("heading", { name: "IndyMill" })).toBeVisible();
  await expect(millCard.locator("img")).toHaveAttribute("src", "/project-images/indymill-official.jpg");
  await expect(millCard.getByRole("link", { name: "Image: Nikodem Bartnik · IndyMill" })).toHaveAttribute(
    "href",
    "https://indystry.cc/wp-content/uploads/2021/10/1.2-e1635075424574.jpg"
  );
  await expect(millCard.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://indystry.cc/indymill/"
  );
  await expect(millCard.getByText("7 required")).toBeVisible();
  await expect(millCard.getByText("2 optional")).toBeVisible();

  await millCard.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for IndyMill." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "IndyMill motion and structure set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "IndyMill GRBL motion-control set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "IndyMill 500 W spindle and power set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "IndyMill machine safety set" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("low-cost ESP32 drone uses the documented airframe and build list", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#low-cost-esp32-drone");

  await expect(card.getByRole("heading", { name: "Low Cost Drone using ESP32" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute(
    "src",
    "/project-images/esp32-drone-circuit-digest-official.jpg"
  );
  await expect(card.getByRole("link", { name: "Image: Circuit Digest · ESP-Drone" })).toHaveAttribute(
    "href",
    "https://circuitdigest.com/microcontroller-projects/DIY-wifi-controlled-drone"
  );
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://github.com/Circuit-Digest/ESP-Drone"
  );
  await expect(card.getByText("7 required")).toBeVisible();

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for Low Cost Drone using ESP32." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ESP32-WROOM drone controller set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ESP-Drone structural custom PCB" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ESP-Drone 720 motor and 55mm propeller set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ESP-Drone 1S 1300mAh high-discharge LiPo" })).toBeVisible();
});

test("OpenMantaClaus uses its official AUV image and source-backed build list", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#openmantaclaus");

  await expect(card.getByRole("heading", { name: "OpenMantaClaus" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/openmantaclaus-official.jpg");
  await expect(card.getByRole("link", { name: "Image: OpenMantaClaus · Kushagra Javeri" })).toHaveAttribute(
    "href",
    "https://github.com/kushagra77/OpenMantaClaus/blob/main/docs/assets/hero_shot.jpg"
  );
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://github.com/kushagra77/OpenMantaClaus"
  );
  await expect(card.getByText("10 required")).toBeVisible();
  await expect(card.getByText("2 optional")).toBeVisible();
  await expect(card.getByText("1 alternative")).toBeVisible();

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for OpenMantaClaus." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenMantaClaus watertight structure set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenMantaClaus five-thruster propulsion set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenMantaClaus Navigator flight controller" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenMantaClaus camera and depth-sensing set" })).toBeVisible();
});

test("Ego-OSCAR uses official media and exposes its calibrated capture build", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#ego-oscar");

  await expect(card.getByRole("heading", { name: "Ego-OSCAR" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/ego-oscar-official.webp");
  await expect(card.getByRole("link", { name: "Image: FPV Labs · Ego-OSCAR" })).toHaveAttribute(
    "href",
    "https://www.fpvlabs.ai/images/ego-oscar-hero.webp"
  );
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://www.fpvlabs.ai/essays/ego-oscar"
  );
  await expect(card.getByText("8 required")).toBeVisible();
  await expect(card.getByText("2 optional")).toBeVisible();
  await expect(card.getByText("0 alternative")).toBeVisible();

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for Ego-OSCAR." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ego-OSCAR synchronized stereo camera" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ego-OSCAR Radxa ROCK 5C capture kit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ego-OSCAR sync and watchdog controller kit" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ego-OSCAR calibration and session-validation kit" })).toBeVisible();

  await page.goto("/components/ego-oscar-calibration-kit");
  await expect(page.getByText(/repository README currently says no license has been granted/)).toBeVisible();
  await expect(page.getByText(/Require informed consent and environment-owner permission/)).toBeVisible();
});

test("Marc Teyssier research tracks use distinct official media and source-backed build paths", async ({ page }) => {
  const tracks = [
    {
      slug: "human-like-robot-skin",
      title: "Human-like Robot Skin",
      image: "/project-images/human-like-robot-skin-official.jpg",
      credit: "Image: Marc Teyssier et al. · Human-like Robot Skin",
      creditUrl: "https://marcteyssier.com/thumbs/projects/humanlike-skin/dscf0391_crop2-800x400.jpg",
      sourceUrl: "https://marcteyssier.com/projects/humanlike-skin",
      counts: ["3 required", "1 optional", "0 alternative"],
      component: "MuCa mutual-capacitance controller"
    },
    {
      slug: "skin-on-interfaces",
      title: "Skin-On Interfaces",
      image: "/project-images/skin-on-interfaces-official.jpg",
      credit: "Image: Marc Teyssier et al. · Skin-On Interfaces",
      creditUrl: "https://marcteyssier.com/thumbs/projects/skin-on/pinchphone3-800x400.jpg",
      sourceUrl: "https://marcteyssier.com/projects/skin-on",
      counts: ["3 required", "1 optional", "0 alternative"],
      component: "Artificial-skin capacitive fabrication kit"
    },
    {
      slug: "polysense",
      title: "PolySense",
      image: "/project-images/polysense-official.jpg",
      credit: "Image: CounterChemists · PolySense",
      creditUrl: "https://marcteyssier.com/thumbs/projects/polysense/combined-800x400.jpg",
      sourceUrl: "https://counterchemists.github.io/",
      counts: ["3 required", "1 optional", "0 alternative"],
      component: "Supervised wet-chemistry safety station"
    },
    {
      slug: "eyecam",
      title: "Eyecam",
      image: "/project-images/eyecam-official.jpg",
      credit: "Image: Marc Teyssier et al. · Eyecam",
      creditUrl: "https://marcteyssier.com/thumbs/projects/eyecam/eyecam_3_zoom-800x400.jpg",
      sourceUrl: "https://github.com/marcteys/eyecam",
      counts: ["5 required", "1 optional", "1 alternative"],
      component: "Eyecam six-servo mechanism"
    }
  ] as const;

  for (const track of tracks) {
    await page.goto("/projects");
    const card = page.locator(`#${track.slug}`);
    await expect(card.getByRole("heading", { name: track.title })).toBeVisible();
    await expect(card.locator("img")).toHaveAttribute("src", track.image);
    await expect(card.getByRole("link", { name: track.credit })).toHaveAttribute("href", track.creditUrl);
    await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute("href", track.sourceUrl);
    for (const count of track.counts) {
      await expect(card.getByText(count)).toBeVisible();
    }
    await card.getByRole("link", { name: "Build components" }).click();
    await expect(page.getByRole("heading", { name: `Build list for ${track.title}.` })).toBeVisible();
    await expect(page.getByRole("heading", { name: track.component })).toBeVisible();
  }
});

test("OpenActuator uses its released LinearVCM hardware and published demo stack", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#openactuator");

  await expect(card.getByRole("heading", { name: "OpenActuator" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/openactuator-linear-vcm-official.jpg");
  await expect(card.getByRole("link", { name: "Image: OpenActuator · LinearVCM project" })).toHaveAttribute(
    "href",
    "https://github.com/OpenActuator/LinearVCM"
  );
  await expect(card.getByText("6 required")).toBeVisible();
  await expect(card.getByText("2 optional")).toBeVisible();
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://solenoid.or.kr/index_eng.html"
  );

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for OpenActuator." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenActuator LinearVCM core" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "L9110 H-bridge driver" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "WSH136 Hall position sensor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenActuator Coil Winder v1.2" })).toBeVisible();
});

test("electrofluidic muscles link official media to a staged, safety-gated research brief", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#electrofluidic-fiber-muscles");

  await expect(card.getByRole("heading", { name: "Electrofluidic Fiber Muscles" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/electrofluidic-fiber-muscles-official.png");
  await expect(card.getByRole("link", { name: "Image: MIT Media Lab · Ozgun Kilic Afsar" })).toHaveAttribute(
    "href",
    "https://www.media.mit.edu/projects/electrofluidicmuscle/overview/"
  );
  await expect(card.getByText("8 required")).toBeVisible();
  await expect(card.getByText("2 optional")).toBeVisible();

  await card.getByRole("link", { name: "Research brief" }).click();
  await expect(page).toHaveURL(/\/projects\/electrofluidic-fiber-muscles$/);
  await expect(page.getByRole("heading", { name: "Electrofluidic Fiber Muscles", level: 1 })).toBeVisible();
  await expect(page.getByText("50 W/kg")).toBeVisible();
  await expect(page.getByText("Source correction")).toBeVisible();
  await expect(page.getByText(/The supplied Science DOI is the 2023 foundational fiber-pump paper/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start with the 2023 pump, not a guessed 2026 muscle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Build in gates, not leaps" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Science Robotics: Electrofluidic fiber muscles" })).toHaveAttribute(
    "href",
    "https://doi.org/10.1126/scirobotics.ady6438"
  );
  await expect(page.getByRole("link", { name: "Science 2023: Electrohydrodynamic fiber pumps" })).toHaveAttribute(
    "href",
    "https://doi.org/10.1126/science.ade8654"
  );
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "sepia theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
});

test("Solo 12 represents ODRI with its official robot and concrete hardware hierarchy", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#solo12-odri");

  await expect(card.getByRole("heading", { name: "Solo 12 · ODRI" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/solo12-odri-official.jpg");
  await expect(card.getByRole("link", { name: "Image: Open Dynamic Robot Initiative · Solo 12" })).toHaveAttribute(
    "href",
    "https://github.com/open-dynamic-robot-initiative/open_robot_actuator_hardware"
  );
  await expect(card.getByText("10 required")).toBeVisible();
  await expect(card.getByText("1 optional")).toBeVisible();
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://open-dynamic-robot-initiative.github.io/"
  );

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for Solo 12 · ODRI." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solo 12 actuator core v1.1" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ODRI Micro Driver v2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lord MicroStrain 3DM-CX5-25 IMU" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Solo 12 autonomy power upgrade" })).toBeVisible();
});

test("Orion Quadruped uses official media and its documented ROS 2 hardware stack", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#orion-quadruped");

  await expect(card.getByRole("heading", { name: "Orion Quadruped" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/orion-quadruped-official.png");
  await expect(card.getByRole("link", { name: "Image: Ashish A. · Orion Quadruped" })).toHaveAttribute(
    "href",
    "https://github.com/AshishA26/Orion-Quadruped/blob/5d265a949ce82a890a101f3e6c9379515f0cefae/photos/Orion_Thumbnail.png"
  );
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://github.com/AshishA26/Orion-Quadruped"
  );
  await expect(card.getByText("license not stated", { exact: true })).toBeVisible();
  await expect(card.getByText("9 required")).toBeVisible();
  await expect(card.getByText("2 optional")).toBeVisible();

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for Orion Quadruped." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orion 12-DoF actuation and mechanical set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orion control and power PCB set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orion dual IMX219 stereo camera set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "NVIDIA Jetson Orin Nano" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Orion RPLIDAR A1M8" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("YOR uses actual project media and its published core build list", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#yor");

  await expect(card.getByRole("heading", { name: "YOR" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/yor-official.jpeg");
  await expect(card.getByRole("link", { name: "Image: YOR project team · yourownrobot.ai" })).toHaveAttribute(
    "href",
    "https://www.yourownrobot.ai/"
  );
  await expect(card.getByText("13 required")).toBeVisible();
  await expect(card.getByText("2 optional")).toBeVisible();
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://www.yourownrobot.ai/"
  );

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for YOR." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AgileX Piper 6-DoF arm" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "REV 3-inch MAXSwerve module" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "YOR 24V power and emergency-stop stack" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seeed reComputer Robotics J4012" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stereolabs ZED 2i stereo camera" })).toBeVisible();
});

test("reCamera uses official media and a project-linked build list", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#recamera");

  await expect(card.getByRole("heading", { name: "reCamera" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/recamera-official.jpg");
  await expect(card.getByRole("link", { name: "Image: Seeed Studio · reCamera" })).toHaveAttribute(
    "href",
    "https://github.com/Seeed-Studio/OSHW-reCamera-Series"
  );
  await expect(card.getByText("1 required")).toBeVisible();
  await expect(card.getByText("3 optional")).toBeVisible();

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for reCamera." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seeed Studio reCamera 2002w 8GB" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seeed Studio reCamera Gimbal 2002w" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "reCamera S3 SC130GS global-shutter sensor board" })).toBeVisible();
});

test("ESP32-AI uses upstream demo media and an exact reproduction build list", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#esp32-ai");

  await expect(card.getByRole("heading", { name: "ESP32-AI" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/esp32-ai-official.png");
  await expect(card.getByRole("link", { name: "Image: Derived from slvDev · esp32-ai demo" })).toHaveAttribute(
    "href",
    "https://github.com/slvDev/esp32-ai"
  );
  await expect(card.getByText("3 required")).toBeVisible();
  await expect(card.getByText("1 optional")).toBeVisible();
  await expect(card.getByText("2 alternative")).toBeVisible();

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for ESP32-AI." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ESP32-S3 N16R8 development board" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1.3-inch SH1106 128x64 I2C OLED" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "0.96-inch SSD1306 128x64 I2C OLED" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GMT020-02-7P 2-inch ST7789 SPI TFT" })).toBeVisible();
});

test("OpenTouch Glove uses official media and an exact project build list", async ({ page }) => {
  await page.goto("/projects");
  const card = page.locator("#opentouch-glove");

  await expect(card.getByRole("heading", { name: "OpenTouch Glove" })).toBeVisible();
  await expect(card.locator("img")).toHaveAttribute("src", "/project-images/opentouch-glove-official.jpg");
  await expect(card.getByRole("link", { name: "Image: OpenTouch Glove · Murphy et al." })).toHaveAttribute(
    "href",
    "https://wiresens-gloves.vercel.app/team/"
  );
  await expect(card.getByText("10 required")).toBeVisible();
  await expect(card.getByText("1 optional")).toBeVisible();
  await expect(card.getByRole("link", { name: "Project source" })).toHaveAttribute(
    "href",
    "https://wiresens-gloves.vercel.app/"
  );

  await card.getByRole("link", { name: "Build components" }).click();
  await expect(page.getByRole("heading", { name: "Build list for OpenTouch Glove." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenTouch personalized FPCB sensor pair" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenTouch zero-potential scanning readout PCBA" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenTouch 16-pin FFC and header set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenTouch glove sensor materials set" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "OpenTouch 3.7V LiPo battery" })).toBeVisible();
  const huzzahCard = page.locator("article").filter({ hasText: "Adafruit HUZZAH32 ESP32 Feather" });
  await expect(huzzahCard.getByRole("heading", { name: "Adafruit HUZZAH32 ESP32 Feather" })).toBeVisible();
  await huzzahCard.getByRole("link").click();
  await expect(page.getByText(/Do not treat the existing ESP32-C6 stock as a drop-in replacement/)).toBeVisible();
});

test.describe("homepage motion controls", () => {
  // The first-install PWA toast can cover the hero controls; PWA behavior has separate coverage.
  test.use({ serviceWorkers: "block" });

test("home hero keeps the circular identity and editorial typography", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const heroMark = page.locator(".topbar .brand-mark");
  await expect(heroMark).toHaveAttribute("viewBox", "0 0 100 100");
  await expect(heroMark).toHaveCSS("transform", "none");
  await expect(heroMark.locator(".brand-mark-segment")).toHaveCount(8);
  await expect(page.locator(".brand-mark--animated")).toHaveCount(0);
  await expect(page.locator(".topbar .brand-lockup")).toHaveAttribute("aria-label", "Armature AI Labs");
  await expect(page.locator(".topbar .brand-lockup > span")).toHaveText("Armature AI Labs");
  await expect(page.locator(".home-hero h1")).toHaveText(/A place to build\s*physical intelligence\./);
  await expect(page.locator(".home-hero h1")).toHaveCSS("font-family", /Helvetica Neue.*Helvetica.*Arial/);
  await expect(page.locator("body")).toHaveCSS("font-family", /Space Mono/);
});

test("home hero keeps controllable T2 motion", async ({ page }) => {
  await page.goto("/");
  const figure = page.locator('.field-of-touch[data-scene="scanner"]');
  const video = figure.locator("video");
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveAttribute("data-state", "ready");
  await expect(figure.locator("canvas")).toHaveCSS("opacity", "1");
  const firstTime = await video.evaluate(element => (element as HTMLVideoElement).currentTime);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(firstTime);
  await figure.getByRole("button", { name: "Pause Microplate stage animation" }).click();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  const pausedTime = await video.evaluate(element => (element as HTMLVideoElement).currentTime);
  await page.waitForTimeout(300);
  expect(await video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBe(pausedTime);
  await figure.getByRole("button", { name: "Play Microplate stage animation" }).click();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).not.toBe(pausedTime);
  await page.locator("footer").scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(true);
  await figure.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).paused)).toBe(false);
});

test("reduced motion keeps T2 still and defers video until Play", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const videoRequests: string[] = [];
  page.on("request", request => {
    if (request.url().includes("/media/field-of-touch/") && request.url().endsWith(".mp4")) videoRequests.push(request.url());
  });
  await page.goto("/");
  const figure = page.locator('.field-of-touch[data-scene="scanner"]');
  await figure.scrollIntoViewIfNeeded();
  await expect(figure).toHaveAttribute("data-state", "poster");
  await expect(figure.locator("video")).not.toHaveAttribute("src");
  await expect.poll(() => figure.locator("img").evaluate(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)).toBe(true);
  expect(videoRequests).toEqual([]);
  await figure.getByRole("button", { name: "Play Microplate stage animation" }).click();
  await expect(figure).toHaveAttribute("data-state", "ready");
  await expect.poll(() => figure.locator("video").evaluate(video => (video as HTMLVideoElement).currentTime)).toBeGreaterThan(0);
});

});

test("public routes preserve the useful legacy lab sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("a 3,500 sq ft lab across two floors")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Two floors at a glance" })).toBeVisible();
  await expect(page.locator("[data-room-tile]")).toHaveCount(14);
  await expect(page.locator("[data-room-tile]").getByText("Coworking commons", { exact: true })).toBeVisible();
  await expect(page.getByText("Workshop terrace", { exact: true })).toBeVisible();
  await expect(page.getByText("Builder pods")).toHaveCount(0);
  await expect(page.getByText(/nine cameras/i)).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Open the models and room CAD/ })).toHaveAttribute("href", "/building-vision");
  await expect(page.getByRole("heading", { name: "Monitored, end to end" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "From idea to working machine" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.goto("/membership");
  await expect(page).toHaveURL(/\/join$/);
  await expect(page.getByRole("heading", { name: "Join the lab. Book what you need." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "One membership journey" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What members can reserve" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Start your membership" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workstation choices" })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await page.goto("/services");
  await expect(page.getByRole("heading", { name: "Talent and training" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Design, build, and run a local AI data centre" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who it is for" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Discuss a project" })).toHaveAttribute("href", "mailto:hello@armatureailabs.com");
  await expectNoHorizontalOverflow(page);

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "P0 builds" })).toBeVisible();
  await expect(page.getByText("Store", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".project-credit").first()).toBeVisible();
  await expect(page.locator(".project-card img")).not.toHaveCount(0);
  const featuredCovers = await page.locator("#p0-builds img").evaluateAll(
    (images) => images.map((image) => (image as HTMLImageElement).src)
  );
  expect(new Set(featuredCovers).size).toBe(featuredCovers.length);
  await expectNoHorizontalOverflow(page);

  await page.goto("/components");
  await expect(page.locator('a[href="/procurement"]')).toHaveCount(0);

  await page.goto("/procurement");
  await expect(page.getByRole("heading", { name: "That bench is not on the floor plan." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buy for ten builders, not ten isolated labs." })).toHaveCount(0);
  await expect(page.locator('a[href="/procurement"]')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("a pending member completes the membership application and keeps its status after reload", async ({ page }, testInfo) => {
  const applicantState = structuredClone(initialDemoState);
  applicantState.currentUserId = "member-pending";
  applicantState.applications = [];
  const applicant = applicantState.profiles.find((profile) => profile.id === "member-pending");
  if (!applicant) throw new Error("Pending member fixture is missing.");
  applicant.name = "";
  applicant.handle = "";

  await page.addInitScript(({ state }) => {
    const key = "armature-demo-state-v1";
    if (!window.localStorage.getItem(key)) {
      window.localStorage.setItem(key, JSON.stringify(state));
    }
  }, { state: applicantState });

  await page.goto("/join");
  await expect(page.getByLabel("Your name")).toBeVisible();
  await expect(page.getByLabel("Public profile handle")).toBeVisible();
  await expect(page.getByLabel("What are you building?")).toBeVisible();
  if (testInfo.project.name === "mobile") await expectMobileFormsAvoidZoom(page);
  await expectNoHorizontalOverflow(page);

  await page.getByLabel("Your name").fill("New Member");
  await page.getByLabel("Public profile handle").fill("new-member");
  await page.getByLabel("What are you building?").fill("A modular mobile robot for indoor mapping.");
  const submit = page.getByRole("button", { name: "Submit membership application" });
  await submit.evaluate(button => button.scrollIntoView({ behavior: "instant", block: "center" }));
  await submit.click();

  await expect(page.getByText("Application under review", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Application under review", { exact: true })).toBeVisible();
  await expect(page.getByLabel("What are you building?")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("financials is hidden publicly and available to an admin", async ({ page }) => {
  await page.goto("/");
  const primaryNavigation = page.locator(".public-nav");
  await expect(primaryNavigation.locator('a[href="/financials"]')).toHaveCount(0);
  await expect(primaryNavigation.locator('a[href="/join"]')).toHaveCount(1);
  await expect(primaryNavigation.locator('a[href="/membership"]')).toHaveCount(0);

  await page.goto("/financials");
  await expect(page).toHaveURL(/\/auth$/);
  await expect(page.getByRole("heading", { name: "Create your member account." })).toBeVisible();
  await page.getByRole("button", { name: "Open the local member demo" }).click();

  await expect(page).toHaveURL(/\/financials$/);
  await expect(page.getByRole("heading", { name: "What the capex buys" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Member workspace" }).getByRole("link", { name: "Financials" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("demo member can open booking workspace", async ({ page }) => {
  await signInDemo(page);
  await page.getByRole("link", { name: "Book a resource" }).click();
  await expect(page.getByRole("heading", { name: "Reserve a working block." })).toBeVisible();
  await expect(page.getByText("GPU compute node")).toBeVisible();
});

test("member books and cancels a resource", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/book/gpu-compute");
  await page.getByLabel("Purpose of session").fill("Validate a local perception model.");
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("heading", { name: "GPU compute node" })).toBeVisible();
  const newStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
  newStart.setMinutes(0, 0, 0);
  const localStart = new Date(
    newStart.getTime() - newStart.getTimezoneOffset() * 60000
  ).toISOString().slice(0, 16);
  await page.getByLabel("New start").fill(localStart);
  await page.getByRole("button", { name: "Reschedule" }).click();
  await expect(page.getByText("Booking rescheduled.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
});

test("one-use code checks a member in and out through kiosk", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/book/gpu-compute");
  await page.getByLabel("Purpose of session").fill("Kiosk attendance validation.");
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await page.goto("/check-in");
  await page.getByRole("button", { name: "Generate check-in code" }).click();
  const checkinToken = await page.locator(".demo-token").textContent();
  expect(checkinToken).toBeTruthy();

  await page.goto("/kiosk");
  await page.getByLabel("Manual token fallback").fill(checkinToken!);
  await page.getByRole("button", { name: "Validate code" }).click();
  await expect(page.getByText(/Check-in accepted/)).toBeVisible();

  await page.goto("/check-in");
  await expect(page.getByRole("heading", { name: "You are checked in." })).toBeVisible();
  await page.getByRole("button", { name: "Generate check-out code" }).click();
  const checkoutToken = await page.locator(".demo-token").textContent();

  await page.goto("/kiosk");
  await page.getByLabel("Manual token fallback").fill(checkoutToken!);
  await page.getByRole("button", { name: "Validate code" }).click();
  await expect(page.getByText(/Check-out recorded/)).toBeVisible();
});

test("staff approves a pending membership application", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "Member approvals" })).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("approved", { exact: true })).toBeVisible();
});

test("staff manages certifications, hours, and booking state", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/admin/members");
  await page.getByLabel("Approved member").selectOption({ label: "Meera Iyer" });
  await page.getByLabel("Certification").selectOption({ label: "Arm cell induction" });
  await page.getByRole("button", { name: "Issue certification" }).click();
  await expect(page.getByText("Certification issued and audited.")).toBeVisible();

  await page.goto("/admin/resources");
  const hoursForm = page.locator("form").filter({ hasText: "Save weekday hours" });
  await hoursForm.locator('select[name="resourceId"]').selectOption({ label: "GPU compute node" });
  await hoursForm.getByRole("button", { name: "Save weekday hours" }).click();
  await expect(page.getByText("Base operating hours updated.")).toBeVisible();

  await page.goto("/admin/bookings");
  await page.getByLabel("Confirmed booking").selectOption({ index: 1 });
  await page.getByLabel("Required reason").fill("Cancelled for supervised maintenance.");
  await page.getByRole("button", { name: "Apply booking action" }).click();
  await expect(page.getByText("Booking state updated and audited.")).toBeVisible();
});

test("approved public profile excludes private contact data", async ({ page }) => {
  await page.goto("/members/anika-builds");
  await expect(page.getByRole("heading", { name: "Anika Rao" })).toBeVisible();
  await expect(page.getByText("anika@example.com")).toHaveCount(0);
  await expect(page.getByText("+91 90000 00000")).toHaveCount(0);
});

test("public request is verified in demo and appears in the member queue", async ({ page }) => {
  await page.goto("/components/request");
  await page.getByLabel("Component name").fill("USB logic analyzer");
  await page.getByLabel("Vendor or product URL").fill("https://example.com/logic-analyzer");
  await page.getByLabel("Project or use case").fill("Debug motor-controller timing on shared electronics benches.");
  await page.getByLabel("Verification email").fill("builder@example.com");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByText(/Demo verification completed/)).toBeVisible();

  await signInDemo(page);
  await page.goto("/component-requests");
  await expect(page.getByText("USB logic analyzer")).toBeVisible();
  await expect(page.getByText("builder@example.com")).toHaveCount(0);
});

test("member sees exact stock, checks out an asset, and returns it", async ({ page }) => {
  await page.goto("/components/bno055-imu");
  await expect(page.getByText("Exact stock")).toHaveCount(0);
  await signInDemo(page);
  await page.goto("/components/bno055-imu");
  await expect(page.getByText("10 available")).toBeVisible();

  await page.goto("/inventory");
  await page.getByRole("button", { name: "Start checkout" }).click();
  await page.getByLabel("Asset tag fallback").fill("ARM-SEN-000123");
  await page.getByRole("button", { name: "Add asset tag" }).click();
  await page.getByRole("button", { name: "Complete checkout" }).click();
  await expect(page.getByText("ARM-SEN-000123")).toBeVisible();
  await page.getByRole("button", { name: "Return" }).click();
  await expect(page.getByText("Your lab checkout is clear.")).toBeVisible();
});

test("printer fleet keeps three Amazon-audited fabrication options", async ({ page }) => {
  await page.goto("/components");
  await page.getByLabel("Filter by category").selectOption("Fabrication");
  await expect(page.getByRole("heading", { name: "Bambu Lab A1 FDM printer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bambu Lab P1S Combo enclosed FDM printer" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ELEGOO Neptune 4 Plus large-format FDM printer" })).toBeVisible();

  await page.goto("/components/bambu-lab-a1");
  await expect(page.getByText("ASIN B0DPXBT99W", { exact: true })).toBeVisible();
  await expect(page.getByText("5.0 / 5 · 14 ratings")).toBeVisible();
  await expect(page.getByRole("link", { name: "Direct link" })).toHaveAttribute(
    "href",
    "https://www.amazon.in/dp/B0DPXBT99W"
  );
  await expect(page.locator('a[href="/procurement"]')).toHaveCount(0);
});

test("public routes omit retired flight-enclosure copy", async ({ page }) => {
  for (const path of ["/", "/branding", "/join", "/projects", "/services"]) {
    await page.goto(path);
    await expect(page.locator("body")).not.toContainText(/\bcages?\b/i);
  }
});

test("member casts only one vote per request", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/component-requests");
  const forceRequest = page.locator("article").filter({ hasText: "Compact six-axis force/torque sensor" });
  await forceRequest.getByRole("button", { name: "Support" }).click();
  await expect(forceRequest.getByRole("button", { name: "Voted" })).toBeDisabled();
});

test("public maker desk explains lockers, small parts, and toolkits", async ({ page }) => {
  await page.goto("/maker-desk");
  await expect(page.getByRole("heading", { name: "Keep the project moving between bookings." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lockers that match the build" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Buy only the small parts you need" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A complete toolbox, checked and ready" })).toBeVisible();
});

test("member requests a locker and staff assigns the physical unit", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/lockers");
  await page.getByRole("button", { name: "Release" }).click();
  await page.getByRole("button", { name: "Request small locker" }).click();
  await expect(page.getByText("Locker request sent to the tool desk.")).toBeVisible();

  await page.goto("/admin/maker-services");
  await page.getByLabel("Locker unit").selectOption({ label: "L-S-022" });
  await page.getByRole("button", { name: "Assign" }).click();

  await page.goto("/lockers");
  await expect(page.getByText("L-S-022", { exact: true })).toBeVisible();
  await expect(page.getByText("active", { exact: true })).toBeVisible();
});

test("member reserves low-cost consumables for desk pickup", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/consumables");
  await page.getByLabel("Quantity for Metric screw assortment").fill("2");
  await page.getByLabel("Quantity for Jumper wires").fill("1");
  await page.getByRole("button", { name: "Submit pickup order" }).click();
  await expect(page.getByText("Pickup order sent to the tool desk.")).toBeVisible();
  await expect(page.getByText(/2× Metric screw assortment/)).toBeVisible();
});

test("member rents and returns a complete tagged toolkit", async ({ page }) => {
  await signInDemo(page);
  await page.goto("/toolkits");
  await page.getByRole("button", { name: "Rent Electronics bench kit" }).click();
  await expect(page.getByText(/ARM-KIT-DEMO/)).toBeVisible();
  await page.getByRole("button", { name: "Return toolkit" }).click();
  await expect(page.getByText("Toolkit returned and condition recorded.")).toBeVisible();
  await expect(page.getByText("No open toolkit rental")).toBeVisible();
});

test("PWA keeps transactional traffic out of Cache Storage", async ({ page, context }) => {
  await signInDemo(page);
  await page.goto("/book/gpu-compute");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();

  const cachedUrls = await page.evaluate(async () => {
    const keys = await caches.keys();
    const requests = await Promise.all(
      keys.map(async (key) => (await caches.open(key)).keys())
    );
    return requests.flat().map((request) => request.url);
  });
  expect(cachedUrls.some((url) => {
    const parsed = new URL(url);
    return (
      parsed.hostname.includes("supabase") ||
      /^\/(?:auth|rest|functions|booking|bookings|check-in|calendar|component-requests|inventory|checkout|cabinet|lockers|consumables|toolkits|maker-services)(?:\/|$)/.test(parsed.pathname)
    );
  })).toBe(false);
  expect(cachedUrls.some((url) => /\/assets\/index-[^/]+\.js$/.test(url))).toBe(true);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /A place to build\s*physical intelligence\./ })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: /A place to build\s*physical intelligence\./ })).toBeVisible();
});

test("mobile route families stay contained and avoid iOS form zoom", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  const publicRoutes = [
    "/", "/membership", "/services", "/projects", "/branding", "/blog", "/blog/model-hardware-standard/", "/ecosystem",
    "/components", "/components/bno055-imu", "/components/request",
    "/maker-desk", "/join", "/members", "/auth", "/kiosk"
  ];
  const memberRoutes = [
    "/dashboard", "/profile", "/book", "/book/gpu-compute", "/bookings", "/check-in",
    "/component-requests", "/inventory", "/lockers", "/consumables", "/toolkits"
  ];
  const adminRoutes = [
    "/financials",
    "/admin/members", "/admin/resources", "/admin/bookings", "/admin/attendance",
    "/admin/integrations", "/admin/components", "/admin/inventory",
    "/admin/component-requests", "/admin/cabinets", "/admin/maker-services"
  ];

  for (const route of publicRoutes) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMobileFormsAvoidZoom(page);
  }

  await page.goto("/projects");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("link", { name: "Equipment", exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Components", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Components", exact: true }).click();
  await expect(page).toHaveURL(/\/components$/);
  await expect(page.locator("#mobile-public-menu")).toHaveCount(0);

  await signInDemo(page);
  for (const route of [...memberRoutes, ...adminRoutes]) {
    await page.goto(route);
    await expect(page.locator("main")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectMobileFormsAvoidZoom(page);
  }

  await page.goto("/profile");
  await expect(page.locator(".workspace-links a.active")).toBeVisible();
  expect(await page.locator(".workspace-links a.active").evaluate((active) => {
    const bounds = active.getBoundingClientRect();
    const nav = active.parentElement!.getBoundingClientRect();
    return bounds.left >= nav.left && bounds.right <= nav.right;
  })).toBe(true);

  await page.goto("/admin/maker-services");
  await expect(page.locator(".admin-nav a.active")).toBeVisible();
  expect(await page.locator(".admin-nav a.active").evaluate((active) => {
    const bounds = active.getBoundingClientRect();
    const nav = active.parentElement!.getBoundingClientRect();
    return bounds.left >= nav.left && bounds.right <= nav.right;
  })).toBe(true);
});
