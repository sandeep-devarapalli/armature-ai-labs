import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

test.skip(process.env.VITE_MEMBERSHIP_LEVELS_ENABLED !== "true", "Requires the separately gated membership-levels build.");

async function fixture(page: Page, options: { ready?: boolean; approved?: boolean; noPhoto?: boolean; corrections?: boolean; enabled?: boolean; level?: null } = {}) {
  const user = { id: "10000000-0000-4000-8000-000000000011", aud: "authenticated", role: "authenticated", email: "clarity@reserved.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const app = { user_id: user.id, full_name: "Synthetic Member", email: user.email, phone: "+919999991234", linkedin_url: "https://www.linkedin.com/in/synthetic", date_of_birth: "1990-01-01", status: options.approved ? "approved" : options.corrections ? "corrections_requested" : "pending", revision: 1, submitted_revision: options.approved ? 1 : null as number | null, submitted_at: options.approved ? "2026-09-01T00:00:00Z" : null as string | null };
  const docs = (options.noPhoto ? [] : options.ready || options.approved ? ["photo", "government_id"] : ["photo"]).map(kind => ({ id: `${kind}-fixture`, user_id: user.id, kind, uploaded_at: "2026-11-01T00:00:00Z", expires_at: options.approved ? "2020-01-01T00:00:00Z" : "2035-01-01T00:00:00Z", deleted_at: null }));
  let submits = 0;
  await page.addInitScript(({ user, key }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, token_type: "bearer", user }));
    localStorage.setItem("armature-theme", "dark");
  }, { user, key: authStorageKey });
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: app.full_name, email: user.email, role: "member", status: options.approved ? "approved" : app.submitted_at ? "pending" : "incomplete", application_status: app.status, revision: 1, owner_approval_available: false, membership_levels_enabled: options.enabled !== false, membership_level: options.level === null ? null : "basic", verification: { email: true, identity: Boolean(options.approved), mobile: false }, next_status_change_at: null };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: options.enabled !== false };
    else if (name === "basic_onboarding_applications") data = [app];
    else if (name === "onboarding_documents") data = docs;
    else if (name === "get_onboarding_update") data = null;
    else if (name === "user") data = user;
    else if (name === "member-phone-verification") data = { enabled: true, available_channels: ["sms"], verified: false, masked_phone: null, channel: null, expires_at: null, resend_available_at: null };
    else if (name === "submit_basic_application_for_review") {
      expect(route.request().postDataJSON().p_expected_revision).toBe(1);
      submits++;
      app.submitted_revision = 1;
      app.submitted_at = new Date().toISOString();
      data = app;
    } else if (name === "member-avatar") {
      await route.fulfill({ status: 404, json: {} });
      return;
    }
    await route.fulfill({ json: data });
  });
  return { submissions: () => submits };
}

async function activeBasic(page: Page) {
  const current = page.getByRole("region", { name: "Current membership", exact: true });
  await expect(current).toBeVisible();
  await expect(current).toContainText("Basic member · active");
}

test("Basic stays active while missing ID is explained beside the review action", async ({ page }, info) => {
  const state = await fixture(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "You're already a Basic member.", exact: true })).toBeVisible();
  await activeBasic(page);
  await page.getByRole("button", { name: "Continue verification", exact: true }).click();
  const steps = page.getByRole("navigation", { name: "Registration steps" });
  await expect(steps.getByRole("button", { name: /Private documents/ })).toHaveAttribute("aria-current", "step");
  await activeBasic(page);
  for (const name of [/Your details/, /Mobile number/, /Private documents/, /Review & submit/]) {
    await steps.getByRole("button", { name }).click();
    await expect(steps.getByRole("button", { name })).toHaveAttribute("aria-current", "step");
    await activeBasic(page);
  }
  await expect(page.getByRole("button", { name: "Submit identity for review", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Add government ID", exact: true }).click();
  await expect(page.getByLabel("government ID image", { exact: true })).toBeVisible();
  await activeBasic(page);
  await page.screenshot({ path: info.outputPath("basic-active-verification.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Back to your membership", exact: true }).click();
  await expect(page.getByRole("heading", { name: "You're already a Basic member.", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue verification", exact: true }).click();
  await steps.getByRole("button", { name: /Your membership/ }).click();
  await expect(page.getByRole("heading", { name: "You're already a Basic member.", exact: true })).toBeVisible();
  await activeBasic(page);
  expect(state.submissions()).toBe(0);
});

test("both missing documents have enabled actions beside the disabled identity submission", async ({ page }) => {
  await fixture(page, { noPhoto: true });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Continue verification", exact: true }).click();
  for (const name of ["Add verification photo", "Add government ID"]) {
    await page.getByRole("navigation", { name: "Registration steps" }).getByRole("button", { name: /Review & submit/ }).click();
    await expect(page.getByRole("button", { name: "Submit identity for review", exact: true })).toBeDisabled();
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("navigation", { name: "Registration steps" }).getByRole("button", { name: /Private documents/ })).toHaveAttribute("aria-current", "step");
    await activeBasic(page);
  }
});

test("requested corrections keep Basic active and continue to personal details", async ({ page }) => {
  await fixture(page, { corrections: true });
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Changes requested.", exact: true })).toBeVisible();
  await expect(page.getByText("Changes needed", { exact: true })).toBeVisible();
  await activeBasic(page);
  await page.getByRole("button", { name: "Continue verification", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Registration steps" }).getByRole("button", { name: /Your details/ })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("button", { name: "Save corrections and continue", exact: true })).toBeVisible();
  await activeBasic(page);
});

test("submitting current documents starts identity review without changing Basic membership", async ({ page }) => {
  const state = await fixture(page, { ready: true });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Continue verification", exact: true }).click();
  await activeBasic(page);
  await page.getByRole("button", { name: "Submit identity for review", exact: true }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByText(/Your identity application is in review\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "View review status", exact: true })).toBeVisible();
  await activeBasic(page);
  expect(state.submissions()).toBe(1);
});

test("approved identity with expired private copies needs mobile verification, not new uploads", async ({ page }) => {
  await fixture(page, { approved: true });
  await page.goto("/onboarding");
  await activeBasic(page);
  await page.getByRole("button", { name: "Verify mobile number", exact: true }).click();
  await expect(page.getByRole("region", { name: "Mobile verification", exact: true })).toBeVisible();
  await activeBasic(page);
  await expect(page.getByLabel("government ID image", { exact: true })).toHaveCount(0);
});

for (const [label, options] of [["no authoritative membership", { level: null }], ["server feature hold", { enabled: false }]] as const) {
  test(`${label} never claims Basic membership is active`, async ({ page }) => {
    await fixture(page, options);
    await page.goto("/onboarding");
    await expect(page.getByRole("heading", { name: "Complete your membership.", exact: true })).toBeVisible();
    await expect(page.getByText("Basic member · active", { exact: true })).toHaveCount(0);
  });
}
