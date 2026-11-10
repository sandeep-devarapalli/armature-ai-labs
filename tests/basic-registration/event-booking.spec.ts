import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

test("event space request from the bookings page", async ({ page }, info) => {
  test.skip(process.env.VITE_EVENT_CHECKOUT_ENABLED !== "true" || process.env.VITE_EVENT_CHECKOUT_MODE !== "test", "Event checkout runs only on test-mode event builds");
  const user = { id: "10000000-0000-4000-8000-000000000061", aud: "authenticated", role: "authenticated", email: "event-fixture@example.test", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const slots = { mode: "test", date: "2027-03-12", ratePaise: 250000, opens: "08:00", closes: "23:00", bufferMinutes: 20, maxAttendees: 35, closed: false, busy: [{ start: "14:00", end: "16:00" }] };
  const quote = { mode: "test", quoteId: "e0000000-0000-4000-8000-000000000061", date: "2027-03-12", startTime: "10:00", hours: 2, attendees: 20,
    purpose: "Robotics meetup with demos", rentPaise: 500000, amountPaise: 500000, agreementHash: "a".repeat(64), policyVersion: "event-v1",
    approvedAt: null, hasAgreement: false, hasOrder: false, orderPending: false, refundDuePaise: null, declineReason: null, status: "awaiting_staff" };
  await page.addInitScript(({ user, key }) => localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user })), { user, key: authStorageKey });
  const sent: { action: string }[] = [];
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Event Fixture", email: user.email, status: "approved", application_status: "approved", role: "member", membership_level: "verified", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: true } };
    else if (name === "get_membership_levels_release_status") data = { membership_levels_enabled: true };
    else if (name === "user") data = user;
    else if (name === "test-event-checkout") { const body = route.request().postDataJSON(); sent.push(body); data = body.action === "availability" ? slots : quote; }
    await route.fulfill({ json: data });
  });
  const width = page.viewportSize()!.width;
  await page.goto("/bookings?item=event");
  await expect(page.getByText("₹2,500 / hour")).toBeVisible();
  await page.getByLabel("Event date").fill("2027-03-12");
  await expect(page.getByLabel(/Already booked: 14:00–16:00/)).toBeVisible();
  await page.getByLabel("Hours").selectOption("2");
  await page.getByLabel("Guests").fill("20");
  await page.getByLabel("What is the event?").fill("Robotics meetup with demos");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath("event-form.png"), fullPage: true });
  await page.getByRole("button", { name: "Request the event space" }).click();
  await expect(page.getByText("Awaiting Armature review")).toBeVisible();
  expect(sent.at(-1)).toMatchObject({ action: "quote", date: "2027-03-12", startTime: "10:00", hours: 2, attendees: 20 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.screenshot({ path: info.outputPath("event-request.png"), fullPage: true });
});
