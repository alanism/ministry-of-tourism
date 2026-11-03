import {expect,it} from 'vitest';
import {readRoomVotingSnapshot} from './room-emulator-voting-state';
import {measureRoomVotingState} from '../../core/src/trip/shared-room-voting-wire';
const ref={collection:(name:string)=>({doc:(id:string)=>({path:name+'/'+id}),limit:(n:number)=>({name,n})})};
it('represents an unconfigured room without private phantom bytes and refuses orphaned record authority',async()=>{
 const empty={exists:false},tx={get:async(q:{path?:string;name?:string})=>q.path?empty:{size:0,docs:[]}};
 const state=await readRoomVotingSnapshot(tx as never,ref as never);expect(state.state.currentRoundId).toBe(null);expect(measureRoomVotingState(state)).toBe(0);
 const orphan={get:async(q:{path?:string;name?:string})=>q.path?empty:q.name==='votingAssignments'?{size:1,docs:[{id:'h',data:()=>({householdId:'h',memberUid:'uid',epoch:1,version:1})}]}:{size:0,docs:[]}};
 await expect(readRoomVotingSnapshot(orphan as never,ref as never)).rejects.toThrow('index');
});
