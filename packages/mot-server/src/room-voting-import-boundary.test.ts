import{expect,it,vi}from'vitest';
vi.mock('../../core/src/trip/package.ts',()=>{throw Error('Protected voting must not load the portable board engine');});
vi.mock('../../core/src/trip/model.ts',()=>{throw Error('Protected voting must not load the local private document model');});
import{readRoomVotingSnapshot}from'./room-emulator-voting-state';
import{createRoomVotingAdapter}from'./room-emulator-voting';
it('loads the trusted voting reader and adapter without the private local board/package engine',async()=>{
 const ref={collection:(name:string)=>({doc:(id:string)=>({path:name+'/'+id}),limit:(n:number)=>({name,n})})},tx={get:async(q:{path?:string})=>q.path?{exists:false}:{size:0,docs:[]}};
 expect((await readRoomVotingSnapshot(tx as never,ref as never)).state.currentRoundId).toBe(null);expect(typeof createRoomVotingAdapter).toBe('function');
});
