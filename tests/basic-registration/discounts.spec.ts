import { expect, test, type Page } from '@playwright/test';
import { backendOrigin, authStorageKey } from './backend-fixture';
async function fixture(page: Page, role = 'admin') {
 const user = { id: '10000000-0000-4000-8000-000000000001', aud: 'authenticated', role: 'authenticated', email: 'admin@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
 const calls: string[] = [];
 const offer = { id: 'offer', revision: 1, name: 'Synthetic October offer', description: 'A synthetic offer for local review only.', audience: 'public', member_id: null, code: null, value_kind: 'percent', value: 10, categories: ['coworking'], starts_at: '2030-10-01T03:30:00Z', ends_at: '2030-10-08T03:30:00Z', state: 'paused', personal_use: 'once', total_limit: null, per_member_limit: null, stack_with_launch: false };
 await page.addInitScript(({ user, storageKey }) => localStorage.setItem(storageKey, JSON.stringify({ access_token: 'synthetic-token', refresh_token: 'synthetic-refresh', expires_at: Math.floor(Date.now() / 1000) + 36000, expires_in: 36000, token_type: 'bearer', user })), { user, storageKey: authStorageKey });
 await page.route(`${backendOrigin}/**`, async route => {
  const name = new URL(route.request().url()).pathname.split('/').at(-1)!; calls.push(name); const body = route.request().postDataJSON();
  let data: unknown = [];
  if (name === 'get_basic_account_summary') data = { user_id: user.id, name: 'Synthetic Admin', email: user.email, status: 'approved', role };
  if (name === 'user') data = user;
  if (name === 'admin_discount_offers') data = [offer];
  if (name === 'admin_discount_member') data = { id: 'member', name: 'Synthetic Member', email: 'member@example.test' };
  if (name === 'list_basic_members') data = { items: [{ user_id: 'member', name: 'Synthetic Member', email: 'member@example.test' }] };
  if (name === 'save_discount_offer') data = { ...body.p_offer, id: 'offer', revision: 2 };
  if (name === 'member-avatar') { await route.fulfill({ status: 404, contentType: 'application/json', body: '{}' }); return calls; }
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
 }); return calls;
}
for (const theme of ['light', 'dark', 'sepia']) test(`personal discount review in ${theme}`, async ({ page }, info) => {
 const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
 const calls = await fixture(page); await page.goto('/admin/discounts');
 await page.getByRole('button', { name: `${theme} theme`, exact: true }).click();
 await page.getByRole('button', { name: 'Edit Synthetic October offer' }).click();
 await page.getByRole('combobox', { name: 'Audience', exact: true }).selectOption('personal');
 await expect(page.getByLabel('Personal offer usage')).toHaveValue('once');
 await page.getByLabel('Find member by name or email').fill('member');
 await expect(page.getByLabel('Selected member').locator('option')).toHaveCount(2);
 await page.getByLabel('Selected member').selectOption('member');
 await page.getByLabel('Personal offer usage').selectOption('repeat_until_expiry');
 await page.getByRole('button', { name: 'Review discount', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'Confirm Synthetic October offer' })).toBeFocused();
 await expect(page.getByRole('heading', { name: 'Confirm Synthetic October offer' })).toBeInViewport();
 await expect(page.getByRole('region', { name: 'Review discount' })).toContainText('member@example.test');
 expect(calls).not.toContain('save_discount_offer');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: info.outputPath('discount-review.png') });
 await page.getByRole('button', { name: 'Confirm and save' }).click();
 await expect(page.getByText('Discount saved and audited. No booking or payment was created.')).toBeVisible();
 expect(calls).toContain('save_discount_offer'); expect(errors).toEqual([]);
});
test('review Staff cannot access discount administration', async ({ page }) => {
 const calls = await fixture(page, 'membership_reviewer'); await page.goto('/admin/discounts');
 await expect(page.getByRole('heading', { name: 'Admin access required' })).toBeVisible();
 expect(calls).not.toContain('admin_discount_offers');
});
