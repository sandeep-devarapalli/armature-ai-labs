import { useState, type FormEvent } from 'react';
import { marketAction, type MarketDetail } from './marketApi';
export function MarketBriefReview({detail,user,onChange}:{detail:MarketDetail;user:string;onChange:(detail:MarketDetail)=>void}) {
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const project=detail.project;
 const buyer=Boolean(user)&&project.buyer_id===user;
 const admin=Boolean(user)&&detail.viewer?.admin===true;
 const note=[...detail.activity].reverse().find(item=>item.event==='request_changes')?.payload as {note?:string}|undefined;
 async function submit(event:FormEvent<HTMLFormElement>,action:string) {
  event.preventDefault();setBusy(true);setError('');
  const fields=Object.fromEntries(new FormData(event.currentTarget)) as Record<string,string>;
  try {
   const payload=action==='request_changes'?{note:fields.note}:{...fields,skills:fields.skills.split(',').map(value=>value.trim()).filter(Boolean),budget_min:Number(fields.budget_min),budget_max:Number(fields.budget_max),revisions:Number(fields.revisions),budget:`₹${fields.budget_min}–₹${fields.budget_max}`};
   onChange(await marketAction(project.id,action,payload));
  } catch(e){setError(e instanceof Error?e.message:'Unable to save the brief.');} finally{setBusy(false);}
 }
 if(!((admin&&project.status==='review')||(buyer&&project.status==='draft')))return null;
 return <section className="market-card"><h2>{project.status==='review'?'Request brief changes':'Edit requirement'}</h2>{error&&<p role="alert">{error}</p>}{project.status==='review'?<form className="market-form" onSubmit={event=>void submit(event,'request_changes')}><label>Changes needed before publication<textarea name="note" required minLength={10} maxLength={4000}/></label><button disabled={busy}>Return to buyer for changes</button></form>:<>{note?.note&&<p className="market-notice">Requested changes: {note.note}</p>}<p>Save your changes, then submit the requirement for Armature review again. No payment is collected.</p><form className="market-form" key={project.id} onSubmit={event=>void submit(event,'edit_brief')}>
 {(['title','category','description','deliverables','acceptance','sourceFiles','dependencies','confidentiality','timeline','location','materials'] as const).map(name=>{
  const labels={title:'Project title',category:'Category',description:'What do you want to build?',deliverables:'Deliverables',acceptance:'How will you check the work?',sourceFiles:'Editable source files and test evidence required',dependencies:'Dependencies and what you will provide',confidentiality:'Confidentiality and IP / licensing requirements',timeline:'Delivery timeframe',location:'City / lab location',materials:'Materials, equipment, supervision and prototype handover'};
  const value=name==='acceptance'?project.acceptance_criteria:name==='sourceFiles'?project.source_files:project[name];
  return <label key={name}>{labels[name]}<textarea name={name} defaultValue={value??''} required={['title','description','deliverables','acceptance','sourceFiles','confidentiality','timeline','location'].includes(name)}/></label>;
 })}
 <label>Required skills or tools, separated by commas<input name="skills" defaultValue={project.skills.join(', ')} required/></label>
 <label>Minimum service budget (INR)<input name="budget_min" type="number" min={1} step="0.01" defaultValue={project.budget_min} required/></label>
 <label>Maximum service budget (INR)<input name="budget_max" type="number" min={1} step="0.01" defaultValue={project.budget_max} required/></label>
 <label>Included revision rounds<input name="revisions" type="number" min={0} defaultValue={project.revisions??1}/></label>
 <label>Work arrangement<select name="workMode" defaultValue={project.work_mode||'Remote'}><option>Remote</option><option>Lab</option><option>Hybrid</option></select></label>
 <button disabled={busy}>Save requirement changes</button></form></>}</section>;
}
