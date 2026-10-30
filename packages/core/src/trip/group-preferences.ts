// MOT-105: the round/response contract. Merging and scoring belong to MOT-107/108.
import {z} from 'zod';

const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/, 'Use a stable ID, not a display name or path');
const revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const text=z.string().trim().min(1).max(2000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{
 const parsed=new Date(`${value}T00:00:00Z`);return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
},'Invalid source date');
const unique=<T,>(values:readonly T[])=>new Set(values).size===values.length;
export const groupRoundSchema=z.object({
 round_id:id,proposal_version:revision,kind:z.enum(['destination','city_venue']),city_id:id.optional(),
 option_ids:z.array(id).min(1).max(200).refine(unique,'Options must have distinct IDs'),
 rank_limit:z.union([z.literal(3),z.literal(5)]),household_weighting:z.literal('one_household_one_vote'),
}).strict().refine(round=>round.kind==='destination'?round.city_id===undefined:round.city_id!==undefined,'Only city venue rounds require a city ID');
export const groupPreferencesSchema=z.object({
 version:z.literal(1),trip_id:id,
 households:z.array(z.object({household_id:id,display_name:z.string().trim().min(1).max(200)}).strict()).min(1).max(100),
 rounds:z.array(groupRoundSchema).min(1).max(100),
}).strict().refine(group=>unique(group.households.map(h=>h.household_id)),'A household has one stable voter ID')
 .refine(group=>unique(group.rounds.map(r=>`${r.proposal_version}:${r.round_id}`)),'Round IDs must be distinct within each proposal')
 .refine(group=>unique(group.rounds.filter(r=>r.kind==='destination').map(r=>r.proposal_version)),'Destination packages share one trip-level destination round');
export type GroupPreferences=z.infer<typeof groupPreferencesSchema>;

const constraint=z.object({id,status:z.enum(['confirmed','inferred','unknown']),text,source:text,source_date:date.nullable(),sharing:z.literal('shared')}).strict();
const responseBase=z.object({
 version:z.literal(1),trip_id:id,proposal_version:revision,round_id:id,household_id:id,response_revision:revision,
 rankings:z.array(z.object({option_id:id,rank:z.number().int().min(1).max(5)}).strict()).max(5),
 stamps:z.array(z.object({option_id:id,value:z.enum(['approved','maybe','denied'])}).strict()).max(200),
 shared_note:z.string().max(4000),constraints:z.array(constraint).max(50),responded_at:z.iso.datetime({offset:true}),
}).strict();
const validResponse=(response:z.infer<typeof responseBase>)=>unique(response.rankings.map(r=>r.option_id))&&unique(response.rankings.map(r=>r.rank))
 &&response.rankings.every(r=>r.rank<=response.rankings.length)&&unique(response.stamps.map(s=>s.option_id))&&unique(response.constraints.map(c=>c.id));
export const groupResponseSchema=responseBase.extend({response_id:z.string().regex(/^[a-f0-9]{64}$/)}).refine(validResponse,'Ranks must be unique and contiguous; stamps and constraints must be unique');
const responseBodySchema=responseBase.refine(validResponse,'Ranks must be unique and contiguous; stamps and constraints must be unique');
export type GroupResponse=z.infer<typeof groupResponseSchema>;
export const responseLedgerSchema=z.object({version:z.literal(1),trip_id:groupPreferencesSchema.shape.trip_id,entries:z.array(z.object({response:groupResponseSchema,sender_resolved:z.boolean()}).strict()).max(1000)}).strict();

/** Canonical content identity, not a signature. Household labels never authenticate a sender. */
export async function createGroupResponse(raw:unknown):Promise<GroupResponse>{
 const parsed=responseBodySchema.parse(raw);
 const normalized={...parsed,rankings:[...parsed.rankings].sort((a,b)=>a.rank-b.rank),stamps:[...parsed.stamps].sort((a,b)=>a.option_id<b.option_id?-1:a.option_id>b.option_id?1:0),constraints:[...parsed.constraints].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)};
 const bytes=new TextEncoder().encode(JSON.stringify(normalized));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const response_id=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {...normalized,response_id};
}

/** Pure validation only: no vote is recorded, merged, ordered by clocks, or applied to the trip. */
export async function validateGroupResponse(raw:unknown,configuration:unknown,senderHouseholdId?:string){
 const response=groupResponseSchema.parse(raw),group=groupPreferencesSchema.parse(configuration);
 if(response.trip_id!==group.trip_id)throw new Error('Response belongs to another trip');
 const round=group.rounds.find(r=>r.round_id===response.round_id&&r.proposal_version===response.proposal_version);
 if(!round)throw new Error('Response belongs to another round or proposal version');
 if(!group.households.some(h=>h.household_id===response.household_id))throw new Error('Household is not in the declared voter roster');
 if(response.rankings.length>round.rank_limit)throw new Error('Response exceeds the declared rank limit');
 const known=new Set(round.option_ids);
 if([...response.rankings,...response.stamps].some(item=>!known.has(item.option_id)))throw new Error('Response contains an option outside this round');
 const {response_id,...body}=response,canonical=await createGroupResponse(body);
 if(response_id!==canonical.response_id)throw new Error('Response content hash does not match');
 const familiar=senderHouseholdId===response.household_id;
 return {response:canonical,identity:'label_only' as const,sender_context:familiar?'matching_household_label' as const:'unfamiliar' as const,requires_resolution:!familiar};
}

/** Declared rounds cannot be silently reinterpreted after replies have been sent out. */
export function validateGroupUpdate(previous:GroupPreferences|undefined,next:GroupPreferences,boardId:string):void{
 if(next.trip_id!==(previous?.trip_id??boardId))throw new Error('Group trip ID cannot change');
 if(!previous)return;
 if(previous.households.some(h=>!next.households.some(n=>n.household_id===h.household_id)))throw new Error('Keep existing household IDs when changing display names');
 for(const old of previous.rounds){
  const declared=next.rounds.find(r=>r.round_id===old.round_id&&r.proposal_version===old.proposal_version);
  if(JSON.stringify(declared)!==JSON.stringify(old))throw new Error('Keep declared rounds unchanged; declare a new proposal version');
 }
}
