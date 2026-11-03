import {expect,it} from 'vitest';
import {readRoomVotingSnapshot} from './room-emulator-voting-state';
import {roomVotingRoundId,roomVotingResponseId} from '../../core/src/trip/shared-room-voting-wire';
import {createGroupResponse} from '../../core/src/trip/group-preferences';
import {POSITIONAL_VOTING_METHOD} from '../../core/src/trip/voting-contract';
it('never lets a cached content hash authorize the same response under another round',async()=>{
 const config=(proposal:number)=>({version:1 as const,trip_id:'trip',households:[{household_id:'h',display_name:'H'}],rounds:[{round_id:'round',proposal_version:proposal,kind:'destination' as const,option_ids:['a'],rank_limit:3 as const,household_weighting:'one_household_one_vote' as const}]}),a=config(1),b=config(2),round1=await roomVotingRoundId(a),round2=await roomVotingRoundId(b),response=await createGroupResponse({version:1,trip_id:'trip',proposal_version:1,round_id:'round',household_id:'h',response_revision:1,rankings:[],stamps:[],shared_note:'',constraints:[],responded_at:'2026-11-03T00:00:00Z'});
 const row=async(roundId:string)=>{const id=await roomVotingResponseId(roundId,'h');return{id,roundId,householdId:'h',version:1,assignmentEpoch:1,uid:'uid',membershipEpoch:1,response,receipt:{operationId:'a'.repeat(64),requestDigest:'a'.repeat(64),uid:'uid',kind:'respond' as const,entityId:id,version:1,acceptedAt:1,responseId:response.response_id}};};
 const snapshot={state:{version:2,currentRoundId:round2,proposalFloor:2,tripId:'trip',roundEpoch:2},assignments:[],rounds:[{id:round1,version:1,epoch:1,configuration:a,method:POSITIONAL_VOTING_METHOD,status:'open' as const},{id:round2,version:1,epoch:2,configuration:b,method:POSITIONAL_VOTING_METHOD,status:'open' as const}],responses:[await row(round1),await row(round2)],history:[]};
 await expect(readRoomVotingSnapshot(null as never,null as never,snapshot)).rejects.toThrow();
});
