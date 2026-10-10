import { webcrypto } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { phoneNumber, phoneStatus, phoneHookPayload, sendPhoneCode, verifyPhoneHook } from "../../supabase/functions/_shared/member-phone";
const mocks = vi.hoisted(() => { const env: Record<string,string> = {}; Object.assign(globalThis,{Deno:{env:{get:(k:string)=>env[k]}}}); return {env,rpc:vi.fn(),user:vi.fn()}; });
vi.mock("../../supabase/functions/_shared/supabase.ts", () => ({adminClient: () => ({rpc: mocks.rpc}), authenticatedUser: (...args: unknown[]) => mocks.user(...args), bearerToken: () => "synthetic-token"}));
import { handlePhoneVerification } from "../../supabase/functions/member-phone-verification/index";
import { handlePhoneDelivery } from "../../supabase/functions/member-phone-delivery/index";
const id = "10000000-0000-4000-8000-000000000001";
const phone = "+919000000001";
const secret = btoa("synthetic-hook-key-at-least-32-bytes");
const config = {key:"synthetic-key",number:"919000000000",template:"synthetic_template",namespace:"synthetic_namespace",language:"en",smsTemplate:"synthetic_sms",smsVariable:"OTP"};
const request = (body: unknown) => new Request("https://api.example.test/functions/v1/member-phone-verification", {method:"POST",body:JSON.stringify(body)});
async function signed(raw: string, timestamp = Math.floor(Date.now()/1000)) {
 const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(atob(secret)),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature = await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(`synthetic-hook.${timestamp}.${raw}`));
 return new Headers({"webhook-id":"synthetic-hook","webhook-timestamp":String(timestamp),"webhook-signature":`v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`});
}
beforeEach(() => {
 vi.stubGlobal("crypto",webcrypto); vi.stubGlobal("Deno",{env:{get:(k:string)=>mocks.env[k]}});
 Object.keys(mocks.env).forEach(k=>delete mocks.env[k]);
 Object.assign(mocks.env,{SUPABASE_URL:"https://api.example.test",SUPABASE_ANON_KEY:"synthetic",MEMBER_PHONE_HOOK_SECRET:`v1,whsec_${secret}`});
 mocks.user.mockReset().mockResolvedValue({id}); mocks.rpc.mockReset().mockResolvedValue({data:{id,phone,channel:"sms",verified:false},error:null});
 vi.stubGlobal("fetch",vi.fn());
});
afterEach(()=>vi.unstubAllGlobals());
it("validates E164 and exposes only a masked status",()=>{
 expect(phoneNumber(phone)).toBe(phone);
 for(const invalid of [null,"9000000001","+91abc","+123"]) expect(()=>phoneNumber(invalid)).toThrow();
 expect(phoneStatus({phone,verified:true},false)).toEqual({enabled:false,available_channels:[],verified:true,masked_phone:"•••• 0001",channel:null,expires_at:null,resend_available_at:null});
});
it("authenticates raw hook bytes, timestamp, signature and secret",async()=>{
 const raw='{"synthetic":true}', headers=await signed(raw);
 await expect(verifyPhoneHook(raw,headers,`v1,whsec_${secret}`)).resolves.toBe("synthetic-hook");
 await expect(verifyPhoneHook(raw+" ",headers,secret)).rejects.toThrow();
 await expect(verifyPhoneHook(raw,await signed(raw,1),secret)).rejects.toThrow();
 headers.set("webhook-signature","v1,garbage"); await expect(verifyPhoneHook(raw,headers,secret)).rejects.toThrow();
});
it("uses only the hook's actual pending target, never current phone or client metadata",()=>{
 const user={id,email:"member@example.test",email_confirmed_at:"2026-10-10",phone:"919000000099",new_phone:phone};
 expect(phoneHookPayload({user,sms:{otp:"123456"}}).phone).toBe(phone);
 expect(()=>phoneHookPayload({user:{...user,new_phone:undefined},sms:{otp:"123456"}})).toThrow();
 expect(()=>phoneHookPayload({user:{...user,email_confirmed_at:undefined},sms:{otp:"123456"}})).toThrow();
 expect(()=>phoneHookPayload({user,sms:{otp:123456}})).toThrow();
});
it("sends the Supabase code through exact MSG91 template endpoints without retries",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('{"request_id":"accepted-request-1"}')).mockResolvedValueOnce(new Response('{"type":"success","message":"accepted-request-2"}'));
 await sendPhoneCode("whatsapp",phone,"123456",config,fetcher); await sendPhoneCode("sms",phone,"654321",config,fetcher);
 expect(fetcher.mock.calls[0][0]).toBe("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/");
 expect(JSON.parse(fetcher.mock.calls[0][1].body).payload.template.to_and_components[0]).toEqual({to:[phone.slice(1)],components:{body_1:{type:"text",value:"123456"},button_1:{subtype:"url",type:"text",value:"123456"}}});
 expect(JSON.parse(fetcher.mock.calls[1][1].body).recipients).toEqual([{mobiles:phone.slice(1),OTP:"654321"}]);
 expect(fetcher.mock.calls[0][1].redirect).toBe("error");
});
it.each(['{}','{"type":"error","message":"sensitive failure"}','not json'])('fails closed on malformed provider acceptance %s',async raw=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(raw));
 await expect(sendPhoneCode("sms",phone,"123456",config,fetcher)).rejects.toThrow("delivery_unavailable"); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("keeps delivery off by default and permits status",async()=>{
 expect((await handlePhoneVerification(request({action:"status"}))).status).toBe(200);
 expect((await handlePhoneVerification(request({action:"start",phone,channel:"whatsapp"}))).status).toBe(503);
 expect(fetch).not.toHaveBeenCalled();
});
it("uses existing account phone_change OTP and refuses an account-switched verify result",async()=>{
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true";
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({user:{id:"different"}})));
 const response=await handlePhoneVerification(request({action:"verify",code:"123456"}));
 expect(response.status).toBe(409); expect(mocks.rpc).toHaveBeenCalledTimes(1);
 expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({phone,token:"123456",type:"phone_change"});
});
it("enforces server rate limits before sending or verifying",async()=>{
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true"; mocks.rpc.mockResolvedValue({data:{error:"rate_limited"},error:null});
 expect((await handlePhoneVerification(request({action:"start",phone,channel:"sms"}))).status).toBe(429);
 expect(fetch).not.toHaveBeenCalled();
});
it("rejects a validly signed callback with no matching intent before provider delivery",async()=>{
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true";
 const raw=JSON.stringify({user:{id,email:"member@example.test",email_confirmed_at:"2026-10-10",new_phone:phone},sms:{otp:"123456"}});
 mocks.rpc.mockResolvedValue({data:{error:"verification_changed"},error:null});
 const response=await handlePhoneDelivery(new Request("https://api.example.test/hook",{method:"POST",body:raw,headers:await signed(raw)}));
 expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
 expect(await response.text()).not.toMatch(/123456|9000000001/);
});

it("advertises SMS only by default and WhatsApp only with its separate gate",async()=>{
 expect(await (await handlePhoneVerification(request({action:"status"}))).json()).toMatchObject({enabled:false,available_channels:[]});
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true";
 expect(await (await handlePhoneVerification(request({action:"status"}))).json()).toMatchObject({enabled:true,available_channels:["sms"]});
 mocks.env.MEMBER_PHONE_WHATSAPP_ENABLED="true";
 expect(await (await handlePhoneVerification(request({action:"status"}))).json()).toMatchObject({available_channels:["sms","whatsapp"]});
});
it("rejects disabled WhatsApp starts before creating an intent or sending",async()=>{
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true";
 const response=await handlePhoneVerification(request({action:"start",phone,channel:"whatsapp"}));
 expect(response.status).toBe(400);
 expect(await response.json()).toMatchObject({code:"channel_unavailable"});
 expect(mocks.rpc).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("does not verify an old WhatsApp intent after its channel is disabled",async()=>{
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true";
 mocks.rpc.mockResolvedValue({data:{id,phone,channel:"whatsapp"},error:null});
 const response=await handlePhoneVerification(request({action:"verify",code:"123456"}));
 expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
 expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("starts account-bound SMS without WhatsApp configuration",async()=>{
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true";
 mocks.rpc.mockResolvedValue({data:{id,phone,channel:"sms",delivered:true},error:null});
 vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({id})));
 const response=await handlePhoneVerification(request({action:"start",phone,channel:"sms"}));
 expect(response.status).toBe(200);
 expect(await response.json()).toMatchObject({available_channels:["sms"],channel:"sms"});
 expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toEqual({phone,channel:"sms"});
});
it("delivers signed SMS hooks with only SMS credentials",async()=>{
 Object.assign(mocks.env,{MEMBER_PHONE_VERIFICATION_ENABLED:"true",MSG91_AUTH_KEY:"synthetic",MSG91_SMS_TEMPLATE:"synthetic_sms",MSG91_SMS_OTP_VARIABLE:"OTP"});
 const raw=JSON.stringify({user:{id,email:"member@example.test",email_confirmed_at:"2026-10-10",new_phone:phone},sms:{otp:"123456"}});
 vi.mocked(fetch).mockResolvedValue(new Response('{"type":"success","message":"accepted-request-2"}'));
 const response=await handlePhoneDelivery(new Request("https://api.example.test/hook",{method:"POST",body:raw,headers:await signed(raw)}));
 expect(response.status).toBe(200); expect(fetch).toHaveBeenCalledTimes(1);
 expect(vi.mocked(fetch).mock.calls[0][0]).toBe("https://control.msg91.com/api/v5/flow");
 expect(mocks.rpc).toHaveBeenLastCalledWith("member_phone_operation",expect.objectContaining({p_action:"sent"}));
});
it("rejects a signed WhatsApp hook when WhatsApp is disabled",async()=>{
 mocks.env.MEMBER_PHONE_VERIFICATION_ENABLED="true";
 mocks.rpc.mockResolvedValue({data:{id,phone,channel:"whatsapp"},error:null});
 const raw=JSON.stringify({user:{id,email:"member@example.test",email_confirmed_at:"2026-10-10",new_phone:phone},sms:{otp:"123456"}});
 const response=await handlePhoneDelivery(new Request("https://api.example.test/hook",{method:"POST",body:raw,headers:await signed(raw)}));
 expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled(); expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it.each(["MSG91_AUTH_KEY","MSG91_SMS_TEMPLATE","MSG91_SMS_OTP_VARIABLE"])("rejects missing SMS configuration %s without sending",async missing=>{
 Object.assign(mocks.env,{MEMBER_PHONE_VERIFICATION_ENABLED:"true",MSG91_AUTH_KEY:"synthetic",MSG91_SMS_TEMPLATE:"synthetic_sms",MSG91_SMS_OTP_VARIABLE:"OTP"});
 delete mocks.env[missing];
 const raw=JSON.stringify({user:{id,email:"member@example.test",email_confirmed_at:"2026-10-10",new_phone:phone},sms:{otp:"123456"}});
 const response=await handlePhoneDelivery(new Request("https://api.example.test/hook",{method:"POST",body:raw,headers:await signed(raw)}));
 expect(response.status).toBe(400); expect(fetch).not.toHaveBeenCalled();
});

const birdConfig = {provider:"bird",region:"us1",key:"bk_us1_synthetic"};
const birdAccepted = {id:"sms_01ky7qmwgpfkybj9ecrnwjx714",status:"accepted",direction:"outbound",to:phone,category:"authentication"};
it("sends the existing Supabase OTP via the regional Bird authentication template",async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(birdAccepted),{status:202}));
 await sendPhoneCode("sms",phone,"123456",birdConfig,fetcher);
 const [url, init]=fetcher.mock.calls[0];
 expect(url).toBe("https://us1.platform.bird.com/v1/sms/messages");
 expect(init.headers).toEqual({"content-type":"application/json",authorization:"Bearer bk_us1_synthetic"});
 expect(JSON.parse(init.body)).toEqual({to:phone,template:{slug:"bird_otp_verification",parameters:{code:"123456"}}});
 expect(init.redirect).toBe("error"); expect(init.signal).toBeInstanceOf(AbortSignal);
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([
 {provider:"other"}, {region:"https://evil.example"}, {region:""}, {region:"eu1"}, {key:"legacy-messagebird-key"},
])("rejects unknown providers and invalid Bird region/key combinations before sending %j",async overrides=>{
 const fetcher=vi.fn();
 await expect(sendPhoneCode("sms",phone,"123456",{...birdConfig,...overrides},fetcher)).rejects.toThrow("delivery_unavailable");
 expect(fetcher).not.toHaveBeenCalled();
});
it("rejects Bird WhatsApp without falling back to another transport",async()=>{
 const fetcher=vi.fn();
 await expect(sendPhoneCode("whatsapp",phone,"123456",birdConfig,fetcher)).rejects.toThrow("delivery_unavailable");
 expect(fetcher).not.toHaveBeenCalled();
});
it.each([
 {status:"sent"}, {id:""}, {id:"not-a-bird-id"}, {to:"+919000000002"}, {direction:"inbound"}, {category:"marketing"},
])("fails closed on contradictory Bird acceptance %j",async overrides=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({...birdAccepted,...overrides}),{status:202}));
 await expect(sendPhoneCode("sms",phone,"123456",birdConfig,fetcher)).rejects.toThrow("delivery_unavailable");
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each([200,402,422,500])("does not accept Bird HTTP %i or retry the send",async status=>{
 const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(birdAccepted),{status}));
 await expect(sendPhoneCode("sms",phone,"123456",birdConfig,fetcher)).rejects.toThrow("delivery_unavailable");
 expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["accepted","malformed","timeout"])("keeps the protected hook contract with Bird %s",async outcome=>{
 Object.assign(mocks.env,{MEMBER_PHONE_VERIFICATION_ENABLED:"true",MEMBER_PHONE_PROVIDER:"bird",BIRD_REGION:"us1",BIRD_API_KEY:"bk_us1_synthetic"});
 const raw=JSON.stringify({user:{id,email:"member@example.test",email_confirmed_at:"2026-10-10",new_phone:phone},sms:{otp:"123456"}});
 if(outcome==="timeout") vi.mocked(fetch).mockRejectedValue(new DOMException("Timeout", "TimeoutError"));
 else vi.mocked(fetch).mockResolvedValue(new Response(outcome==="accepted"?JSON.stringify(birdAccepted):"not json",{status:202}));
 const response=await handlePhoneDelivery(new Request("https://api.example.test/hook",{method:"POST",body:raw,headers:await signed(raw)}));
 expect(response.status).toBe(outcome==="accepted"?200:400);
 expect(mocks.rpc).toHaveBeenCalledTimes(outcome==="accepted"?2:1);
 if(outcome==="accepted") expect(mocks.rpc).toHaveBeenLastCalledWith("member_phone_operation",expect.objectContaining({p_action:"sent"}));
 expect(fetch).toHaveBeenCalledTimes(1);
 expect(await response.text()).not.toMatch(/123456|9000000001|bk_us1/);
});
