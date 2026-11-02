import type {Actor} from '../doc/model.ts';
import {CommandError} from '../commands/define.ts';
import {readAllCards,readCard,readTripMeta} from './model.ts';
import {localDateFor} from './schema.ts';
import type {TripSession} from './session.ts';
import {applyProposal,type Proposal} from './proposals.ts';
import {scheduleAssignmentsSchema,type ScheduleAssignment} from './planning-constraints.ts';
import {checkScheduleFeasibility,type DeniedAttendance} from './schedule-feasibility.ts';
import {tripLocalInstant} from './group-plan-review.ts';
import type {VotingRoundKey} from './voting-contract.ts';
import {getVotingRoundView,votingRoundState} from './voting-lifecycle.ts';

const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)):item);
const fingerprint=(session:TripSession)=>stable({meta:readTripMeta(session.doc),seals:[...session.parts.clock].filter(([key])=>key.startsWith('votingSeal:'))});
export type ManagedScheduleReview={proposal:Proposal;revision:number;round:VotingRoundKey;assignments:ScheduleAssignment[];feasibility:ReturnType<typeof checkScheduleFeasibility>};
type Receipt={session:TripSession;actor:string;revision:number;fingerprint:string;value:ManagedScheduleReview;denied:DeniedAttendance[];valid:boolean;release:()=>void};
const receipts=new WeakMap<ManagedScheduleReview,Receipt>();
const stale=()=>new CommandError('stale','This manual review is cancelled or the trip changed. Prepare a fresh review.');
function current(session:TripSession,key:VotingRoundKey){const meta=readTripMeta(session.doc),group=meta.groupPreferences,planning=meta.groupWorkspace?.planning,round=group?.rounds.find(r=>r.round_id===key.round_id&&r.proposal_version===key.proposal_version);if(!group||!round||round.kind!=='city_venue'||votingRoundState(session,key)!=='open'||key.proposal_version!==Math.max(...group.rounds.map(r=>r.proposal_version)))throw new Error('Manual planning requires the latest open activity round; draft, closed, destination and historical results remain unavailable');if(!planning||planning.trip_id!==group.trip_id||planning.round_id!==key.round_id||planning.proposal_version!==key.proposal_version||!meta.timeZone)throw new Error('Save planning facts for this exact round and choose a destination time zone first');return{meta,group,planning,round};}
function checkReceipt(r:Receipt,session:TripSession,actor:Actor){if(!r.valid||r.session!==session||actor.kind!=='human'||stable(actor)!==r.actor||session.boardRev!==r.revision||fingerprint(session)!==r.fingerprint)throw stale();current(session,r.value.round);}
/** A person supplies assignments. No ranking is turned into consent or an automatic itinerary. */
export async function prepareManagedScheduleReview(session:TripSession,actor:Actor,key:VotingRoundKey,input:ScheduleAssignment[],options:{signal?:AbortSignal}={}){
 if(actor.kind!=='human')throw new CommandError('human_only','Only a person can prepare manual group changes');
 const state=current(session,key),revision=session.boardRev,binding=fingerprint(session),assignments=scheduleAssignmentsSchema.parse(input);
 if(!assignments.length||new Set(assignments.map(a=>a.option_id)).size!==assignments.length)throw new Error('Choose each activity once');
 let valid=!options.signal?.aborted;const invalidate=()=>{valid=false;},release=()=>{session.doc.off('update',invalidate);options.signal?.removeEventListener('abort',invalidate);};session.doc.on('update',invalidate);options.signal?.addEventListener('abort',invalidate,{once:true});
 const unchanged=()=>{if(!valid||session.boardRev!==revision||fingerprint(session)!==binding)throw stale();current(session,key);};
 try{
  unchanged();const view=await getVotingRoundView(session,key);unchanged();if(!view.tally)throw new Error('The current provisional result is unavailable');
  const denied=view.tally.options.flatMap(o=>o.stamps.denied.map(household_id=>({household_id,option_id:o.option_id})));
  const planning={...state.planning,as_of:new Date().toISOString()};
  for(const card of readAllCards(session.parts))if(card.booking&&card.booking.status!=='not_booked'){
   const fixed=planning.commitments.find(c=>c.kind==='fixed_booking'&&(c.option_id===card.id||c.id===card.id));if(!fixed)throw new Error('Record the protected booking window before preparing changes');
   const start=new Date(fixed.start),time=new Intl.DateTimeFormat('en-GB',{timeZone:state.meta.timeZone!,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(start);if(card.day&&card.day!==localDateFor(start,state.meta.timeZone!)||card.time&&card.time!==time)throw new Error('Protected booking window contradicts its recorded start');
  }
  const ops:Proposal['ops']=[];
  for(const a of assignments){const card=readCard(session.parts,a.option_id),slot=planning.slots.find(s=>s.slot_id===a.slot_id);if(!card||card.scope==='private'||!state.round.option_ids.includes(a.option_id)||!planning.activities.some(p=>p.option_id===a.option_id)||!slot||card.booking&&card.booking.status!=='not_booked'||planning.commitments.some(c=>c.kind==='fixed_booking'&&(c.option_id===card.id||c.id===card.id)))throw new Error('Choose an eligible activity and declared time slot; protected bookings cannot move');ops.push({command:'trip_card_update',input:{id:card.id,day:localDateFor(new Date(slot.start),state.meta.timeZone!),time:new Intl.DateTimeFormat('en-GB',{timeZone:state.meta.timeZone!,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(slot.start))}});}
  const feasibility=checkScheduleFeasibility(planning,assignments,denied);if(feasibility.status==='infeasible')throw new Error('Manual choices are infeasible: '+feasibility.errors.join('; '));unchanged();
  const value:ManagedScheduleReview={proposal:{id:crypto.randomUUID(),boardId:session.boardId,token:session.token(ops.map(op=>String(op.input.id))),ops,sources:[],reason:'Explicit manual choices from a provisional activity result; no booking or consent inferred.',author:actor.id,status:'proposed'},revision,round:{round_id:key.round_id,proposal_version:key.proposal_version},assignments,feasibility};
  const receipt:Receipt={session,actor:stable(actor),revision,fingerprint:binding,value:structuredClone(value),denied,valid:true,release:()=>{release();receipt.valid=false;}};
  // The preparation listener remains live until Apply, cancellation or any document update.
  const invalidateReceipt=()=>{receipt.valid=false;receipt.release();session.doc.off('update',invalidateReceipt);};release();session.doc.on('update',invalidateReceipt);options.signal?.addEventListener('abort',invalidateReceipt,{once:true});receipt.release=()=>{session.doc.off('update',invalidateReceipt);options.signal?.removeEventListener('abort',invalidateReceipt);receipt.valid=false;};
  receipts.set(value,receipt);return value;
 }catch(error){release();throw error;}
}
export function cancelManagedScheduleReview(review:ManagedScheduleReview){receipts.get(review)?.release();receipts.delete(review);}
export function applyManagedScheduleReview(session:TripSession,actor:Actor,review:ManagedScheduleReview,selected:number[],allowTentative:boolean){
 const receipt=receipts.get(review);if(!receipt)throw stale();checkReceipt(receipt,session,actor);if(stable(review)!==stable(receipt.value))throw stale();
 if(!selected.length||new Set(selected).size!==selected.length||selected.some(i=>!Number.isInteger(i)||!receipt.value.assignments[i]))throw new Error('Select existing manual changes once');
 const state=current(session,review.round),assignments=selected.map(i=>receipt.value.assignments[i]!),chosen=new Set(assignments.map(a=>a.option_id));
 const placed=readAllCards(session.parts).flatMap(card=>{if(chosen.has(card.id)||!card.day||!card.time||!state.planning.activities.some(a=>a.option_id===card.id)||state.planning.commitments.some(c=>c.kind==='fixed_booking'&&(c.option_id===card.id||c.id===card.id)))return[];let start:number;try{start=Date.parse(tripLocalInstant(card.day+'T'+card.time,state.meta.timeZone!));}catch{throw new Error('An existing scheduled activity has an ambiguous time; correct it before Apply');}const slots=state.planning.slots.filter(s=>Date.parse(s.start)===start);if(slots.length!==1)throw new Error('An existing scheduled activity needs a matching declared time slot before Apply');return[{option_id:card.id,slot_id:slots[0]!.slot_id,household_ids:[...slots[0]!.household_ids]}];});
 const checked=checkScheduleFeasibility({...state.planning,as_of:new Date().toISOString()},[...assignments,...placed],receipt.denied);if(checked.status==='infeasible')throw new Error('Selected changes break the declared constraints: '+checked.errors.join('; '));if(checked.status==='tentative'&&!allowTentative)throw new Error('Acknowledge the unconfirmed facts before applying tentative choices');
 checkReceipt(receipt,session,actor);receipt.release();receipts.delete(review);return applyProposal(session,actor,receipt.value.proposal,selected);
}
