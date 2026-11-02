import{roomSnapshotSchema,sharedRoomCardSchema,type RoomSnapshot,type SharedRoomCard}from'../../../../packages/core/src/trip/shared-room-domain';
import{roomRegisteredSessionSchema,type RoomRegisteredSession}from'../../../../packages/core/src/trip/shared-room-sessions';
import{roomSharedMediaSchema,type RoomSharedMedia}from'../../../../packages/core/src/trip/shared-room-media';
import{canonicalFileJson}from'../../../../packages/core/src/trip/file-exchange-json';
import{sha256Hex}from'../../../../packages/core/src/trip/sha256';
import{roomPngDimensions}from'./shared-room-media-client';
import{SharedRoomRequestError,sharedRoomAwait,type SharedRoomServiceClient}from'./shared-room-client';
import{roomMediaReceiptSchema,roomMediaReserveSchema,roomMediaCommitSchema,type RoomMediaReserve}from'../../../../packages/core/src/trip/shared-room-media-wire';
import{roomMediaUndoAdditionSchema}from'../../../../packages/core/src/trip/shared-room-media-undo';
import{decodeSharedRoomPng}from'./shared-room-media-image';

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

export interface SharedRoomMediaUndoTarget{capture:SharedRoomMediaUndoCapture;receipt:ReturnType<typeof roomMediaReceiptSchema.parse>;}
export interface SharedRoomMediaUndoView{
 state:'ready'|'preparing'|'review'|'pending'|'uncertain'|'conflict'|'rejected'|'accepted';
 preview?:{readonly url:string|undefined;asset:RoomSharedMedia};message?:string;step?:'reserve'|'upload'|'commit'|'remove';
}
export function createSharedRoomMediaUndo(options:{client:SharedRoomServiceClient;room:RoomSnapshot;session:RoomRegisteredSession;target:SharedRoomMediaUndoTarget}){
 const room=roomSnapshotSchema.parse(options.room),session=roomRegisteredSessionSchema.parse(options.session),receipt=roomMediaReceiptSchema.parse(options.target.receipt),held=options.target.capture,card=room.cards.find(row=>row.payload.id===receipt.cardId),beforeCard=sharedRoomCardSchema.parse(held.beforeCard),previousAsset=held.previousAsset?roomSharedMediaSchema.parse(held.previousAsset):undefined;
 if(held.client!==options.client||held.uid!==options.client.uid||held.roomId!==room.roomId||held.sessionId!==session.id||held.membershipEpoch!==session.membershipEpoch||session.uid!==held.uid||session.roomId!==held.roomId||!session.active||room.principal.uid!==held.uid||room.principal.membershipEpoch!==held.membershipEpoch||!['owner','editor'].includes(room.principal.role)||!room.capabilities.includes('room-media/1')||receipt.uid!==held.uid||receipt.undoOf||!card||card.version!==receipt.version||card.payload.id!==beforeCard.id||!card.payload.assetIds.includes(receipt.assetId))fail('unavailable');
 let bytes=held.previousBytes?new Uint8Array(held.previousBytes):undefined,view:SharedRoomMediaUndoView=Object.freeze({state:'ready'}),url:string|undefined,abort:AbortController|undefined,disposed=false,busy=false,reservation:RoomMediaReserve|undefined,stageId:string|undefined,uploaded:RoomSharedMedia|undefined,commit:ReturnType<typeof roomMediaCommitSchema.parse>|undefined,removal:ReturnType<typeof roomMediaUndoAdditionSchema.parse>|undefined;
 const listeners=new Set<()=>void>(),context=Object.freeze({uid:held.uid,roomId:held.roomId,sessionId:held.sessionId,membershipEpoch:held.membershipEpoch,cardId:receipt.cardId,undoOf:receipt.operationId,baseVersion:receipt.version});
 const emit=(patch:Partial<SharedRoomMediaUndoView>)=>{view=Object.freeze({...view,...patch});for(const listener of listeners){try{listener();}catch{/* An observer cannot change acceptance. */}}},check=(signal?:AbortSignal)=>{if(disposed||signal?.aborted)fail('cancelled');},clearUrl=()=>{if(url){URL.revokeObjectURL(url);url=undefined;}},digest=(value:unknown)=>sha256Hex(new TextEncoder().encode(canonicalFileJson(value)));
 function showPreview(){check();if(previousAsset&&bytes&&!url&&view.state!=='accepted'){url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'image/png'}));emit({preview:{get url(){return url;},asset:previousAsset}});}}
 async function prepare(signal?:AbortSignal){check(signal);if(busy||view.state!=='ready')fail('conflict');busy=true;abort=new AbortController();const current=signal?AbortSignal.any([signal,abort.signal]):abort.signal;emit({state:'preparing'});
  try{
   if(await digest(beforeCard)!==receipt.beforeDigest||await digest(card!.payload)!==receipt.afterDigest)fail('invalid-response');check(current);
   const base={roomId:context.roomId,schemaMajor:1 as const,capability:'room-media/1' as const,operationId:crypto.randomUUID(),sessionId:context.sessionId,membershipEpoch:context.membershipEpoch,baseVersion:context.baseVersion};
   if(previousAsset){
    if(!bytes||!receipt.previousAssetDigest||await digest(previousAsset)!==receipt.previousAssetDigest||!beforeCard.assetIds.includes(previousAsset.id)||await sha256Hex(bytes)!==previousAsset.hash||bytes.length!==previousAsset.bytes)fail('invalid-response');
    const dimensions=roomPngDimensions(bytes!);if(dimensions.width!==previousAsset.width||dimensions.height!==previousAsset.height)fail('invalid-response');
    await decodeSharedRoomPng(new Blob([new Uint8Array(bytes!).buffer],{type:'image/png'}),current,bitmap=>{if(bitmap.width!==previousAsset.width||bitmap.height!==previousAsset.height)fail('invalid-response');});check(current);
    reservation=roomMediaReserveSchema.parse({...base,cardId:context.cardId,assetId:crypto.randomUUID(),sourceHash:previousAsset.hash,sourceBytes:bytes!.length,replaceAssetId:receipt.assetId,undoOf:receipt.operationId,publicationConsent:true,...(previousAsset.caption!==undefined?{caption:previousAsset.caption}:{}),...(previousAsset.credit!==undefined?{credit:previousAsset.credit}:{}),...(previousAsset.rightsStatus!==undefined?{rightsStatus:previousAsset.rightsStatus}:{})});
    showPreview();
   }else{if(bytes||receipt.previousAssetDigest)fail('invalid-response');removal=roomMediaUndoAdditionSchema.parse({...base,cardId:context.cardId,undoOf:receipt.operationId,beforeCard});}
   emit({state:'review',message:previousAsset?'Review the exact prior photograph, caption and credit. Undo creates a fresh shared image identity.':'Review removal of the photograph added by your accepted operation. Other card content is restored exactly.'});
  }catch(cause){if(!disposed)emit({state:'rejected',message:cause instanceof SharedRoomRequestError?cause.message:'The prior authorized representation could not be verified.'});throw cause;}finally{busy=false;}
 }
 async function send(signal?:AbortSignal){check(signal);if(busy||!reservation&&!removal)fail('conflict');busy=true;abort=new AbortController();const current=signal?AbortSignal.any([signal,abort.signal]):abort.signal;emit({state:'pending',message:'Undo is pending service acceptance; no change is confirmed.'});
  try{
   if(removal){emit({step:'remove'});await sharedRoomAwait(()=>options.client.undoRoomMediaAddition(removal!,current),current);check(current);}
   else{
    if(!stageId){emit({step:'reserve'});const result=await sharedRoomAwait(()=>options.client.reserveRoomMedia(reservation!,current),current);check(current);stageId=result.stageId;}
    if(!uploaded){emit({step:'upload'});const result=await sharedRoomAwait(()=>options.client.uploadRoomMedia(context.roomId,stageId!,bytes!,current),current);check(current);const asset=roomSharedMediaSchema.parse(result.asset);if(asset.id!==reservation!.assetId||canonicalFileJson({...asset,id:previousAsset!.id})!==canonicalFileJson(previousAsset))fail('invalid-response');uploaded=asset;}
    commit??=roomMediaCommitSchema.parse({roomId:context.roomId,schemaMajor:1,capability:'room-media/1',operationId:reservation!.operationId,sessionId:context.sessionId,membershipEpoch:context.membershipEpoch,stageId,baseVersion:context.baseVersion,undoBeforeCard:beforeCard});
    emit({step:'commit'});const result=await sharedRoomAwait(()=>options.client.commitRoomMedia(commit!,{cardId:context.cardId,assetId:reservation!.assetId},current),current);check(current);if(result.receipt.undoOf!==receipt.operationId||canonicalFileJson(result.asset)!==canonicalFileJson(uploaded))fail('invalid-response');
   }
   emit({state:'accepted',message:'Undo accepted by the room service. Check the current photograph and caption; this does not prove another participant viewed it.'});clearUrl();bytes=undefined;
  }catch(cause){if(!disposed){const error=cause instanceof SharedRoomRequestError?cause:new SharedRoomRequestError('network');emit({state:['network','cancelled','invalid-response'].includes(error.code)?'uncertain':error.code==='conflict'?'conflict':'rejected',message:error.message});}throw cause;}finally{busy=false;}
 }
 return{context,getSnapshot:()=>view,subscribe(listener:()=>void){listeners.add(listener);return()=>listeners.delete(listener);},prepare,
  async publish(confirmed:boolean,signal?:AbortSignal){if(!confirmed||view.state!=='review')fail('unsupported');return send(signal);},
  async retry(signal?:AbortSignal){if(view.state!=='uncertain')fail('conflict');return send(signal);},
  hide(){abort?.abort();clearUrl();},showPreview,
  previousBytes:()=>bytes?new Uint8Array(bytes):undefined,
  recoveryData:()=>({type:'mot-room-photo-undo-recovery',...context,state:view.state,step:view.step,reservation,stageId,commit,removal,note:'Untrusted recovery details; no tokens or image bytes. Keep the prior PNG separately. No room authority, automatic replay or cross-device Undo is granted.'}),
  dispose(){if(disposed)return;disposed=true;abort?.abort();clearUrl();bytes=undefined;reservation=undefined;uploaded=undefined;commit=undefined;removal=undefined;listeners.clear();},
 };
}
export type SharedRoomMediaUndo=ReturnType<typeof createSharedRoomMediaUndo>;
