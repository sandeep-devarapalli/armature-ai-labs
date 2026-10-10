import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

test.skip(process.env.VITE_MEMBERSHIP_LEVELS_ENABLED !== "true", "Requires the separately gated membership-levels build.");
async function fixture(page: Page, enabled = true) {
  const user = { id: "10000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "member@example.test", email_confirmed_at: "2026-01-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  let level = "basic", mobile = false;
  let phone = { enabled: true, verified: false, masked_phone: null as string | null, channel: null as string | null, expires_at: null as string | null, resend_available_at: null as string | null };
  const calls: string[] = [];
  await page.addInitScript(({ user, storageKey }) => localStorage.setItem(storageKey, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, storageKey: authStorageKey });
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1)!;
    const body = route.request().postDataJSON() || {}; calls.push(name);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Synthetic Member", email: user.email, role: "member", status: "approved", application_status: "approved", revision: 1, owner_approval_available: false, membership_levels_enabled: enabled, membership_level: level, verification: { email: true, identity: true, mobile }, next_status_change_at: null };
    if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: enabled };
    if (name === "basic_onboarding_applications") data = [{ user_id: user.id, full_name: "Synthetic Member", email: user.email, phone: "+919999991234", linkedin_url: "https://www.linkedin.com/in/synthetic", date_of_birth: "1990-01-01", status: "approved", revision: 1, submitted_revision: 1, submitted_at: "2026-09-27T00:00:00Z" }];
    if (name === "member-phone-verification") {
      if (body.action === "start") phone = { ...phone, channel: body.channel, masked_phone: "+91••••••1234", expires_at: new Date(Date.now() + 300000).toISOString(), resend_available_at: new Date(Date.now() + 60000).toISOString() };
      if (body.action === "verify") { mobile = true; level = "verified"; phone = { ...phone, verified: true, expires_at: null, resend_available_at: null }; }
      data = phone;
    }
    if (name === "user") data = user;
    if (name === "member-avatar") { await route.fulfill({ status: 404, contentType: "application/json", body: "{}" }); return; }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(data) });
  });
  return { calls, premium: () => { level = "premium"; } };
}

test("Basic to Verified and Premium keep identity status distinct on desktop and mobile", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const state = await fixture(page);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Basic member", exact: true })).toBeVisible();
  await expect(page.getByText("Identity: Approved", { exact: true })).toBeVisible();
  await page.getByLabel("Mobile number with country code").fill("+919999991234");
  await page.getByRole("button", { name: "Send WhatsApp code", exact: true }).click();
  await expect(page.getByText(/Code sent by WhatsApp/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Use SMS instead" })).toBeDisabled();
  await page.getByRole("region", { name: "Mobile verification", exact: true }).screenshot({ path: info.outputPath("mobile-code-pending.png") });
  await page.getByLabel("Verification code", { exact: true }).fill("123456");
  await page.getByRole("button", { name: "Verify mobile number", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Verified member", exact: true })).toBeVisible();
  await expect(page.getByText(/Mobile verified ·/)).toBeVisible();
  await page.getByRole("heading", { name: "Verified member", exact: true }).scrollIntoViewIfNeeded();
  await page.getByRole("region", { name: "Membership verification", exact: true }).screenshot({ path: info.outputPath("verified-membership.png") });
  state.premium();
  await page.evaluate(() => window.dispatchEvent(new Event("armature:account-changed")));
  await expect(page.getByRole("heading", { name: "Premium member", exact: true })).toBeVisible();
  await page.getByLabel("Account: Synthetic Member", { exact: true }).click();
  await expect(page.locator(".account-panel").getByText("Premium member", { exact: true }).first()).toBeVisible();
  await expect(page.locator(".account-panel").getByText("Identity approved", { exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("server hold retains original registration and avoids OTP calls", async ({ page }) => {
  const { calls } = await fixture(page, false);
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Your basic membership" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mobile verification" })).toHaveCount(0);
  expect(calls).not.toContain("member-phone-verification");
  await page.goto("/join");
  await expect(page.getByRole("heading", { name: "Complete identity review" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Premium", exact: true })).toHaveCount(0);
});

test("public membership journey explains all three levels without promising rentals", async ({ page }, info) => {
  await fixture(page);
  await page.goto("/join");
  for (const label of ["Basic", "Verified", "Premium"]) await expect(page.getByRole("heading", { name: label, exact: true })).toBeVisible();
  await expect(page.getByText(/Premium membership/)).toContainText("Paid bookings remain closed");
  await page.getByRole("heading", { name: "One membership journey" }).scrollIntoViewIfNeeded();
  await page.locator(".process-list").screenshot({ path: info.outputPath("membership-levels-join.png"), style: ".topbar, .skip-link { visibility: hidden !important; }" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
