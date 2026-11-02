import{expect,it,vi}from'vitest';
vi.mock('../../../../packages/core/src/trip/package',()=>{throw Error('Ordinary room transport must not initialize the native local board engine');});
import{createSharedRoomClient}from'./shared-room-client';
it('reads ordinary authorized cards without initializing the unused native local board engine',async()=>{
 const session={id:'a'.repeat(64),roomId:'room',uid:'owner',membershipEpoch:1,active:true,createdAt:1},snapshot={serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1'],roomId:'room',principal:{uid:'owner',role:'owner',membershipEpoch:1,householdId:null,householdEpoch:null},cards:[],sync:'accepted'},fetcher=vi.fn<typeof fetch>(async()=>Response.json(snapshot));
 const client=createSharedRoomClient({baseUrl:'http://127.0.0.1:48125',projectId:'demo-mot-rooms',auth:{uid:'owner',getIdToken:async()=>'synthetic-token'},session,fetcher});
 expect((await client.read('room')).cards).toEqual([]);expect(fetcher).toHaveBeenCalledOnce();
});
