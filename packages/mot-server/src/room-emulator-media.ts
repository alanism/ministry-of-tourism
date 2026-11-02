import {randomBytes} from 'node:crypto';
import {FieldValue,type Firestore,type Transaction,type DocumentReference} from 'firebase-admin/firestore';
import {z} from 'zod';
import {canonicalFileJson,parseFileJson} from '../../core/src/trip/file-exchange-json.ts';
import {sha256Hex} from '../../core/src/trip/sha256.ts';
import {sanitizeRoomMediaUpload,roomSharedMediaSchema,type RoomMediaContext,type RoomSharedMedia} from '../../core/src/trip/shared-room-media.ts';
import {roomMediaReserveSchema,roomMediaCommitSchema,roomMediaStageResultSchema,roomMediaUploadResultSchema,roomMediaReceiptSchema,roomMediaCommitResultSchema,type RoomMediaReserve} from '../../core/src/trip/shared-room-media-wire.ts';
import {roomSnapshotSchema,type RoomMember,type RoomCardRecord} from '../../core/src/trip/shared-room-domain.ts';
import {roomAccountingFields,roomPublicMetadata} from './room-emulator-snapshot.ts';
import {measureRoomSnapshot} from '../../core/src/trip/shared-room-limits.ts';
import type {createRoomEmulatorByteStore} from './room-emulator-storage.ts';

const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),MiB=1024*1024;
const principalSchema=z.object({uid:id,roomId:id,membershipEpoch:integer,sessionId:hex}).strict();
export type RoomMediaPrincipal=z.infer<typeof principalSchema>;
const stageSchema=z.object({id:hex,uid:id,roomId:id,membershipEpoch:integer,sessionId:hex,createdAt:integer,expiresAt:integer,requestDigest:hex,input:roomMediaReserveSchema,phase:z.enum(['reserved','uploading','uploaded','committed','discarded']),uploadToken:hex.optional(),publicationDigest:hex.optional(),asset:roomSharedMediaSchema.optional()}).strict();
type Stage=z.infer<typeof stageSchema>;
type Context={meta:Record<string,unknown>;member:RoomMember};
export interface RoomMediaAdapterOptions {
 db:Firestore;store:ReturnType<typeof createRoomEmulatorByteStore>;
 /** Read-only transaction callback: verified Auth UID plus current member/session records. */
 authorize(tx:Transaction,ref:DocumentReference,principal:RoomMediaPrincipal):Promise<Context>;
 /** Fresh server policy, never caller scope/privateAncestor/personalOnly flags. */
 publication(tx:Transaction,ref:DocumentReference,uid:string,cardId:string,assetId:string,input:RoomMediaReserve):Promise<RoomMediaContext['publication']>;
 /** Read authoritative public records and include both candidates before any transaction writes. */
 accounting(tx:Transaction,ref:DocumentReference,meta:Record<string,unknown>,change:{card:{id:string;record:RoomCardRecord};asset:RoomSharedMedia;replaceAssetId?:string}):Promise<ReturnType<typeof measureRoomSnapshot>>;
}
const digest=(v:unknown)=>sha256Hex(new TextEncoder().encode(canonicalFileJson(v)));
function wire(raw:unknown){const bytes=new TextEncoder().encode(JSON.stringify(raw));if(bytes.length>65536)throw Error('Room intent limit');return parseFileJson(bytes);}
/** Isolated emulator adapter. Central HTTP owns verified Auth, attempt budgets and binary request bounds. */
export function createRoomMediaAdapter(o:RoomMediaAdapterOptions){
 const refFor=(p:RoomMediaPrincipal)=>o.db.doc('rooms/'+p.roomId);
 const stageRef=(ref:DocumentReference,stageId:string)=>ref.collection('mediaStages').doc(hex.parse(stageId));
 async function current(tx:Transaction,ref:DocumentReference,p:RoomMediaPrincipal){
  const c=await o.authorize(tx,ref,p);if(c.meta.id!==p.roomId||c.meta.schemaMajor!==1||c.meta.closed!==false||!c.member.active||c.member.epoch!==p.membershipEpoch)throw Error('Room media unavailable');return c;
 }
 function bound(p:RoomMediaPrincipal,input:{roomId:string;membershipEpoch:number;sessionId:string}){if(p.roomId!==input.roomId||p.membershipEpoch!==input.membershipEpoch||p.sessionId!==input.sessionId)throw Error('Room media unavailable');}
 function ownStage(p:RoomMediaPrincipal,stage:Stage){if(stage.uid!==p.uid||stage.roomId!==p.roomId||stage.membershipEpoch!==p.membershipEpoch||stage.sessionId!==p.sessionId)throw Error('Room media unavailable');}
 function live(stage:Stage,now:number){if(stage.expiresAt<=now||stage.createdAt>now||stage.phase==='discarded'||stage.phase==='committed')throw Error('Upload staging expired or unavailable');}
 async function cardPolicy(tx:Transaction,ref:DocumentReference,p:RoomMediaPrincipal,c:Context,input:RoomMediaReserve){
  const cardDoc=await tx.get(ref.collection('cards').doc(input.cardId));if(!cardDoc.exists)throw Error('Room media unavailable');const card=roomSnapshotSchema.shape.cards.element.parse(cardDoc.data());
  if(card.version!==input.baseVersion)throw Error('Stale media card version');
  const owner=c.member.role==='owner'&&c.meta.ownerUid===p.uid,editor=c.member.role==='editor';
  if(!owner&&!editor||editor&&!input.replaceAssetId||input.replaceAssetId&&!card.payload.assetIds.includes(input.replaceAssetId))throw Error('Room media publication unavailable');
  if(card.payload.assetIds.includes(input.assetId))throw Error('Media identity conflict');
  // Citation metadata needs a source-bound byte admission path; never strip it into the photo branch.
  if(input.source!==undefined||input.citationBinding!==undefined)throw Error('Source-bound media publication unsupported; retain local original');
  const publication=await o.publication(tx,ref,p.uid,input.cardId,input.assetId,input);
  if(publication.roomId!==p.roomId||publication.assetId!==input.assetId||publication.scope!=='shared'||publication.personalOnly!==false||publication.privateAncestor!==false)throw Error('Room media publication unavailable');
  return{card,publication};
 }
 async function pending(tx:Transaction,ref:DocumentReference,p:RoomMediaPrincipal,now:number){
  const docs=await tx.get(ref.collection('mediaStages').where('uid','==',p.uid).where('expiresAt','>',now).where('phase','in',['reserved','uploading','uploaded']).limit(3));
  const stages=docs.docs.map(d=>stageSchema.parse(d.data())),bytes=stages.reduce((n,s)=>n+Math.max(s.input.sourceBytes,s.asset?.bytes??0),0);return{stages,bytes};
 }
 async function uploadSnapshot(tx:Transaction,ref:DocumentReference,meta:Record<string,unknown>,input:RoomMediaReserve){
  const[cardDocs,presentations]=await Promise.all([tx.get(ref.collection('cards').limit(501)),tx.get(ref.collection('presentations').limit(1))]);if(cardDocs.size>500||presentations.size)throw Error('Unsupported room snapshot projection');
  const cards=cardDocs.docs.map(d=>roomSnapshotSchema.shape.cards.element.parse(d.data())).map(c=>c.payload.id===input.cardId&&input.replaceAssetId?{...c,payload:{...c.payload,assetIds:c.payload.assetIds.filter(a=>a!==input.replaceAssetId)}}:c);
  const ids=[...new Set(cards.flatMap(c=>c.payload.assetIds))];if(ids.length>200)throw Error('Room media capacity reached');const docs=ids.length?await tx.getAll(...ids.map(a=>ref.collection('media').doc(a))):[];
  const assets=docs.map(d=>{if(!d.exists)throw Error('Room media unavailable');const asset=roomSharedMediaSchema.parse(d.get('payload'));if(asset.id!==d.id)throw Error('Room media identity mismatch');return asset;});
  return measureRoomSnapshot({metadata:roomPublicMetadata(meta),cards,presentations:[],assets},assets.map(a=>({assetId:a.id,hash:a.hash,bytes:a.bytes})));
 }
 function stageResult(stage:Stage){return roomMediaStageResultSchema.parse({stageId:stage.id,assetId:stage.input.assetId,expiresAt:stage.expiresAt,uploaded:stage.phase==='uploaded'});}
 async function reserve(rawPrincipal:RoomMediaPrincipal,raw:unknown){
  const p=principalSchema.parse(rawPrincipal),input=roomMediaReserveSchema.parse(wire(raw));bound(p,input);const requestDigest=await digest(input),ref=refFor(p),stageId=randomBytes(32).toString('hex');
  return o.db.runTransaction(async tx=>{const now=Date.now(),c=await current(tx,ref,p);await cardPolicy(tx,ref,p,c,input);const[prior,existing,usage]=await Promise.all([tx.get(ref.collection('mediaStages').where('uid','==',p.uid).where('input.operationId','==',input.operationId).limit(1)),tx.get(ref.collection('media').doc(input.assetId)),pending(tx,ref,p,now)]);
   if(prior.size){const stage=stageSchema.parse(prior.docs[0]!.data());ownStage(p,stage);live(stage,now);if(stage.requestDigest!==requestDigest)throw Error('Media reservation identity conflict');return stageResult(stage);}
   if(existing.exists)throw Error('Media identity conflict');if(usage.stages.length>=2||usage.bytes+input.sourceBytes>20*MiB)throw Error('Room staging capacity reached');
   const stage=stageSchema.parse({id:stageId,uid:p.uid,roomId:p.roomId,membershipEpoch:p.membershipEpoch,sessionId:p.sessionId,createdAt:now,expiresAt:now+3600000,requestDigest,input,phase:'reserved'});
   tx.create(stageRef(ref,stageId),stage);tx.update(ref,{mediaAdmissionEpoch:Number(c.meta.mediaAdmissionEpoch??0)+1});return stageResult(stage);
  });
 }
 async function upload(rawPrincipal:RoomMediaPrincipal,stageId:string,input:Uint8Array|(()=>Promise<Uint8Array>)){
  const p=principalSchema.parse(rawPrincipal),ref=refFor(p),sref=stageRef(ref,stageId),token=randomBytes(32).toString('hex');
  const acquired=await o.db.runTransaction(async tx=>{const now=Date.now(),c=await current(tx,ref,p),doc=await tx.get(sref);if(!doc.exists)throw Error('Room media unavailable');const stage=stageSchema.parse(doc.data());ownStage(p,stage);live(stage,now);const{publication}=await cardPolicy(tx,ref,p,c,stage.input),usage=await pending(tx,ref,p,now);
   const replayed=stage.phase==='uploaded';if(replayed&&(!stage.asset||stage.publicationDigest!==await digest(publication)))throw Error('Media publication policy conflict');
   if(!['reserved','uploaded'].includes(stage.phase)||usage.stages.some(s=>s.phase==='uploading'))throw Error('One room upload at a time limit');
   const snapshot=replayed?undefined:await uploadSnapshot(tx,ref,c.meta,stage.input);live(stage,Date.now());tx.update(sref,{phase:'uploading',uploadToken:token});tx.update(ref,{mediaAdmissionEpoch:Number(c.meta.mediaAdmissionEpoch??0)+1});return{stage,c,publication,usage,snapshot,replayed};
  });
  const {stage,c,publication,usage}=acquired;
  try{
   // Central transport passes a bounded reader, so rejected concurrent uploads never consume a body.
   const bytes=typeof input==='function'?await input():input;if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>10*MiB)throw Error('Room media file limit');
   if(acquired.replayed){
    if(bytes.length!==stage.input.sourceBytes||await sha256Hex(bytes)!==stage.input.sourceHash)throw Error('Uploaded media identity conflict');
    await o.db.runTransaction(async tx=>{const fresh=await current(tx,ref,p),doc=await tx.get(sref),s=stageSchema.parse(doc.data());ownStage(p,s);if(s.phase!=='uploading'||s.uploadToken!==token)throw Error('Upload context changed');const policy=await cardPolicy(tx,ref,p,fresh,s.input);if(s.publicationDigest!==await digest(policy.publication))throw Error('Media publication policy conflict');live(s,Date.now());tx.update(sref,{phase:'uploaded',uploadToken:FieldValue.delete()});});
    return roomMediaUploadResultSchema.parse({stageId,asset:stage.asset});
   }
   const clean=await sanitizeRoomMediaUpload({roomId:p.roomId,uid:p.uid,ownerUid:String(c.meta.ownerUid),closed:false,member:c.member,membershipEpoch:p.membershipEpoch,now:Date.now(),stage:{id:stageId,roomId:p.roomId,uid:p.uid,membershipEpoch:p.membershipEpoch,assetId:stage.input.assetId,createdAt:stage.createdAt,expiresAt:stage.expiresAt,sourceHash:stage.input.sourceHash,sourceBytes:stage.input.sourceBytes},publication,usage:{referencedObjects:acquired.snapshot!.mediaCount,snapshotBytes:acquired.snapshot!.totalBytes,stagedObjects:usage.stages.length,stagedBytes:usage.bytes,activeUploads:1}},bytes,stage.input.caption);
   await o.store.putStage(p.roomId,p.uid,stageId,clean.bytes,clean.asset.hash);
   await o.db.runTransaction(async tx=>{const now=Date.now(),fresh=await current(tx,ref,p),doc=await tx.get(sref),s=stageSchema.parse(doc.data());ownStage(p,s);live(s,now);if(s.phase!=='uploading'||s.uploadToken!==token)throw Error('Upload context changed');const policy=await cardPolicy(tx,ref,p,fresh,s.input);if(canonicalFileJson(policy.publication)!==canonicalFileJson(publication))throw Error('Media publication policy conflict');const u=await pending(tx,ref,p,now);if(u.stages.length>2||u.bytes-Math.max(s.input.sourceBytes,s.asset?.bytes??0)+Math.max(s.input.sourceBytes,clean.asset.bytes)>20*MiB)throw Error('Room staging capacity reached');const publicationDigest=await digest(publication);live(s,Date.now());tx.update(sref,{phase:'uploaded',asset:clean.asset,publicationDigest,uploadToken:FieldValue.delete()});tx.update(ref,{mediaAdmissionEpoch:Number(fresh.meta.mediaAdmissionEpoch??0)+1});});
   return roomMediaUploadResultSchema.parse({stageId,asset:clean.asset});
  }catch(error){if(!acquired.replayed)await o.store.discardStage(p.roomId,p.uid,stageId).catch(()=>{});await o.db.runTransaction(async tx=>{const doc=await tx.get(sref);if(doc.exists&&doc.get('phase')==='uploading'&&doc.get('uploadToken')===token)tx.update(sref,{phase:acquired.replayed?'uploaded':'reserved',uploadToken:FieldValue.delete()});}).catch(()=>{});throw error;}
 }
 async function commit(rawPrincipal:RoomMediaPrincipal,raw:unknown){
  const p=principalSchema.parse(rawPrincipal),input=roomMediaCommitSchema.parse(wire(raw));bound(p,input);const ref=refFor(p),sref=stageRef(ref,input.stageId),rref=ref.collection('receipts').doc(input.operationId),requestDigest=await digest(input);
  async function inspect(tx:Transaction){const now=Date.now(),c=await current(tx,ref,p),prior=await tx.get(rref);if(prior.exists){const receipt=roomMediaReceiptSchema.parse(prior.data());if(receipt.uid!==p.uid||receipt.requestDigest!==requestDigest)throw Error('Media operation identity conflict');const asset=await readable(tx,ref,p,receipt.assetId);return{replay:roomMediaCommitResultSchema.parse({receipt,replayed:true,asset})};}
   const doc=await tx.get(sref);if(!doc.exists)throw Error('Room media unavailable');const stage=stageSchema.parse(doc.data());ownStage(p,stage);live(stage,now);if(stage.phase!=='uploaded'||!stage.asset)throw Error('Upload not ready');if(input.baseVersion!==stage.input.baseVersion)throw Error('Media commit version conflict');const{card,publication}=await cardPolicy(tx,ref,p,c,stage.input);if(stage.publicationDigest!==await digest(publication))throw Error('Media publication policy conflict');return{stage,c,card,now};}
  const prepared=await o.db.runTransaction(inspect);if(prepared.replay)return prepared.replay;const stage=prepared.stage!,asset=stage.asset!;
  const clean=await o.store.readStage(p.roomId,p.uid,stage.id,asset.bytes,asset.hash);try{await o.store.putAsset(p.roomId,asset.id,clean,asset.hash);
  const result=await o.db.runTransaction(async tx=>{const fresh=await inspect(tx);if(fresh.replay)return fresh.replay;const{stage:s,c,card,now}=fresh;if(!s||!c||!card||now===undefined||canonicalFileJson(s.asset)!==canonicalFileJson(asset))throw Error('Upload context changed');const existing=await tx.get(ref.collection('media').doc(asset.id));if(existing.exists)throw Error('Media identity conflict');const count=integer.parse(c.meta.receiptCount);if(count>=20000||card.version===Number.MAX_SAFE_INTEGER)throw Error('Room receipt capacity reached');
   const assetIds=s.input.replaceAssetId?card.payload.assetIds.map(old=>old===s.input.replaceAssetId?asset.id:old):[...card.payload.assetIds,asset.id],record=roomSnapshotSchema.shape.cards.element.parse({version:card.version+1,authorUid:p.uid,updatedAt:now,payload:{...card.payload,assetIds}}),measurement=await o.accounting(tx,ref,c.meta,{card:{id:s.input.cardId,record},asset,...(s.input.replaceAssetId?{replaceAssetId:s.input.replaceAssetId}:{})});
   const receipt=roomMediaReceiptSchema.parse({operationId:input.operationId,uid:p.uid,kind:'media',cardId:s.input.cardId,assetId:asset.id,version:record.version,requestDigest,beforeDigest:await digest(card.payload),afterDigest:await digest(record.payload),acceptedAt:now});
   live(s,Date.now());tx.create(ref.collection('media').doc(asset.id),{payload:asset,version:1,authorUid:p.uid,updatedAt:now});tx.set(ref.collection('cards').doc(s.input.cardId),record);tx.create(rref,receipt);tx.update(sref,{phase:'committed'});tx.update(ref,{receiptCount:count+1,...roomAccountingFields(measurement)});return roomMediaCommitResultSchema.parse({receipt,replayed:false,asset});});
  await o.store.discardStage(p.roomId,p.uid,stage.id).catch(()=>{});return result;
  }catch(error){
   // Only the permanent closed-room fence permits deletion after an uncertain write.
   // Active-room candidates remain tracked by their stage for authoritative orphan cleanup.
   await ref.get().then(doc=>doc.get('closed')===true?o.store.discardAsset(p.roomId,asset.id,asset.hash):undefined).catch(()=>{});throw error;
  }
 }
 async function readable(tx:Transaction,ref:DocumentReference,p:RoomMediaPrincipal,assetId:string){await current(tx,ref,p);const[doc,cards]=await Promise.all([tx.get(ref.collection('media').doc(assetId)),tx.get(ref.collection('cards').limit(501))]);if(!doc.exists||cards.size>500||!cards.docs.some(d=>roomSnapshotSchema.shape.cards.element.parse(d.data()).payload.assetIds.includes(assetId)))throw Error('Room media unavailable');const asset=roomSharedMediaSchema.parse(doc.get('payload'));if(asset.id!==assetId)throw Error('Room media identity mismatch');return asset;}
 async function read(rawPrincipal:RoomMediaPrincipal,assetId:string){const p=principalSchema.parse(rawPrincipal),ref=refFor(p);id.parse(assetId);const asset=await o.db.runTransaction(tx=>readable(tx,ref,p,assetId)),bytes=await o.store.readAsset(p.roomId,asset.id,asset.bytes,asset.hash),fresh=await o.db.runTransaction(tx=>readable(tx,ref,p,assetId));if(canonicalFileJson(fresh)!==canonicalFileJson(asset))throw Error('Room media changed during read');return{asset,bytes};}
 async function discard(rawPrincipal:RoomMediaPrincipal,stageId:string){const p=principalSchema.parse(rawPrincipal),ref=refFor(p),sref=stageRef(ref,stageId);await o.db.runTransaction(async tx=>{await current(tx,ref,p);const doc=await tx.get(sref);if(!doc.exists)throw Error('Room media unavailable');const stage=stageSchema.parse(doc.data());ownStage(p,stage);if(stage.phase==='committed')throw Error('Published media requires withdrawal');tx.update(sref,{phase:'discarded',uploadToken:FieldValue.delete()});});await o.store.discardStage(p.roomId,p.uid,stageId);return{discarded:true as const};}
 return{reserve,upload,commit,read,discard};
}
