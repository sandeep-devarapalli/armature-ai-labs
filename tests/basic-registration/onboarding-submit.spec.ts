import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";
for (const theme of ["light", "dark", "sepia"]) test(`documents and final submission in ${theme}`, async ({ page }, info) => {
  const user = { id: "10000000-0000-4000-8000-000000000005", aud: "authenticated", role: "authenticated", email: "synthetic@example.test", email_confirmed_at: "2026-09-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const app = { user_id: user.id, full_name: "Synthetic Member", email: user.email, phone: "9999999999", linkedin_url: "https://linkedin.com/in/synthetic", date_of_birth: "1990-01-01", status: "pending", revision: 1, submitted_revision: null as number | null, submitted_at: null as string | null };
  const docs: { id: string; kind: string; uploaded_at: string | null; expires_at: string; deleted_at: null }[] = [];
  let reservations = 0, uploads = 0, submits = 0;
  await page.addInitScript(({ user, key, theme }) => { localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now()/1000)+36000, token_type: "bearer", user })); localStorage.setItem("armature-theme", theme); }, { user, key: authStorageKey, theme });
  page.on("pageerror", error => { throw error; });
  await page.route(`${backendOrigin}/**`, async route => {
    const url = new URL(route.request().url()), name = url.pathname.split("/").at(-1), body = route.request().postDataJSON?.bind(route.request());
    let data: unknown = [];
    if (name === "onboarding-document") {
      uploads++;
      if (uploads === 1) { await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic scan interruption. Retry this upload." }) }); return; }
      docs.find(doc => doc.id === url.searchParams.get("id"))!.uploaded_at = new Date().toISOString(); data = { uploaded: true };
    } else if (name === "get_basic_account_summary") data = { user_id: user.id, name: app.full_name, email: user.email, status: app.submitted_at ? "pending" : "incomplete", role: "member", revision: 1 };
    else if (name === "basic_onboarding_applications") data = [app];
    else if (name === "onboarding_documents") data = docs;
    else if (name === "user") data = user;
    else if (name === "reserve_onboarding_document") { reservations++; const kind = body!().p_kind; const doc = { id: kind, kind, uploaded_at: null, expires_at: "2035-01-01T00:00:00Z", deleted_at: null }; docs.push(doc); data = doc; }
    else if (name === "submit_basic_application_for_review") { submits++; expect(body!().p_expected_revision).toBe(1); app.submitted_revision = 1; app.submitted_at = new Date().toISOString(); data = app; }
    else if (name === "member-avatar") { await route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"No avatar"}' }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto("/onboarding");
  await expect(page.getByRole("heading", { name: "Start your process", exact: true })).toBeVisible();
  const photo = page.getByLabel("photo image", { exact: true });
  const image = { name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from("synthetic image fixture") };
  await photo.setInputFiles(image); expect(uploads).toBe(0);
  await page.getByRole("button", { name: "Submit photo", exact: true }).click();
  await expect(page.locator("#upload-error-photo")).toBeFocused();
  await expect(page.getByText("Photo Uploaded", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit photo", exact: true }).click();
  await expect(page.getByText("Photo Uploaded", { exact: true })).toBeVisible(); expect(reservations).toBe(1);
  await page.getByLabel("government ID image", { exact: true }).setInputFiles(image);
  await page.getByRole("button", { name: "Submit government ID", exact: true }).click();
  await expect(page.getByText("Government ID Uploaded", { exact: true })).toBeVisible(); expect(submits).toBe(0);
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: process.env.CI ? info.outputPath(`onboarding-top-${theme}.png`) : `/tmp/onboarding-top-${theme}-${info.project.name}.png` });
  await page.screenshot({ path: process.env.CI ? info.outputPath(`onboarding-documents-${theme}.png`) : `/tmp/onboarding-documents-${theme}-${info.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: "Submit application", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Your details have been received" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Done", exact: true })).toBeFocused(); expect(submits).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: process.env.CI ? info.outputPath(`onboarding-${theme}.png`) : `/tmp/onboarding-${theme}-${info.project.name}.png` });
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByRole("button", { name: "Application submitted", exact: true })).toBeDisabled();
});
