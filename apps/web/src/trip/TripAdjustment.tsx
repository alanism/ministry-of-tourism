import {useEffect,useRef,useState} from 'react';
import {applyTripAdaptation,nextStep,planTripAdaptation,undoProposal,type Actor,type AdaptationPlan,type TripChange,type TripSession} from '@writers-board/core';
import {dayLabel} from './sample';

export function NextStepPanel({session}:{session:TripSession}){
 const step=nextStep(session);if(!step)return null;
 return <section className="mot-step" aria-label="Next step"><p className="m-eyebrow">Next step · {dayLabel(step.when.day)} · {step.when.time??'time not set'} · {step.when.timeZone}</p><h3>{step.card.title||'Untitled'}</h3>
  <p className="m-muted">{step.source.label}{step.source.retrievedAt?` · checked ${step.source.retrievedAt.slice(0,10)}`:''} · Time {step.when.confidence==='scheduled'?'scheduled by you':'day only'} · Booking {step.booking==='held'?'held, not confirmed':step.booking.replace('_',' ')}</p>
  {!!step.preparation.length&&<ul>{step.preparation.map(item=><li key={item}>{item}</li>)}</ul>}{step.facts.map(fact=><p key={fact.field}>{fact.field}: {fact.value} · seen {fact.observedAt.slice(0,10)}{fact.stale?' · may be out of date':''}</p>)}<p className="m-muted t-1">{step.route.reason}</p>
 </section>;
}

export function AdaptPanel({session,actor,day,tick,refresh,notify,whenSaved}:{session:TripSession;actor:Actor;day:string;tick:number;refresh:()=>void;notify:(m:string)=>void;whenSaved?:()=>Promise<void>}){
 const [until,setUntil]=useState(''),[plan,setPlan]=useState<AdaptationPlan|null>(null),[applied,setApplied]=useState(false),[busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[ack,setAck]=useState(false),run=useRef(0);
 useEffect(()=>{run.current++;setBusy(false);return()=>{run.current++;};},[session,tick,day]);
 const check=async(change:TripChange)=>{const token=++run.current;setBusy(true);setFailure('');setPlan(null);setApplied(false);setAck(false);try{const next=await planTripAdaptation(session,change,{ownerView:true});if(token===run.current)setPlan(next);}catch(error){if(token===run.current)setFailure(error instanceof Error?error.message:'The adjustment could not be checked.');}finally{if(token===run.current)setBusy(false);}};
 const durability=async(message:string)=>{if(!whenSaved){notify(`${message} In this tab only; download a ZIP backup.`);return;}try{await whenSaved();notify(`${message} Saved on this device.`);}catch{notify(`${message} In this tab only; download a ZIP backup.`);}};
 const apply=()=>{if(!plan)return;try{applyTripAdaptation(session,actor,plan,ack);setApplied(true);refresh();void durability('Only the listed activities changed.');}catch(error){setFailure(error instanceof Error?error.message:'Nothing changed.');}};
 const undo=()=>{if(plan?.proposal&&undoProposal(session,plan.proposal.id)){setApplied(false);setPlan(null);refresh();void durability('Adjustment undone.');}else setFailure('The trip changed after this adjustment. Use the board’s Undo if needed.');};
 const list=(title:string,items:string[])=>!!items.length&&<><p className="m-eyebrow">{title}</p><ul>{items.map((item,i)=><li key={`${i}:${item}`}>{item}</li>)}</ul></>;
 const stale=!!plan&&!applied&&plan.revision!==session.boardRev,tentative=plan?.feasibility?.status==='tentative';
 return <section className="mot-adapt" aria-label="Adjust this day"><p className="m-label">Adjust {dayLabel(day)}</p>
  <form onSubmit={e=>{e.preventDefault();if(until)void check({kind:'delay',day,until});}}><label>Running late until<input className="m-field" type="time" value={until} onChange={e=>setUntil(e.target.value)}/></label><button type="submit" className="m-btn small" disabled={!until||busy}>Check delay</button><button type="button" className="m-btn small" disabled={busy} onClick={()=>void check({kind:'energy',day,level:'low'})}>Low energy</button><button type="button" className="m-btn small" disabled={busy} onClick={()=>void check({kind:'weather',day})}>Weather changed</button></form>
  {busy&&<p role="status">Checking the affected activities…</p>}
  {plan&&<div className="mot-adapt-result" role="status">{list('Would change',plan.changes.map(c=>`${c.title||'Untitled'}: ${c.from} → ${c.to}`))}{list('Kept as is',plan.preserved.map(p=>`${p.title}: ${p.reason}`))}{list('Needs you',plan.conflicts.map(c=>`${c.title}: ${c.detail}`))}{list('Saved alternatives',plan.alternatives.map(a=>`${a.title}: ${a.why}`))}{list('Assumptions',plan.assumptions)}{list('Unknown',plan.unknowns)}
   {stale&&<p>The trip changed. Check the adjustment again before applying.</p>}
   {!plan.proposal?<p>Nothing changes automatically.</p>:applied?<button type="button" className="m-btn small" onClick={undo}>Undo adjustment</button>:<>{tentative&&<label className="mot-adapt-ack"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I understand the unconfirmed facts; apply this tentative adjustment.</label>}<button type="button" className="m-btn primary small" disabled={stale||tentative&&!ack} onClick={apply}>Apply {plan.changes.length} {plan.changes.length===1?'change':'changes'}</button></>}
  </div>}{failure&&<p role="alert">{failure}</p>}
 </section>;
}
