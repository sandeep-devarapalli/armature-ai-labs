import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const url = process.env.ARMATURE_LOCAL_SUPABASE_URL ?? "";
const anon = process.env.ARMATURE_LOCAL_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.ARMATURE_LOCAL_SUPABASE_SERVICE_KEY ?? "";
const dbUrl = process.env.ARMATURE_LOCAL_SUPABASE_DB_URL ?? "";
test.skip(process.env.ARMATURE_LOCAL_TEAM_E2E !== "1", "Explicit synthetic local Supabase only.");

test("chair conflicts, closures and whole-team cabins stay authoritative across the booking UI", async ({ page }, testInfo) => {
  expect(new URL(url).origin).toBe("http://127.0.0.1:57321");
  expect(new URL(dbUrl).hostname).toBe("127.0.0.1");
  expect(new URL(dbUrl).port).toBe("57322");
  const sql = (query: string) => execFileSync("psql", ["--dbname", dbUrl, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], { input: query, encoding: "utf8" }).trim();
  const savedGate = sql("select mock_grants_enabled from public.booking_policy_settings") === "t";
  const savedProducts: { id: string; enabled: boolean }[] = JSON.parse(sql("select json_agg(p) from (select id,enabled from public.booking_products where code in ('workspace-day','cabin-month')) p"));
  const resources: { id: string; code: string; location_id: string; active: boolean }[] = JSON.parse(sql("select json_agg(r) from (select r.id,i.code,r.location_id,r.active from public.booking_inventory i join public.resources r on r.id=i.resource_id where i.code in ('S01','S02','S03','C01')) r"));
  expect(resources).toHaveLength(4);
  const resource = (code: string) => resources.find((item) => item.code === code)!;
  const dayProduct = sql("select id from public.booking_products where code='workspace-day'");
  const cabinProduct = sql("select id from public.booking_products where code='cabin-month'");
  const date = "2026-12-08", monthStart = "2026-12-01";
  const suffix = randomUUID().slice(0, 8), org = randomUUID();
  const password = `Synthetic-${randomUUID()}`;
  const users: string[] = [];
  const clients: SupabaseClient[] = [];
  const sessions: Session[] = [];
  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const closureReason = `Inventory browser fixture ${suffix}`;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  async function show(index: number, route: string) {
    await page.goto("/robots.txt");
    await page.evaluate((session) => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), sessions[index]);
    await page.goto(route);
  }
  async function chooseDay() {
    await page.getByRole("combobox", { name: "Access product", exact: true }).selectOption(dayProduct);
    await page.getByLabel("Day-pass date", { exact: true }).fill(date);
    await page.getByRole("button", { name: "Add date", exact: true }).click();
    await page.getByRole("button", { name: "Check chair availability", exact: true }).click();
  }
  const chair = (code: string) => page.getByRole("button", { name: new RegExp(`^${code} ·`) }).last();
  try {
    sql("update public.booking_policy_settings set mock_grants_enabled=true; update public.booking_products set enabled=true where code in ('workspace-day','cabin-month')");
    for (const name of ["Admin", "Builder", "Competitor"]) {
      const email = `inventory-${name.toLowerCase()}-${suffix}@example.test`;
      const created = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Inventory ${name}` } });
      expect(created.error).toBeNull(); users.push(created.data.user!.id);
      const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
      const signed = await client.auth.signInWithPassword({ email, password });
      expect(signed.error).toBeNull(); clients.push(client); sessions.push(signed.data.session!);
    }
    sql(`insert into public.staff_roles(user_id,role) values ('${users[0]}','admin');
      insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status)
      select id,raw_user_meta_data->>'full_name',email,'9999999999','https://linkedin.com/in/synthetic','1990-01-01','approved' from auth.users where id in (${users.map((id) => `'${id}'`).join(",")});
      insert into public.organizations(id,name) values ('${org}','Inventory Team ${suffix}');
      insert into public.organization_memberships(organization_id,status,seat_allowance,starts_at,ends_at,approved_by) values ('${org}','active',6,'2026-09-01','2027-01-01','${users[0]}');
      insert into public.organization_members(organization_id,user_id,role,seat_enabled) values ('${org}','${users[1]}','admin',true);`);
    for (const userId of users.slice(1)) for (const code of ["S01", "S02"]) {
      const grant = await clients[0].rpc("grant_mock_access", { p_user_id: userId, p_product_id: dayProduct, p_resource_id: resource(code).id, p_dates: [date] });
      expect(grant.error).toBeNull();
    }
    const cabinGrant = await clients[0].rpc("grant_mock_access", { p_user_id: null, p_product_id: cabinProduct, p_resource_id: resource("C01").id, p_dates: [monthStart], p_seats: 6, p_organization_id: org });
    expect(cabinGrant.error).toBeNull();

    await show(1, "/passes"); await chooseDay();
    await expect(chair("S01")).toBeEnabled();
    await expect(page.locator(".viewer-seat")).toHaveCount(25);
    const canvas = page.locator(".booking-floor-canvas canvas");
    await expect(canvas).toHaveAttribute("data-frames", /^[1-9]/);
    const idleFrames = await canvas.getAttribute("data-frames");
    await page.waitForTimeout(800);
    expect(await canvas.getAttribute("data-frames")).toBe(idleFrames);
    await page.locator(".viewer-seat[data-seat=S01]").click();
    await expect(chair("S01")).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Review reservation", exact: true }).click();
    const competing = await clients[2].rpc("reserve_workspace_pass", { p_resource_id: resource("S01").id, p_product_id: dayProduct, p_dates: [date] });
    expect(competing.error).toBeNull();
    await page.getByRole("checkbox", { name: "I confirm these dates and this chair or whole cabin.", exact: true }).check();
    await page.getByRole("button", { name: "Confirm reservation", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(/reserved|available|conflict/i);
    expect(sql(`select count(*) from public.bookings where resource_id='${resource("S01").id}' and member_id='${users[1]}'`)).toBe("0");
    await page.getByRole("button", { name: "Check chair availability", exact: true }).click();
    await expect(chair("S01")).toBeDisabled();
    await chair("S02").click();
    await page.getByRole("button", { name: "Review reservation", exact: true }).click();
    await page.getByRole("checkbox", { name: "I confirm these dates and this chair or whole cabin.", exact: true }).check();
    await page.locator(".booking-floor-canvas").screenshot({ path: `/private/tmp/inventory-map-${testInfo.project.name}.png` });
    for (const theme of ["light", "dark", "sepia"]) {
      await page.getByRole("button", { name: `${theme} theme`, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/private/tmp/inventory-review-${testInfo.project.name}-${theme}.png`, fullPage: true });
    }
    await page.getByRole("button", { name: "Confirm reservation", exact: true }).click();
    await expect.poll(() => sql(`select count(*) from public.bookings where resource_id='${resource("S02").id}' and member_id='${users[1]}' and status='confirmed'`)).toBe("1");
    await expect(page).toHaveURL(/\/bookings$/);
    await expect(page.getByRole("heading", { name: "My bookings.", exact: true })).toBeVisible();

    await show(0, "/admin/access");
    await page.getByRole("combobox", { name: "Availability resource", exact: true }).selectOption(resource("S03").id);
    await page.getByRole("combobox", { name: "New booking availability", exact: true }).selectOption("no");
    await page.getByLabel("Availability change reason", { exact: true }).fill(closureReason);
    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByRole("button", { name: "Save resource availability", exact: true }).click();
    await expect.poll(() => sql(`select active from public.resources where id='${resource("S03").id}'`)).toBe("f");
    await page.getByRole("combobox", { name: "Lab location", exact: true }).selectOption(resource("S01").location_id);
    await page.getByLabel("Closed date", { exact: true }).fill(date);
    await page.getByLabel("Closure reason", { exact: true }).fill(closureReason);
    await page.getByRole("button", { name: "Add closure", exact: true }).click();
    await expect(page.locator("li").filter({ hasText: closureReason })).toBeVisible();
    await show(1, "/passes"); await chooseDay();
    await expect(chair("S03")).toBeDisabled();
    await expect(chair("S04")).toBeDisabled();
    await expect(page.getByText(closureReason, { exact: false }).first()).toBeVisible();
    const removed = await clients[0].rpc("set_booking_closure", { p_location_id: resource("S01").location_id, p_closed_on: date, p_reason: closureReason, p_closed: false });
    expect(removed.error).toBeNull();

    await page.getByRole("combobox", { name: "Access product", exact: true }).selectOption(cabinProduct);
    await page.getByLabel("First day of the month", { exact: true }).fill(monthStart);
    await page.getByRole("button", { name: "Check chair availability", exact: true }).click();
    await chair("C01").click();
    await page.getByRole("combobox", { name: "Booking account", exact: true }).selectOption(org);
    await page.getByRole("button", { name: "Review reservation", exact: true }).click();
    await page.getByRole("checkbox", { name: "I confirm these dates and this chair or whole cabin.", exact: true }).check();
    await expect(page.locator(".viewer-cabin[data-cabin=C01]")).toBeVisible();
    await page.screenshot({ path: `/private/tmp/inventory-cabin-${testInfo.project.name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Confirm reservation", exact: true }).click();
    await expect.poll(() => sql(`select count(*) from public.bookings where organization_id='${org}' and resource_id='${resource("C01").id}' and status='confirmed'`)).toBe("31");
    expect(sql(`select count(distinct resource_id) from public.bookings where organization_id='${org}'`)).toBe("1");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page).toHaveURL(/\/bookings$/);
    expect(errors).toEqual([]);
  } finally {
    const ids = users.map((id) => `'${id}'`).join(",") || "null";
    sql(`begin;
      update public.booking_policy_settings set mock_grants_enabled=${savedGate};
      ${savedProducts.map(p => `update public.booking_products set enabled=${p.enabled} where id='${p.id}';`).join("\n")}
      delete from public.booking_closures where reason='${closureReason}';
      ${resources.map((r) => `update public.resources set active=${r.active} where id='${r.id}';`).join("\n")}
      delete from public.workspace_pass_allocations where member_id in (${ids});
      delete from public.bookings where member_id in (${ids});
      delete from public.paid_access_entitlements where granted_by in (${ids});
      delete from public.organizations where id='${org}';
      delete from public.basic_onboarding_applications where user_id in (${ids});
      set local session_replication_role=replica;
      delete from public.audit_events where actor_user_id in (${ids});
      set local session_replication_role=origin;
      commit;`);
    for (const id of users.reverse()) expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
