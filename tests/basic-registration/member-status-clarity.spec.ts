import { test, expect } from "@playwright/test";
import { backendOrigin, authStorageKey } from "./backend-fixture";
test("current tiers and optional verification progress remain distinct", async ({ page }, info) => {
 const user = { id: "10000000-0000-4000-8000-000000000001", email: "reviewer@example.test", aud: "authenticated", role: "authenticated", email_confirmed_at: "2026-09-01", app_metadata: {}, user_metadata: {}, created_at: "2026-09-01" };
 const rows = [
  { name: "Basic Starter", membership_level: "basic", application_status: null, status: "incomplete", verification: { email: true, mobile: false, identity: false } },
  { name: "Basic Identity Approved", membership_level: "basic", application_status: "approved", status: "approved", verification: { email: true, mobile: false, identity: true } },
  { name: "Verified Builder", membership_level: "verified", application_status: "approved", status: "approved", verification: { email: true, mobile: true, identity: true } },
  { name: "Premium Builder", membership_level: "premium", application_status: "approved", status: "approved", verification: { email: true, mobile: true, identity: true } },
  { name: "Restricted Account", membership_level: null, application_status: "approved", status: "approved", verification: { email: true, mobile: true, identity: true } },
 ].map((row,i)=>({...row,user_id:`20000000-0000-4000-8000-00000000000${i}`,email:`synthetic${i}@example.test`,role:"member",registered_at:"2026-10-20",reviewed_at:null,revision:1,photo_available:false,id_available:false}));
 await page.addInitScript(({user,key})=>{localStorage.setItem(key,JSON.stringify({access_token:"synthetic",refresh_token:"synthetic",expires_at:Math.floor(Date.now()/1000)+36000,token_type:"bearer",user}));localStorage.setItem("armature-theme","dark")},{user,key:authStorageKey});
 await page.route(`${backendOrigin}/**`,async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);if(name==='member-avatar'){await route.fulfill({status:404,contentType:'application/json',body:'{}'});return;}const data=name==='get_basic_account_summary'?{role:'admin',name:'Synthetic Reviewer',membership_levels_enabled:true,membership_level:'basic'}:name==='list_basic_members'?{items:rows,total:rows.length,counts:{incomplete:1,approved:4}}:name==='user'?user:[];await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});});
 await page.goto('/admin/members');
 await expect(page.getByText('Basic · Active',{exact:true})).toHaveCount(2);
 await expect(page.getByText('Verified · Active',{exact:true})).toBeVisible();
 await expect(page.getByText('Premium · Active',{exact:true})).toBeVisible();
 await expect(page.getByText('Access restricted',{exact:true})).toBeVisible();
 await expect(page.getByText('Verification not started',{exact:true})).toBeVisible();
 await expect(page.getByText('Registration incomplete',{exact:true})).toHaveCount(0);
 await expect(page.getByText('missing / expired',{exact:false})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('member-status-clarity.png'),fullPage:true});
 await page.getByRole('button',{name:'View Basic Starter',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Basic Starter',exact:true})).toBeFocused();
 await expect(page.getByText(/Original documents expire under the retention policy/)).toBeVisible();
});
