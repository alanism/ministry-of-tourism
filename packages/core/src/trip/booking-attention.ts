import {z} from 'zod';
import {groupRoundSchema} from './group-preferences.ts';
import {planningFact,confirmedFact} from './planning-constraints.ts';

export const bookingAttentionSchema=z.object({option_id:groupRoundSchema.shape.round_id,activity_start:z.iso.datetime({offset:true}).nullable(),deadline:planningFact(z.iso.datetime({offset:true})),cost:planningFact(z.number().nonnegative().max(1e9)),importance:z.enum(['important','optional']),optional_promotion:z.boolean()}).strict();
export function bookingAttention(raw:unknown,asOf:string){
 const a=bookingAttentionSchema.parse(raw),now=z.iso.datetime({offset:true}).parse(asOf),verified=confirmedFact(a.deadline,now),deadline=verified?a.deadline.value:null,remaining=deadline?Date.parse(deadline)-Date.parse(now):null;
 const urgency=remaining===null?'unknown' as const:remaining<0?'passed' as const:remaining<=24*60*60*1000?'urgent' as const:'later' as const;
 const reason=urgency==='unknown'?'Booking deadline is unknown or stale; check the dated source.':urgency==='passed'?'The recorded booking deadline has passed; check the source for available options.':urgency==='urgent'?'The dated booking deadline is within 24 hours.':'The recorded booking deadline is later; it can wait beyond this 24-hour attention window.';
 return{option_id:a.option_id,activity_start:a.activity_start,deadline,urgency,important:a.importance==='important',optional_promotion:a.optional_promotion,cost_confirmed:confirmedFact(a.cost,now),source:a.deadline.source,source_date:a.deadline.source_date,reason:reason+(a.optional_promotion?' This is an optional promotion.':''),authorization:'attention_only' as const,policy:{id:'mot-booking-attention',version:1,window_hours:24}};
}
