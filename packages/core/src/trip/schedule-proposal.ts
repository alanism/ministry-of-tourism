import {groupPreferencesSchema,type GroupResponse} from './group-preferences.ts';
import {mergeResponseLedger} from './response-ledger.ts';
import {groupPolicySchema,confirmedFact,planningProblemSchema,type PlanningProblem,type ScheduleAssignment} from './planning-constraints.ts';
import {evaluateSchedule,type DeniedAttendance} from './schedule-feasibility.ts';

export {groupPolicySchema,DEFAULT_GROUP_POLICY} from './planning-constraints.ts';
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
function eligible(p:PlanningProblem,a:ScheduleAssignment,id:string,denied:readonly DeniedAttendance[]){
 const h=p.households.find(h=>h.household_id===id),activity=p.activities.find(x=>x.option_id===a.option_id),slot=p.slots.find(s=>s.slot_id===a.slot_id)??p.commitments.find(c=>`fixed:${c.id}`===a.slot_id),access=activity?.access.find(x=>x.household_id===id)?.allowed;
 return !!h&&!!slot&&!!access&&a.household_ids.includes(id)&&confirmedFact(h.attendance,p.as_of)&&(!h.attendance.valid_until||Date.parse(h.attendance.valid_until)>=Date.parse(slot.end))&&h.attendance.value===true&&confirmedFact(access,p.as_of)&&(!access.valid_until||Date.parse(access.valid_until)>=Date.parse(slot.end))&&access.value===true&&confirmedFact(h.availability,p.as_of)&&(!h.availability.valid_until||Date.parse(h.availability.valid_until)>=Date.parse(slot.end))&&h.availability.value.some(w=>Date.parse(w.start)<=Date.parse(slot.start)&&Date.parse(w.end)>=Date.parse(slot.end))&&!denied.some(d=>d.household_id===id&&d.option_id===a.option_id);
}
export function scoreGroupSchedule(p:PlanningProblem,assignments:ScheduleAssignment[],responses:GroupResponse[],rankLimit:3|5){
 const denied=responses.flatMap(r=>r.stamps.filter(s=>s.value==='denied').map(s=>({household_id:r.household_id,option_id:s.option_id})));let top_two=0,first_choice=0,points=0;
 const participating=[...assignments,...p.commitments.filter(c=>c.kind==='fixed_booking'&&c.option_id).map(c=>({option_id:c.option_id!,slot_id:`fixed:${c.id}`,household_ids:c.household_ids}))];
 for(const r of responses){const chosen=new Set(participating.filter(a=>eligible(p,a,r.household_id,denied)).map(a=>a.option_id)),matched=r.rankings.filter(rank=>chosen.has(rank.option_id));if(matched.some(r=>r.rank<=2))top_two++;if(matched.some(r=>r.rank===1))first_choice++;points+=matched.reduce((sum,r)=>sum+rankLimit+1-r.rank,0);}
 return{top_two,first_choice,points,travel_minutes:evaluateSchedule(p,assignments,denied,true).travel_minutes};
}

/** Bounded deterministic beam plus one-option local swaps. A heuristic, never a global optimum claim. */
export async function proposeGroupSchedule(configuration:unknown,ledger:unknown,rawProblem:unknown,rawPolicy:unknown){
 const group=groupPreferencesSchema.parse(configuration),p=planningProblemSchema.parse(rawProblem),policy=groupPolicySchema.parse(rawPolicy),round=group.rounds.find(r=>r.proposal_version===p.proposal_version&&r.round_id===p.round_id);
 if(group.trip_id!==p.trip_id||!round||p.proposal_version!==Math.max(...group.rounds.map(r=>r.proposal_version))||p.households.some(h=>!group.households.some(g=>g.household_id===h.household_id))||p.activities.some(a=>!round.option_ids.includes(a.option_id)))throw new Error('Planning problem must match a declared current trip, round, households and options');
 const merged=await mergeResponseLedger(group,ledger,[]),responses=merged.current.filter(r=>r.round_id===p.round_id&&r.proposal_version===p.proposal_version),denied=responses.flatMap(r=>r.stamps.filter(s=>s.value==='denied').map(s=>({household_id:r.household_id,option_id:s.option_id})));
 const scored=(assignments:ScheduleAssignment[],partial=false)=>{const score=scoreGroupSchedule(p,assignments,responses,round.rank_limit);return{assignments,objective:score,feasibility:evaluateSchedule(p,assignments,denied,partial)};};
 type Candidate=ReturnType<typeof scored>;
 const key=(c:Candidate)=>JSON.stringify(c.assignments.map(a=>[a.slot_id,a.option_id,[...a.household_ids].sort(compare)]));
 const order=(a:Candidate,b:Candidate)=>{for(const criterion of policy.criteria){if(criterion==='feasibility')continue;const field=criterion==='participating_points'?'points':criterion==='travel'?'travel_minutes':criterion,difference=criterion==='travel'?a.objective[field]-b.objective[field]:b.objective[field]-a.objective[field];if(difference)return difference;}return compare(key(a),key(b));};
 const slots=[...p.slots].sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)||compare(a.slot_id,b.slot_id)),activities=[...p.activities].sort((a,b)=>compare(a.option_id,b.option_id));
 let beam:Candidate[]=[scored([],true)],evaluated=1;
 for(const slot of slots){
  const next:Candidate[]=[];
  for(const prior of beam){next.push(prior);for(const activity of activities){if(evaluated>=6000)break;if(prior.assignments.some(a=>a.option_id===activity.option_id)||p.commitments.some(c=>c.kind==='fixed_booking'&&c.option_id===activity.option_id))continue;
   const parties=[slot.household_ids,...p.split_groups.filter(s=>s.option_id===activity.option_id).map(s=>s.household_ids)].map(ids=>[...ids].sort(compare));
   for(const household_ids of parties){const candidate=scored([...prior.assignments,{slot_id:slot.slot_id,option_id:activity.option_id,household_ids}],true);evaluated++;if(candidate.feasibility.status!=='infeasible')next.push(candidate);}
  }}
  beam=[...new Map(next.sort(order).map(c=>[key(c),c])).values()].slice(0,32);
 }
 let candidates=beam.map(c=>scored(c.assignments)).filter(c=>c.feasibility.status!=='infeasible').sort(order);
 // Local swaps rescue candidates pruned while later dependencies or opening windows were unknown.
 for(const base of candidates.slice(0,8))for(let i=0;i<base.assignments.length;i++)for(const activity of activities){if(evaluated>=6000)break;if(p.commitments.some(c=>c.kind==='fixed_booking'&&c.option_id===activity.option_id))continue;if(base.assignments.some((a,j)=>j!==i&&a.option_id===activity.option_id))continue;const changed=base.assignments.map((a,j)=>j===i?{...a,option_id:activity.option_id}:a),candidate=scored(changed);evaluated++;if(candidate.feasibility.status!=='infeasible')candidates.push(candidate);}
 candidates=candidates.sort(order);if(!candidates.length)return{policy,heuristic:'Bounded beam and local swaps; not a global optimum proof.',evaluated,best:null,alternatives:[],omissions:activities.map(a=>({option_id:a.option_id,reasons:['No feasible candidate under the declared constraints']})),pending_households:group.households.filter(h=>!responses.some(r=>r.household_id===h.household_id)).map(h=>h.household_id).sort(compare),partial_households:responses.filter(r=>r.rankings.length<round.rank_limit).map(r=>r.household_id).sort(compare),unknown_acceptability:[]};
 const seen=new Set<string>(),unique=candidates.filter(c=>{const set=[...c.assignments.map(a=>a.option_id)].sort(compare).join('|');if(seen.has(set))return false;seen.add(set);return true;}),best=candidates[0]!;
 const omissions=activities.filter(a=>!best.assignments.some(s=>s.option_id===a.option_id)).map(activity=>{const tests=slots.map(s=>evaluateSchedule(p,[{option_id:activity.option_id,slot_id:s.slot_id,household_ids:s.household_ids}],denied,true));const reasons=[...new Set(tests.flatMap(t=>t.errors))].sort(compare);return{option_id:activity.option_id,reasons:tests.every(t=>t.status==='infeasible')?reasons:['Other feasible options improve earlier fairness criteria or participating points']};});
 return{policy,heuristic:'Bounded beam (32), up to 6000 evaluations and one-option local swaps; not a global optimum proof.',evaluated,best,alternatives:unique.filter(c=>key(c)!==key(best)).slice(0,3),omissions,pending_households:group.households.filter(h=>!responses.some(r=>r.household_id===h.household_id)).map(h=>h.household_id).sort(compare),partial_households:responses.filter(r=>r.rankings.length<round.rank_limit).map(r=>r.household_id).sort(compare),unknown_acceptability:best.assignments.flatMap(a=>a.household_ids.filter(id=>!responses.find(r=>r.household_id===id)?.stamps.some(s=>s.option_id===a.option_id)).map(household_id=>({option_id:a.option_id,household_id})))};
}

export type GroupPlanningResult=Awaited<ReturnType<typeof proposeGroupSchedule>>;
