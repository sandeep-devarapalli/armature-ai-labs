import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

test.skip(process.env.ARMATURE_LOCAL_WISHLIST_E2E !== "1", "Explicit synthetic local wishlist backend only.");
test("members submit and withdraw votes while admins publish and merge duplicates", async ({ page }, info) => {
  const url = process.env.ARMATURE_LOCAL_SUPABASE_URL!, db = process.env.ARMATURE_LOCAL_SUPABASE_DB_URL!;
  expect(new URL(url).origin).toBe("http://127.0.0.1:58321"); expect(new URL(db).hostname).toBe("127.0.0.1"); expect(new URL(db).port).toBe("58322");
  const sql = (query: string) => execFileSync("psql", [db, "-XAt", "-v", "ON_ERROR_STOP=1"], { input: query, encoding: "utf8" }).trim();
  const service = createClient(url, process.env.ARMATURE_LOCAL_SUPABASE_SERVICE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const suffix = randomUUID().slice(0, 8), password = `Synthetic-${randomUUID()}`;
  const ids: string[] = [], sessions: Session[] = [], errors: string[] = [];
  const names = [`Precision gripper ${suffix}`, `Duplicate gripper ${suffix}`];
  page.on("pageerror", error => errors.push(error.message));
  async function show(index: number, path: string) { await page.goto("/robots.txt"); await page.evaluate(session => localStorage.setItem("sb-127-auth-token", JSON.stringify(session)), sessions[index]); await page.goto(path); }
  const article = (name: string) => page.locator("article:not(.wishlist-own)").filter({ has: page.getByRole("heading", { name, exact: true }) });
  try {
    for (const role of ["member", "admin", "membership_reviewer"]) {
      const email = `wishlist-${role}-${suffix}@example.test`;
      const user = await service.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Wishlist ${role}` } }); expect(user.error).toBeNull(); ids.push(user.data.user!.id);
      const client = createClient(url, process.env.ARMATURE_LOCAL_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
      const signed = await client.auth.signInWithPassword({ email, password }); expect(signed.error).toBeNull(); sessions.push(signed.data.session!);
    }
    sql(`insert into public.staff_roles(user_id,role) values ('${ids[1]}','admin'),('${ids[2]}','membership_reviewer');
      insert into public.basic_onboarding_applications(user_id,full_name,email,phone,linkedin_url,date_of_birth,status) select id,raw_user_meta_data->>'full_name',email,'9999999999','https://linkedin.com/in/synthetic','1990-01-01','approved' from auth.users where id in (${ids.map(id => `'${id}'`).join(",")});`);
    await show(0, "/components/wishlist");
    for (const name of names) {
      await page.getByLabel("Equipment name", { exact: true }).fill(name);
      await page.getByRole("textbox", { name: /What would you build/ }).fill("Evaluate repeatable grasping of laboratory objects.");
      await page.getByRole("button", { name: "Submit for review", exact: true }).click();
      await expect(page.locator(".wishlist-own").filter({ hasText: name })).toContainText("Awaiting admin review");
    }
    expect(sql(`select count(*) from public.public_equipment_wishlist where component_name in ('${names[0]}','${names[1]}')`)).toBe("0");
    await show(1, "/admin/equipment-wishlist");
    for (const name of names) {
      await article(name).getByRole("checkbox", { name: `Publish ${name}`, exact: true }).check();
      await article(name).getByRole("textbox", { name: new RegExp(`Review note for ${name}`) }).fill("Relevant shared robotics equipment request.");
      await article(name).getByRole("button", { name: "Save review", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Review saved." })).toBeVisible();
      await expect(article(name).getByRole("button", { name: "Save review" })).toBeEnabled();
    }
    await article(names[0]).getByText("Edit request details", { exact: true }).click();
    await article(names[0]).getByLabel(`Model for ${names[0]}`, { exact: true }).fill("Synthetic model A");
    await article(names[0]).getByRole("button", { name: "Save request details" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Request details updated." })).toBeVisible();
    await show(0, "/components/wishlist");
    await expect(article(names[0])).toContainText("Synthetic model A");
    for (const name of names) { await article(name).getByRole("button", { name: "Support request" }).click(); await expect(article(name).getByText("1 vote", { exact: true })).toBeVisible(); }
    await article(names[0]).getByRole("button", { name: "Withdraw vote" }).click(); await expect(article(names[0]).getByText("0 votes", { exact: true })).toBeVisible();
    await article(names[0]).getByRole("button", { name: "Support request" }).click(); await expect(article(names[0]).getByText("1 vote", { exact: true })).toBeVisible();
    for (const theme of ["light", "dark", "sepia"]) { await page.getByRole("button", { name: `${theme} theme`, exact: true }).click(); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); await article(names[0]).screenshot({ path: info.outputPath(`wishlist-${theme}.png`) }); }
    await show(1, "/admin/equipment-wishlist");
    await page.getByRole("searchbox", { name: /Find a published merge target/ }).fill(names[0]);
    await article(names[1]).getByText("Merge duplicate", { exact: true }).click();
    const target = sql(`select id from public.component_requests where requester_user_id='${ids[0]}' and component_name='${names[0]}'`);
    await article(names[1]).getByRole("combobox", { name: `Merge ${names[1]} into`, exact: true }).selectOption(target);
    await article(names[1]).getByRole("textbox", { name: `Merge reason for ${names[1]}`, exact: true }).fill("Same equipment and use case.");
    page.once("dialog", dialog => void dialog.accept());
    await article(names[1]).getByRole("button", { name: "Review merge" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Requests merged." })).toBeVisible();
    expect(sql(`select vote_count from public.public_equipment_wishlist where id='${target}'`)).toBe("1");
    expect(sql(`select count(*) from public.public_equipment_wishlist where component_name='${names[1]}'`)).toBe("0");
    const source = sql(`select id from public.component_requests where requester_user_id='${ids[0]}' and component_name='${names[1]}'`);
    await show(0, `/components/wishlist?request=${source}`);
    await expect(page).toHaveURL(new RegExp(`request=${target}$`));
    await expect(article(names[0])).toBeVisible();
    await show(2, "/admin/equipment-wishlist"); await expect(page.getByRole("heading", { name: "Admin access required.", exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    const users = ids.map(id => `'${id}'`).join(",") || "null";
    sql(`begin; delete from public.component_requests where requester_user_id in (${users}); delete from public.basic_onboarding_applications where user_id in (${users}); set local session_replication_role=replica; delete from public.audit_events where actor_user_id in (${users}); set local session_replication_role=origin; commit;`);
    for (const id of ids.reverse()) expect((await service.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
