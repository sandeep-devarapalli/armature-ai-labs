import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

test.skip(!process.env.ONBOARDING_LOCAL_SERVICE_KEY, "Requires the isolated synthetic onboarding stack.");
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function login(page: Page, email: string, password: string) {
  await page.goto('/onboarding-local');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
async function upload(page: Page) {
  for (const kind of ['photo', 'government ID']) {
    await page.getByLabel(`Synthetic ${kind} image`, { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: `Upload ${kind}`, exact: true }).click();
    await expect(page.getByText('Synthetic image uploaded privately.', { exact: true })).toBeVisible();
  }
}

for (const ageGroup of ['adult', 'minor']) test(`${ageGroup}: authenticated correction, resubmission and approval`, async ({ page, browser, baseURL }, info) => {
  test.setTimeout(90_000);
  expect(baseURL).toBe('http://127.0.0.1:4341');
  const service = createClient('http://127.0.0.1:55421', process.env.ONBOARDING_LOCAL_SERVICE_KEY!, { auth: { persistSession: false } });
  const users: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const staffContext = await browser.newContext({ viewport: page.viewportSize()! });
  const staffPage = await staffContext.newPage();
  staffPage.on('pageerror', error => errors.push(error.message));
  const actor = async (role: string) => {
    const email = `${role}-${randomUUID()}@example.test`; const password = `Local-${randomUUID()}!`;
    const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(error).toBeNull(); users.push(data.user!.id);
    return { id: data.user!.id, email, password };
  };
  try {
    const member = await actor('member'); const reviewer = await actor('reviewer');
    expect(reviewer.id).toMatch(/^[0-9a-f-]{36}$/);
    execFileSync('docker', ['exec', 'supabase_db_armature-onboarding-local', 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `insert into public.staff_roles(user_id,role) values('${reviewer.id}','admin')`], { stdio: 'pipe' });
    expect((await service.from('onboarding_settings').update({ enabled: true }).eq('singleton', true)).error).toBeNull();
    await login(page, member.email, member.password);
    await expect(page).toHaveTitle('Local onboarding review | Armature AI Labs');
    await page.getByLabel('Full name', { exact: true }).fill('Synthetic Local Member');
    await page.getByLabel('Phone number', { exact: true }).fill('+919999000000');
    await page.getByLabel('Your LinkedIn profile', { exact: true }).fill('https://linkedin.com/in/synthetic-local-member');
    await page.getByLabel('Date of birth', { exact: true }).fill(ageGroup === 'minor' ? new Date(new Date().setFullYear(new Date().getFullYear() - 17)).toISOString().slice(0,10) : '2000-01-01');
    await page.getByRole('button', { name: 'Submit registration', exact: true }).click();
    await expect(page.getByText('Registration saved. Upload both synthetic images before staff review.', { exact: true })).toBeVisible();
    await upload(page);
    const oldDocs = (await service.from('onboarding_documents').select('id,expires_at').eq('user_id', member.id)).data!;
    await login(staffPage, reviewer.email, reviewer.password);
    await staffPage.getByLabel('Application to review').selectOption(member.id);
    await staffPage.getByRole('button', { name: 'View government ID', exact: true }).click();
    await expect(staffPage.getByAltText('Private synthetic verification document')).toBeVisible();
    await staffPage.getByRole('button', { name: 'Close image', exact: true }).click();
    await staffPage.getByLabel('Correction instructions').fill('Please replace both test images and correct the name.');
    await staffPage.getByRole('button', { name: 'Request corrections', exact: true }).click();
    await expect.poll(async () => (await service.from('basic_onboarding_applications').select('status').eq('user_id', member.id).single()).data?.status).toBe('corrections_requested');
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.getByText('Please replace both test images and correct the name.', { exact: true })).toBeVisible();
    await page.getByLabel('Full name', { exact: true }).fill('Corrected Synthetic Member');
    await page.getByRole('button', { name: 'Resubmit corrections', exact: true }).click();
    await expect(page.getByText('Registration saved. Upload both synthetic images before staff review.', { exact: true })).toBeVisible();
    await upload(page);
    await staffPage.getByRole('button', { name: 'Refresh status', exact: true }).click();
    if (ageGroup === 'minor') {
      await staffPage.getByLabel('Guardian email', { exact: true }).fill('guardian@example.test');
      await staffPage.getByLabel('Guardian email reference', { exact: true }).fill('synthetic-permission-message-001');
      await staffPage.getByLabel('Guardian email received at', { exact: true }).fill(new Date(Date.now() - 86400000).toISOString().slice(0,16));
    }
    await staffPage.getByRole('button', { name: 'Approve registration', exact: true }).click();
    await expect.poll(async () => (await service.from('basic_onboarding_applications').select('status').eq('user_id', member.id).single()).data?.status).toBe('approved');
    await page.getByRole('button', { name: 'Refresh status', exact: true }).click();
    await expect(page.locator('.ol-status')).toContainText('approved');
    const expired = (await service.from('onboarding_documents').select('expires_at').in('id', oldDocs.map(d => d.id))).data!;
    expect(expired.every(d => Date.parse(d.expires_at) <= Date.now())).toBe(true);
    for (const theme of ['light', 'dark', 'sepia']) {
      await page.getByRole('button', { name: `${theme} theme`, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    if (await page.getByRole('button', { name: 'Dismiss update notice' }).isVisible()) await page.getByRole('button', { name: 'Dismiss update notice' }).click();
    if (await staffPage.getByRole('button', { name: 'Dismiss update notice' }).isVisible()) await staffPage.getByRole('button', { name: 'Dismiss update notice' }).click();
    await page.screenshot({ path: `/private/tmp/armature-onboarding-${info.project.name}.png`, fullPage: true });
    await staffPage.screenshot({ path: `/private/tmp/armature-onboarding-staff-${info.project.name}.png`, fullPage: true });
    await page.locator('.ol-grid').screenshot({ path: `/private/tmp/armature-onboarding-panel-${info.project.name}.png` });
    expect(errors).toEqual([]);
  } finally {
    await staffContext.close();
    const docs = (await service.from('onboarding_documents').select('object_path').in('user_id', users)).data ?? [];
    if (docs.length) await service.storage.from('onboarding-documents').remove(docs.map(d => d.object_path));
    for (const table of ['onboarding_resubmissions', 'onboarding_reviews', 'onboarding_documents', 'basic_onboarding_applications']) {
      expect((await service.from(table).delete().in('user_id', users)).error).toBeNull();
    }
    for (const id of users.reverse()) await service.auth.admin.deleteUser(id);
    await service.from('onboarding_settings').update({ enabled: false }).eq('singleton', true);
  }
});
