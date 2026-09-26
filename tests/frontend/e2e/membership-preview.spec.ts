import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
  test.skip(!baseURL?.endsWith(":4340"), "Use playwright.membership-preview.config.ts for the local-only preview.");
  await page.goto("/membership-preview");
});

test("local preview renders in every theme without overflow or external mutations", async ({ page }, testInfo) => {
  const errors: string[] = [];
  const mutations: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!["GET", "HEAD"].includes(request.method())) mutations.push(request.url());
  });
  await expect(page.locator("h1")).toHaveText("One account. A place to build.");
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  for (const theme of ["light", "dark", "sepia"]) {
    await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.screenshot({ path: `/private/tmp/armature-membership-preview-${testInfo.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
  expect(mutations).toEqual([]);
});

async function submitSample(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Attach synthetic photo", exact: true }).click();
  await page.getByRole("button", { name: "Attach synthetic ID", exact: true }).click();
  await page.getByLabel("Accept lab rules and privacy notice for this simulation.").check();
  await page.getByRole("button", { name: "Submit sample application", exact: true }).click();
}

test("adult approval is separate from paid access, refund and ID deletion", async ({ page }) => {
  await expect(page.getByRole("button", { name: "Simulate successful payment" })).toBeDisabled();
  await submitSample(page);
  await page.getByRole("button", { name: "Approve sample member" }).click();
  await expect(page.getByText("Basic membership approved — paid access is not included. No email was sent.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Synthetic paid-pass receipt" })).toHaveCount(0);
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic paid-pass receipt" })).toBeVisible();
  await page.getByLabel("Refund clock simulation").selectOption("outside");
  await expect(page.getByRole("button", { name: "Request full refund" })).toBeDisabled();
  await page.getByLabel("Refund clock simulation").selectOption("inside");
  await page.getByRole("button", { name: "Request full refund" }).click();
  await expect(page.getByRole("heading", { name: /Full refund requested/ })).toBeVisible();
  await page.getByRole("button", { name: "Simulate day-30 ID deletion" }).click();
  await expect(page.getByText("Document copy deleted", { exact: true })).toBeVisible();
  await expect(page.getByText(/Verification record: Staff-approved/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: /Full refund requested/ })).toHaveCount(0);
  await expect(page.getByText("No document attached", { exact: true })).toBeVisible();
});

test("minor needs reviewed guardian email and cannot purchase overnight access", async ({ page }) => {
  await page.getByLabel("Synthetic applicant").selectOption("minor");
  await submitSample(page);
  await page.getByRole("button", { name: "Approve sample member" }).click();
  await expect(page.getByRole("alert")).toContainText("Staff must review");
  await expect(page.getByRole("button", { name: "Simulate successful payment" })).toBeDisabled();
  await page.getByLabel("Staff inspected synthetic guardian email containing minor details and explicit permission.").check();
  await page.getByRole("button", { name: "Approve sample member" }).click();
  await page.getByLabel("Pass type").selectOption("overnight");
  await expect(page.getByText("Overnight access is adults-only (18+).", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simulate successful payment" })).toBeDisabled();
});

test("dates, closures and renewal rules remain visible before mock purchase", async ({ page }) => {
  await submitSample(page);
  await page.getByRole("button", { name: "Approve sample member" }).click();
  await expect(page.getByLabel("Preview optional automatic renewal")).toHaveCount(0);
  await page.getByLabel("Additional day-pass date").fill("2026-11-05");
  await expect(page.getByText("Day-pass dates must be within the selected month.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove 2026-11-05" }).click();
  await page.getByLabel("Pass type").selectOption("month");
  await page.getByLabel("Preview optional automatic renewal").check();
  await expect(page.getByText("Closed: 2026-10-02", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simulate successful payment" })).toBeDisabled();
  await page.getByLabel("Select any date in the calendar month").fill("2028-02-22");
  await expect(page.getByRole("heading", { name: "1 Feb 2028 — 29 Feb 2028" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Simulate successful payment" })).toBeEnabled();
  await page.getByLabel("Pass type").selectOption("day");
  await expect(page.getByLabel("Preview optional automatic renewal")).toHaveCount(0);
});

test("incomplete, underage and expired-document applications cannot be approved", async ({ page }) => {
  await page.getByLabel("Synthetic applicant").selectOption("underage");
  await submitSample(page);
  await expect(page.getByRole("alert")).toContainText("Membership starts at age 16.");
  await expect(page.getByRole("button", { name: "Approve sample member" })).toBeDisabled();
  await page.getByLabel("Synthetic applicant").selectOption("adult");
  await page.getByLabel("LinkedIn URL · required").fill("");
  await submitSample(page);
  await expect(page.getByRole("alert")).toContainText("Enter your own LinkedIn profile URL.");
  await page.getByLabel("LinkedIn URL · required").fill("https://www.linkedin.com/in/synthetic-builder");
  await page.getByRole("button", { name: "Submit sample application" }).click();
  await page.getByRole("button", { name: "Simulate day-30 ID deletion" }).click();
  await page.getByRole("button", { name: "Approve sample member" }).click();
  await expect(page.getByRole("alert")).toContainText("Attach a current synthetic identity document.");
  await expect(page.getByRole("button", { name: "Simulate successful payment" })).toBeDisabled();
});

test("resource review enforces guest counts, event capacity and staff exceptions", async ({ page }) => {
  await expect(page.getByText("Visitor allowance: 2. Maximum stay: 3 hours.")).toBeVisible();
  await page.getByLabel("Simultaneous visitors").fill("3");
  await expect(page.getByText("Guest allowance exceeded", { exact: true })).toBeVisible();
  await page.getByLabel("Simultaneous visitors").fill("2");
  await page.getByLabel("Visitor stay (hours)").fill("4");
  await expect(page.getByText("Guest allowance exceeded", { exact: true })).toBeVisible();
  await page.getByLabel("Seated attendees").fill("36");
  await expect(page.getByText("Review timing, closure, approval or seating", { exact: true })).toBeVisible();
  await page.getByLabel("Seated attendees").fill("35");
  await page.getByLabel("Event start (IST)").fill("10:00");
  await expect(page.getByText("Review timing, closure, approval or seating", { exact: true })).toBeVisible();
  await page.getByLabel("Simulate special weekday daytime approval").check();
  await expect(page.getByText("Preview checks passed; availability not checked", { exact: true })).toBeVisible();
  await page.getByLabel("Event date").fill("");
  await expect(page.getByText("Review timing, closure, approval or seating", { exact: true })).toBeVisible();
});
