import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("Resources opens the selected cover and two independent documents with an installed worker", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  if (testInfo.project.name === "mobile") {
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await page.getByRole("link", { name: "Resources / White Paper", exact: true }).click();
  } else {
    await page.locator("summary").filter({ hasText: /^Resources/ }).click();
    await page.getByRole("link", { name: "White Paper", exact: true }).click();
  }
  await page.getByRole("link", { name: "Explore robotic actuators" }).click();
  await expect(page.getByRole("heading", { name: "Robotic actuators", exact: true })).toBeVisible();
  await expect(page.locator(".publication-art")).toBeVisible();
  expect(await page.locator(".publication-art").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF", exact: true }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe("robotic-actuators-india-white-paper.pdf");
  expect(await download.failure()).toBeNull();
  expect((await readFile((await download.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
  const read = page.locator(".publication-actions a").first();
  const compare = page.locator(".publication-companion > a");
  const paperUrl = await read.getAttribute("href");
  const specificationsUrl = await compare.getAttribute("href");
  expect(paperUrl).not.toBe(specificationsUrl);
  await read.click();
  await expect(page.locator("#root")).toHaveCount(0);
  await expect(page.locator("h1").first()).toContainText(/actuator/i);
  await page.goto(specificationsUrl!);
  await expect(page.locator("#root")).toHaveCount(0);
  await expect(page.locator("h1").first()).toContainText(/actuator/i);
});
