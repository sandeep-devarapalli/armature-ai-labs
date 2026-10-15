import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { MarketReviewDesk,MarketAmendments,MarketMilestoneNotices } from '../../src/features/talent/MarketOperations';
const {rpc,listProjects}=vi.hoisted(()=>({rpc:vi.fn(),listProjects:vi.fn()}));
vi.mock('../../src/features/talent/liveTalent',()=>({talentRpc:rpc}));
vi.mock('../../src/features/talent/marketApi',()=>({money:(n:number)=>`INR ${n}`,listMarketProjects:listProjects}));
beforeEach(()=>{rpc.mockReset();listProjects.mockReset().mockResolvedValue([]);});
it('requires an explicit evidence action and resolves without a payment action',async()=>{
 rpc.mockImplementation(async(name:string)=>name==='market_case_reviewer_options'?[]:name==='market_review_cases'?[{id:'case',reason:'Review delayed',status:'assigned',reviewer_id:'reviewer',report_id:null}]:name==='market_case_detail'?{milestone:{terms:{title:'Board'},submission:{delivery:'Drawing'}}}:{});
 render(<MarketReviewDesk user="reviewer"/>);await screen.findByText('Review delayed');expect(rpc).not.toHaveBeenCalledWith('market_case_detail',expect.anything());fireEvent.click(screen.getByText('Open case evidence (audited)'));await screen.findByText('Delivery: Drawing');fireEvent.change(screen.getByLabelText('Resolution shared with project participants'),{target:{value:'Resume review of the supplied drawing'}});fireEvent.click(screen.getByText('Resume mutual review'));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('market_case_action',{case_id:'case',action:'resume_review',note:'Resume review of the supplied drawing',reviewer_id:null}));expect(rpc.mock.calls.some(([name])=>name==='market_simulate_payment')).toBe(false);
});
it('does not show evidence access for an unassigned administrator',async()=>{rpc.mockImplementation(async(name:string)=>name==='market_case_reviewer_options'?[{id:'reviewer',label:'Sample Reviewer'}]:[{id:'case',reason:'Reported conversation',status:'open',reviewer_id:null,report_id:'report'}]);render(<MarketReviewDesk user="admin"/>);await screen.findByText('Reported conversation');expect(screen.queryByText('Open case evidence (audited)')).toBeNull();expect(screen.getByRole('option',{name:'Sample Reviewer'})).toHaveValue('reviewer');});
it('shows additions and uses explicit acceptance of the exact immutable request',async()=>{const row={id:'addition',status:'pending',proposed_by:'buyer',buyer_accepted:false,provider_accepted:false,terms:{approach:'Additional sensor',schedule:'One week',milestones:[{title:'Sensor',deliverables:'Source',acceptance:'Tests',serviceAmount:300,materialsAmount:20}]}};rpc.mockResolvedValue([row]);render(<MarketAmendments user="provider" projectId="project" onChange={async()=>{}}>{()=>null}</MarketAmendments>);await screen.findByText('Additional sensor · pending');expect(screen.queryByText('Withdraw addition')).toBeNull();fireEvent.click(screen.getByText('Accept this additional scope'));await waitFor(()=>expect(rpc).toHaveBeenCalledWith('market_amendment_action',{project_id:'project',action:'accept',amendment_id:'addition',terms:null}));});
it('links overdue notices to the affected project without an automatic accept control',async()=>{rpc.mockResolvedValue([{id:1,title:'Board',stage:2,project_id:'project'}]);render(<MarketMilestoneNotices user="buyer"/>);expect(await screen.findByRole('link',{name:'Board'})).toHaveAttribute('href','#project/project');expect(screen.queryByRole('button')).toBeNull();});

it('lists only briefs awaiting review after server administrator authorization',async()=>{
 rpc.mockResolvedValue([]);
 listProjects.mockResolvedValue([{id:'pending',title:'Sensor board',status:'review',category:'Electronics',work_mode:'Remote',location:'Bengaluru',deliverables:'Board source files'},{id:'open',title:'Already published',status:'open'}]);
 render(<MarketReviewDesk user="admin"/>);
 expect(await screen.findByRole('link',{name:'Sensor board'})).toHaveAttribute('href','#project/pending');
 expect(screen.queryByText('Already published')).toBeNull();
 expect(screen.getByRole('link',{name:'Review requirement'})).toHaveAttribute('href','#project/pending');
});
it('keeps the admin brief queue hidden from a non-admin direct visit',async()=>{
 rpc.mockImplementation(async(name:string)=>{if(name==='market_case_reviewer_options')throw new Error('Administrator required');return [];});
 render(<MarketReviewDesk user="buyer"/>);
 await waitFor(()=>expect(rpc).toHaveBeenCalledWith('market_case_reviewer_options'));
 expect(screen.queryByRole('region',{name:'Briefs awaiting review'})).toBeNull();
 expect(listProjects).not.toHaveBeenCalled();
});
it('reports a failed brief load without claiming the queue is empty',async()=>{
 rpc.mockResolvedValue([]);listProjects.mockRejectedValue(new Error('Unable to load briefs'));
 render(<MarketReviewDesk user="admin"/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load briefs');
 expect(screen.queryByText('No briefs awaiting review.')).toBeNull();
});
it('hides the admin queue immediately when the account changes',async()=>{
 rpc.mockResolvedValue([]);listProjects.mockResolvedValue([{id:'pending',title:'Sensor board',status:'review'}]);
 const view=render(<MarketReviewDesk user="admin"/>);await screen.findByRole('link',{name:'Sensor board'});
 rpc.mockImplementation(async(name:string)=>{if(name==='market_case_reviewer_options')throw new Error('Administrator required');return [];});
 view.rerender(<MarketReviewDesk user="buyer"/>);
 expect(screen.queryByRole('region',{name:'Briefs awaiting review'})).toBeNull();
});
