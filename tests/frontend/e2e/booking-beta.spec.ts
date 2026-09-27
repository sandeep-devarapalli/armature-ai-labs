import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("booking beta explores chairs and whole cabins without operational writes", async ({ page }, testInfo) => {
  const writes: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    const url = new URL(request.url());
    if (/\/rest\/v1\/rpc\//.test(url.pathname) || (/supabase|127\.0\.0\.1:57321/.test(url.host) && !["GET", "HEAD", "OPTIONS"].includes(request.method())) || /razorpay|dodopayments|checkout\.stripe/.test(url.host)) writes.push(`${request.method()} ${url.origin}${url.pathname}`);
  });
  await page.goto("/booking-beta");
  await expect(page.getByRole("heading", { name: "Find your place in the lab.", exact: true })).toBeVisible();
  await expect(page.getByText("This beta does not show live availability, reserve a place or collect payment.", { exact: false })).toBeVisible();
  const summary = page.locator(".booking-beta-summary");
  const product = page.getByRole("combobox", { name: "Pass type", exact: true });
  const student = page.getByRole("combobox", { name: /Student discount estimate/ });
  await expect(page.locator(".booking-place-list button")).toHaveCount(25);
  await expect(page.locator(".viewer-seat")).toHaveCount(25, { timeout: 15_000 });
  await page.locator(".viewer-seat[data-seat=S02]").click();
  await expect(summary).toContainText("S02 · GF-10");
  await expect(summary.locator(".booking-beta-price")).toContainText("₹350");
  await student.selectOption("20");
  await expect(summary.locator(".booking-beta-price")).toContainText("₹280");
  await expect(summary).toContainText("It is not an awarded discount.");
  await student.selectOption("0");
  for (const theme of ["light", "dark", "sepia"]) {
    await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".booking-floor-map").screenshot({ path: testInfo.outputPath(`booking-beta-${theme}.png`) });
  }
  await product.selectOption("week");
  await expect(summary).toContainText("23 Nov 2026");
  await expect(summary.locator(".booking-beta-price")).toContainText("₹1,750");
  await product.selectOption("month");
  await expect(summary).toContainText("31 Dec 2026");
  await expect(summary.locator(".booking-beta-price")).toContainText("₹7,000");
  await product.selectOption("cabin");
  await expect(page.locator(".booking-place-list button")).toHaveCount(4);
  await expect(student).toHaveCount(0);
  await page.getByRole("button", { name: /^C02 · FF-03 Whole cabin · 6 seats · Explore$/ }).click();
  await expect(summary).toContainText("C02 · FF-03");
  await expect(page.locator(".viewer-cabin[data-cabin=C02]")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".viewer-seat")).toHaveCount(0);
  await expect(summary.locator(".booking-beta-price")).toContainText("₹52,500");
  await page.locator(".booking-floor-canvas").screenshot({ path: testInfo.outputPath("booking-beta-cabin.png") });
  await product.selectOption("week");
  await page.getByLabel("Week start date", { exact: true }).fill("2026-12-29");
  await expect(summary).toContainText(/review/i);
  await expect(summary.locator(".booking-beta-price")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Confirm reservation|Pay now|Checkout|Reserve now/i })).toHaveCount(0);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});
