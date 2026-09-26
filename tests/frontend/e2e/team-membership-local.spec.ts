import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

const url = process.env.ARMATURE_LOCAL_SUPABASE_URL ?? "";
const anonKey = process.env.ARMATURE_LOCAL_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.ARMATURE_LOCAL_SUPABASE_SERVICE_KEY ?? "";
const dbUrl = process.env.ARMATURE_LOCAL_SUPABASE_DB_URL ?? "";

test.skip(process.env.ARMATURE_LOCAL_TEAM_E2E !== "1", "Run only against an explicit local Supabase instance.");

test("an invited builder books with a team seat and appears only in team usage", async ({ page }) => {
  expect(new URL(url).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(anonKey).toBeTruthy();
  expect(serviceKey).toBeTruthy();
  expect(new URL(dbUrl).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/);
  expect(new URL(dbUrl).port).toBe("54322");

  function localSql(sql: string) {
    execFileSync("psql", ["--dbname", dbUrl, "--no-psqlrc", "--set", "ON_ERROR_STOP=1"], { input: sql, stdio: ["pipe", "ignore", "pipe"] });
  }
  function localValue(sql: string) {
    return execFileSync("psql", ["--dbname", dbUrl, "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--tuples-only", "--no-align"], { input: sql, encoding: "utf8" }).trim();
  }

  const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID().slice(0, 8);
  const password = `Local-only-${randomUUID()}`;
  const people = [
    { email: `team-staff-${suffix}@example.test`, name: "Local Staff" },
    { email: `team-admin-${suffix}@example.test`, name: "Local Admin" },
    { email: `team-builder-${suffix}@example.test`, name: "Local Builder" }
  ];
  const ids: string[] = [];

  async function signedIn(email: string) {
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    expect(error).toBeNull();
    expect(data.session).toBeTruthy();
    return { client, session: data.session as Session };
  }

  async function showAs(session: Session, route: string) {
    await page.goto("/");
    await page.evaluate((value) => localStorage.setItem("sb-127-auth-token", JSON.stringify(value)), session);
    await page.goto(route);
  }

  try {
    for (const person of people) {
      const { data, error } = await service.auth.admin.createUser({
        email: person.email, password, email_confirm: true,
        user_metadata: { full_name: person.name }
      });
      expect(error).toBeNull();
      ids.push(data.user!.id);
    }
    localSql(`insert into public.staff_roles(user_id,role) values ('${ids[0]}','admin');`);

    const staff = await signedIn(people[0].email);
    const admin = await signedIn(people[1].email);
    const builder = await signedIn(people[2].email);
    const teamName = `Local Robotics ${suffix}`;
    const { data: applicationId, error: applyError } = await admin.client.rpc("submit_team_application", {
      p_organization_name: teamName, p_contact_name: people[1].name,
      p_summary: "Synthetic local team", p_requested_seats: 1
    });
    expect(applyError).toBeNull();
    const start = new Date(Date.now() - 86_400_000).toISOString();
    const end = new Date(Date.now() + 30 * 86_400_000).toISOString();
    const { data: organizationId, error: decideError } = await staff.client.rpc("staff_decide_team_application", {
      p_application_id: applicationId!, p_approve: true, p_notes: "Local test",
      p_starts_at: start, p_ends_at: end
    });
    expect(decideError).toBeNull();
    const { error: activateError } = await staff.client.rpc("staff_set_team_membership", {
      p_organization_id: organizationId!, p_status: "active", p_seat_allowance: 1,
      p_starts_at: start, p_ends_at: end
    });
    expect(activateError).toBeNull();

    await showAs(admin.session, "/workspace/team");
    await expect(page.getByRole("heading", { name: teamName })).toBeVisible();
    await expect(page.getByText("0 active seats and 0 pending invitations of 1 named seats.")).toBeVisible();
    await page.getByRole("textbox", { name: "Builder email" }).fill(people[2].email);
    await page.getByRole("button", { name: "Create invitation link" }).click();
    const link = await page.getByRole("textbox", { name: "New invitation link" }).inputValue();
    expect(new URL(link).pathname).toMatch(/^\/workspace\/team\/accept\/[0-9a-f]+$/);
    await expect(page.getByText("0 active seats and 1 pending invitations of 1 named seats.")).toBeVisible();

    await showAs(builder.session, new URL(link).pathname);
    await page.getByRole("button", { name: "Accept invitation" }).click();
    await expect(page).toHaveURL(/\/workspace\/team$/);
    await expect(page.getByText("Your team membership and booking access.")).toBeVisible();
    await expect(page.getByText("Enabled", { exact: true })).toBeVisible();

    const certificationId = localValue("select id from public.certification_types where slug='lab-orientation';");
    expect(certificationId).toBeTruthy();
    localSql(`insert into public.member_certifications(member_id,certification_type_id,issued_by,issued_at) values ('${ids[2]}','${certificationId}','${ids[0]}',now());`);
    const resourceId = localValue("select id from public.resources where slug='builder-pod-01';");
    expect(resourceId).toBeTruthy();
    const from = new Date(Date.now() + 86_400_000);
    from.setUTCMinutes(Math.ceil(from.getUTCMinutes() / 15) * 15, 0, 0);
    const to = new Date(from.getTime() + 7 * 86_400_000);
    const { data: slots, error: slotsError } = await builder.client.rpc("list_availability", {
      p_resource_id: resourceId, p_from: from.toISOString(), p_to: to.toISOString(), p_duration_minutes: 60
    });
    expect(slotsError).toBeNull();
    const open = slots?.find((slot: { available: boolean; starts_at: string }) => slot.available && new Date(slot.starts_at).getMinutes() === 0);
    expect(open).toBeTruthy();

    await page.goto("/book/builder-pod-01");
    await expect(page.getByRole("combobox", { name: "Membership used for this booking" })).toHaveValue(organizationId!);
    const localStart = await page.evaluate((iso) => {
      const date = new Date(iso);
      return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    }, open!.starts_at);
    await page.getByRole("textbox", { name: "Start time" }).fill(localStart);
    await page.getByRole("textbox", { name: "Purpose of session" }).fill("Local team booking");
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]+$/);

    const booking = JSON.parse(localValue(`select row_to_json(row) from (select id,access_source,organization_id,status from public.bookings where member_id='${ids[2]}') row;`));
    expect(booking).toMatchObject({ access_source: "team", organization_id: organizationId, status: "confirmed" });

    await showAs(admin.session, "/workspace/team");
    await expect(page.getByRole("row", { name: /Local Builder.*Builder pod 01/ })).toBeVisible();
    page.on("dialog", (dialog) => void dialog.accept());
    await page.getByRole("row", { name: /Local Builder.*member.*Enabled/ }).getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("0 active seats and 0 pending invitations of 1 named seats.")).toBeVisible();
    expect(localValue(`select status from public.bookings where id='${booking.id}';`)).toBe("cancelled");
    const { data: access } = await builder.client.rpc("list_my_team_access");
    expect(access).toHaveLength(0);
  } finally {
    for (const id of ids.reverse()) await service.auth.admin.deleteUser(id);
  }
});
