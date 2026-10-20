import { expect, test } from "@playwright/test";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";

async function listBuiltCode(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const relativePath = path.posix.join(prefix, entry.name);
    return entry.isDirectory()
      ? listBuiltCode(path.join(directory, entry.name), relativePath)
      : /\.(?:js|css)$/.test(entry.name) ? [relativePath] : [];
  }));
  return files.flat();
}

test("a retired lazy chunk reloads once, then reaches the branded recovery page", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser exercises the deployment transition.");
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();
  let documentRequests = 0;
  let chunkRequests = 0;

  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests += 1;
  });
  await page.route(/\/assets\/ProjectsPage-[^/]+\.js(?:\?.*)?$/, async (route) => {
    chunkRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: "<!doctype html><title>stale SPA fallback</title>"
    });
  });

  await page.goto("/projects");

  await expect(page.getByRole("heading", { name: "This page did not load." })).toBeVisible();
  await expect(page.getByRole("button", { name: /Reload page/ })).toBeVisible();
  await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(documentRequests).toBe(2);
  expect(chunkRequests).toBe(2);
  await context.close();
});

test("the service worker precaches every built JavaScript and CSS asset", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser verifies the production cache manifest.");
  const expected = (await listBuiltCode(path.resolve("dist/assets")))
    .map((asset) => `/assets/${asset}`)
    .sort();

  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();

  const cachedPaths = await page.evaluate(async () => {
    const cacheNames = await caches.keys();
    const requests = await Promise.all(
      cacheNames.map(async (cacheName) => (await caches.open(cacheName)).keys())
    );
    return requests.flat().map((request) => new URL(request.url).pathname);
  });

  expect(expected.filter((asset) => !cachedPaths.includes(asset))).toEqual([]);
});


test("deep navigation survives an evicted service-worker app shell", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const removed = await page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/app-shell" || pathname === "/app-shell.html") {
          paths.push(pathname);
          await cache.delete(request);
        }
      }
    }
    return paths;
  });
  expect(removed).toEqual(["/app-shell"]);
  for (const route of ["/join/", "/auth/callback?next=%2Fonboarding", "/onboarding"]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
});


test("a waiting deployment updates only on request and preserves account storage", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser exercises two real service-worker versions.");
  let version = "old";
  const root = path.resolve("dist");
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    const relative = pathname === "/app-shell" ? "app-shell.html" : pathname.slice(1);
    const filename = path.resolve(root, relative || "index.html");
    if (!filename.startsWith(`${root}/`)) { response.writeHead(403).end(); return; }
    let body: Buffer;
    let extension = path.extname(filename);
    try { body = await readFile(filename); }
    catch {
      if (extension) { response.writeHead(404).end(); return; }
      body = await readFile(path.join(root, "index.html"));
      extension = ".html";
    }
    if (pathname === "/sw.js") {
      body = Buffer.from(body.toString().replace(/(url:"(?:index\.html|app-shell)",revision:")[^"]+/g, `$1fixture-${version}`));
    } else if (extension === ".html") {
      body = Buffer.from(body.toString().replace("<body", `<body data-deployment="${version}"`));
    }
    const types: Record<string, string> = { ".js": "application/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
    response.writeHead(200, { "Content-Type": types[extension] || "application/octet-stream", "Cache-Control": "no-store" });
    response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  const context = await browser.newContext({ serviceWorkers: "allow" });
  try {
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/components`);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect(page.locator("body")).toHaveAttribute("data-deployment", "old");
    await page.getByRole("textbox").first().fill("unfinished equipment search");
    await page.evaluate(() => {
      localStorage.setItem("pwa-test-account", "synthetic-account");
      sessionStorage.setItem("pwa-test-session", "synthetic-session");
    });
    let navigations = 0;
    page.on("framenavigated", frame => { if (frame === page.mainFrame()) navigations += 1; });
    version = "new";
    // Run a real browser update, including install/precache and the waiting-worker lifecycle.
    await page.evaluate(async () => (await navigator.serviceWorker.ready).update());
    await expect(page.getByRole("button", { name: "Update now", exact: true })).toBeVisible();
    if (process.env.VITE_ANALYTICS_ENABLED === "true") {
      await expect(page.getByRole("region", { name: "Optional website analytics" })).toBeVisible();
    }
    expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).waiting?.state)).toBe("installed");
    await expect(page.locator("body")).toHaveAttribute("data-deployment", "old");
    await expect(page.getByRole("textbox").first()).toHaveValue("unfinished equipment search");
    expect(navigations).toBe(0);
    await page.screenshot({ path: testInfo.outputPath("deployment-waiting.png") });
    await page.getByRole("button", { name: "Update now", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-deployment", "new");
    expect(navigations).toBe(1);
    expect(await page.evaluate(() => [localStorage.getItem("pwa-test-account"), sessionStorage.getItem("pwa-test-session")])).toEqual(["synthetic-account", "synthetic-session"]);
    await expect(page.getByRole("button", { name: "Update now", exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("deployment-updated.png") });
  } finally {
    await context.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("proxy analytics respects consent, private routes and withdrawal", async ({ page }, testInfo) => {
  test.skip(process.env.VITE_ANALYTICS_ENABLED !== "true", "Requires the analytics-enabled fixture.");
  // Exercise visitor capture locally; the SDK intentionally ignores automated browsers.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "userAgent", { value: navigator.userAgent.replace("HeadlessChrome", "Chrome") });
    Object.defineProperty(navigator, "userAgentData", { value: undefined });
  });
  const requests: { url: string; body: string | null }[] = [];
  await page.route(/^https:\/\/(?:[^/]+\.posthog\.com|z\.armatureailabs\.com)\//, async route => {
    requests.push({ url: route.request().url(), body: route.request().postData() });
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  await page.goto("/privacy?email=private@example.test#private");
  await expect(page.getByRole("region", { name: "Optional website analytics" }).filter({ has: page.getByRole("button", { name: "Allow analytics", exact: true }) })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Allow analytics", exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(new URL(requests[0].url).origin).toBe("https://z.armatureailabs.com");
  expect(JSON.stringify(requests)).not.toMatch(/private@example|email=|#private|\$set|\$session_id/);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Analytics settings", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Analytics is allowed");
  await page.screenshot({ path: testInfo.outputPath("proxy-consent-settings.png") });
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Withdraw consent", exact: true }).click();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("armature-analytics-consent"))).toBe("denied");
  expect(requests).toHaveLength(1);
});
