import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SafeMessage, TalentMarketplace, TalentChatRequest, useMarketplaceUnread } from '../../src/features/talent/Marketplace';
import { attachmentError, maxAttachmentBytes, normalizeDetail, normalizeProject } from '../../src/features/talent/marketApi';
const rpc=vi.hoisted(()=>vi.fn());
const unavailable=vi.hoisted(()=>({value:false}));
const authChange=vi.hoisted(()=>({current:undefined as undefined|((event:string,session:{user:{id:string}}|null)=>void)}));
vi.mock('../../src/features/talent/liveTalent',()=>({talentRpc:rpc,talentClient:()=>{if(unavailable.value)throw new Error('Not configured');return ({auth:{getSession:async()=>({data:{session:{user:{id:'recipient'}}}}),onAuthStateChange:(callback:(event:string,session:{user:{id:string}}|null)=>void)=>{authChange.current=callback;return {data:{subscription:{unsubscribe:vi.fn()}}};}},channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:vi.fn()});}}));
const conversation={id:'chat',kind:'direct',status:'pending',initiator_id:'sender',recipient_id:'recipient',unread_count:1,counterpart_name:'Test sender'};
beforeEach(()=>{unavailable.value=false;rpc.mockReset();rpc.mockImplementation(async(name:string)=>name==='market_conversations'?[conversation]:name==='market_thread'?{conversation,messages:[],attachments:[]}:name==='market_get_message_preferences'?{email_enabled:true}:null);});
describe('marketplace boundary helpers' ,()=>{
 it('renders only HTTP links and leaves script markup as text',()=>{render(<SafeMessage text={'https://example.com/drawing javascript:alert(1) <script>bad</script>'}/>);const link=screen.getByRole('link');expect(link.getAttribute('href')).toBe('https://example.com/drawing');expect(link.getAttribute('rel')).toContain('noopener');expect(document.querySelector('script')).toBeNull();});
 it('blocks unsafe or oversized attachments before upload',()=>{expect(attachmentError({name:'firmware.exe',size:1})).toContain('not supported');expect(attachmentError({name:'drawing.step',size:maxAttachmentBytes+1})).toContain('50 MB');expect(attachmentError({name:'drawing.step',size:1024})).toBeNull();expect(attachmentError({name:'index.html',size:100})).not.toBeNull();});
 it('keeps private project records and proposal versions separate from directory identities',()=>{const detail=normalizeDetail({project:{id:'project',buyer_id:'buyer',brief:{title:'PCB test',acceptance:'Bench test',workMode:'Lab'},agreement:{ipTerms:'Editable sources'}},proposals:[{id:'proposal',version:2,offer:{approach:'Measure'},withdrawn:false}],milestones:[],activity:[]});expect(detail.project.title).toBe('PCB test');expect(detail.project.acceptance_criteria).toBe('Bench test');expect(detail.proposals[0].data.approach).toBe('Measure');expect(detail.proposals[0].version).toBe(2);});
});

describe('private conversation controls',()=>{
 it('allows the recipient to accept one pending introduction, without a composer',async()=>{render(<TalentMarketplace route="messages/chat"/>);await screen.findByRole('button',{name:'Accept chat'});expect(screen.queryByRole('button',{name:'Send message'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Accept chat'}));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('market_chat_respond',{conversation_id:'chat',action:'accept'}));});
 it('keeps the draft and idempotency key after send failure',async()=>{let attempts=0;rpc.mockImplementation(async(name:string)=>{if(name==='market_get_message_preferences')return {email_enabled:true};if(name==='market_conversations')return [conversation];if(name==='market_thread')return {conversation:{...conversation,status:'active'},messages:[],attachments:[]};if(name==='market_send_message'&&++attempts===1)throw new Error('Network unavailable');return null;});render(<TalentMarketplace route="messages/chat"/>);const box=await screen.findByRole('textbox',{name:'Message'});fireEvent.change(box,{target:{value:'Please review this drawing'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));await screen.findByText(/Your draft is kept/);expect((box as HTMLTextAreaElement).value).toBe('Please review this drawing');fireEvent.click(screen.getByRole('button',{name:'Send message'}));await waitFor(()=>expect(attempts).toBe(2));const sends=rpc.mock.calls.filter(call=>call[0]==='market_send_message');expect(sends[0][1].client_id).toBe(sends[1][1].client_id);await waitFor(()=>expect((box as HTMLTextAreaElement).value).toBe(''));expect(screen.getByText('← Conversations').getAttribute('href')).toBe('#messages');});
});

it('shows chat only for claimed profiles and submits a single introduction',async()=>{const person={id:'fixture',name:'Synthetic engineer',claimed:false} as import('../../src/features/talent/directorySearch').DirectoryPerson;const view=render(<TalentChatRequest person={person}/>);expect(screen.queryByRole('button',{name:'Request to chat'})).toBeNull();view.rerender(<TalentChatRequest person={{...person,claimed:true}}/>);fireEvent.click(screen.getByRole('button',{name:'Request to chat'}));const intro=await screen.findByRole('textbox',{name:'Your introduction'});fireEvent.change(intro,{target:{value:'Can we discuss this prototype?'}});rpc.mockResolvedValueOnce('chat');fireEvent.click(screen.getByRole('button',{name:'Send chat request'}));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('market_chat_request',{profile_id:'fixture',intro:'Can we discuss this prototype?'}));});

it('traps claim-chat dialog keyboard focus and restores the opener on Escape',async()=>{const person={id:'fixture',name:'Synthetic engineer',claimed:true} as import('../../src/features/talent/directorySearch').DirectoryPerson;render(<TalentChatRequest person={person}/>);await act(async()=>{await Promise.resolve();});const opener=screen.getByRole('button',{name:'Request to chat'});opener.focus();fireEvent.click(opener);const intro=await screen.findByRole('textbox',{name:'Your introduction'});expect(document.activeElement).toBe(intro);fireEvent.keyDown(document,{key:'Tab',shiftKey:true});expect(document.activeElement).toBe(screen.getByRole('button',{name:'Cancel'}));fireEvent.keyDown(document,{key:'Tab'});expect(document.activeElement).toBe(intro);fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(opener);});
it('marks only the last displayed message read and avoids read-event loops',async()=>{rpc.mockImplementation(async(name:string)=>{if(name==='market_get_message_preferences')return {email_enabled:true};if(name==='market_conversations')return [conversation];if(name==='market_thread')return {conversation:{...conversation,status:'active'},messages:[{id:'visible-message',sender_id:'sender',body:'Displayed message',created_at:'2026-10-13T10:00:00Z'}],attachments:[]};return null;});render(<TalentMarketplace route="messages/chat"/>);await screen.findByText('Displayed message');await waitFor(()=>expect(rpc).toHaveBeenCalledWith('market_mark_read',{conversation_id:'chat',last_message_id:'visible-message'}));fireEvent.change(screen.getByRole('textbox',{name:'Message'}),{target:{value:'Reply'}});fireEvent.click(screen.getByRole('button',{name:'Send message'}));await waitFor(()=>expect((screen.getByRole('textbox',{name:'Message'}) as HTMLTextAreaElement).value).toBe(''));expect(rpc.mock.calls.filter(call=>call[0]==='market_mark_read')).toHaveLength(1);});
it('refreshes authoritative unread counts after marking the displayed thread read',async()=>{let marked=false;rpc.mockImplementation(async(name:string)=>{if(name==='market_get_message_preferences')return {email_enabled:true};if(name==='market_conversations')return [{...conversation,unread_count:marked?2:1}];if(name==='market_thread')return {conversation:{...conversation,status:'active'},messages:[{id:'read-cursor',sender_id:'sender',body:'Read this first',created_at:'2026-10-13T10:00:00Z'}],attachments:[]};if(name==='market_mark_read')marked=true;return null;});render(<TalentMarketplace route="messages/chat"/>);await screen.findByText('(2 unread)');expect(rpc.mock.calls.filter(call=>call[0]==='market_conversations').length).toBeGreaterThanOrEqual(2);});

it('does not apply a previous account notification preference after account switching',async()=>{let resolveFirst!:(value:{email_enabled:boolean})=>void;let preferenceCalls=0;rpc.mockImplementation(async(name:string)=>{if(name==='market_get_message_preferences'){if(++preferenceCalls===1)return new Promise<{email_enabled:boolean}>(resolve=>{resolveFirst=resolve;});return {email_enabled:false};}if(name==='market_conversations')return [];return null;});render(<TalentMarketplace route="messages"/>);await waitFor(()=>expect(preferenceCalls).toBe(1));act(()=>authChange.current?.('SIGNED_IN',{user:{id:'second-user'}}));await waitFor(()=>expect(preferenceCalls).toBe(2));const preference=screen.getByLabelText('Email reminders for unread messages') as HTMLInputElement;await waitFor(()=>expect(preference.disabled).toBe(false));expect(preference.checked).toBe(false);await act(async()=>resolveFirst({email_enabled:true}));expect(preference.checked).toBe(false);});

it('keeps standalone previews usable without backend configuration',()=>{unavailable.value=true;function Counter(){return <span>Unread: {useMarketplaceUnread()}</span>;}render(<Counter/>);expect(screen.getByText('Unread: 0')).toBeTruthy();expect(rpc).not.toHaveBeenCalled();});

it('hides Request to chat on the signed-in owners own profile',async()=>{
 rpc.mockImplementation(async(name:string)=>name==='talent_my_status'?{owner:true}:null);
 const person={id:'own-profile',name:'Owner',claimed:true} as import('../../src/features/talent/directorySearch').DirectoryPerson;
 render(<TalentChatRequest person={person}/>);
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('talent_my_status',{profile_id:'own-profile'}));
 await waitFor(()=>expect(screen.queryByRole('button',{name:'Request to chat'})).toBeNull());
});

it('uses only structured numeric budgets and normalizes skills at the API boundary',()=>{
 const p=normalizeProject({brief:{skills:'ROS 2, C++, ',budget_min:'1000',budget_max:2000}});
 expect(p.skills).toEqual(['ROS 2','C++']);expect(p.budget_min).toBe(1000);expect(p.budget_max).toBe(2000);
 expect(normalizeProject({brief:{budget:'1 lakh',skills:['CAD',123]}}).budget_max).toBeUndefined();
 expect(normalizeProject({brief:{skills:['CAD',123]}}).skills).toEqual(['CAD']);
});

it('keeps sentence punctuation outside clickable message links',()=>{render(<SafeMessage text="Review https://example.com/report. Then reply."/>);expect(screen.getByRole('link').getAttribute('href')).toBe('https://example.com/report');expect(screen.getByText(/Then reply/)).toBeTruthy();});

it('clears buyer-only proposals immediately when the account changes',async()=>{
 let switched=false;
 rpc.mockImplementation(async(name:string)=>{
  if(name==='market_project_detail'){
   if(switched)return new Promise(()=>{});
   return {project:{id:'project',buyer_id:'recipient',status:'open',brief:{title:'Private draft',skills:[]}},proposals:[{id:'proposal',provider_id:'provider',offer:{approach:'Confidential price and design',milestones:[]}}],milestones:[],activity:[]};
  }
  return [];
 });
 render(<TalentMarketplace route="project/project"/>);fireEvent.click(await screen.findByRole('button',{name:'Proposals'}));await screen.findByText('Confidential price and design');
 switched=true;act(()=>authChange.current?.('SIGNED_OUT',null));
 expect(screen.queryByText('Confidential price and design')).toBeNull();expect(screen.queryByText('Private draft')).toBeNull();
});
it('clears an old private inbox immediately before the next accounts fetch finishes',async()=>{
 let loads=0;
 rpc.mockImplementation(async(name:string)=>{
  if(name==='market_conversations'){if(++loads>1)return new Promise(()=>{});return [conversation];}
  if(name==='market_thread')return {conversation:{...conversation,status:'active'},messages:[{id:'m',body:'Private previous-account message',sender_id:'sender',created_at:'2026-10-15'}],attachments:[]};
  if(name==='market_get_message_preferences')return {email_enabled:true};return null;
 });
 render(<TalentMarketplace route="messages/chat"/>);await screen.findByText('Private previous-account message');
 act(()=>authChange.current?.('SIGNED_IN',{user:{id:'another-account'}}));
 expect(screen.queryByText('Private previous-account message')).toBeNull();
});

it('confirms and clears successful reports, while retaining failed report drafts',async()=>{
 let fail=true;
 rpc.mockImplementation(async(name:string)=>{
  if(name==='market_conversations')return [conversation];
  if(name==='market_thread')return {conversation:{...conversation,status:'active'},messages:[],attachments:[]};
  if(name==='market_get_message_preferences')return {email_enabled:true};
  if(name==='market_report'){if(fail)throw new Error('Report unavailable');return 'report-id';}
  return null;
 });
 render(<TalentMarketplace route="messages/chat"/>);
 const reason=await screen.findByLabelText('Report a concern');
 fireEvent.change(reason,{target:{value:'Please investigate this concern'}});fireEvent.click(screen.getByRole('button',{name:'Send report'}));
 await screen.findByText('Report unavailable');expect(reason).toHaveValue('Please investigate this concern');expect(screen.queryByText(/Report submitted/)).toBeNull();
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Send report'}));
 await screen.findByText('Report submitted. An authorised reviewer will review your concern.');expect(reason).toHaveValue('');
});
