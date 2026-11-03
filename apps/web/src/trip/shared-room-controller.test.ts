import {expect,it,vi} from 'vitest';
import {applyRoomCardOperation,projectSharedCard,type RoomCardState,type RoomSnapshot} from '../../../../packages/core/src/trip/shared-room-domain';
import {createSharedRoomController} from './shared-room-controller';
import {SharedRoomRequestError,type SharedRoomClient} from './shared-room-client';
function fixture(){
 const payload=projectSharedCard({id:'card',kind:'note',title:'Shared',body:'Original',stage:'plan',scope:'guide',provenance:'traveler',assetIds:[],x:0,y:0,createdBy:'local',updatedAt:'now'});
 let state:RoomCardState={id:'room',schemaMajor:1,ownerUid:'owner',closed:false,receiptCount:0,members:{owner:{role:'owner',epoch:1,active:true},other:{role:'editor',epoch:1,active:true}},cards:{card:{version:1,authorUid:'owner',updatedAt:1,payload}},receipts:{}};
 const read=():RoomSnapshot=>({serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1'],roomId:'room',principal:{uid:'owner',role:'owner',membershipEpoch:state.members.owner!.epoch,householdId:null,householdEpoch:null},cards:Object.values(state.cards),sync:'accepted'});
 const client:SharedRoomClient={uid:'owner',read:vi.fn(async()=>structuredClone(read())),operate:vi.fn(async operation=>{const result=await applyRoomCardOperation(state,'owner',operation,2);state=result.state;return{receipt:result.receipt,replayed:result.replayed};})};let n=0;
 const controller=createSharedRoomController({client,roomId:'room',newOperationId:()=>`operation-${++n}`});return{controller,client,payload,getState:()=>state,setState:(next:RoomCardState)=>{state=next;},read};
}
it('retains the exact stale draft rather than rebasing through a later accepted read',async()=>{
 const f=fixture();await f.controller.refresh();const id=f.controller.beginEdit('card');f.controller.updateDraft(id,{...f.payload,body:'My unsent text'});
 f.getState().cards.card={version:2,authorUid:'other',updatedAt:2,payload:{...f.payload,body:'Other accepted text'}};await f.controller.refresh();
 const draft=f.controller.getSnapshot().drafts.find(d=>d.operation.operationId===id)!;expect(draft.operation.baseVersion).toBe(1);expect(draft.operation.payload.body).toBe('My unsent text');
 vi.mocked(f.client.operate).mockRejectedValue(new SharedRoomRequestError('conflict'));await f.controller.sendDraft(id);expect(f.controller.getSnapshot().drafts[0]!.status).toBe('conflict');expect(f.controller.getSnapshot().room!.cards[0]!.payload.body).toBe('Other accepted text');
});
it('retries lost acknowledgement with the same immutable operation ID/body and one server effect',async()=>{
 const f=fixture(),operate=f.client.operate;let drop=true;f.client.operate=vi.fn(async(operation,signal)=>{const reply=await operate(operation,signal);if(drop){drop=false;throw new SharedRoomRequestError('network');}return reply;});
 await f.controller.refresh();const id=f.controller.beginEdit('card');f.controller.updateDraft(id,{...f.payload,body:'Accepted once'});await f.controller.sendDraft(id);expect(f.controller.getSnapshot().drafts[0]!.status).toBe('uncertain');
 expect(()=>f.controller.updateDraft(id,{...f.payload,body:'Changed body under same ID'})).toThrow();await f.controller.sendDraft(id);
 expect(f.getState().cards.card!.version).toBe(2);expect(f.getState().receiptCount).toBe(1);expect(f.controller.getSnapshot().latestReceipt!.replayed).toBe(true);
 const calls=vi.mocked(f.client.operate).mock.calls;expect(calls[0]![0]).toEqual(calls[1]![0]);
});
it('clears the authorized feed on unavailable access but preserves only its local recoverable work',async()=>{
 const f=fixture();await f.controller.refresh();const id=f.controller.beginEdit('card');f.controller.updateDraft(id,{...f.payload,body:'Recover this draft'});vi.mocked(f.client.read).mockRejectedValue(new SharedRoomRequestError('unavailable'));await f.controller.refresh();
 expect(f.controller.getSnapshot().room).toBeUndefined();expect(f.controller.getSnapshot().access).toBe('unavailable');expect(JSON.stringify(f.controller.recoveryData())).toContain('Recover this draft');expect(JSON.stringify(f.controller.recoveryData())).not.toContain('Bearer');
});
it('rejects stale initiator Undo visibly without overwriting another person and keeps the inverse draft',async()=>{
 const f=fixture();await f.controller.refresh();const id=f.controller.beginEdit('card');f.controller.updateDraft(id,{...f.payload,x:10});await f.controller.sendDraft(id);
 f.getState().cards.card={version:3,authorUid:'other',updatedAt:3,payload:{...f.payload,x:10,body:'Keep their later note'}};await f.controller.refresh();vi.mocked(f.client.operate).mockRejectedValue(new SharedRoomRequestError('conflict'));await f.controller.undoLatest();
 expect(f.getState().cards.card!.payload.body).toBe('Keep their later note');const undo=f.controller.getSnapshot().drafts.find(d=>d.operation.kind==='undo')!;expect(undo.status).toBe('conflict');expect(undo.operation.baseVersion).toBe(2);
});
it('invalidates late reads and writes on disposal, without rebinding them into another room/account',async()=>{
 const f=fixture();let resolve!:(snapshot:RoomSnapshot)=>void;vi.mocked(f.client.read).mockImplementation(()=>new Promise(done=>{resolve=done;}));const pending=f.controller.refresh();f.controller.dispose();resolve(f.read());await pending;expect(f.controller.getSnapshot().room).toBeUndefined();expect(f.controller.getSnapshot().access).toBe('unavailable');
});
it('preserves drafts at the100-operation cap and allows explicit local discard without a server write',async()=>{
 const f=fixture();await f.controller.refresh();for(let i=0;i<100;i++)f.controller.beginEdit('card');expect(()=>f.controller.beginEdit('card')).toThrow(/limit/i);expect(f.controller.getSnapshot().drafts).toHaveLength(100);f.controller.discardDraft('operation-1');expect(f.controller.getSnapshot().drafts).toHaveLength(99);expect(f.client.operate).not.toHaveBeenCalled();
});
it('ignores a late accepted write after context disposal and retains its uncertain recovery draft',async()=>{
 const f=fixture();await f.controller.refresh();const id=f.controller.beginEdit('card');let resolve!:(value:Awaited<ReturnType<SharedRoomClient['operate']>>)=>void;vi.mocked(f.client.operate).mockImplementation(()=>new Promise(done=>{resolve=done;}));const pending=f.controller.sendDraft(id);f.controller.dispose();resolve({receipt:{operationId:id,uid:'owner',kind:'edit',cardId:'card',version:2,requestDigest:'a'.repeat(64),beforeDigest:'b'.repeat(64),afterDigest:'c'.repeat(64),acceptedAt:2},replayed:false});await pending;
 expect(f.controller.getSnapshot().latestReceipt).toBeUndefined();expect(f.controller.getSnapshot().room).toBeUndefined();expect(f.controller.getSnapshot().drafts[0]!.status).toBe('uncertain');
});
it('does not expose a mutable queued operation body through its view snapshot',async()=>{
 const f=fixture();await f.controller.refresh();f.controller.beginEdit('card');expect(()=>{f.controller.getSnapshot().drafts[0]!.operation.payload.body='Changed outside draft API';}).toThrow();expect(f.controller.getSnapshot().drafts[0]!.operation.payload.body).toBe('Original');
});
it('does not create a second Undo while the first inverse is pending',async()=>{
 const f=fixture();await f.controller.refresh();const id=f.controller.beginEdit('card');f.controller.updateDraft(id,{...f.payload,x:10});await f.controller.sendDraft(id);const replies:{operation:Parameters<SharedRoomClient['operate']>[0];resolve:(reply:Awaited<ReturnType<SharedRoomClient['operate']>>)=>void}[]=[];
 vi.mocked(f.client.operate).mockClear().mockImplementation(operation=>new Promise(resolve=>replies.push({operation,resolve})));const first=f.controller.undoLatest(),second=f.controller.undoLatest();
 try{expect(f.client.operate).toHaveBeenCalledTimes(1);}finally{for(const{operation,resolve}of replies)resolve({receipt:{operationId:operation.operationId,uid:'owner',kind:'undo',cardId:'card',version:3,requestDigest:'a'.repeat(64),beforeDigest:'b'.repeat(64),afterDigest:'c'.repeat(64),acceptedAt:3},replayed:false});await Promise.allSettled([first,second]);}
});
