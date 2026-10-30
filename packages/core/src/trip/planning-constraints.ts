import {z} from 'zod';
import {responseLedgerSchema,groupRoundSchema} from './group-preferences.ts';

const id=groupRoundSchema.shape.round_id,ids=z.array(id).min(1).max(100).refine(a=>new Set(a).size===a.length);
export const planningFact=<T extends z.ZodType>(value:T)=>z.object({value:value.nullable(),status:z.enum(['confirmed','inferred','unknown']),source:z.string().min(1).max(2000),source_date:z.iso.date().nullable(),valid_until:z.iso.datetime({offset:true}).nullable()}).strict();
export const planningIntervalSchema=z.object({start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true})}).strict().refine(w=>Date.parse(w.end)>Date.parse(w.start),'End must follow start');
const intervals=z.array(planningIntervalSchema).max(100),minutes=z.number().int().nonnegative().max(10080);
export const scheduleAssignmentSchema=z.object({slot_id:id,option_id:id,household_ids:ids}).strict();
export const scheduleAssignmentsSchema=z.array(scheduleAssignmentSchema).max(100);
export const planningProblemSchema=z.object({
 version:z.literal(1),trip_id:id,proposal_version:groupRoundSchema.shape.proposal_version,round_id:id,as_of:z.iso.datetime({offset:true}),currency:z.string().regex(/^[A-Z]{3}$/),
 budget:planningFact(z.number().nonnegative().max(1e9)),travel_minutes:planningFact(minutes),
 households:z.array(z.object({household_id:id,attendance:planningFact(z.boolean()),availability:planningFact(intervals),rest_minutes:planningFact(minutes)}).strict()).min(1).max(100),
 activities:z.array(z.object({option_id:id,duration_minutes:planningFact(minutes.positive()),cost:planningFact(z.number().nonnegative().max(1e9)),opening:planningFact(intervals),reservation:planningFact(z.enum(['not_required','available','unavailable','unknown'])),access:z.array(z.object({household_id:id,allowed:planningFact(z.boolean())}).strict()).max(100)}).strict()).min(1).max(200),
 slots:z.array(z.object({slot_id:id,start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),household_ids:ids}).strict().refine(s=>Date.parse(s.end)>Date.parse(s.start))).min(1).max(30),
 commitments:z.array(z.object({id,kind:z.enum(['fixed_booking','meal','rest']),option_id:id.optional(),start:z.iso.datetime({offset:true}),end:z.iso.datetime({offset:true}),household_ids:ids}).strict().refine(s=>Date.parse(s.end)>Date.parse(s.start))).max(100),
 rules:z.array(z.discriminatedUnion('kind',[
  z.object({kind:z.literal('and'),option_ids:ids}).strict(),z.object({kind:z.literal('at_most_one'),option_ids:ids}).strict(),z.object({kind:z.literal('exactly_one'),option_ids:ids}).strict(),
  z.object({kind:z.literal('before'),first:id,then:id}).strict(),z.object({kind:z.literal('only_if'),option_id:id,requires:id}).strict(),
 ])).max(100),
 split_groups:z.array(z.object({option_id:id,household_ids:ids,permission:planningFact(z.boolean()),supervision:planningFact(z.boolean()),transport:planningFact(z.boolean())}).strict()).max(100),
}).strict().superRefine((p,ctx)=>{
 const h=new Set(p.households.map(h=>h.household_id)),a=new Set(p.activities.map(a=>a.option_id));
 if(h.size!==p.households.length||a.size!==p.activities.length||new Set(p.slots.map(s=>s.slot_id)).size!==p.slots.length||new Set(p.commitments.map(c=>c.id)).size!==p.commitments.length)ctx.addIssue({code:'custom',message:'Households, activities, slots and commitments need distinct stable IDs'});
 const participants=[...p.slots,...p.commitments,...p.split_groups].flatMap(s=>s.household_ids),options=p.rules.flatMap(r=>'option_ids'in r?r.option_ids:r.kind==='before'?[r.first,r.then]:[r.option_id,r.requires]);
 if(participants.some(id=>!h.has(id))||p.activities.some(a=>a.access.some(x=>!h.has(x.household_id))||new Set(a.access.map(x=>x.household_id)).size!==a.access.length)||[...options,...p.split_groups.map(s=>s.option_id)].some(id=>!a.has(id)))ctx.addIssue({code:'custom',message:'Constraint refers to an undeclared household or activity'});
});
export type PlanningProblem=z.infer<typeof planningProblemSchema>;
export type ScheduleAssignment=z.infer<typeof scheduleAssignmentSchema>;
export type PlanningEvidence<T>={value:T|null;status:'confirmed'|'inferred'|'unknown';source:string;source_date:string|null;valid_until:string|null};
export function confirmedFact<T>(fact:PlanningEvidence<T>,asOf:string):fact is PlanningEvidence<T>&{value:T}{return fact.status==='confirmed'&&fact.value!==null&&fact.source_date!==null&&fact.source_date<=new Date(asOf).toISOString().slice(0,10)&&(!fact.valid_until||Date.parse(fact.valid_until)>=Date.parse(asOf));}

export const groupPolicySchema=z.object({id:z.literal('mot-group-planning'),version:z.literal(1),criteria:z.union([z.tuple([z.literal('feasibility'),z.literal('top_two'),z.literal('first_choice'),z.literal('participating_points'),z.literal('travel')]),z.tuple([z.literal('feasibility'),z.literal('participating_points'),z.literal('top_two'),z.literal('first_choice'),z.literal('travel')])])}).strict();
export const DEFAULT_GROUP_POLICY=groupPolicySchema.parse({id:'mot-group-planning',version:1,criteria:['feasibility','top_two','first_choice','participating_points','travel']});
export const groupWorkspaceSchema=z.object({version:z.literal(1),policy:groupPolicySchema,planning:planningProblemSchema.optional(),ledger:responseLedgerSchema.optional()}).strict();
