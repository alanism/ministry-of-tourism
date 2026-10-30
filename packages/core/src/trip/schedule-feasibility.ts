import {confirmedFact,planningProblemSchema,scheduleAssignmentsSchema,type PlanningProblem,type ScheduleAssignment,type PlanningEvidence} from './planning-constraints.ts';

export interface DeniedAttendance {household_id:string;option_id:string;}
const overlaps=(a:{start:string;end:string},b:{start:string;end:string})=>Date.parse(a.start)<Date.parse(b.end)&&Date.parse(b.start)<Date.parse(a.end);
const covers=(windows:{start:string;end:string}[],slot:{start:string;end:string})=>{let through=Date.parse(slot.start);for(const w of [...windows].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))){if(Date.parse(w.start)>through)break;through=Math.max(through,Date.parse(w.end));if(through>=Date.parse(slot.end))return true;}return false;};
/** Internal typed checker also supports partial search states; final checks enforce required dependencies. */
export function evaluateSchedule(p:PlanningProblem,assignments:ScheduleAssignment[],denied:readonly DeniedAttendance[]=[],partial=false){
 const errors:string[]=[],tentative:string[]=[],timeBlocks=p.commitments.map(c=>({...c,label:`${c.kind} ${c.id}`}));
 const scale=10**(new Intl.NumberFormat('en',{style:'currency',currency:p.currency}).resolvedOptions().maximumFractionDigits??2);let cost=0,travel=0;
 const known=<T,>(f:PlanningEvidence<T>,label:string,at=p.as_of)=>{if(confirmedFact(f,p.as_of)&&(!f.valid_until||Date.parse(f.valid_until)>=Date.parse(at)))return true;tentative.push(`${label} is unconfirmed, missing or stale (source: ${f.source}; date: ${f.source_date??'unknown'})`);return false;};
 const selected=new Set(assignments.map(a=>a.option_id));
 if(selected.size!==assignments.length)errors.push('An activity cannot occupy duplicate slots');
 if(new Set(assignments.map(a=>a.slot_id)).size!==assignments.length)errors.push('A slot can contain only one activity');
 for(const a of assignments){
  const slot=p.slots.find(s=>s.slot_id===a.slot_id)!,activity=p.activities.find(x=>x.option_id===a.option_id)!;
  const subset=a.household_ids.length!==slot.household_ids.length||slot.household_ids.some(id=>!a.household_ids.includes(id));
  if(a.household_ids.some(id=>!slot.household_ids.includes(id)))errors.push(`${a.option_id}: participant is outside this slot`);
  if(subset){const split=p.split_groups.find(s=>s.option_id===a.option_id&&s.household_ids.length===a.household_ids.length&&s.household_ids.every(id=>a.household_ids.includes(id)));if(!split||![split.permission,split.supervision,split.transport].every(f=>confirmedFact(f,p.as_of)&&f.value===true))errors.push(`${a.option_id}: split needs confirmed permission, supervision and transport`);}
  if(known(activity.duration_minutes,`${a.option_id} duration`,slot.end)&&activity.duration_minutes.value!>(Date.parse(slot.end)-Date.parse(slot.start))/60000)errors.push(`${a.option_id}: duration exceeds slot`);
  if(known(activity.opening,`${a.option_id} opening hours`,slot.end)&&!covers(activity.opening.value!,slot))errors.push(`${a.option_id}: venue is closed during this slot`);
  if(known(activity.reservation,`${a.option_id} reservation`,slot.end)){if(activity.reservation.value==='unavailable')errors.push(`${a.option_id}: reservation unavailable`);if(activity.reservation.value==='unknown')tentative.push(`${a.option_id}: opening hours do not establish reservation availability`);}
  if(known(activity.cost,`${a.option_id} cost`,slot.end))cost+=Math.round(activity.cost.value!*scale);
  for(const id of a.household_ids){
   const h=p.households.find(h=>h.household_id===id)!,access=activity.access.find(x=>x.household_id===id);
   if(denied.some(d=>d.household_id===id&&d.option_id===a.option_id))errors.push(`${a.option_id}: household ${id} denied participation`);
   if(known(h.attendance,`${id} attendance`,slot.end)&&h.attendance.value===false)errors.push(`${id}: not intending to attend`);
   if(known(h.availability,`${id} availability`,slot.end)&&!covers(h.availability.value!,slot))errors.push(`${id}: unavailable for ${a.option_id}`);
   if(!access)tentative.push(`${a.option_id}: access for ${id} unknown (source: not supplied)`);else if(known(access.allowed,`${a.option_id} access for ${id}`,slot.end)&&access.allowed.value===false)errors.push(`${a.option_id}: inaccessible for ${id}`);
  }
  timeBlocks.push({...slot,label:a.option_id,kind:'fixed_booking',id:a.option_id,option_id:a.option_id,household_ids:a.household_ids});
 }
 for(const fixed of p.commitments.filter(c=>c.kind==='fixed_booking')){
  const activity=p.activities.find(a=>a.option_id===fixed.option_id);
  if(activity&&!selected.has(activity.option_id)&&known(activity.cost,`${activity.option_id} booked cost`,fixed.end))cost+=Math.round(activity.cost.value!*scale);
  for(const id of fixed.household_ids){
   if(denied.some(d=>d.household_id===id&&d.option_id===fixed.option_id))errors.push(`${fixed.option_id}: booked household ${id} denied participation`);
   const access=activity?.access.find(a=>a.household_id===id)?.allowed;if(access&&known(access,`${fixed.option_id} booked access for ${id}`,fixed.end)&&access.value===false)errors.push(`${fixed.option_id}: inaccessible booked activity for ${id}`);
  }
 }
 const lastEnd=[...assignments.map(a=>p.slots.find(s=>s.slot_id===a.slot_id)!.end),...p.commitments.map(c=>c.end)].sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??p.as_of;
 const budgetKnown=known(p.budget,'Group budget',lastEnd);if(budgetKnown&&cost>Math.round(p.budget.value!*scale))errors.push(`Confirmed cost ${cost/scale} ${p.currency} exceeds budget ${p.budget.value}`);
 for(const h of p.households){
  const blocks=timeBlocks.filter(b=>b.household_ids.includes(h.household_id)).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)||a.label.localeCompare(b.label));
  for(let i=1;i<blocks.length;i++){
   const a=blocks[i-1]!,b=blocks[i]!;if(overlaps(a,b)){errors.push(`${h.household_id}: overlapping ${a.label} and ${b.label}`);continue;}
   const travelKnown=known(p.travel_minutes,'Travel buffer',b.end),restKnown=known(h.rest_minutes,`${h.household_id} rest buffer`,b.end),gap=(Date.parse(b.start)-Date.parse(a.end))/60000;
   if(travelKnown)travel+=p.travel_minutes.value!;
   if(gap<(travelKnown?p.travel_minutes.value!:0)+(restKnown?h.rest_minutes.value!:0))errors.push(`${h.household_id}: insufficient travel and rest buffer`);
  }
 }
 const allSelected=new Set([...selected,...p.commitments.filter(c=>c.kind==='fixed_booking'&&c.option_id).map(c=>c.option_id!)]);
 for(const rule of p.rules){
  if('option_ids'in rule){const n=rule.option_ids.filter(id=>allSelected.has(id)).length;if(rule.kind==='and'&&n>0&&n<rule.option_ids.length&&!partial)errors.push('AND dependency missing');if((rule.kind==='at_most_one'||rule.kind==='exactly_one')&&n>1)errors.push('At most one alternative may be selected');if(rule.kind==='exactly_one'&&n===0&&!partial)errors.push('A required exactly-one choice is missing');}
  else if(rule.kind==='only_if'){if(allSelected.has(rule.option_id)&&!allSelected.has(rule.requires)&&!partial)errors.push(`${rule.option_id} requires ${rule.requires}`);}
  else {const find=(id:string)=>timeBlocks.find(b=>b.option_id===id),a=find(rule.first),b=find(rule.then);if(a&&b&&Date.parse(a.end)>Date.parse(b.start))errors.push(`${rule.first} must finish before ${rule.then}`);}
 }
 const unique=(a:string[])=>[...new Set(a)].sort();return{status:errors.length?'infeasible' as const:tentative.length?'tentative' as const:'feasible' as const,errors:unique(errors),tentative:unique(tentative),confirmed_cost:cost/scale,currency:p.currency,travel_minutes:travel,fixed:structuredClone(p.commitments)};
}
export function checkScheduleFeasibility(raw:unknown,placements:unknown,denied:readonly DeniedAttendance[]=[],partial=false){
 const p=planningProblemSchema.parse(raw),assignments=scheduleAssignmentsSchema.parse(placements),h=new Set(p.households.map(h=>h.household_id));
 if(assignments.some(a=>!p.slots.some(s=>s.slot_id===a.slot_id)||!p.activities.some(x=>x.option_id===a.option_id)||a.household_ids.some(id=>!h.has(id))))throw new Error('Assignment refers to an unknown slot, activity or participant');
 return evaluateSchedule(p,assignments,denied,partial);
}

export type ScheduleFeasibilityResult=ReturnType<typeof checkScheduleFeasibility>;
