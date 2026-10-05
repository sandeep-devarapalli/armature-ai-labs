import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw new Error(`Browser runtime error: ${error.message}`); });
});
const actor = "10000000-0000-4000-8000-000000000001";
const applicant = "10000000-0000-4000-8000-000000000002";
async function mockMembers(page: Page, role: string, incomplete = false) {
  const calls: { name: string; body: Record<string, unknown> }[] = [];
  let targetRole = "member";
  let status = "pending";
  const user = { id: actor, aud: "authenticated", role: "authenticated", email: "reviewer@example.test", email_confirmed_at: "2026-09-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  await page.addInitScript(({ user, storageKey }) => {
    localStorage.setItem(storageKey, JSON.stringify({ access_token: "synthetic-access-token", refresh_token: "synthetic-refresh-token", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user }));
  }, { user, storageKey: authStorageKey });
  await page.route(`${backendOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split("/").at(-1)!;
    const body = route.request().postDataJSON() || {};
    let data: unknown = [];
    if (url.pathname.includes("/rpc/")) {
      calls.push({ name, body });
      if (name === "get_basic_account_summary") data = { user_id: actor, name: "Synthetic Reviewer", email: user.email, status: "approved", application_status: "approved", role, revision: 1, owner_approval_available: false };
      if (name === "list_basic_members") data = { items: status === "approved" && role === "membership_reviewer" ? [] : [{ user_id: applicant, name: "Synthetic Applicant", email: "applicant@example.test", registered_at: "2026-09-01T00:00:00Z", status, application_status: incomplete ? null : status, role: targetRole, revision: 1, photo_available: true, id_available: true, reviewed_at: null }], total: 1, counts: { pending: 1 } };
      if (name === "set_membership_staff_role") { targetRole = String(body.p_role); data = targetRole; }
      if (name === "review_basic_onboarding") { status = "approved"; data = {}; }
    } else if (name === "staff_roles") data = [{ role }];
    else if (name === "basic_onboarding_applications") data = status === "approved" && role === "membership_reviewer" ? [] : [{ user_id: applicant, full_name: "Synthetic Applicant", email: "applicant@example.test", phone: "+919999999999", linkedin_url: "https://www.linkedin.com/in/synthetic", date_of_birth: "1990-01-01", status, revision: 1, submitted_revision: 1, submitted_at: "2026-09-27T00:00:00Z" }];
    else if (name === "onboarding_documents") data = ["photo", "government_id"].map((kind, index) => ({ id: `document-${index}`, user_id: applicant, kind, uploaded_at: "2026-09-27T00:00:00Z", expires_at: "2035-01-01T00:00:00Z", deleted_at: null }));
    else if (name === "user") data = user;
    else if (name === "member-avatar") { await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "No avatar" }) }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  return calls;
}
test("signed-in header persists on homepage and admin can manage Staff", async ({ page }, info) => {
  const calls = await mockMembers(page, "admin");
  await page.goto("/");
  const accountTrigger = page.getByLabel("Account: Synthetic Reviewer", { exact: true });
  await expect(accountTrigger).toBeVisible();
  await expect(page.locator(".account-panel")).not.toBeVisible();
  await accountTrigger.click();
  await expect(page.locator("header").getByText("Synthetic Reviewer", { exact: true }).first()).toBeVisible();
  await expect(page.locator("header").getByText("Basic · Approved", { exact: false }).first()).toBeVisible();
  const boxes = await Promise.all([".brand-link", ".account-menu summary", ".theme-switch", ".compact-mobile-nav button"].map(async (selector) => { const element = page.locator(".topbar").locator(selector); return await element.isVisible() ? element.boundingBox() : null; }));
  for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
    const left = boxes[a], right = boxes[b];
    if (left && right) expect(left.x + left.width <= right.x + 1 || right.x + right.width <= left.x + 1 || left.y + left.height <= right.y + 1 || right.y + right.height <= left.y + 1).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: process.env.CI ? info.outputPath("member-home.png") : `/private/tmp/member-home-${info.project.name}.png` });
  for (const theme of ["light", "sepia", "dark"]) {
    await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
    await expect(page.getByRole("button", { name: `${theme} theme`, exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".account-panel")).not.toBeVisible();
    await accountTrigger.click();
    await expect(page.locator("header").getByText("Basic · Approved", { exact: false }).first()).toBeVisible();
    await accountTrigger.press("Escape");
    await expect(accountTrigger).toBeFocused();
  }
  await page.goto("/admin/members");
  await expect(page.getByRole("cell", { name: "Synthetic Applicant applicant@example.test" })).toBeVisible();
  await page.getByLabel("Search members").fill("Applicant");
  await expect.poll(() => calls.some((call) => call.name === "list_basic_members" && call.body.p_search === "Applicant")).toBe(true);
  await page.getByRole("button", { name: "View Synthetic Applicant" }).click();
  await page.getByRole("button", { name: "Manage staff role" }).click();
  await expect(page.getByRole("option", { name: "Admin — membership and Staff management" })).toHaveCount(0);
  await page.getByLabel("New role").selectOption("membership_reviewer");
  await page.getByLabel("I confirm this change for the account above.").check();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect.poll(() => calls.some((call) => call.name === "set_membership_staff_role" && call.body.p_role === "membership_reviewer")).toBe(true);
  await expect(page.getByText("Change recorded. Paid access is unchanged.")).toBeVisible();
  await expect(page.getByText("Loading members…")).toHaveCount(0);
  await expect(page.getByRole("cell", { name: /Pending review Staff/ })).toBeVisible();
  expect(await page.locator(".member-table-scroll").evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.getByRole("button", { name: "View Synthetic Applicant" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: process.env.CI ? info.outputPath("member-list.png") : `/private/tmp/member-list-${info.project.name}.png` });
});
test("Staff can approve pending applications without administrative controls", async ({ page }, info) => {
  const calls = await mockMembers(page, "membership_reviewer");
  await page.goto("/admin/members");
  await expect(page.getByRole("heading", { name: "Membership reviews", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "View Synthetic Applicant" }).click();
  await expect(page.getByRole("button", { name: "Approve registration" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Reject registration" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Request corrections" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage staff role" })).toHaveCount(0);
  await page.screenshot({ path: process.env.CI ? info.outputPath("member-staff-review.png") : `/private/tmp/member-staff-review-${info.project.name}.png` });
  await page.getByRole("button", { name: "Approve registration" }).click();
  await expect.poll(() => calls.some((call) => call.name === "review_basic_onboarding" && call.body.p_decision === "approved")).toBe(true);
  await expect(page.getByRole("button", { name: "Approve registration" })).toHaveCount(0);
});

for (const incomplete of [true, false]) test(`View brings ${incomplete ? "incomplete" : "submitted"} member details into view`, async ({ page }, info) => {
  await mockMembers(page, "admin", incomplete);
  await page.goto("/admin/members");
  const view = page.getByRole("button", { name: "View Synthetic Applicant" });
  const heading = page.getByRole("region", { name: "Selected member" }).getByRole("heading", { name: "Synthetic Applicant", exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await view.click();
    await expect(heading).toBeFocused(); await expect(heading).toBeInViewport();
    await expect(view).toHaveAttribute("aria-expanded", "true");
  }
  if (incomplete) await expect(page.getByText("This account has not submitted an application yet.")).toBeVisible();
  else await expect(page.getByRole("button", { name: "Approve registration" })).toBeVisible();
  await page.screenshot({ path: info.outputPath(`member-view-${incomplete ? "incomplete" : "submitted"}.png`) });
});
