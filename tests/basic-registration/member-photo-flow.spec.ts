import { expect, test, type Page } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5x8AAAAASUVORK5CYII=", "base64");
const user = { id: "10000000-0000-4000-8000-000000000021", aud: "authenticated", role: "authenticated", email: "photo-fixture@example.test", email_confirmed_at: "2026-09-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
const photoId = "20000000-0000-4000-8000-000000000021", governmentId = "30000000-0000-4000-8000-000000000021";

async function fixture(page: Page, options: { saved?: boolean; imageUnavailable?: boolean; verificationAvailable?: boolean; theme?: string; holdSave?: boolean } = {}) {
  let saved = options.saved !== false, unavailable = Boolean(options.imageUnavailable);
  let savedBytes = png;
  const mutations: { method: string; bytes: Buffer | null; consent?: string; contentType?: string }[] = [];
  const documents: string[] = [], calls: string[] = [], errors: string[] = [];
  let releaseSave!: () => void;
  const saveReleased = new Promise<void>(resolve => { releaseSave = resolve; });
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(({ user, key, theme }) => {
    localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: "bearer", user }));
    localStorage.setItem("armature-theme", theme);
  }, { user, key: authStorageKey, theme: options.theme || "dark" });
  await page.route(`${backendOrigin}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), name = url.pathname.split("/").at(-1)!;
    calls.push(name);
    let data: unknown = [];
    if (name === "member-avatar") {
      if (request.method() === "GET") {
        if (!saved || unavailable) return route.fulfill({ status: 404, json: { error: "Avatar unavailable." } });
        return route.fulfill({ contentType: "image/png", body: savedBytes });
      }
      mutations.push({ method: request.method(), bytes: request.postDataBuffer(), consent: request.headers()["x-avatar-consent"], contentType: request.headers()["content-type"] });
      if (request.method() === "DELETE") { saved = false; return route.fulfill({ json: { removed: true } }); }
      if (options.holdSave) await saveReleased;
      saved = true; unavailable = false; savedBytes = request.postDataBuffer()!;
      return route.fulfill({ status: 201, json: { saved: true } });
    }
    if (name === "onboarding-document") {
      const id = url.searchParams.get("id")!; documents.push(id);
      expect(request.method()).toBe("GET"); expect(id).toBe(photoId);
      return route.fulfill({ contentType: "application/octet-stream", body: png });
    }
    if (name === "member_avatars") {
      expect(url.searchParams.get("user_id")).toBe(`eq.${user.id}`);
      data = saved ? { user_id: user.id, updated_at: "2026-10-25T00:00:00Z" } : null;
    } else if (name === "get_basic_account_summary") data = { user_id: user.id, name: "Synthetic Photo Member", email: user.email, status: "approved", application_status: "approved", role: "member", revision: 1, membership_level: "verified", membership_levels_enabled: true, verification: { email: true, identity: true, mobile: true }, owner_approval_available: false };
    else if (name === "basic_onboarding_applications") data = [{ user_id: user.id, full_name: "Synthetic Photo Member", email: user.email, phone: "+919999991234", linkedin_url: "https://linkedin.com/in/synthetic", date_of_birth: "1990-01-01", status: "approved", revision: 1, submitted_revision: 1, submitted_at: "2026-09-27T00:00:00Z" }];
    else if (name === "onboarding_documents") data = [{ id: photoId, user_id: user.id, kind: "photo", uploaded_at: "2026-10-25T00:00:00Z", expires_at: options.verificationAvailable === false ? "2020-01-01T00:00:00Z" : "2035-01-01T00:00:00Z", deleted_at: null }, { id: governmentId, user_id: user.id, kind: "government_id", uploaded_at: "2026-10-25T00:00:00Z", expires_at: "infinity", deleted_at: null }];
    else if (name === "member-phone-verification") data = { enabled: true, available_channels: ["sms"], verified: true, masked_phone: "+91••••••1234", channel: "sms" };
    else if (name === "user") data = user;
    await route.fulfill({ json: data });
  });
  return { mutations, documents, calls, errors, releaseSave, makeImageAvailable: () => { unavailable = false; } };
}

async function openPhoto(page: Page) {
  await page.goto("/onboarding");
  await page.getByRole("button", { name: "Manage my registration", exact: true }).click();
  await page.getByRole("navigation", { name: "Registration steps" }).getByRole("button", { name: /Private documents/ }).click();
  const region = page.getByRole("region", { name: "Member profile photo", exact: true });
  await expect(region).toBeVisible();
  return region;
}

for (const theme of ["light", "dark"]) test(`member photo selection, explicit save and removal preserve identity in ${theme}`, async ({ page }, info) => {
  const state = await fixture(page, { theme, holdSave: true });
  const region = await openPhoto(page);
  await expect(region.getByText("Saved", { exact: true })).toBeVisible();
  await expect(region.getByRole("checkbox")).toHaveCount(0);
  const currentImage = region.getByRole("img", { name: "Current member profile photo", exact: true });
  await expect(currentImage).toBeVisible();
  const original = await currentImage.getAttribute("src");
  await region.getByRole("button", { name: "Change photo", exact: true }).click();
  await region.locator('input[type="file"]').setInputFiles({ name: "synthetic-photo.png", mimeType: "image/png", buffer: png });
  const previewHeading = region.getByRole("heading", { name: "Preview your new photo", exact: true });
  await expect(previewHeading).toBeFocused();
  await expect.poll(() => previewHeading.evaluate(heading => {
    const box = heading.getBoundingClientRect();
    const headerBottom = Math.max(0, ...Array.from(document.querySelectorAll(".topbar, .workspace-nav")).map(header => {
      const bounds = header.getBoundingClientRect(), style = getComputedStyle(header);
      return style.display !== "none" && style.visibility !== "hidden" && bounds.top < innerHeight && bounds.bottom > 0 ? bounds.bottom : 0;
    }));
    return box.top >= headerBottom && box.top <= headerBottom + 180 && box.bottom <= innerHeight;
  })).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: process.env.CI ? info.outputPath(`member-photo-focus-${theme}.png`) : `/tmp/member-photo-focus-${theme}-${info.project.name}.png` });
  expect(state.mutations).toEqual([]);
  await expect(region.getByRole("button", { name: "Save photo", exact: true })).toBeDisabled();
  await expect(currentImage).toHaveAttribute("src", original!);
  await region.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(currentImage).toHaveAttribute("src", original!);
  expect(state.mutations).toEqual([]);
  await region.getByRole("button", { name: "Change photo", exact: true }).click();
  await region.locator('input[type="file"]').setInputFiles({ name: "synthetic-photo.png", mimeType: "image/png", buffer: png });
  const consent = region.getByRole("checkbox", { name: /Keep this image as my member profile photo/ });
  await expect(consent).not.toBeChecked(); await consent.check();
  const saveButton = region.getByRole("button", { name: "Save photo", exact: true });
  await expect(saveButton).toBeEnabled();
  await expect(saveButton).toHaveCSS("background-color", theme === "light" ? "rgb(17, 17, 16)" : "rgb(246, 246, 242)");
  await expect(saveButton).toHaveCSS("color", theme === "light" ? "rgb(255, 255, 255)" : "rgb(17, 17, 16)");
  const contrast = await saveButton.evaluate(button => {
    const style = getComputedStyle(button);
    const luminance = (value: string) => value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => {
      const linear = channel / 255;
      return linear <= .04045 ? linear / 12.92 : ((linear + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
    const foreground = luminance(style.color), background = luminance(style.backgroundColor);
    return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  await region.screenshot({ path: process.env.CI ? info.outputPath(`member-photo-preview-${theme}.png`) : `/tmp/member-photo-preview-${theme}-${info.project.name}.png`, style: ".topbar, .workspace-nav, .skip-link { visibility: hidden !important; }" });
  await region.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect.poll(() => state.mutations.length).toBe(1);
  for (const step of await page.getByRole("navigation", { name: "Registration steps" }).getByRole("button").all()) await expect(step).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back to status", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Review application", exact: true })).toBeDisabled();
  await expect(region.getByRole("button", { name: "Checking and saving…", exact: true })).toBeDisabled();
  await expect(currentImage).toHaveAttribute("src", original!);
  state.releaseSave();
  await expect(region.getByRole("status").filter({ hasText: "Profile photo saved." })).toBeVisible();
  expect(state.mutations).toHaveLength(1);
  expect(state.mutations[0]).toMatchObject({ method: "POST", consent: "2026-09-27-avatar-1", contentType: "image/png" });
  expect(state.mutations[0].bytes?.equals(png)).toBe(true);
  await region.getByRole("button", { name: "Remove saved photo", exact: true }).click();
  await expect(region.getByRole("heading", { name: "Remove your saved profile photo?", exact: true })).toBeVisible();
  expect(state.mutations).toHaveLength(1);
  await region.getByRole("button", { name: "Keep photo", exact: true }).click();
  await expect(region.getByText("Saved", { exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: "Remove saved photo", exact: true })).toBeFocused();
  await region.getByRole("button", { name: "Remove saved photo", exact: true }).click();
  await region.getByRole("button", { name: "Remove photo", exact: true }).click();
  await expect(region.getByRole("button", { name: "Add a photo", exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: "Remove saved photo", exact: true })).toHaveCount(0);
  expect(state.mutations.map(value => value.method)).toEqual(["POST", "DELETE"]);
  expect(state.documents).toEqual([]);
  expect(state.calls.some(name => /save_my_directory|submit_basic|review_basic/.test(name))).toBe(false);
  await page.getByRole("button", { name: "Back to status", exact: true }).click();
  await expect(page.getByText("Identity: Approved", { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});

test("a saved photo loading failure remains distinct from no saved photo and supports retry", async ({ page }) => {
  const state = await fixture(page, { imageUnavailable: true });
  const region = await openPhoto(page);
  await expect(region.getByText("Photo could not be loaded", { exact: true })).toBeVisible();
  await expect(region.getByText("Your saved photo has not been removed.", { exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: "Remove saved photo", exact: true })).toBeVisible();
  state.makeImageAvailable();
  await region.getByRole("button", { name: "Retry loading photo", exact: true }).click();
  await expect(region.getByText("Saved", { exact: true })).toBeVisible();
  await expect(region.getByRole("img", { name: "Current member profile photo", exact: true })).toBeVisible();
  expect(state.mutations).toEqual([]); expect(state.errors).toEqual([]);
});

test("verification reuse previews only the photo and saves the exact preview bytes after consent", async ({ page }) => {
  const state = await fixture(page, { saved: false });
  const region = await openPhoto(page);
  await expect(region.getByRole("button", { name: "Add a photo", exact: true })).toBeVisible();
  await expect(region.getByRole("button", { name: "Remove saved photo", exact: true })).toHaveCount(0);
  await region.getByRole("button", { name: "Add a photo", exact: true }).click();
  await region.getByRole("button", { name: /Use my verification photo/ }).click();
  await expect(region.getByRole("heading", { name: "Preview your new photo", exact: true })).toBeVisible();
  expect(state.documents).toEqual([photoId]); expect(state.documents).not.toContain(governmentId); expect(state.mutations).toEqual([]);
  await expect(region.getByRole("button", { name: "Save photo", exact: true })).toBeDisabled();
  await region.getByRole("checkbox", { name: /Keep this image as my member profile photo/ }).check();
  await region.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(region.getByRole("status").filter({ hasText: "Profile photo saved." })).toBeVisible();
  expect(state.documents).toEqual([photoId]);
  expect(state.mutations).toHaveLength(1); expect(state.mutations[0].bytes?.equals(png)).toBe(true);
  expect(state.mutations[0].contentType).toBe("image/png");
  expect(state.mutations[0].consent).toBe("2026-09-27-avatar-1");
  expect(state.errors).toEqual([]);
});

test("an expired verification photo does not block identity approval or a new member photo", async ({ page }) => {
  const state = await fixture(page, { saved: false, verificationAvailable: false });
  const region = await openPhoto(page);
  await region.getByRole("button", { name: "Add a photo", exact: true }).click();
  await expect(region.getByRole("button", { name: /Use my verification photo/ })).toHaveCount(0);
  await expect(region.getByText(/Your verification photo is unavailable for reuse/)).toBeVisible();
  await expect(region.getByRole("button", { name: /Upload a new photo/ })).toBeEnabled();
  expect(state.documents).toEqual([]); expect(state.mutations).toEqual([]);
  await page.getByRole("button", { name: "Back to status", exact: true }).click();
  await expect(page.getByText("Identity: Approved", { exact: true })).toBeVisible();
  expect(state.errors).toEqual([]);
});
