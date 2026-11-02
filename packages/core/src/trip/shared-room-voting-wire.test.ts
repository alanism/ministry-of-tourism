import {expect,it} from 'vitest';
import {roomVotingDeclareSchema,roomVotingResponseSchema,roomVotingAssignmentSchema,roomVotingOperationId} from './shared-room-voting-wire';
const base={roomId:'room',schemaMajor:1,capability:'room-votes/1',operationId:'a'.repeat(64),membershipEpoch:1,sessionId:'b'.repeat(64),baseVersion:0};
const configuration={version:1,trip_id:'trip',households:[{household_id:'h1',display_name:'Same name'}],rounds:[{round_id:'round',proposal_version:1,kind:'destination',option_ids:['a','b'],rank_limit:3,household_weighting:'one_household_one_vote'}]};
it('requires explicit frozen declaration and rejects roster/history or identity authority shortcuts',()=>{
 expect(roomVotingDeclareSchema.parse({...base,configuration,confirmed:true}).configuration).toEqual(configuration);
 expect(roomVotingDeclareSchema.safeParse({...base,configuration:{...configuration,households:Array.from({length:9},(_,i)=>({household_id:'h'+i,display_name:'Same'}))},confirmed:true}).success).toBe(false);
 expect(roomVotingDeclareSchema.safeParse({...base,configuration,confirmed:true,ledger:{privateCanary:true}}).success).toBe(false);
 expect(roomVotingAssignmentSchema.safeParse({...base,roundEpoch:1,householdId:'h1',memberUid:'uid',expectedAssignmentEpoch:0,actor:'owner'}).success).toBe(false);
 expect(roomVotingResponseSchema.safeParse({...base,roundEpoch:1,assignmentEpoch:1,response:{household_id:'h1'}}).success).toBe(false);
});
it('binds deterministic operation identity to verified UID, kind and exact immutable intent',async()=>{
 const{operationId,...intent}=base;
 expect(await roomVotingOperationId('owner','declare',intent)).toMatch(/^[a-f0-9]{64}$/);
 expect(await roomVotingOperationId('owner','declare',intent)).not.toBe(await roomVotingOperationId('other','declare',intent));
 expect(await roomVotingOperationId('owner','declare',intent)).not.toBe(await roomVotingOperationId('owner','close',intent));
});
