import{afterEach,beforeEach,expect,it,vi}from'vitest';
import{createSharedRoomMediaUndo}from'./shared-room-media-undo-client';
import{createSharedRoomClient,SharedRoomRequestError}from'./shared-room-client';
import{canonicalFileJson}from'../../../../packages/core/src/trip/file-exchange-json';
import{sha256Hex}from'../../../../packages/core/src/trip/sha256';
import type{RoomSnapshot}from'../../../../packages/core/src/trip/shared-room-domain';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64')),session={id:'a'.repeat(64),roomId:'room',uid:'owner',membershipEpoch:2,active:true,createdAt:1};
const hash=(value:unknown)=>sha256Hex(new TextEncoder().encode(canonicalFileJson(value)));
async function fixture(addition=false){
 const old={id:'old',hash:await sha256Hex(png),mime:'image/png' as const,width:1,height:1,bytes:png.length,caption:'EXACT-OLD-CAPTION',credit:'Exact credit'},beforeCard={id:'card',kind:'note' as const,title:'Shared',body:'Whole note',stage:'plan' as const,provenance:'traveler' as const,assetIds:addition?[]:['old'],x:0,y:0},afterCard={...beforeCard,assetIds:['new']},room:RoomSnapshot={serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1','room-media/1'],roomId:'room',principal:{uid:'owner',role:'owner',membershipEpoch:2,householdId:null,householdEpoch:null},cards:[{version:5,authorUid:'owner',updatedAt:1,payload:afterCard}],assets:[{...old,id:'new',caption:'NEW-CAPTION'}],sync:'accepted'};
 const client=Object.assign(createSharedRoomClient({baseUrl:'http://127.0.0.1:48125',projectId:'demo-mot-rooms',auth:{uid:'owner',getIdToken:async()=>{throw Error('No network expected');}},session}),{undoRoomMediaAddition:vi.fn(async(input:{operationId:string;undoOf:string})=>({receipt:{operationId:input.operationId,uid:'owner',kind:'media-undo' as const,cardId:'card',undoOf:input.undoOf,version:6,requestDigest:'c'.repeat(64),beforeDigest:'d'.repeat(64),afterDigest:'e'.repeat(64),acceptedAt:1},replayed:false}))});
 const receipt={operationId:'forward',uid:'owner',kind:'media' as const,cardId:'card',assetId:'new',version:5,requestDigest:'c'.repeat(64),beforeDigest:await hash(beforeCard),afterDigest:await hash(afterCard),acceptedAt:1,...(!addition?{previousAssetDigest:await hash(old)}:{})},capture={client,uid:'owner',roomId:'room',sessionId:session.id,membershipEpoch:2,beforeCard,...(!addition?{previousAsset:old,previousBytes:png}:{})};
 let fresh='';const reserve=vi.spyOn(client,'reserveRoomMedia').mockImplementation(async input=>{fresh=input.assetId;return{stageId:'b'.repeat(64),assetId:fresh,expiresAt:1800000000000,uploaded:false};}),upload=vi.spyOn(client,'uploadRoomMedia').mockImplementation(async()=>({stageId:'b'.repeat(64),asset:{...old,id:fresh}})),commit=vi.spyOn(client,'commitRoomMedia').mockImplementation(async input=>({receipt:{...receipt,operationId:input.operationId,assetId:fresh,version:6,undoOf:'forward'},replayed:false,asset:{...old,id:fresh}}));
 return{client,room,receipt,capture,target:{capture,receipt},reserve,upload,commit};
}
beforeEach(()=>vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1,height:1,close:vi.fn()}))));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('restores exact held bytes and caption only after a reviewed inverse, using a fresh asset identity',async()=>{
 const f=await fixture(),resource=createSharedRoomMediaUndo({client:f.client,room:f.room,session,target:f.target});
 await resource.prepare();expect(resource.getSnapshot().state).toBe('review');await expect(resource.publish(false)).rejects.toThrow();expect(f.reserve).not.toHaveBeenCalled();
 await resource.publish(true);expect(resource.getSnapshot().state).toBe('accepted');
 const input=f.reserve.mock.calls[0]![0];expect(input).toMatchObject({undoOf:'forward',replaceAssetId:'new',caption:'EXACT-OLD-CAPTION',credit:'Exact credit',sourceHash:f.capture.previousAsset!.hash});expect(input.assetId).not.toBe('old');expect(input.assetId).not.toBe('new');
 expect(f.upload.mock.calls[0]![2]).toEqual(png);expect(f.commit.mock.calls[0]![0].undoBeforeCard).toEqual(f.capture.beforeCard);
});
it('retries the same uncertain inverse without a new reservation or changed body',async()=>{
 const f=await fixture(),resource=createSharedRoomMediaUndo({client:f.client,room:f.room,session,target:f.target});f.commit.mockRejectedValueOnce(new SharedRoomRequestError('network'));
 await resource.prepare();await expect(resource.publish(true)).rejects.toThrow();const first=structuredClone(f.commit.mock.calls[0]![0]);expect(resource.getSnapshot().state).toBe('uncertain');await resource.retry();
 expect(f.commit.mock.calls[1]![0]).toEqual(first);expect(f.reserve).toHaveBeenCalledOnce();expect(f.upload).toHaveBeenCalledOnce();
});
it('uses exact preconditioned reference removal for an addition without any photo upload',async()=>{
 const f=await fixture(true),resource=createSharedRoomMediaUndo({client:f.client,room:f.room,session,target:f.target});await resource.prepare();await resource.publish(true);
 expect(f.client.undoRoomMediaAddition).toHaveBeenCalledOnce();expect(f.client.undoRoomMediaAddition.mock.calls[0]![0]).toMatchObject({undoOf:'forward',beforeCard:f.capture.beforeCard,baseVersion:5});expect(f.reserve).not.toHaveBeenCalled();expect(f.upload).not.toHaveBeenCalled();
});
it('refuses a changed prior caption, changed card or another session before sending an inverse',async()=>{
 const f=await fixture(),changed={...f.target,capture:{...f.capture,previousAsset:{...f.capture.previousAsset!,caption:'Unreviewed'}}};
 const resource=createSharedRoomMediaUndo({client:f.client,room:f.room,session,target:changed});await expect(resource.prepare()).rejects.toThrow();expect(f.reserve).not.toHaveBeenCalled();
 expect(()=>createSharedRoomMediaUndo({client:f.client,room:{...f.room,cards:[{...f.room.cards[0]!,version:6}]},session,target:f.target})).toThrow();
 expect(()=>createSharedRoomMediaUndo({client:f.client,room:f.room,session:{...session,id:'f'.repeat(64)},target:f.target})).toThrow();
});
it('does not commit an uploaded prior representation under an unreviewed asset identity',async()=>{
 const f=await fixture(),resource=createSharedRoomMediaUndo({client:f.client,room:f.room,session,target:f.target});
 f.upload.mockImplementation(async()=>({stageId:'b'.repeat(64),asset:{...f.capture.previousAsset!,id:'not-the-reserved-fresh-identity'}}));
 await resource.prepare();await expect(resource.publish(true)).rejects.toMatchObject({code:'invalid-response'});expect(f.commit).not.toHaveBeenCalled();
});
it('quarantines a late reservation after disposal without uploading bytes into a departed context',async()=>{
 const f=await fixture(),resource=createSharedRoomMediaUndo({client:f.client,room:f.room,session,target:f.target});let finish!:(value:Awaited<ReturnType<typeof f.client.reserveRoomMedia>>)=>void;
 f.reserve.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await resource.prepare();const pending=resource.publish(true),failure=expect(pending).rejects.toMatchObject({code:'cancelled'});void failure.catch(()=>{});
 await vi.waitFor(()=>expect(f.reserve).toHaveBeenCalledOnce());resource.dispose();finish({stageId:'b'.repeat(64),assetId:'late',expiresAt:1800000000000,uploaded:false});await failure;
 expect(f.upload).not.toHaveBeenCalled();expect(f.commit).not.toHaveBeenCalled();expect(resource.previousBytes()).toBeUndefined();expect(resource.getSnapshot().preview).toBeUndefined();
});
it('never exposes a prior-photo preview before exact validation or after a failed prior-descriptor check',async()=>{
 const f=await fixture(),changed={...f.target,capture:{...f.capture,previousAsset:{...f.capture.previousAsset!,caption:'Unverified caption'}}},resource=createSharedRoomMediaUndo({client:f.client,room:f.room,session,target:changed});
 resource.showPreview();expect(resource.getSnapshot().preview).toBeUndefined();await expect(resource.prepare()).rejects.toThrow();resource.showPreview();expect(resource.getSnapshot().preview).toBeUndefined();
});
