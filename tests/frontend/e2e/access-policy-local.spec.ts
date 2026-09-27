import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const url = process.env.ARMATURE_LOCAL_SUPABASE_URL ?? "";
const anonKey = process.env.ARMATURE_LOCAL_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.ARMATURE_LOCAL_SUPABASE_SERVICE_KEY ?? "";
const dbUrl = process.env.ARMATURE_LOCAL_SUPABASE_DB_URL ?? "";
test.skip(process.env.ARMATURE_LOCAL_TEAM_E2E !== "1", "Synthetic local Supabase only.");

test.setTimeout(60_000);
test("lab admin configures access and a member reviews dates, closures and renewal", async ({ page }, testInfo) => {
  expect(new URL(url).hostname).toBe("127.0.0.1");
  expect(new URL(url).port).toBe("57321");
  expect(new URL(dbUrl).hostname).toBe("127.0.0.1");
  expect(new URL(dbUrl).port).toBe("57322");
  const sql = (query: string) => execFileSync("psql", ["--dbname", dbUrl, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], { input: query, encoding: "utf8" }).trim();
  expect(sql("select mock_grants_enabled from public.booking_policy_settings;")).toBe("t");
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID().slice(0, 8);
  const password = `Synthetic-${randomUUID()}`;
  const ids: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const resource = JSON.parse(sql("select row_to_json(r) from (select id,name,location_id from public.resources where slug='builder-pod-01') r;"));
  const savedProducts = JSON.parse(sql("select json_agg(p) from (select id,price_paise,enabled from public.booking_products where code in ('workspace-day','workspace-week')) p;"));
  const savedPolicy = sql(`select kind from public.resource_booking_policies where resource_id='${resource.id}';`);
  const nextMonth = new Date(); nextMonth.setUTCDate(1); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const month = nextMonth.toISOString().slice(0, 7);
  const closedOn = `${month}-02`, grantStart = `${month}-08`;
  const closureReason = `Synthetic closure ${suffix}`;
  expect(sql(`select count(*) from public.booking_closures where location_id='${resource.location_id}' and closed_on='${closedOn}';`)).toBe("0");
  async function signIn(email: string) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.auth.signInWithPassword({ email, password }); expect(result.error).toBeNull(); return result.data.session!;
  }
  async function show(session: Session, route: string) {
    await page.goto("/robots.txt"); await page.evaluate((data) => localStorage.setItem("sb-127-auth-token", JSON.stringify(data)), session); await page.goto(route);
  }
  try {
    for (const name of ["Access Admin", "Access Builder"]) {
      const result = await service.auth.admin.createUser({ email: `${name.replaceAll(" ", "-").toLowerCase()}-${suffix}@example.test`, password, email_confirm: true, user_metadata: { full_name: name } });
      expect(result.error).toBeNull(); ids.push(result.data.user!.id);
    }
    sql(`insert into public.staff_roles(user_id,role) values ('${ids[0]}','admin');
      insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
      select id,raw_user_meta_data->>'full_name',email,'9999999999','https://linkedin.com/in/synthetic','1990-01-01','approved' from auth.users where id in ('${ids[0]}','${ids[1]}');`);
    const admin = await signIn(`access-admin-${suffix}@example.test`);
    const member = await signIn(`access-builder-${suffix}@example.test`);
    await show(admin, "/admin/access");
    await expect(page.getByRole("heading", { name: "Access, prices and closures" })).toBeVisible();
    await page.getByLabel("Policy resource").selectOption(resource.id);
    await page.getByRole("combobox", { name: "Booking policy", exact: true }).selectOption("workspace");
    await page.getByRole("button", { name: "Save resource policy" }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved\.$/ })).toHaveText("Saved.");
    for (const name of ["Coworking day pass", "Coworking week pass"]) {
      const form = page.locator("form").filter({ has: page.getByRole("heading", { name, exact: true }) });
      await form.getByRole("spinbutton").fill("250");
      await form.getByRole("checkbox").check();
      await form.getByRole("button", { name: "Save product" }).click();
      await expect(form.getByRole("button", { name: "Save product" })).toBeEnabled();
    }
    await page.getByLabel("Lab location").selectOption(resource.location_id);
    await page.getByLabel("Closed date").fill(closedOn);
    await page.getByLabel("Closure reason").fill(closureReason);
    await page.getByRole("button", { name: "Add closure" }).click();
    await expect(page.locator("li").filter({ hasText: closureReason })).toBeVisible();
    await page.getByLabel("Test member").selectOption(ids[1]);
    await page.getByLabel("Test product").selectOption({ label: "Coworking week pass" });
    await page.getByLabel("Specific resource").selectOption(resource.id);
    await page.locator("input[name=dates]").fill(grantStart);
    await page.getByLabel("This is synthetic local test data").check();
    await page.getByRole("button", { name: "Grant mock access" }).click();
    await expect(page.getByRole("row").filter({ hasText: "Access Builder" })).toHaveCount(7);
    await expect(page.getByRole("row").filter({ hasText: "Access Builder" }).first()).toContainText("Granted");
    for (const theme of ["light", "dark", "sepia"]) {
      await page.getByRole("button", { name: `${theme} theme` }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `/private/tmp/access-admin-${testInfo.project.name}-${theme}.png`, fullPage: true });
      for (const [section, heading] of [["prices", "Prices and availability"], ["closures", "Holiday calendar"], ["mock", "Synthetic access test"]]) {
        await page.getByRole("heading", { name: heading, exact: true }).evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 180, behavior: "instant" }));
        await page.screenshot({ path: `/private/tmp/access-admin-${testInfo.project.name}-${theme}-${section}.png` });
      }
    }
    await show(member, "/passes");
    await expect(page.getByRole("heading", { name: "Choose your lab access" })).toBeVisible();
    await page.getByLabel("Access product").selectOption({ label: "Coworking day pass · ₹250.00" });
    await page.getByLabel("Pass resource").selectOption(resource.id);
    await page.getByLabel("Day-pass date").fill(closedOn);
    await page.getByRole("button", { name: "Add date" }).click();
    await page.getByRole("button", { name: "Check dates and price" }).click();
    await expect(page.getByRole("status").filter({ hasText: closureReason })).toBeVisible();
    expect(await page.getByRole("checkbox").count()).toBe(1);
    await page.getByRole("checkbox", { name: /Renew Coworking week pass/ }).click();
    await expect(page.getByText("Renewal preference saved; automatic billing remains unavailable.")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Renew Coworking week pass/ })).toBeChecked();
    expect(sql(`select enabled from public.access_renewal_preferences where user_id='${ids[1]}';`)).toBe("t");
    for (const theme of ["light", "dark", "sepia"]) {
      await page.getByRole("button", { name: `${theme} theme` }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.screenshot({ path: `/private/tmp/access-member-${testInfo.project.name}-${theme}.png`, fullPage: true });
      await page.getByRole("heading", { name: "Your pass renewal preferences" }).evaluate((element) => window.scrollTo({ top: element.getBoundingClientRect().top + window.scrollY - 180, behavior: "instant" }));
      await page.screenshot({ path: `/private/tmp/access-member-${testInfo.project.name}-${theme}-renewal.png` });
    }
    await expect(page.locator("vite-error-overlay")).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    sql(`delete from public.booking_closures where location_id='${resource.location_id}' and closed_on='${closedOn}' and reason='${closureReason}';
      delete from public.access_renewal_preferences where user_id in (${ids.map((id) => `'${id}'`).join(",") || "null"});
      delete from public.paid_access_entitlements where granted_by in (${ids.map((id) => `'${id}'`).join(",") || "null"});
      delete from public.basic_onboarding_applications where user_id in (${ids.map((id) => `'${id}'`).join(",") || "null"});
      ${savedProducts.map((p: { id: string; price_paise: number | null; enabled: boolean }) => `update public.booking_products set price_paise=${p.price_paise ?? "null"},enabled=${p.enabled} where id='${p.id}';`).join("\n")}
      ${savedPolicy ? `update public.resource_booking_policies set kind='${savedPolicy}' where resource_id='${resource.id}';` : `delete from public.resource_booking_policies where resource_id='${resource.id}';`}`);
    for (const id of ids.reverse()) { const result = await service.auth.admin.deleteUser(id); expect(result.error).toBeNull(); }
  }
});
