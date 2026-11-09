import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

test("guided desk recovery on a fresh device preserves a pending payment", async ({ page }, info) => {
  test.skip(process.env.VITE_DESK_CHECKOUT_ENABLED !== "true", "Desk interface is gated off in this build");
  const user = { id: "10000000-0000-4000-8000-000000000051", aud: "authenticated", role: "authenticated", email: "desk-fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const quote = { quoteId: "a0000000-0000-4000-8000-000000000051", chair: "S01", unit: "day", start: "2099-06-10", amountPaise: 35000, orderPending: true };
  const actions: string[] = [];
  await page.addInitScript(({ user, key }) => localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, key: authStorageKey });
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Desk Fixture", email: user.email, status: "approved", application_status: "approved", role: "member", membership_level: "verified", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: true } };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "user") data = user;
    else if (name === "desk-checkout") {
      const { action } = route.request().postDataJSON(); actions.push(action);
      data = { mode: "live", ...(action === "list_own" ? { quotes: [quote] } : action === "status" ? quote : { chairs: ["S01"], dates: [] }) };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/bookings/?item=desk");
  await expect(page.getByRole("list", { name: "Booking steps" })).toBeVisible();
  await page.getByText("Resume an existing booking", { exact: true }).click();
  await page.getByRole("button", { name: "Load my recent requests" }).click();
  await page.getByRole("button", { name: /S01.*In progress/ }).click();
  await expect(page.getByText("Armature needs to reconcile this payment. Contact support before trying again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay with Razorpay" })).toHaveCount(0);
  expect(actions).not.toContain("order");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: info.outputPath("desk-recovery.png"), fullPage: true });
});
