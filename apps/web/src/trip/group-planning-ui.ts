// Pure helpers behind the WP8 organizer summary and booking-attention form (MOT-112/113), kept out of the
// components so the honesty rules (separate cost evidence, no false Undo/Saved claims, round-scoped
// conflicts, replied-vs-pending stamps, trip-local display times) are unit tested.
import {tripLocalInstant,undoProposal,type Actor,type TripSession} from '@writers-board/core';

export interface BookingAttentionDraft {option:string;activity:string;deadline:string;source:string;date:string;status:'confirmed'|'unknown';costStatus:'confirmed'|'unknown';importance:string;promotion:boolean;cost:string;}

/** Build the command input. Deadline and cost each carry their own certainty; blank stays unknown. */
export function bookingAttentionFromForm(d:BookingAttentionDraft,timeZone:string|null|undefined){
 const toInstant=(s:string)=>{if(!timeZone)throw new Error('Choose a destination time zone before entering clock times');return tripLocalInstant(s,timeZone);};
 const source=d.source.trim(),fact=<T,>(value:T|null,status:'confirmed'|'unknown')=>({value,status:value===null?'unknown' as const:status,source:source||'Not supplied',source_date:source&&d.date?d.date:null,valid_until:null});
 return{option_id:d.option,activity_start:d.activity?toInstant(d.activity):null,deadline:fact(d.deadline?toInstant(d.deadline):null,d.status),cost:fact(d.cost===''?null:Number(d.cost),d.costStatus),importance:d.importance,optional_promotion:d.promotion};
}

/** Add the task, then wait for the durable write. A failed save never invites a duplicate retry. */
export async function addBookingAttention(session:TripSession,actor:Actor,d:BookingAttentionDraft,timeZone:string|null|undefined,whenSaved:()=>Promise<void>,asOf=new Date().toISOString()){
 try{session.execute(actor,'trip_booking_attention_add',{attention:bookingAttentionFromForm(d,timeZone),as_of:asOf});}
 catch(e){return{added:false,saved:false,message:`${e instanceof Error?e.message:'Could not add attention task'} Nothing was added; the current board is unchanged.`};}
 try{await whenSaved();}catch(e){return{added:true,saved:false,message:`Attention task added in this tab only. ${e instanceof Error?e.message:'Storage did not complete.'} Do not add it again; download a personal ZIP backup before closing.`};}
 return{added:true,saved:true,message:'Private booking attention task saved. Activity dates and rankings are unchanged.'};
}

/** Undo the applied group plan; report only what actually happened. */
export function undoGroupPlan(session:TripSession,proposalId:string){
 return undoProposal(session,proposalId)?{undone:true,message:'Proposed changes undone and saved; unrelated edits stay.'}:{undone:false,message:'Nothing was undone: this group plan is no longer in the undo history of this tab. The current board is unchanged.'};
}

export interface StampSummary {approved:readonly string[];maybe:readonly string[];denied:readonly string[]}
/** Respondents who left an option unstamped are distinct from households with no current reply. */
export function optionStampCounts(stamps:StampSummary,responding:number,total:number){
 const stamped=stamps.approved.length+stamps.maybe.length+stamps.denied.length;
 return{approved:stamps.approved.length,maybe:stamps.maybe.length,denied:stamps.denied.length,noStamp:Math.max(0,responding-stamped),noReply:total-responding};
}

export function roundConflicts<T extends {proposal_version:number;round_id:string}>(conflicts:readonly T[],round:{proposal_version:number;round_id:string}){return conflicts.filter(c=>c.proposal_version===round.proposal_version&&c.round_id===round.round_id);}

/** Show an instant in the trip's own clock, labelled with the zone; unknown stays unknown. */
export function formatTripInstant(iso:string|null,timeZone:string|null|undefined){
 if(!iso)return 'unknown';if(!timeZone)return iso;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${timeZone}`;
}
