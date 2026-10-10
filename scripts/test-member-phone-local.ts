// Real local GoTrue lifecycle; only MSG91 transport is mocked. No provider traffic is permitted.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { handlePhoneVerification } from "../supabase/functions/member-phone-verification/index.ts";
import { handlePhoneDelivery } from "../supabase/functions/member-phone-delivery/index.ts";
const base = Deno.env.get("SUPABASE_URL")!;
if (base !== "http://127.0.0.1:59421") throw new Error("Use the isolated membership-levels stack only");
const realFetch = globalThis.fetch;
const codes = new Map<string,string>();
let deliveryCount=0, lastHook: {raw:string; headers:Headers}|null=null;
globalThis.fetch = (async (input: RequestInfo | URL, init?:RequestInit) => {
 const url=String(input instanceof Request?input.url:input);
 if (url.startsWith("https://api.msg91.com/") || url.startsWith("https://control.msg91.com/")) {
  const body=JSON.parse(init?.body as string);
  const wa=url.includes("whatsapp"), recipient=wa?body.payload.template.to_and_components[0]:body.recipients[0];
  codes.set(`+${wa?recipient.to[0]:recipient.mobiles}`,wa?recipient.components.body_1.value:recipient.OTP);
  deliveryCount++;
  return new Response(JSON.stringify(wa?{request_id:`synthetic-${deliveryCount}`}:{type:"success",message:`synthetic-${deliveryCount}`}));
 }
 if (!url.startsWith(base)) throw new Error("External traffic prohibited in local phone lifecycle test");
 return realFetch(input,init);
}) as typeof fetch;
const server = Deno.serve({hostname:"0.0.0.0",port:59428,onListen:()=>{}},async request=>{
 const copy=request.clone(); lastHook={raw:await copy.text(),headers:new Headers(copy.headers)};
 return handlePhoneDelivery(request);
});
const admin=createClient(base,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
const userClient=createClient(base,Deno.env.get("SUPABASE_ANON_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
let userId:string|undefined;
function assert(ok:unknown,message:string):asserts ok {if(!ok)throw new Error(message)}
async function sql(command:string) {
 const process=new Deno.Command("docker",{args:["exec","-i","supabase_db_armature-membership-levels-check","psql","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-q"],stdin:"piped",stdout:"null",stderr:"piped"}).spawn();
 const writer=process.stdin.getWriter(); await writer.write(new TextEncoder().encode(command)); await writer.close();
 assert((await process.output()).success,"Synthetic fixture update failed");
}
try {
 for(let i=0;i<30;i++){try{if((await realFetch(`${base}/auth/v1/health`,{headers:{apikey:Deno.env.get("SUPABASE_ANON_KEY")!}})).ok)break}catch{} await new Promise(r=>setTimeout(r,300));}
 const password=crypto.randomUUID()+"Aa1!", email=`phone-lifecycle-${crypto.randomUUID()}@example.test`;
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
 assert(!created.error&&created.data.user,"Synthetic user creation failed"); userId=created.data.user.id;
 const signed=await userClient.auth.signInWithPassword({email,password});
 assert(!signed.error&&signed.data.session,"Synthetic email sign-in failed");
 const token=signed.data.session.access_token;
 const call=async (body:object)=>{
  const res=await handlePhoneVerification(new Request(`${base}/functions/v1/member-phone-verification`,{method:"POST",headers:{authorization:`Bearer ${token}`},body:JSON.stringify(body)}));
  const data=await res.json(); return {status:res.status,data};
 };
 const first="+919000001071",second="+919000001072";
 const status=await call({action:"status"});
 assert(JSON.stringify(status.data.available_channels)===JSON.stringify(["sms"]),"SMS-only channels were not exposed");
 const disabled=await call({action:"start",phone:first,channel:"whatsapp"});
 assert(disabled.status===400&&disabled.data.code==="channel_unavailable"&&Number(deliveryCount)===0,"Disabled WhatsApp sent a code");
 const started=await call({action:"start",phone:first,channel:"sms"});
 assert(started.status===200,`SMS start failed (${started.status}; ${started.data.code??"none"})`);
 assert(codes.has(first)&&Number(deliveryCount)===1,"Mock SMS transport did not receive code");
 const captured=lastHook!;
 const malformed=await call({action:"verify",code:"wrong"});assert(malformed.status===400,"Malformed code accepted");
 const verified=await call({action:"verify",code:codes.get(first)});
 assert(verified.status===200&&verified.data.verified===true,"Real first phone-change verification failed");
 const duplicate=await call({action:"verify",code:codes.get(first)});assert(duplicate.status===409,"Consumed OTP accepted again");
 const actual=await admin.auth.admin.getUserById(userId);assert(actual.data.user?.id===userId&&actual.data.user.phone===first.slice(1),"Phone not attached to original email account");
 await sql(`update private.member_phone_intents set resend_available_at=now()-interval '1 second' where user_id='${userId}';update auth.users set phone_change_sent_at=now()-interval '2 minutes' where id='${userId}';`);
 const replacement=await call({action:"start",phone:second,channel:"sms"});
 assert(replacement.status===200&&!replacement.data.verified&&Number(deliveryCount)===2,"SMS replacement did not remain unverified");
 const replay=await handlePhoneDelivery(new Request("http://127.0.0.1:59428",{method:"POST",headers:captured.headers,body:captured.raw}));
 assert(replay.status===400&&Number(deliveryCount)===2,"Old signed hook replay caused another send");
 const replaced=await call({action:"verify",code:codes.get(second)});
 assert(replaced.status===200&&replaced.data.verified===true,"Real replacement OTP failed");
 const final=await admin.auth.admin.getUserById(userId);assert(final.data.user?.phone===second.slice(1),"Replacement did not update original account");
 console.log(JSON.stringify({gotrue:"2.195.0",real_auth:true,mocked_msg91:true,sms_initial_verified:true,whatsapp_disabled:true,sms_replacement_verified:true,original_account_retained:true,otp_replay_blocked:true,hook_replay_blocked:true,provider_calls:deliveryCount,external_messages:0}));
} finally {
 if(userId){await admin.auth.admin.deleteUser(userId);await sql(`delete from private.member_phone_limits where key='account:${userId}' or key in ('phone:'||encode(extensions.digest('+919000001071','sha256'),'hex'),'phone:'||encode(extensions.digest('+919000001072','sha256'),'hex'));`)}
 await server.shutdown(); codes.clear();
}
