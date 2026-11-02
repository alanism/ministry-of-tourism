import {groupPreferencesSchema,validateGroupResponse,type GroupResponse} from './group-preferences.ts';
import type {RoomMember} from './shared-room-domain.ts';

/** All context comes from the service transaction, never from a submitted household label. */
export interface RoomVoteContext {
 roomId:string;uid:string;ownerUid:string;closed:boolean;member:RoomMember;membershipEpoch:number;
 assignment:{householdId:string;uid:string;epoch:number};
 round:{epoch:number;status:'draft'|'open'|'closed';configuration:unknown};
 expectedRoundEpoch:number;expectedAssignmentEpoch:number;previousResponse?:GroupResponse;
}
const epoch=(n:number)=>Number.isSafeInteger(n)&&n>=0;
/** Validation only. Central service owns entity versions, atomic receipts and response storage. */
export async function validateRoomVotePayload(context:RoomVoteContext,raw:unknown):Promise<{response:GroupResponse;contentHash:string}>{
 const c=context,m=c.member,a=c.assignment;
 if(new TextEncoder().encode(JSON.stringify(raw)).length>65536)throw Error('Room intent exceeds64KiB; retain local response');
 if(!c.roomId||!c.uid||c.closed||!m?.active||!['owner','respondent'].includes(m.role)||m.role==='owner'&&c.uid!==c.ownerUid||m.epoch!==c.membershipEpoch||!epoch(m.epoch)||a.uid!==c.uid||!a.householdId||!epoch(a.epoch)||a.epoch!==c.expectedAssignmentEpoch||c.round.status!=='open'||!epoch(c.round.epoch)||c.round.epoch!==c.expectedRoundEpoch)throw Error('Room response unavailable; retain local response');
 const group=groupPreferencesSchema.parse(c.round.configuration);
 // Service supplies only the current round's frozen declaration, not historical/live rosters.
 if(group.rounds.length!==1||group.households.length>8)throw Error('Use the current room round declaration');
 const {response}=await validateGroupResponse(raw,group);
 if(response.household_id!==a.householdId)throw Error('Only the assigned household account may respond');
 if(c.previousResponse){
  const previous=(await validateGroupResponse(c.previousResponse,group)).response;
  if(previous.household_id!==a.householdId)throw Error('Stored response has another household identity');
  if(response.response_revision<previous.response_revision||response.response_revision===previous.response_revision&&response.response_id!==previous.response_id)throw Error('Response revision conflicts; retain local response');
 }
 return{response,contentHash:response.response_id};
}
