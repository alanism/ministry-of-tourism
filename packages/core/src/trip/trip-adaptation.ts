// During-trip next step and local adaptation (MOT-114). Reads only board state; returns an ordinary
// proposal the person applies (and undoes) through the existing proposal path. Confirmed bookings,
// private cards and other days are never changed here.
import { readAllCards, readTripMeta } from './model.ts';
import { localDateFor, type TripCard } from './schema.ts';
import type { Proposal, ProposalOp } from './proposals.ts';
import type { TripSession } from './session.ts';
import { isExpired } from './workflow-routing.ts';
import {z} from 'zod';
import {CommandError} from '../commands/define.ts';
import type {Actor} from '../doc/model.ts';
import {applyProposal} from './proposals.ts';
import {confirmedFact,planningProblemSchema,type PlanningProblem,type ScheduleAssignment} from './planning-constraints.ts';
import {groupPreferencesSchema} from './group-preferences.ts';
import {mergeResponseLedger} from './response-ledger.ts';
import {evaluateSchedule} from './schedule-feasibility.ts';
import {tripLocalInstant} from './group-plan-review.ts';
import {validatePlanningGroup} from './group-workspace.ts';

export interface NextStep {
  card: { id: string; title: string; body: string; stage: string };
  when: { day: string; time?: string; timeZone: string; confidence: 'scheduled' | 'day_only' };
  source: { kind: TripCard['provenance']; label: string; retrievedAt?: string; url?: string };
  booking: 'confirmed' | 'held' | 'not_booked' | 'unknown';
  preparation: string[];
  facts: { field: string; value: string; observedAt: string; stale: boolean }[];
  route: { status: 'unavailable'; reason: string };
}

const SOURCE_LABEL: Record<TripCard['provenance'], string> = { host: 'From your host', traveler: 'Your own entry', fcc: 'From FCC', agent: 'Suggested by an agent and approved by you', provider: 'From a provider' };
const live = (card: TripCard) => card.scope !== 'private' && card.kind !== 'brief' && card.status !== 'done';
const nowTime = (instant: Date, timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant);
const byWhen = (a: TripCard, b: TripCard) => a.day!.localeCompare(b.day!) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99') || a.id.localeCompare(b.id);

/** The next open activity in the trip's time zone, with where its details came from. No invented real-time facts. */
export function nextStep(session: TripSession, instant: Date = new Date()): NextStep | null {
  const meta = readTripMeta(session.doc);
  if (!meta.timeZone) return null;
  const today = localDateFor(instant, meta.timeZone), time = nowTime(instant, meta.timeZone);
  const cards = readAllCards(session.parts).filter(live);
  const card = cards.filter(c => c.kind!=='task' && c.day && (c.day > today || (c.day === today && (!c.time || c.time >= time)))).sort(byWhen)[0];
  if (!card) return null;
  const facts = (card.currentFacts ?? []).map(f => ({ field: f.field, value: f.value, observedAt: f.observedAt, stale: isExpired(f.validUntil, instant) }));
  const preparation = [
    ...(card.body.trim() ? [card.body.trim().slice(0, 280)] : []),
    ...cards.filter(c => c.kind === 'task' && c.day === card.day && c.id !== card.id).sort(byWhen).map(c => `Task: ${c.title}`),
    ...(card.booking ? [] : ['Booking status is not recorded on this card.']),
  ];
  return {
    card: { id: card.id, title: card.title, body: card.body, stage: card.stage },
    when: { day: card.day!, ...(card.time ? { time: card.time } : {}), timeZone: meta.timeZone, confidence: card.time ? 'scheduled' : 'day_only' },
    source: { kind: card.provenance, label: SOURCE_LABEL[card.provenance], ...(card.source?.retrievedAt ? { retrievedAt: card.source.retrievedAt } : {}), ...(card.source?.canonicalUrl ?? card.source?.url ? { url: card.source.canonicalUrl ?? card.source.url } : {}) },
    booking: card.booking?.status ?? 'unknown', preparation, facts,
    route: { status: 'unavailable', reason: 'No verified route or travel-time provider is connected. Travel time is unknown.' },
  };
}

const day=z.iso.date(),time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const tripChangeSchema=z.discriminatedUnion('kind',[z.object({kind:z.literal('delay'),day,until:time}).strict(),z.object({kind:z.literal('energy'),day,level:z.literal('low'),after:time.optional()}).strict(),z.object({kind:z.literal('weather'),day,note:z.string().max(500).optional()}).strict()]);
export type TripChange=z.infer<typeof tripChangeSchema>;
export const adaptationContextSchema=z.object({configuration:groupPreferencesSchema,ledger:z.unknown().optional(),planning:planningProblemSchema}).strict();
type Feasibility=ReturnType<typeof evaluateSchedule>;
export interface AdaptationPlan {
 change:TripChange;revision:number;changes:{id:string;title:string;from:string;to:string}[];preserved:{id:string;title:string;reason:string}[];conflicts:{id:string;title:string;detail:string}[];alternatives:{id:string;title:string;why:string}[];assumptions:string[];unknowns:string[];proposal:Proposal|null;feasibility:Feasibility|null;
 check?:{planning:PlanningProblem;assignments:ScheduleAssignment[];denied:{household_id:string;option_id:string}[]};
}

/** Local adjustment only. The owner view reads the native workspace; agent callers must deliberately supply planning data. */
export async function planTripAdaptation(session:TripSession,raw:unknown,options:{ownerView?:boolean;context?:unknown;newId?:()=>string}={}):Promise<AdaptationPlan>{
 const change=tripChangeSchema.parse(raw),revision=session.boardRev,plan:AdaptationPlan={change,revision,changes:[],preserved:[],conflicts:[],alternatives:[],assumptions:[],unknowns:[],proposal:null,feasibility:null};
 if(change.kind==='weather'){plan.unknowns.push('Verified weather and outdoor suitability are not recorded, so no weather move is proposed.');return plan;}
 if(!options.ownerView&&!options.context){plan.unknowns.push('Provide explicitly shared WP8 planning data, or use the owner Today view. No private planning context or duration is assumed.');return plan;}
 const meta=readTripMeta(session.doc);if(!meta.timeZone){plan.unknowns.push('Destination time zone is unknown.');return plan;}
 const context=options.context?adaptationContextSchema.parse(options.context):meta.groupPreferences&&meta.groupWorkspace?.planning?{configuration:meta.groupPreferences,ledger:meta.groupWorkspace.ledger,planning:meta.groupWorkspace.planning}:null;
 if(!context){plan.unknowns.push('Save dated WP8 planning facts and participant time slots first.');return plan;}
 const p=structuredClone(context.planning);p.as_of=new Date().toISOString();validatePlanningGroup(p,context.configuration);
 const declared=context.configuration.rounds.find(r=>r.proposal_version===p.proposal_version&&r.round_id===p.round_id);
 if(p.trip_id!==(meta.groupPreferences?.trip_id??meta.boardId)||p.proposal_version!==Math.max(...context.configuration.rounds.map(r=>r.proposal_version))||declared?.kind==='city_venue'&&declared.city_id!==meta.cityId||meta.dates&&(change.day<meta.dates.start||change.day>meta.dates.end)){plan.unknowns.push('Planning context is stale for the trip destination, dates or proposal. Review those facts first.');return plan;}
 const merged=await mergeResponseLedger(context.configuration,context.ledger,[]),responses=merged.current.filter(r=>r.round_id===p.round_id&&r.proposal_version===p.proposal_version),denied=responses.flatMap(r=>r.stamps.filter(s=>s.value==='denied').map(s=>({household_id:r.household_id,option_id:s.option_id})));
 const all=readAllCards(session.parts).filter(c=>live(c)&&c.kind!=='task'),today=all.filter(c=>c.day===change.day),fixed=(c:TripCard)=>c.booking?.status==='confirmed'||c.booking?.status==='held'||p.commitments.some(x=>x.kind==='fixed_booking'&&(x.option_id===c.id||x.id===c.id));
 const localTime=(iso:string)=>nowTime(new Date(iso),meta.timeZone!);
 for(const card of today.filter(fixed)){const window=p.commitments.find(c=>c.kind==='fixed_booking'&&(c.option_id===card.id||c.id===card.id));plan.preserved.push({id:card.id,title:card.title,reason:'Confirmed or held booking: unchanged; no cancellation or purchase.'});if(!window||card.day!==localDateFor(new Date(window.start),meta.timeZone)||card.time&&card.time!==localTime(window.start)){plan.unknowns.push(`Protected booking window is missing or differs from ${card.title}.`);return plan;}if(change.kind==='delay'&&card.time&&card.time<change.until)plan.conflicts.push({id:card.id,title:card.title,detail:'The fixed booking starts before the new arrival. Contact the provider; it is not moved or cancelled.'});}
 if(plan.conflicts.length)return plan;
 const affected=today.filter(c=>!fixed(c)&&!!c.time&&(change.kind==='delay'?c.time!<change.until:!change.after||c.time!>=change.after)).sort(byWhen);
 const bindings=new Map<string,ScheduleAssignment>();
 for(const card of all.filter(c=>c.day&&c.time&&p.activities.some(a=>a.option_id===c.id)&&!fixed(c))){const start=tripLocalInstant(`${card.day}T${card.time}`,meta.timeZone),slots=p.slots.filter(s=>Date.parse(s.start)===Date.parse(start));if(slots.length===1)bindings.set(card.id,{option_id:card.id,slot_id:slots[0]!.slot_id,household_ids:[...slots[0]!.household_ids]});}
 for(const card of affected){const activity=p.activities.find(a=>a.option_id===card.id),binding=bindings.get(card.id);if(!activity||!confirmedFact(activity.duration_minutes,p.as_of)||!binding){plan.unknowns.push(`${card.title}: a confirmed duration and unambiguous participant slot are needed.`);continue;}if(p.split_groups.some(g=>g.option_id===card.id&&g.household_ids.length<binding.household_ids.length))plan.unknowns.push(`${card.title}: the applied split party is not recorded unambiguously; no supervision or transport is invented.`);}
 if(plan.unknowns.length)return plan;
 const working=[...bindings.values()].filter(a=>!affected.some(c=>c.id===a.option_id));
 const ops:ProposalOp[]=[],points=new Map<string,number>(),K=declared!.rank_limit;
 for(const r of responses)for(const ranking of r.rankings)points.set(ranking.option_id,(points.get(ranking.option_id)??0)+K+1-ranking.rank);
 const energyKeep=change.kind==='energy'?[...affected].sort((a,b)=>(points.get(b.id)??0)-(points.get(a.id)??0)||byWhen(a,b))[0]?.id:undefined;
 if(change.kind==='energy')plan.assumptions.push('Low-energy proposal keeps one ranked remaining activity (earliest if no accepted preference distinguishes them); others stay as undated ideas. Fixed bookings remain.');
 let earliest=change.kind==='delay'?Date.parse(tripLocalInstant(`${change.day}T${change.until}`,meta.timeZone)):0;
 for(const card of affected){
  const binding=bindings.get(card.id)!,activity=p.activities.find(a=>a.option_id===card.id)!,slot=p.slots.find(s=>s.slot_id===binding.slot_id)!,duration=activity.duration_minutes.value!*60000;
  if(change.kind==='energy'&&card.id===energyKeep){working.push(binding);plan.preserved.push({id:card.id,title:card.title,reason:'Kept as the remaining optional activity.'});continue;}
  let found=false;
  if(change.kind==='delay'){
   const buffer=Math.max(...binding.household_ids.map(id=>{const h=p.households.find(h=>h.household_id===id)!;return(confirmedFact(p.travel_minutes,p.as_of)?p.travel_minutes.value:0)+(confirmedFact(h.rest_minutes,p.as_of)?h.rest_minutes.value:0);}))*60000;
   const anchors=[earliest,...(activity.opening.value??[]).map(w=>Date.parse(w.start)),...p.households.filter(h=>binding.household_ids.includes(h.household_id)).flatMap(h=>(h.availability.value??[]).map(w=>Date.parse(w.start))),...p.commitments.map(c=>Date.parse(c.end)+buffer),...working.map(a=>Date.parse(p.slots.find(s=>s.slot_id===a.slot_id)!.end)+buffer)].filter(t=>t>=earliest).sort((a,b)=>a-b);
   for(const start of [...new Set(anchors)]){const end=start+duration;if(localDateFor(new Date(start),meta.timeZone)!==change.day||localDateFor(new Date(end),meta.timeZone)!==change.day)continue;const candidate={...p,slots:p.slots.map(s=>s.slot_id===slot.slot_id?{...s,start:new Date(start).toISOString(),end:new Date(end).toISOString()}:s)},check=evaluateSchedule(candidate,[...working,binding],denied,true);if(check.status==='infeasible')continue;p.slots=candidate.slots;working.push(binding);const to=localTime(new Date(start).toISOString());plan.changes.push({id:card.id,title:card.title,from:card.time!,to});ops.push({command:'trip_card_update',input:{id:card.id,time:to}});earliest=end+buffer;found=true;break;}
  }
  if(!found){plan.changes.push({id:card.id,title:card.title,from:`${card.day} ${card.time}`,to:'flexible (no day)'});ops.push({command:'trip_card_update',input:{id:card.id,day:null,time:null}});if(change.kind==='delay')plan.conflicts.push({id:card.id,title:card.title,detail:'No permitted local slot fits the dated facts. Proposed as an undated idea, not cancelled.'});}
 }
 const checked=evaluateSchedule(p,working,denied);plan.feasibility=checked;plan.unknowns.push(...checked.tentative);
 if(checked.status==='infeasible'){plan.conflicts.push(...checked.errors.map(detail=>({id:'constraints',title:'Declared constraints',detail})));return plan;}
 if(affected.length){
  const target=bindings.get(affected[0]!.id)!,slot=p.slots.find(s=>s.slot_id===target.slot_id)!,buffer=Math.max(...target.household_ids.map(id=>{const h=p.households.find(h=>h.household_id===id)!;return(confirmedFact(p.travel_minutes,p.as_of)?p.travel_minutes.value:0)+(confirmedFact(h.rest_minutes,p.as_of)?h.rest_minutes.value:0);}))*60000;
  for(const card of all.filter(c=>!c.day&&!fixed(c)&&(c.kind==='place'||c.kind==='note')&&p.activities.some(a=>a.option_id===c.id)).sort((a,b)=>a.id.localeCompare(b.id))){
   const activity=p.activities.find(a=>a.option_id===card.id)!;if(!confirmedFact(activity.duration_minutes,p.as_of))continue;
   const anchors=[Date.parse(slot.start),...working.map(a=>Date.parse(p.slots.find(s=>s.slot_id===a.slot_id)!.end)+buffer),...p.commitments.map(c=>Date.parse(c.end)+buffer),...(activity.opening.value??[]).map(w=>Date.parse(w.start))].sort((a,b)=>a-b);
   for(const start of [...new Set(anchors)]){const end=start+activity.duration_minutes.value*60000;if(localDateFor(new Date(start),meta.timeZone)!==change.day||localDateFor(new Date(end),meta.timeZone)!==change.day||change.kind==='delay'&&localTime(new Date(start).toISOString())<change.until)continue;
    const alternative={...target,option_id:card.id},candidate={...p,slots:p.slots.map(s=>s.slot_id===slot.slot_id?{...s,start:new Date(start).toISOString(),end:new Date(end).toISOString()}:s)},checked=evaluateSchedule(candidate,[...working.filter(a=>a.slot_id!==slot.slot_id),alternative],denied);
    if(checked.status!=='infeasible'){plan.alternatives.push({id:card.id,title:card.title,why:`${checked.status==='tentative'?'Tentative':'Feasible'} alternative at ${localTime(new Date(start).toISOString())}; uses the declared duration and participant/access/buffer facts. Choose it separately.`});break;}
   }
  }
 }

 if(session.boardRev!==revision)throw new CommandError('stale','The trip changed while checking the adjustment; try again');
 if(ops.length){plan.proposal={id:`adapt-${(options.newId??(()=>crypto.randomUUID()))()}`,boardId:session.boardId,token:session.token(ops.map(op=>String(op.input.id))),ops,sources:[],reason:'Local adjustment checked against dated WP8 facts; no unrelated days, source notes or bookings changed.',author:'mot-adaptation',status:'proposed'};plan.check={planning:p,assignments:working,denied};}
 return plan;
}

export function applyTripAdaptation(session:TripSession,actor:Actor,plan:AdaptationPlan,allowTentative=false){
 if(!plan.proposal||!plan.check)throw new Error('There is no permitted adjustment to apply');if(session.boardRev!==plan.revision)throw new CommandError('stale','The trip changed after this adjustment was checked; nothing applied');
 const checked=evaluateSchedule({...plan.check.planning,as_of:new Date().toISOString()},plan.check.assignments,plan.check.denied);if(checked.status==='infeasible')throw new Error(checked.errors.join('; '));if(checked.status==='tentative'&&!allowTentative)throw new Error('Explicitly acknowledge the unconfirmed facts before applying this tentative adjustment');return applyProposal(session,actor,plan.proposal);
}
