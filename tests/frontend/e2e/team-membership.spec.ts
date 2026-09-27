import { expect, test } from "@playwright/test";

test("membership paths distinguish an individual application from a team request", async ({ page }) => {
  await page.goto("/join");
  const paths = page.getByRole("group", { name: "Membership path" });
  await expect(paths.getByRole("button", { name: "Individual" })).toHaveAttribute("aria-pressed", "true");
  await paths.getByRole("button", { name: "Team" }).click();
  await expect(page).toHaveURL(/\/join\?path=team$/);
  await expect(page.getByText("One team admin applies for a fixed number of named seats.", { exact: false })).toBeVisible();
  await page.reload();
  await expect(paths.getByRole("button", { name: "Team" })).toHaveAttribute("aria-pressed", "true");
  for (const theme of ["light", "dark", "sepia"]) {
    await page.getByRole("button", { name: `${theme} theme` }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(paths.getByRole("button", { name: "Team" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  }

  await page.goto("/auth");
  await page.getByRole("button", { name: "Open the local member demo" }).click();
  await page.goto("/workspace/team");
  await expect(page.getByRole("heading", { name: "Team workspace" })).toBeVisible();
  await expect(page.getByText("The local demo does not create invitations or change team seats.", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
