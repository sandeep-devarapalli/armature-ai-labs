import { expect, test } from "@playwright/test";

test.use({ colorScheme: "light", serviceWorkers: "block" });

for (const saved of [null, "invalid", "light", "dark", "sepia"]) {
  test(`theme is correct before app code and after startup: ${saved ?? "new visitor"}`, async ({ page }) => {
    if (saved !== null) await page.addInitScript((theme) => localStorage.setItem("armature-theme", theme), saved);
    let releaseScripts!: () => void;
    const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
    await page.route(/\/assets\/.*\.js(?:\?.*)?$/, async (route) => {
      await scriptsReady;
      await route.continue();
    });
    const expected = saved === "light" || saved === "sepia" ? "light" : "dark";
    const colors = { dark: "#111110", light: "#ffffff" };
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", colors[expected]);
    await expect(page.locator("#root")).toHaveAttribute("data-prerendered-path", "/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("physical intelligence");
    await expect(page.locator("html")).toHaveCSS("background-color", expected === "dark" ? "rgb(17, 17, 16)" : "rgb(255, 255, 255)");
    releaseScripts();
    await expect(page.getByRole("button", { name: `${expected} theme` })).toHaveAttribute("aria-pressed", "true");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", expected);
  });
}

test("dark startup and theme controls survive blocked theme storage", async ({ page }) => {
  await page.addInitScript(() => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (key) {
      if (key === "armature-theme") throw new DOMException("Blocked", "SecurityError");
      return get.call(this, key);
    };
    Storage.prototype.setItem = function (key, value) {
      if (key === "armature-theme") throw new DOMException("Blocked", "SecurityError");
      return set.call(this, key, value);
    };
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: "dark theme" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "light theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#ffffff");
  expect(errors).toEqual([]);
});

test("all public route families hydrate without errors and keep query filters usable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|Minified React error/i.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem("armature-theme", "light"));
  for (const pathname of [
    "/", "/services/", "/projects/", "/branding/", "/blog/",
    "/blog/model-hardware-standard/", "/projects/electrofluidic-fiber-muscles/",
    "/building-vision/", "/ecosystem/", "/components/", "/maker-desk/",
    "/join/", "/members/", "/components/weather-pico-w-controller/",
    "/projects/?q=BRIDGE", "/components/?project=bridge", "/ecosystem/?focus=niqo-robotics"
  ]) {
    await page.goto(pathname);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.getByRole("button", { name: "light theme", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Unexpected Application Error!", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "This page did not load.", exact: true })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});


test("saved theme reaches controls after delayed route hydration", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("armature-theme", "light"));
  let release!: () => void;
  let intercepted!: () => void;
  const requestSeen = new Promise<void>(resolve => { intercepted = resolve; });
  const ready = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/assets\/ComponentsPages-[^/]+\.js$/, async route => {
    intercepted();
    await ready;
    await route.continue();
  });
  await page.goto("/components/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await requestSeen;
  release();
  await expect(page.locator("main h1")).toBeVisible();
  const light = page.getByRole("button", { name: "light theme", exact: true });
  await expect(light).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "dark theme", exact: true }).click();
  await expect(light).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("armature-theme"))).toBe("dark");
});
