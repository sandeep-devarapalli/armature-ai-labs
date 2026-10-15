import { talentClient, talentRpc } from './liveTalent';
export type MarketProject = { id: string; buyer_id: string; title: string; category: string; skills: string[]; budget?:string; agreement_version?:number; buyer_agreed_version?:number; provider_agreed_version?:number; description: string; deliverables: string; acceptance_criteria: string; budget_min?: number; budget_max?: number; timeline: string; location: string; work_mode: string; status: string; created_at: string; saved?: boolean; has_proposal?: boolean; selected_provider_id?: string; materials?: string; dependencies?: string; revisions?: number; source_files?: string; confidentiality?: string };
export type MarketProposal = {provider_name?:string;profile_id?:string;id:string;provider_id:string;status:string;data:Record<string,unknown>;price?:number;approach?:string;portfolio?:string;conversation_id?:string;version?:number};
export type MarketInvitation = {id:string;project_id:string;provider_id:string;status:string;project_title?:string};
export type MarketDetail = { project:MarketProject;proposals:MarketProposal[];agreement:Record<string,unknown>|null;milestones:Record<string,unknown>[];activity:Record<string,unknown>[];invitations?:MarketInvitation[];viewer?:{buyer?:boolean;provider?:boolean;admin?:boolean} };
export type Conversation = {id:string;kind:string;status:string;initiator_id:string;recipient_id:string;project_id:string|null;unread_count:number;last_body:string;created_at:string;counterpart_name?:string;project_title?:string};
export type Attachment = {id:string;filename:string;content_type:string;byte_size:number;status:string;uploader_id?:string;created_at?:string};
export type Thread = {conversation:Conversation;messages:{id:string;sender_id:string;body:string;created_at:string}[];attachments:Attachment[]};
export function normalizeProject(raw:Record<string,unknown>):MarketProject {
 const brief=(raw.brief??{}) as Record<string,unknown>;
 const amount=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>0?value:typeof value==='string'&&/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)&&Number(value)>0?Number(value):undefined;
 const skills=Array.isArray(brief.skills)?brief.skills.filter((item):item is string=>typeof item==='string'):typeof brief.skills==='string'?brief.skills.split(',').map(item=>item.trim()).filter(Boolean):[];
 return {...raw,...brief,skills,work_mode:brief.workMode,source_files:brief.sourceFiles,acceptance_criteria:brief.acceptance,selected_provider_id:raw.provider_id,budget_min:amount(brief.budget_min),budget_max:amount(brief.budget_max)} as unknown as MarketProject;
}
export function normalizeDetail(raw:Record<string,unknown>):MarketDetail {const project=raw.project as Record<string,unknown>;return {...raw,viewer:{admin:raw.viewer_admin===true},project:normalizeProject(project),agreement:project.agreement,proposals:((raw.proposals??[]) as Record<string,unknown>[]).map(p=>({...p,data:p.offer,status:p.withdrawn?'withdrawn':'submitted'}))} as unknown as MarketDetail;}
export const listMarketProjects = async()=> (await talentRpc<Record<string,unknown>[]>('market_list_projects')).map(normalizeProject);
export const getMarketDetail = async(id:string)=>normalizeDetail(await talentRpc<Record<string,unknown>>('market_project_detail',{project_id:id}));
export const marketAction = async(projectId:string|null,action:string,payload:Record<string,unknown>={}) => normalizeDetail(await talentRpc<Record<string,unknown>>('market_project_action',{project_id:projectId,action,payload}));
export const money = (value:unknown) => typeof value==='number' ? new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value) : 'To be agreed';
export const maxAttachmentBytes = 50*1024*1024;
export function attachmentError(file:Pick<File,'name'|'size'>):string|null {
 if(file.size>maxAttachmentBytes)return 'Choose a file of 50 MB or less.';
 if(/\.(png|jpe?g|webp)$/i.test(file.name)&&file.size>5*1024*1024)return 'Choose an image of 5 MB or less.';
 if(!/\.(png|jpe?g|webp|pdf|txt|csv|docx|xlsx|pptx|step|stp|iges|igs|stl|fcstd|dxf|dwg|kicad_pcb|kicad_sch|zip)$/i.test(file.name))return 'This file type is not supported. Executables, scripts and active HTML are blocked.';
 return null;
}
export async function uploadMarketFile(conversationId:string,file:File,onProgress:(percent:number)=>void){
 const invalid=attachmentError(file);if(invalid)throw new Error(invalid);
 onProgress(0);
 const {data:{session}}=await talentClient().auth.getSession();
 if(!session)throw new Error('Sign in before uploading files.');
 const endpoint=import.meta.env.VITE_SUPABASE_URL?.trim();
 const key=(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??import.meta.env.VITE_SUPABASE_ANON_KEY)?.trim();
 if(!endpoint||!key)throw new Error('Private upload service is unavailable.');
 return await new Promise<unknown>((resolve,reject)=>{
  const request=new XMLHttpRequest();request.open('POST',`${endpoint}/functions/v1/market-message-files`);request.timeout=240000;request.ontimeout=()=>reject(new Error('Upload timed out. Check the conversation before retrying.'));
  request.setRequestHeader('Authorization',`Bearer ${session.access_token}`);request.setRequestHeader('apikey',key);
  request.setRequestHeader('x-conversation-id',conversationId);request.setRequestHeader('x-file-name',encodeURIComponent(file.name));request.setRequestHeader('Content-Type',file.type||'application/octet-stream');
  request.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(event.loaded/event.total*100));};
  request.onerror=()=>reject(new Error('Upload failed. Your file has not been shared. Retry when connected.'));
  request.onload=()=>{try{const result=JSON.parse(request.responseText);if(request.status<200||request.status>=300)throw new Error(result.error||'Private upload unavailable');onProgress(100);resolve(result);}catch(error){reject(error);}};
  request.send(file);
 });
}
