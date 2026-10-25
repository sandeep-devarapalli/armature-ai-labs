import { expect, test, type Page } from "@playwright/test";

const path = "/resources/white-paper/robotic-actuators/feedback?document=actuator-specifications";
const userId = "10000000-0000-4000-8000-000000000123";
const pending = { id: "20000000-0000-4000-8000-000000000123", document: "actuator-specifications", version: "2026-10-25", kind: "correction", reference: "RS06 mass", body: "Synthetic correction: confirm whether cable mass is included.", source_url: "https://example.test/datasheet", display_name: "Synthetic reviewer", response: "", created_at: "2026-10-25T00:00:00Z", updated_at: "2026-10-25T00:00:00Z", revision: 1, status: "pending", review_note: "" };

async function fixtures(page: Page, role?: "member" | "admin") {
  let entry = { ...pending };
  let submitted = role === "admin";
  const writes: { name: string; args: Record<string, unknown> }[] = [];
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  if (role) await page.addInitScript(({ id, role }) => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem("sb-resource-feedback-auth-token", JSON.stringify({ access_token: `${btoa('{"alg":"HS256","typ":"JWT"}')}.${btoa(JSON.stringify({ sub: id, exp }))}.synthetic`, refresh_token: "synthetic-refresh", token_type: "bearer", expires_in: 3600, expires_at: exp, user: { id, aud: "authenticated", email: `${role}@example.test`, role: "authenticated", app_metadata: {}, user_metadata: {} } }));
  }, { id: userId, role });
  await page.route("https://resource-feedback.invalid/**", async route => {
    const name = new URL(route.request().url()).pathname.split("/").pop()!;
    const args = route.request().postDataJSON() || {};
    if (name === "get_basic_account_summary") return route.fulfill({ json: { user_id: userId, name: "Private registration name", email: `${role}@example.test`, status: "incomplete", role, membership_level: "basic", membership_levels_enabled: true } });
    if (name === "resource_feedback_access") return route.fulfill({ json: { can_submit: Boolean(role), can_moderate: role === "admin" } });
    if (name === "submit_resource_feedback") {
      writes.push({ name, args }); submitted = true;
      entry = { ...entry, display_name: String(args.p_display_name), body: String(args.p_body) };
      return route.fulfill({ json: entry });
    }
    if (name === "review_resource_feedback") {
      writes.push({ name, args }); entry = { ...entry, status: String(args.p_status), response: String(args.p_response), review_note: String(args.p_review_note), revision: entry.revision + 1 };
      return route.fulfill({ json: entry });
    }
    if (name === "list_resource_feedback") return route.fulfill({ json: { items: entry.status === "approved" ? [{ ...entry, review_note: undefined, status: undefined }] : [], total: entry.status === "approved" ? 1 : 0 } });
    if (name === "list_my_resource_feedback") return route.fulfill({ json: { items: submitted ? [entry] : [], total: submitted ? 1 : 0 } });
    if (name === "list_resource_feedback_queue") {
      const include = args.p_status === "all" || args.p_status === entry.status;
      return route.fulfill({ json: { items: include ? [entry] : [], total: include ? 1 : 0 } });
    }
    return route.fulfill({ json: [] });
  });
  return { writes, pageErrors };
}

test("anonymous readers see only published feedback and retain the document during sign-in", async ({ page }, info) => {
  const { writes, pageErrors } = await fixtures(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "Comments & corrections", exact: true })).toBeVisible();
  await expect(page.getByText("No published feedback yet.")).toBeVisible();
  await expect(page.getByText(pending.body)).toHaveCount(0);
  await expect(page.getByLabel("Public display name")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("feedback-anonymous.png"), fullPage: true });
  await page.getByRole("link", { name: "Sign in or register for free" }).click();
  await expect(page).toHaveURL(/\/auth$/);
  expect(await page.evaluate(() => history.state.usr.from)).toBe(path);
  expect(writes).toEqual([]); expect(pageErrors).toEqual([]);
});

test("Basic members submit privately for review without identity approval", async ({ page }, info) => {
  const { writes, pageErrors } = await fixtures(page, "member");
  await page.goto(path);
  await expect(page.getByLabel("Public display name")).toHaveValue("");
  await page.getByLabel("Public display name").fill("Synthetic reviewer");
  await page.getByLabel("Feedback type").selectOption("correction");
  await page.getByLabel("Section, page or actuator model (optional)").fill("RS06 mass");
  await page.getByLabel("Your comment or correction").fill(pending.body);
  await page.getByLabel("Supporting source URL (optional)").fill(pending.source_url);
  await page.getByRole("checkbox", { name: /I agree that my chosen display name/ }).check();
  await page.getByRole("button", { name: "Submit for review", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Feedback submitted for review" })).toBeVisible();
  const own = page.locator("section").filter({ has: page.getByRole("heading", { name: "Your submissions", exact: true }) });
  await expect(own).toContainText(pending.body); await expect(own).toContainText("Awaiting review");
  await expect(page.getByText("No published feedback yet.")).toBeVisible();
  expect(writes).toHaveLength(1);
  expect(writes[0].args).toMatchObject({ p_document: "actuator-specifications", p_kind: "correction", p_display_name: "Synthetic reviewer", p_consent_version: "2026-10-25-resource-feedback-v1" });
  expect(writes[0].args.p_request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await own.screenshot({ path: info.outputPath("feedback-basic-pending.png") });
  expect(pageErrors).toEqual([]);
});

test("admins explicitly approve feedback and only the public response reaches the public feed", async ({ page }, info) => {
  const { writes, pageErrors } = await fixtures(page, "admin");
  await page.goto("/admin/resource-feedback");
  await expect(page.getByRole("heading", { name: "Resource feedback review", exact: true })).toBeVisible();
  await expect(page.getByText(pending.body)).toBeVisible();
  await page.getByLabel("Public Armature response (optional)").fill("Synthetic response: source checked, report update under review.");
  await page.getByLabel("Review note to the author (not public)").fill("Synthetic private review note.");
  await page.screenshot({ path: info.outputPath("feedback-admin-review.png"), fullPage: true });
  await page.getByRole("button", { name: "Approve and publish", exact: true }).click();
  await expect(page.getByText("No feedback in this view.")).toBeVisible();
  expect(writes[0]).toMatchObject({ name: "review_resource_feedback", args: { p_id: pending.id, p_expected_revision: 1, p_status: "approved" } });
  await page.goto(path);
  const published = page.locator("section").filter({ has: page.getByRole("heading", { name: "Published comments & corrections", exact: true }) });
  await expect(published).toContainText(pending.body);
  await expect(published).toContainText("Synthetic response: source checked");
  await expect(published).not.toContainText("Synthetic private review note.");
  await published.screenshot({ path: info.outputPath("feedback-approved.png") });
  expect(pageErrors).toEqual([]);
});
