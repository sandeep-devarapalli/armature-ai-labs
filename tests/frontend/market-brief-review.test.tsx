import { fireEvent,render,screen,waitFor } from '@testing-library/react';
import { beforeEach,expect,it,vi } from 'vitest';
import { MarketBriefReview } from '../../src/features/talent/MarketBriefReview';
import type { MarketDetail } from '../../src/features/talent/marketApi';
const action=vi.hoisted(()=>vi.fn());
vi.mock('../../src/features/talent/marketApi',()=>({marketAction:action}));
const detail=(status:string,admin=false)=>({project:{id:'project',created_at:'2026-10-15T00:00:00Z',buyer_id:'buyer',status,title:'Sensor board',category:'Electronics',description:'Build board',deliverables:'Board files',acceptance_criteria:'Tests pass',source_files:'KiCad source',confidentiality:'Buyer owns files',timeline:'Two weeks',location:'Bengaluru',skills:['KiCad'],work_mode:'Remote',budget_min:100,budget_max:200},viewer:{admin},activity:[{event:'request_changes',payload:{note:'Clarify testing requirements'}}],proposals:[],milestones:[],agreement:null}) as MarketDetail;
beforeEach(()=>{action.mockReset();});
it('lets only a reviewer return a review-stage brief with a note',async()=>{
 const changed=vi.fn();action.mockResolvedValue(detail('draft',true));render(<MarketBriefReview detail={detail('review',true)} user="admin" onChange={changed}/>);
 fireEvent.change(screen.getByLabelText('Changes needed before publication'),{target:{value:'Please add acceptance measurements'}});
 fireEvent.click(screen.getByText('Return to buyer for changes'));
 await waitFor(()=>expect(action).toHaveBeenCalledWith('project','request_changes',{note:'Please add acceptance measurements'}));
 expect(changed).toHaveBeenCalledWith(detail('draft',true));
});
it('prefills the returned draft and saves the buyer correction without publishing',async()=>{
 action.mockResolvedValue(detail('draft'));render(<MarketBriefReview detail={detail('draft')} user="buyer" onChange={vi.fn()}/>);
 expect(screen.getByText('Requested changes: Clarify testing requirements')).toBeVisible();
 expect(screen.getByLabelText('Project title')).toHaveValue('Sensor board');
 fireEvent.change(screen.getByLabelText('How will you check the work?'),{target:{value:'Voltage within 1%'}});
 fireEvent.click(screen.getByText('Save requirement changes'));
 await waitFor(()=>expect(action).toHaveBeenCalledWith('project','edit_brief',expect.objectContaining({acceptance:'Voltage within 1%',skills:['KiCad'],budget_min:100,budget_max:200,workMode:'Remote'})));
 expect(action).toHaveBeenCalledTimes(1);
});
it('does not offer edits to an outsider, reviewer or owner of published work',()=>{
 const {rerender}=render(<MarketBriefReview detail={detail('draft')} user="outsider" onChange={vi.fn()}/>);
 expect(screen.queryByRole('button')).toBeNull();
 rerender(<MarketBriefReview detail={detail('draft',true)} user="admin" onChange={vi.fn()}/>);expect(screen.queryByRole('button')).toBeNull();
 rerender(<MarketBriefReview detail={detail('open')} user="buyer" onChange={vi.fn()}/>);expect(screen.queryByRole('button')).toBeNull();
});
it('keeps correction input on an action failure',async()=>{
 action.mockImplementation(async()=>{throw new Error('Draft owner required');});render(<MarketBriefReview detail={detail('draft')} user="buyer" onChange={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText('Project title'),{target:{value:'Revised sensor board'}});fireEvent.click(screen.getByText('Save requirement changes'));
 expect(await screen.findByRole('alert')).toHaveTextContent('Draft owner required');expect(screen.getByLabelText('Project title')).toHaveValue('Revised sensor board');
});
