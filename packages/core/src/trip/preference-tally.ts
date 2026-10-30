// MOT-108: deterministic, read-only tally of explicitly supplied current response data.
import {z} from 'zod';
import {groupPreferencesSchema,groupRoundSchema} from './group-preferences.ts';
import {mergeResponseLedger} from './response-ledger.ts';

export const preferenceRoundSchema=z.object({proposal_version:groupRoundSchema.shape.proposal_version,round_id:groupRoundSchema.shape.round_id}).strict();
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;

export async function tallyGroupPreferences(configuration:unknown,ledger:unknown,selection:unknown){
 const group=groupPreferencesSchema.parse(configuration),selected=preferenceRoundSchema.strict().parse(selection);
 const round=group.rounds.find(r=>r.round_id===selected.round_id&&r.proposal_version===selected.proposal_version);
 if(!round)throw new Error('Choose a declared round and proposal version');
 if(round.proposal_version!==Math.max(...group.rounds.map(r=>r.proposal_version)))throw new Error('This proposal is stale; tally a declared current round');
 const merged=await mergeResponseLedger(group,ledger,[]),matches=(r:{proposal_version:number;round_id:string})=>r.proposal_version===round.proposal_version&&r.round_id===round.round_id;
 const responses=merged.current.filter(matches),conflicts=merged.conflicts.filter(matches),unresolved_households=[...new Set(merged.ledger.entries.filter(e=>!e.sender_resolved&&matches(e.response)).map(e=>e.response.household_id))].sort(compare);
 const options=[...round.option_ids].sort(compare).map(option_id=>({option_id,points:0,stamps:{approved:[] as string[],maybe:[] as string[],denied:[] as string[]}}));
 const byOption=new Map(options.map(option=>[option.option_id,option]));
 const households=[...group.households].sort((a,b)=>compare(a.household_id,b.household_id)).map(({household_id})=>{
  const response=responses.find(r=>r.household_id===household_id);
  const status=response?(response.rankings.length===round.rank_limit?'complete' as const:'partial' as const):conflicts.some(c=>c.household_id===household_id)?'conflict' as const:unresolved_households.includes(household_id)?'needs_resolution' as const:'pending' as const;
  let points=0;
  for(const ranking of response?.rankings??[]){const earned=round.rank_limit+1-ranking.rank;byOption.get(ranking.option_id)!.points+=earned;points+=earned;}
  for(const stamp of response?.stamps??[])byOption.get(stamp.option_id)!.stamps[stamp.value].push(household_id);
  return {household_id,status,ranked_count:response?.rankings.length??0,points};
 });
 // Canonicalize all explicitly shared concerns by household, then stable constraint ID.
 const ordered=[...responses].sort((a,b)=>compare(a.household_id,b.household_id));
 return {
  trip_id:group.trip_id,proposal_version:round.proposal_version,round_id:round.round_id,
  policy:{id:'mot-household-sticker-points',version:1,rank_limit:round.rank_limit,household_weighting:'one_household_one_vote',unranked_points:0,unused_points:'not_redistributed',tie_break:'none',display_order:'option_id'},
  total_points:households.reduce((sum,h)=>sum+h.points,0),options,households,
  coverage:{total:households.length,responding:responses.length,pending:households.filter(h=>h.status==='pending').length,partial:households.filter(h=>h.status==='partial').length,complete:households.filter(h=>h.status==='complete').length,conflicting:conflicts.length,needs_resolution:households.filter(h=>h.status==='needs_resolution').length},
  unresolved_households,conflicts,
  shared_notes:ordered.filter(r=>r.shared_note!=='').map(r=>({household_id:r.household_id,text:r.shared_note})),
  constraints:ordered.flatMap(r=>r.constraints.map(c=>({household_id:r.household_id,...c}))),
  identity:'household_labels_only',
 };
}
export type PreferenceTally=Awaited<ReturnType<typeof tallyGroupPreferences>>;
