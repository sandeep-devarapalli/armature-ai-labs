import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

const user = { id: "10000000-0000-4000-8000-000000000031", aud: "authenticated", role: "authenticated", email: "phone-fixture@example.test", email_confirmed_at: "2026-09-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };

async function fixture(page: Page, theme: string, fresh = false) {
  let applicationExists = !fresh;
  const submissions: Record<string, string>[] = [];
  let savedPhone = "9999991234", verified = false;
  let phone = { enabled: true, available_channels: ["sms"], verified: false, masked_phone: null as string | null, channel: null as string | null, expires_at: null as string | null, resend_available_at: null as string | null };
  const actions: Record<string, string>[] = [], errors: string[] = [];
  let applicationReads = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ user, key, theme }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user }));
    localStorage.setItem("armature-theme", theme);
  }, { user, key: authStorageKey, theme });
  await page.route(`${backendOrigin}/**`, async route => {
    const request = route.request(), name = new URL(request.url()).pathname.split("/").at(-1)!;
    let data: unknown = [];
    if (name === "submit_basic_onboarding") {
      const body = request.postDataJSON(); submissions.push(body); savedPhone = body.p_phone; applicationExists = true; data = {};
    } else if (name === "member-phone-verification") {
      const body = request.postDataJSON(); actions.push(body);
      if (body.action === "start") phone = { ...phone, verified: false, channel: "sms", masked_phone: body.phone.startsWith("+44") ? "+44••••••0123" : "+91••••••1234", expires_at: new Date(Date.now() + 300000).toISOString(), resend_available_at: new Date(Date.now() + 60000).toISOString() };
      if (body.action === "verify") { verified = true; savedPhone = "+447700900123"; phone = { ...phone, verified: true, expires_at: null, resend_available_at: null }; }
      data = phone;
    } else if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Synthetic Phone Member", email: user.email, status: fresh ? "incomplete" : "approved", application_status: fresh ? "pending" : "approved", role: "member", revision: 1, membership_level: verified ? "verified" : "basic", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: verified }, owner_approval_available: false };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "basic_onboarding_applications") { applicationReads++; data = applicationExists ? [{ user_id: user.id, full_name: "Synthetic Phone Member", email: user.email, phone: savedPhone, linkedin_url: "https://linkedin.com/in/synthetic", date_of_birth: "1990-01-01", status: fresh ? "pending" : "approved", revision: 1, submitted_revision: fresh ? null : 1, submitted_at: fresh ? null : "2026-09-27T00:00:00Z" }] : []; }
    else if (name === "user") data = user;
    else if (name === "member-avatar") return route.fulfill({ status: 404, json: {} });
    await route.fulfill({ json: data });
  });
  return { actions, errors, submissions, reads: () => applicationReads };
}

for (const theme of ["light", "dark"]) test(`saved mobile number, explicit SMS and verified details refresh in ${theme}`, async ({ page }, info) => {
  const state = await fixture(page, theme);
  await page.goto("/onboarding");
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByRole("heading", { name: "Your membership status" })).toBeVisible();
  await page.getByRole("button", { name: "Manage my registration", exact: true }).click();
  const region = page.getByRole("region", { name: "Mobile verification", exact: true });
  await expect(region.getByText(/Mobile number from your details/)).toBeVisible();
  await expect(region.getByText("+91 99999 91234", { exact: true })).toBeVisible();
  await expect(region.getByLabel("Mobile number", { exact: true })).toHaveCount(0);
  await expect(region.getByRole("button", { name: "Send SMS code" })).toBeEnabled();
  expect(state.actions).toEqual([{ action: "status" }]);
  await region.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/mobile-number-summary-${theme}-${info.project.name}.png` });
  await region.screenshot({ path: `/tmp/mobile-number-summary-region-${theme}-${info.project.name}.png`, style: ".topbar, .workspace-nav, .skip-link { visibility: hidden !important; }" });
  await region.getByRole("button", { name: "Edit number", exact: true }).click();
  const country = region.getByRole("combobox", { name: "Country code", exact: true }), number = region.getByLabel("Mobile number", { exact: true });
  await expect(country).toHaveValue("IN");
  await expect(number).toHaveValue("9999991234");
  await country.selectOption("GB");
  await number.fill("7700 900123");
  expect(state.actions).toEqual([{ action: "status" }]);
  await expect(country).toHaveJSProperty("tagName", "SELECT");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await number.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `/tmp/mobile-number-editor-${theme}-${info.project.name}.png` });
  await region.screenshot({ path: `/tmp/mobile-number-editor-region-${theme}-${info.project.name}.png`, style: ".topbar, .workspace-nav, .skip-link { visibility: hidden !important; }" });
  await region.getByRole("button", { name: "Send SMS code" }).click();
  await expect(region.getByText(/Code sent by SMS to \+44••••••0123/)).toBeVisible();
  expect(state.actions.at(-1)).toEqual({ action: "start", phone: "+447700900123", channel: "sms" });
  await expect(region.getByRole("button", { name: "Send SMS code" })).toBeDisabled();
  await expect(region.getByRole("button", { name: "Verify mobile number" })).toBeDisabled();
  const reads = state.reads();
  await region.getByLabel("Verification code", { exact: true }).fill("123456");
  await region.getByRole("button", { name: "Verify mobile number" }).click();
  await expect(region.getByText(/Mobile verified/)).toBeVisible();
  expect(state.actions.at(-1)).toEqual({ action: "verify", code: "123456" });
  await expect.poll(state.reads).toBeGreaterThan(reads);
  await page.getByRole("navigation", { name: "Registration steps" }).getByRole("button", { name: /Your details/ }).click();
  await expect(page.locator("#registration-details").getByText("+447700900123", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(state.actions.filter(action => action.action === "start")).toHaveLength(1);
  expect(state.errors).toEqual([]);
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
});


test("saving initial details reuses the number on the mobile step without duplicate entry", async ({ page }) => {
  const state = await fixture(page, "dark", true);
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Become Verified", exact: true }).click();
  await page.getByLabel("Full name", { exact: true }).fill("Synthetic Phone Member");
  await expect(page.getByRole("combobox", { name: "Country code", exact: true })).toHaveValue("IN");
  await page.getByLabel("Phone number", { exact: true }).fill("99999 91234");
  await page.getByLabel("Your LinkedIn profile (required)").fill("https://linkedin.com/in/synthetic");
  await page.getByLabel("Date of birth", { exact: true }).fill("1990-01-01");
  await page.getByRole("checkbox", { name: /I accept the privacy notice/ }).check();
  expect(state.actions).toEqual([]);
  await page.getByRole("button", { name: "Save details and continue", exact: true }).click();
  const region = page.getByRole("region", { name: "Mobile verification", exact: true });
  await expect(region.getByText(/Mobile number from your details/)).toBeVisible();
  await expect(region.getByText("+91 99999 91234", { exact: true })).toBeVisible();
  await expect(region.getByLabel("Mobile number", { exact: true })).toHaveCount(0);
  expect(state.submissions).toHaveLength(1);
  expect(state.submissions[0].p_phone).toBe("+919999991234");
  expect(state.actions).toEqual([{ action: "status" }]);
  await region.getByRole("button", { name: "Send SMS code", exact: true }).click();
  await expect.poll(() => state.actions.at(-1)).toEqual({ action: "start", phone: "+919999991234", channel: "sms" });
  await expect(region.getByText(/Code sent by SMS to \+91••••••1234/)).toBeVisible();
  expect(state.actions.filter(action => action.action === "start")).toHaveLength(1);
  expect(state.errors).toEqual([]);
});
