import { expect, test } from "@playwright/test";
import { readdir } from "node:fs/promises";
import path from "node:path";

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
