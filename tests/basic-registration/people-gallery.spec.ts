import { expect, test } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";
for (const theme of ["light", "dark", "sepia"]) test(`people gallery and voluntary publishing in ${theme}`, async ({ page }, info) => {
  const user = { id: "10000000-0000-4000-8000-000000000005", aud: "authenticated", role: "authenticated", email: "synthetic@example.test", email_confirmed_at: "2026-09-01T00:00:00Z", app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-09-01T00:00:00Z" };
  const person = { id: "20000000-0000-4000-8000-000000000001", display_name: "Synthetic Builder", bio: "Building open robot hands and learning embedded systems.", skills: ["Robotics", "Embedded systems"], has_avatar: false };
  let own = { ...person, published: false, share_avatar: false, avatar_available: true, avatar_revision: "synthetic-revision" };
  await page.addInitScript(({ user, key, theme }) => { localStorage.setItem(key, JSON.stringify({ access_token: "synthetic-token", refresh_token: "synthetic-refresh", expires_at: Math.floor(Date.now()/1000)+36000, token_type: "bearer", user })); localStorage.setItem("armature-theme", theme); }, { user, key: authStorageKey, theme });
  page.on("pageerror", error => { throw error; });
  await page.route(`${backendOrigin}/**`, async route => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    let data: unknown = [];
    if (name === "user") data = user;
    else if (name === "get_basic_account_summary") data = { user_id: user.id, name: person.display_name, email: user.email, status: "incomplete", role: "member", membership_level: "basic", revision: 1 };
    else if (name === "list_public_member_profiles") { const body = route.request().postDataJSON(); data = { items: body.p_search === "missing" ? [] : [person], total: body.p_search === "missing" ? 0 : 1 }; }
    else if (name === "get_public_member_profile") data = person;
    else if (name === "get_my_directory_profile") data = own;
    else if (name === "hide_my_directory_profile") { own = { ...own, published: false, share_avatar: false }; data = own; }
    else if (name === "save_my_directory_profile") { const body = route.request().postDataJSON(); expect(body.p_share_avatar).toBe(false); expect(body.p_avatar_revision).toBe("synthetic-revision"); own = { ...own, display_name: body.p_display_name, published: body.p_published }; data = own; }
    else if (name === "member-avatar") { await route.fulfill({ status: 404, body: '{}' }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
  await page.goto("/members");
  await expect(page.getByRole("heading", { name: person.display_name })).toBeVisible();
  await page.getByRole("button", { name: "Robotics", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("Robotics");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await page.getByRole("heading", { name: /Meet the people/ }).click();
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: info.outputPath(`gallery-viewport-${theme}.png`) });
  await page.screenshot({ path: info.outputPath(`gallery-${theme}.png`), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("searchbox").fill("missing"); await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("No matching members yet.")).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("link", { name: /View profile/ }).click();
  await expect(page.getByRole("heading", { name: person.display_name })).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
  await expect(page.getByText("+91 90000 00000")).toHaveCount(0);
  await expect(page.locator("main")).toHaveCount(1);
  await page.getByRole("link", { name: /Back to members/ }).click();
  await page.getByRole("link", { name: /Manage my public profile/ }).click();
  await expect(page.getByLabel("Public name", { exact: true })).toHaveValue(person.display_name);
  await expect(page.getByRole("checkbox", { name: /I want my name/ })).not.toBeChecked();
  await page.getByRole("checkbox", { name: /I want my name/ }).check();
  await page.getByRole("button", { name: "Save profile choices" }).click();
  await expect(page.getByText("Your public profile is now visible in the members directory.")).toBeVisible();
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: info.outputPath(`settings-${theme}.png`), fullPage: true });
  await page.getByLabel("Public name", { exact: true }).fill("");
  await page.getByRole("button", { name: "Hide my public profile" }).click();
  await expect(page.getByText("Your profile is private. It is not listed in the public directory.")).toBeVisible();
  expect(own.published).toBe(false); expect(own.display_name).toBe(person.display_name);
});
