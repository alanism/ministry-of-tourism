import{expect,it,vi}from'vitest';
import{captureSharedRoomMediaUndo}from'./shared-room-media-undo-client';
import{createSharedRoomClient}from'./shared-room-client';
import{sha256Hex}from'../../../../packages/core/src/trip/sha256';
import type{RoomSnapshot}from'../../../../packages/core/src/trip/shared-room-domain';
const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'));
const session={id:'a'.repeat(64),roomId:'room',uid:'owner',membershipEpoch:2,active:true,createdAt:1};
async function fixture(){
 const asset={id:'old',hash:await sha256Hex(png),mime:'image/png' as const,width:1,height:1,bytes:png.length,caption:'Exact old caption',credit:'Exact credit'},room:RoomSnapshot={serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1','room-media/1'],roomId:'room',principal:{uid:'owner',role:'owner',membershipEpoch:2,householdId:null,householdEpoch:null},cards:[{version:4,authorUid:'owner',updatedAt:1,payload:{id:'card',kind:'note',title:'Shared',body:'Keep the whole note',stage:'plan',provenance:'traveler',assetIds:['old'],x:0,y:0}}],assets:[asset],sync:'accepted'};
 const client=createSharedRoomClient({baseUrl:'http://127.0.0.1:48125',projectId:'demo-mot-rooms',auth:{uid:'owner',getIdToken:async()=>{throw Error('No network expected');}},session});
 const read=vi.spyOn(client,'readRoomMedia').mockResolvedValue({bytes:png,asset});
 return{asset,room,client,read};
}
it('holds only the exact initiating card and authorized prior photo for a later semantic inverse',async()=>{
 const{room,client,read}=await fixture(),capture=await captureSharedRoomMediaUndo({client,room,session,cardId:'card',replaceAssetId:'old'});
 expect(read).toHaveBeenCalledOnce();expect(capture).toMatchObject({uid:'owner',roomId:'room',sessionId:session.id,membershipEpoch:2,beforeCard:room.cards[0]!.payload,previousAsset:room.assets![0]});
 expect(capture.previousBytes).toEqual(png);expect(capture.previousBytes).not.toBe(png);expect(capture.beforeCard).not.toBe(room.cards[0]!.payload);
});
it('prepares an addition inverse without reading or copying unrelated photographs',async()=>{
 const{room,client,read}=await fixture(),capture=await captureSharedRoomMediaUndo({client,room,session,cardId:'card'});
 expect(read).not.toHaveBeenCalled();expect(capture.previousBytes).toBeUndefined();expect(capture.previousAsset).toBeUndefined();
});
it('refuses other contexts and corrupted held bytes before they can become an Undo preview',async()=>{
 const{room,client,read,asset}=await fixture();
 for(const held of [{...session,uid:'other'},{...session,roomId:'other'},{...session,membershipEpoch:1},{...session,active:false}])await expect(captureSharedRoomMediaUndo({client,room,session:held,cardId:'card',replaceAssetId:'old'})).rejects.toThrow();
 expect(read).not.toHaveBeenCalled();
 read.mockResolvedValue({asset,bytes:new Uint8Array(png.length)});
 await expect(captureSharedRoomMediaUndo({client,room,session,cardId:'card',replaceAssetId:'old'})).rejects.toThrow();
});
