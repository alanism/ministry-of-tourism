import type {Actor} from '../doc/model.ts';
import {CommandError} from '../commands/define.ts';
import {readAllCards,readCard,readTripMeta} from './model.ts';
import {localDateFor} from './schema.ts';
import type {TripSession} from './session.ts';
import {applyProposal,type Proposal} from './proposals.ts';
import {proposeGroupSchedule} from './schedule-proposal.ts';
import {mergeResponseLedger} from './response-ledger.ts';
import {checkScheduleFeasibility} from './schedule-feasibility.ts';

/** Reject DST gaps and repeated clocks instead of silently choosing an offset. */
export function tripLocalInstant(local:string,timeZone:string){
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('Choose a complete local date and time');
 const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),base=Date.parse(`${local}:00Z`),matches:string[]=[];
 for(let offset=-14*60;offset<=14*60;offset+=15){const candidate=new Date(base-offset*60000),parts=Object.fromEntries(formatter.formatToParts(candidate).map(p=>[p.type,p.value])),clock=`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;if(clock===local)matches.push(candidate.toISOString());}
 if(matches.length!==1)throw new Error('This local clock time is nonexistent or ambiguous in the destination time zone; choose an unambiguous time');return matches[0]!;
}
export async function prepareGroupScheduleReview(session:TripSession,actor:Actor){
 if(actor.kind!=='human')throw new CommandError('human_only','Only a person can prepare a plan from private group data');
 const meta=readTripMeta(session.doc),group=meta.groupPreferences,workspace=meta.groupWorkspace,revision=session.boardRev;
 if(!group||!workspace?.planning)throw new Error('Save the group planning facts and time slots first');if(!meta.timeZone)throw new Error('Choose the destination time zone first');
 for(const card of readAllCards(session.parts))if(card.booking&&card.booking.status!=='not_booked'){
  const fixed=workspace.planning.commitments.find(c=>c.kind==='fixed_booking'&&(c.option_id===card.id||c.id===card.id));
  if(!fixed)throw new Error(`Add the protected time window for fixed booking ${card.title} before proposing a plan`);
  const start=new Date(fixed.start),time=new Intl.DateTimeFormat('en-GB',{timeZone:meta.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(start);
  if(card.day&&card.day!==localDateFor(start,meta.timeZone)||card.time&&card.time!==time)throw new Error(`Protected window contradicts the recorded booking start for ${card.title}`);
 }
 const planning={...workspace.planning,as_of:new Date().toISOString()};
 const result=await proposeGroupSchedule(group,workspace.ledger,planning,workspace.policy);
 if(session.boardRev!==revision)throw new CommandError('stale','The trip changed while preparing the plan; try again');
 const assignments=result.best?.assignments??[],ops:Proposal['ops']=[],operationAssignments:typeof assignments=[];
 for(const a of assignments){
  const card=readCard(session.parts,a.option_id),slot=workspace.planning.slots.find(s=>s.slot_id===a.slot_id)!;
  if(!card||card.scope==='private'||card.booking&&card.booking.status!=='not_booked'||workspace.planning.commitments.some(c=>c.kind==='fixed_booking'&&(c.option_id===card.id||c.id===card.id)))continue;
  const day=localDateFor(new Date(slot.start),meta.timeZone),time=new Intl.DateTimeFormat('en-GB',{timeZone:meta.timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(slot.start));
  ops.push({command:'trip_card_update',input:{id:card.id,day,time}});operationAssignments.push(a);
 }
 const proposal:Proposal={id:crypto.randomUUID(),boardId:session.boardId,token:session.token(ops.map(op=>String(op.input.id))),ops,sources:[],reason:'Local group proposal under the saved policy and dated facts; organizer chooses the changes.',author:'MoT group planner',status:'proposed'};
 const current=await mergeResponseLedger(group,workspace.ledger,[]);if(session.boardRev!==revision)throw new CommandError('stale','The trip changed; prepare the plan again');
 return{proposal,revision,result,operationAssignments,planning,denied:current.current.flatMap(r=>r.stamps.filter(s=>s.value==='denied').map(s=>({household_id:r.household_id,option_id:s.option_id})))};
}
export type GroupScheduleReview=Awaited<ReturnType<typeof prepareGroupScheduleReview>>;
export function applyGroupScheduleReview(session:TripSession,actor:Actor,review:GroupScheduleReview,selected:number[],allowTentative:boolean){
 if(session.boardRev!==review.revision)throw new CommandError('stale','The trip changed after this proposal; nothing applied. Prepare it again.');
 if(!review.result.best)throw new Error('There is no feasible proposal to apply');
 const assignments=selected.map(i=>review.operationAssignments[i]);if(assignments.some(a=>!a))throw new Error('Select existing proposed changes');
 const checked=checkScheduleFeasibility({...review.planning,as_of:new Date().toISOString()},assignments,review.denied);
 if(checked.status==='infeasible')throw new Error(`Selected changes break the declared constraints: ${checked.errors.join('; ')}`);
 if(checked.status==='tentative'&&!allowTentative)throw new Error('These choices are tentative; explicitly acknowledge the unconfirmed facts before applying');
 return applyProposal(session,actor,review.proposal,selected);
}
