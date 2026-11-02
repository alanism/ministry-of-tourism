import{roomSnapshotSchema,sharedRoomCardSchema,type RoomSnapshot,type SharedRoomCard}from'../../../../packages/core/src/trip/shared-room-domain';
import{roomRegisteredSessionSchema,type RoomRegisteredSession}from'../../../../packages/core/src/trip/shared-room-sessions';
import{roomSharedMediaSchema,type RoomSharedMedia}from'../../../../packages/core/src/trip/shared-room-media';
import{canonicalFileJson}from'../../../../packages/core/src/trip/file-exchange-json';
import{sha256Hex}from'../../../../packages/core/src/trip/sha256';
import{roomPngDimensions}from'./shared-room-media-client';
import{SharedRoomRequestError,type SharedRoomServiceClient}from'./shared-room-client';

/** Session-memory only. A captured descriptor or hash is not permission to restore it. */
export interface SharedRoomMediaUndoCapture{
 client:SharedRoomServiceClient;uid:string;roomId:string;sessionId:string;membershipEpoch:number;
 beforeCard:SharedRoomCard;previousAsset?:RoomSharedMedia;previousBytes?:Uint8Array;
}
const fail=(code:ConstructorParameters<typeof SharedRoomRequestError>[0]):never=>{throw new SharedRoomRequestError(code);};
export async function captureSharedRoomMediaUndo(options:{client:SharedRoomServiceClient;room:RoomSnapshot;session:RoomRegisteredSession;cardId:string;replaceAssetId?:string;signal?:AbortSignal}):Promise<SharedRoomMediaUndoCapture>{
 const room=roomSnapshotSchema.parse(options.room),session=roomRegisteredSessionSchema.parse(options.session),card=room.cards.find(row=>row.payload.id===options.cardId),check=()=>{if(options.signal?.aborted)fail('cancelled');};
 check();
 if(!card||!room.capabilities.includes('room-media/1')||!['owner','editor'].includes(room.principal.role)||room.principal.role==='editor'&&!options.replaceAssetId||room.principal.uid!==options.client.uid||session.uid!==options.client.uid||session.roomId!==room.roomId||!session.active||session.membershipEpoch!==room.principal.membershipEpoch)fail('unavailable');
 const capture:SharedRoomMediaUndoCapture={client:options.client,uid:options.client.uid,roomId:room.roomId,sessionId:session.id,membershipEpoch:session.membershipEpoch,beforeCard:structuredClone(sharedRoomCardSchema.parse(card!.payload))};
 if(options.replaceAssetId){
  const selected=room.assets?.find(asset=>asset.id===options.replaceAssetId);
  if(!selected||!card!.payload.assetIds.includes(selected.id))fail('unavailable');
  const held=await options.client.readRoomMedia(room,selected!.id,options.signal);check();
  const asset=roomSharedMediaSchema.parse(held.asset),bytes=new Uint8Array(held.bytes),dimensions=roomPngDimensions(bytes);
  if(canonicalFileJson(asset)!==canonicalFileJson(selected)||bytes.length!==asset.bytes||dimensions.width!==asset.width||dimensions.height!==asset.height||await sha256Hex(bytes)!==asset.hash)fail('invalid-response');
  check();capture.previousAsset=structuredClone(asset);capture.previousBytes=bytes;
 }
 return capture;
}
