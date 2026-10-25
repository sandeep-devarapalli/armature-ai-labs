import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

const user = { id: "10000000-0000-4000-8000-000000000041", aud: "authenticated", role: "authenticated", email: "review-fixture@example.test", email_confirmed_at: "2026-09-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
async function fixture(page: Page, status: string, theme = "dark", pendingIdentity?: boolean) {
  const application = { user_id: user.id, full_name: "Current Member Name", email: user.email, phone: "+919999991234", linkedin_url: "https://linkedin.com/in/current-member", date_of_birth: "1990-01-01", status, revision: 4, submitted_revision: 4, submitted_at: "2026-09-27T00:00:00Z" };
  let update: Record<string, unknown> | null = pendingIdentity === undefined ? null : { id: "update-one", user_id: user.id, status: "pending", revision: 1, application_revision: 4, full_name: pendingIdentity ? "Proposed New Name" : application.full_name, linkedin_url: "https://linkedin.com/in/proposed-member", date_of_birth: application.date_of_birth, previous_details: { full_name: application.full_name, linkedin_url: application.linkedin_url, date_of_birth: application.date_of_birth }, identity_changed: pendingIdentity, needs_documents: pendingIdentity };
  const mutations: { name: string; body: Record<string, unknown> }[] = [], errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ user, key, theme }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user }));
    localStorage.setItem("armature-theme", theme);
  }, { user, key: authStorageKey, theme });
  await page.route(`${backendOrigin}/**`, async route => {
    const request = route.request(), name = new URL(request.url()).pathname.split("/").at(-1)!;
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: application.full_name, email: user.email, status, application_status: status, role: "member", revision: 4, membership_level: "basic", membership_levels_enabled: true, verification: { email: true, identity: status === "approved", mobile: false }, owner_approval_available: false };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "basic_onboarding_applications") data = [application];
    else if (name === "onboarding_documents") data = ["photo", "government_id"].map(kind => ({ id: `${kind}-fixture`, user_id: user.id, kind, uploaded_at: "2026-09-01T00:00:00Z", expires_at: "2020-01-01T00:00:00Z", deleted_at: null }));
    else if (name === "onboarding_reviews") data = [{ id: "review-one", decision: status, reason: "Synthetic reviewer history", created_at: "2026-09-27T00:00:00Z" }];
    else if (name === "member-phone-verification") data = { enabled: true, available_channels: ["sms"], verified: false, masked_phone: null, channel: null, expires_at: null, resend_available_at: null };
    else if (name === "get_onboarding_update") data = update;
    else if (name === "submit_onboarding_update") {
      const body = request.postDataJSON(); mutations.push({ name, body });
      update = { id: "update-one", user_id: user.id, status: "pending", revision: 1, application_revision: application.revision, full_name: body.p_full_name, linkedin_url: body.p_linkedin_url, date_of_birth: body.p_date_of_birth, previous_details: { full_name: application.full_name, linkedin_url: application.linkedin_url, date_of_birth: application.date_of_birth }, created_at: "2026-10-25T12:00:00Z", updated_at: "2026-10-25T12:00:00Z", review_reason: null, identity_changed: body.p_full_name !== application.full_name || body.p_date_of_birth !== application.date_of_birth };
      data = update;
    } else if (name === "withdraw_onboarding_update") {
      const body = request.postDataJSON(); mutations.push({ name, body });
      update = { ...update, status: "withdrawn", revision: 2 }; data = update;
    } else if (name === "user") data = user;
    else if (name === "member-avatar") return route.fulfill({ status: 404, json: {} });
    else if (request.method() === "POST" && !["get_my_directory_profile", "list_public_member_profiles"].includes(name)) {
      if (/submit|resubmit|review|update|reserve/.test(name)) mutations.push({ name, body: request.postDataJSON() });
    }
    await route.fulfill({ json: data });
  });
  return { application, mutations, errors };
}

async function openReview(page: Page) {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Manage my registration", exact: true }).click();
  await page.getByRole("navigation", { name: "Registration steps" }).getByRole("button", { name: /Private documents/ }).click();
  const review = page.getByRole("button", { name: "Review application", exact: true });
  await expect(review).toBeEnabled();
  await review.click();
}

for (const status of ["pending", "approved", "rejected", "revoked"]) test(`${status} submitted member can review the application after uploads expire`, async ({ page }, info) => {
  const state = await fixture(page, status);
  await openReview(page);
  const review = page.getByRole("region", { name: "Application review", exact: true });
  await expect(review).toBeVisible();
  await expect(review.getByRole("button", { name: "Edit application details", exact: true })).toBeEnabled();
  await expect(review.getByText("Private copy expired", { exact: true })).toHaveCount(2);
  await expect(review.getByText("Synthetic reviewer history", { exact: true })).toBeVisible();
  if (status === "pending") await expect(review.getByRole("button", { name: "Application submitted", exact: true })).toBeDisabled();
  await expect(review.getByText("Current Member Name", { exact: true })).toBeVisible();
  await expect(review.getByText(user.email, { exact: true })).toBeVisible();
  await expect(review.getByText("+919999991234", { exact: true })).toBeVisible();
  await expect(review.getByText("https://linkedin.com/in/current-member", { exact: true })).toBeVisible();
  await expect(review.getByText("1990-01-01", { exact: true })).toBeVisible();
  if (status === "approved") await review.screenshot({ path: `/tmp/application-review-approved-${info.project.name}.png`, style: ".topbar, .workspace-nav, .skip-link { visibility: hidden !important; }" });
  expect(state.mutations).toEqual([]);
  expect(state.errors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});


for (const theme of ["light", "dark"]) test(`approved edits are proposed separately and current details remain active in ${theme}`, async ({ page }, info) => {
  const state = await fixture(page, "approved", theme);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Review application", exact: true }).click();
  const review = page.getByRole("region", { name: "Application review", exact: true });
  const updates = page.getByRole("region", { name: "Application updates", exact: true });
  await expect(review.getByRole("heading", { name: "Current approved details", exact: true })).toBeVisible();
  await updates.getByRole("button", { name: "Edit application details", exact: true }).click();
  await expect(updates.getByLabel("Full name", { exact: true })).toHaveValue(state.application.full_name);
  await expect(updates.getByLabel(/Phone|Email/)).toHaveCount(0);
  await updates.getByLabel("Full name", { exact: true }).fill("Proposed New Name");
  await updates.getByLabel("Your LinkedIn profile", { exact: true }).fill("https://linkedin.com/in/proposed-member");
  expect(state.mutations).toEqual([]);
  await updates.getByRole("checkbox", { name: /I confirm these proposed changes/ }).check();
  await updates.getByRole("button", { name: "Submit changes for review", exact: true }).click();
  await expect(updates.getByRole("status")).toContainText("Changes submitted for staff review.");
  expect(state.mutations).toHaveLength(1);
  expect(state.mutations[0]).toEqual({ name: "submit_onboarding_update", body: { p_full_name: "Proposed New Name", p_linkedin_url: "https://linkedin.com/in/proposed-member", p_date_of_birth: "1990-01-01", p_notice_version: "2026-09-26-release-1", p_expected_application_revision: 4, p_expected_update_revision: null } });
  const table = updates.getByRole("table", { name: "Current application and proposed changes" });
  await expect(table.getByText("Current Member Name", { exact: true })).toBeVisible();
  const proposedName = table.getByText("Proposed New Name", { exact: true });
  await expect(proposedName).toBeVisible();
  expect(await proposedName.evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth; })).toBe(true);
  await expect(updates.getByText(/current approved details remain active/)).toBeVisible();
  expect(state.application.full_name).toBe("Current Member Name");
  expect(state.application.status).toBe("approved");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await updates.screenshot({ path: `/tmp/application-updates-${theme}-${info.project.name}.png`, style: ".topbar, .workspace-nav, .skip-link { visibility: hidden !important; }" });
  await page.getByRole("button", { name: "Back to status", exact: true }).click();
  await expect(page.getByText("Identity: Approved", { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});


for (const identityChanged of [false, true]) test(`approved upload controls require a pending identity change: ${identityChanged}`, async ({ page }) => {
  const state = await fixture(page, "approved", "dark", identityChanged);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Manage my registration", exact: true }).click();
  await page.getByRole("navigation", { name: "Registration steps" }).getByRole("button", { name: /Private documents/ }).click();
  await expect(page.getByRole("button", { name: "Review application", exact: true })).toBeEnabled();
  if (identityChanged) {
    await expect(page.getByLabel("photo image", { exact: true })).toBeVisible();
    await expect(page.getByLabel("government ID image", { exact: true })).toBeVisible();
  } else {
    await expect(page.getByText(/New evidence is needed only for proposed changes to your name or date of birth/)).toBeVisible();
    await expect(page.getByLabel("photo image", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("government ID image", { exact: true })).toHaveCount(0);
  }
  expect(state.mutations).toEqual([]); expect(state.errors).toEqual([]);
});

test("a pending SMS request locks registration exits until the response arrives", async ({ page }) => {
  const state = await fixture(page, "approved");
  let release!: () => void, requested = false;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  await page.route(`${backendOrigin}/functions/v1/member-phone-verification`, async route => {
    if (route.request().postDataJSON().action !== "start") return route.fallback();
    requested = true; await responseReady;
    await route.fulfill({ json: { enabled: true, available_channels: ["sms"], verified: false, masked_phone: "+91••••••1234", channel: "sms", expires_at: new Date(Date.now() + 300000).toISOString(), resend_available_at: new Date(Date.now() + 60000).toISOString() } });
  });
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Manage my registration", exact: true }).click();
  await page.getByRole("button", { name: "Send SMS code", exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  for (const step of await page.getByRole("navigation", { name: "Registration steps" }).getByRole("button").all()) await expect(step).toBeDisabled();
  for (const name of ["Back to status", "Back", "Continue with identity review", "Refresh status", "Sign out"]) await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  release();
  await expect(page.getByText(/Code sent by SMS/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to status", exact: true })).toBeEnabled();
  expect(state.errors).toEqual([]);
});
