import type {Firestore,Transaction,DocumentReference} from 'firebase-admin/firestore';
import {z} from 'zod';
import {canonicalFileJson,parseFileJson} from '../../core/src/trip/file-exchange-json.ts';
import {sha256Hex} from '../../core/src/trip/sha256.ts';
import {exportRoomPublicPackage,roomPublicExportSnapshotSchema,type RoomPublicExportSnapshot} from '../../core/src/trip/shared-room-export.ts';
import {measureRoomSnapshot} from '../../core/src/trip/shared-room-limits.ts';
import {roomWithdrawRequestSchema,roomCloseRequestSchema,roomWithdrawResultSchema,roomCloseResultSchema,roomLifecycleStatusSchema,roomLifecycleOperationId,roomLifecycleReceiptSchema} from '../../core/src/trip/shared-room-lifecycle-wire.ts';
import type {RoomMember} from '../../core/src/trip/shared-room-domain.ts';
import {roomAccountingFields} from './room-emulator-snapshot.ts';
import type {createRoomEmulatorByteStore} from './room-emulator-storage.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),day=86400000;
export interface RoomLifecyclePrincipal{uid:string;roomId:string;membershipEpoch:number;sessionId:string;}
type Context={meta:Record<string,any>;member:RoomMember};
interface Options{db:Firestore;store:ReturnType<typeof createRoomEmulatorByteStore>;authorize(tx:Transaction,ref:DocumentReference,p:RoomLifecyclePrincipal):Promise<Context>;readSnapshot(tx:Transaction,ref:DocumentReference,meta:Record<string,any>):Promise<{snapshot:unknown;measurement:ReturnType<typeof measureRoomSnapshot>}>;audit(tx:Transaction,ref:DocumentReference,entry:{uid:string;kind:'withdraw'|'close';entityId:string;version:number;at:number}):Promise<()=>void>;}
const digest=(value:unknown)=>sha256Hex(new TextEncoder().encode(canonicalFileJson(value)));
const body=(raw:unknown)=>{const bytes=new TextEncoder().encode(JSON.stringify(raw));if(bytes.length>65536)throw Error('Room lifecycle intent limit');return parseFileJson(bytes);};
function owner(c:Context,p:RoomLifecyclePrincipal){if(c.meta.id!==p.roomId||c.meta.closed||c.meta.schemaMajor!==1||c.meta.ownerUid!==p.uid||!c.member.active||c.member.role!=='owner'||c.member.epoch!==p.membershipEpoch)throw Error('Room lifecycle unavailable');}
function next(c:Context){const version=integer.parse(c.meta.lifecycleVersion??0);if(version===Number.MAX_SAFE_INTEGER)throw Error('Room lifecycle version capacity');return version+1;}
/** Only the demo-service boundary may construct this adapter. Closed identity fences never expire. */
export function createRoomLifecycleAdapter(o:Options){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Explicit loopback emulators required');
 const refFor=(p:RoomLifecyclePrincipal)=>{id.parse(p.uid);id.parse(p.roomId);hex.parse(p.sessionId);integer.parse(p.membershipEpoch);return o.db.doc('rooms/'+p.roomId);};
 async function identity(p:RoomLifecyclePrincipal,kind:'withdraw'|'close',input:Record<string,unknown>){const{operationId,...intent}=input;if(input.roomId!==p.roomId||operationId!==await roomLifecycleOperationId(p.uid,kind,intent))throw Error('Room lifecycle unavailable');}
 const bound=(p:RoomLifecyclePrincipal,input:{membershipEpoch:number;sessionId:string})=>{if(input.membershipEpoch!==p.membershipEpoch||input.sessionId!==p.sessionId)throw Error('Room lifecycle unavailable');};
 async function authorizedSnapshot(p:RoomLifecyclePrincipal){const ref=refFor(p);return o.db.runTransaction(async tx=>{const c=await o.authorize(tx,ref,p);owner(c,p);const result=await o.readSnapshot(tx,ref,c.meta),snapshot=roomPublicExportSnapshotSchema.parse(result.snapshot);if(snapshot.metadata.id!==p.roomId)throw Error('Room snapshot unavailable');return{c,snapshot,snapshotDigest:await digest(snapshot)};});}
 async function recheck(p:RoomLifecyclePrincipal,expected:string){const fresh=await authorizedSnapshot(p);if(fresh.snapshotDigest!==expected)throw Error('Room snapshot changed; request a fresh export');}
 async function status(p:RoomLifecyclePrincipal){const current=await authorizedSnapshot(p);return roomLifecycleStatusSchema.parse({roomId:p.roomId,serverTime:Date.now(),lifecycleVersion:current.c.meta.lifecycleVersion??0,snapshotDigest:current.snapshotDigest,cardCount:current.snapshot.cards.length,mediaCount:current.snapshot.assets.length,ordinaryReceiptCount:current.c.meta.receiptCount??0});}
 async function exportPackage(p:RoomLifecyclePrincipal){
  const current=await authorizedSnapshot(p),bytes=new Map<string,Uint8Array>();
  for(const asset of current.snapshot.assets){const data=await o.store.readAsset(p.roomId,asset.id,asset.bytes,asset.hash);await recheck(p,current.snapshotDigest);bytes.set(asset.id,data);}
  const result=await exportRoomPublicPackage({roomId:p.roomId,uid:p.uid,ownerUid:current.c.meta.ownerUid,member:current.c.member,schemaMajor:1,closed:false},current.snapshot,bytes);await recheck(p,current.snapshotDigest);return result;
 }
 async function withdraw(p:RoomLifecyclePrincipal,raw:unknown){
  const input=roomWithdrawRequestSchema.parse(body(raw));await identity(p,'withdraw',input);bound(p,input);const ref=refFor(p),cardRef=ref.collection('cards').doc(input.cardId),tombstoneRef=ref.collection('cardTombstones').doc(input.cardId);
  return o.db.runTransaction(async tx=>{
   const c=await o.authorize(tx,ref,p);owner(c,p);const[card,tombstone]=await Promise.all([tx.get(cardRef),tx.get(tombstoneRef)]);
   if(tombstone.exists){const result=roomWithdrawResultSchema.parse(tombstone.get('result'));if(result.receipt.uid===p.uid&&result.receipt.operationId===input.operationId&&result.receipt.requestDigest===input.operationId)return roomWithdrawResultSchema.parse({...result,replayed:true});throw Error('Withdrawal context changed');}
   const publicState=await o.readSnapshot(tx,ref,c.meta),snapshot=roomPublicExportSnapshotSchema.parse(publicState.snapshot),record=snapshot.cards.find(card=>card.payload.id===input.cardId);if(!card.exists||!record)throw Error('Room lifecycle unavailable');if(record.version!==input.baseVersion||record.version===Number.MAX_SAFE_INTEGER)throw Error('Stale card version');
   const cards=snapshot.cards.filter(card=>card.payload.id!==input.cardId),referenced=new Set(cards.flatMap(card=>card.payload.assetIds)),assets=snapshot.assets.filter(asset=>referenced.has(asset.id)),removed=snapshot.assets.filter(asset=>!referenced.has(asset.id)),nextSnapshot:RoomPublicExportSnapshot={metadata:snapshot.metadata,cards,presentations:[],assets},measurement=measureRoomSnapshot(nextSnapshot,assets.map(a=>({assetId:a.id,hash:a.hash,bytes:a.bytes}))),mediaRecords=await Promise.all(removed.map(asset=>tx.get(ref.collection('media').doc(asset.id))));
   const lifecycleVersion=next(c),entry={uid:p.uid,kind:'withdraw' as const,entityId:input.cardId,version:record.version+1,at:Date.now()},applyAudit=await o.audit(tx,ref,entry),now=Date.now(),receipt=roomLifecycleReceiptSchema.parse({uid:p.uid,kind:'withdraw',operationId:input.operationId,requestDigest:input.operationId,entityId:input.cardId,version:record.version+1,acceptedAt:now}),result=roomWithdrawResultSchema.parse({withdrawn:true,cardId:input.cardId,lifecycleVersion,receipt,replayed:false});
   applyAudit();tx.delete(cardRef);tx.create(tombstoneRef,{id:input.cardId,version:record.version+1,result});tx.update(ref,{lifecycleVersion,...roomAccountingFields(measurement)});
   for(const[index,asset]of removed.entries()){const previous=mediaRecords[index]!;tx.set(previous.ref,{id:asset.id,withdrawn:true,version:integer.parse(previous.get('version')??0)+1,hash:asset.hash,bytes:asset.bytes,withdrawnAt:now});tx.set(ref.collection('mediaCleanup').doc(asset.id),{roomId:p.roomId,assetId:asset.id,hash:asset.hash,requestedAt:now,deadlineAt:now+day});}
   return result;
  });
 }
 async function close(p:RoomLifecyclePrincipal,raw:unknown){
  const input=roomCloseRequestSchema.parse(body(raw));id.parse(p.uid);id.parse(p.roomId);await identity(p,'close',input);const ref=o.db.doc('rooms/'+p.roomId),closedByDigest=await digest({uid:p.uid,roomId:p.roomId});
  return o.db.runTransaction(async tx=>{
   const doc=await tx.get(ref),meta=doc.data();if(meta?.closed===true){if(meta.schemaMajor!==1||meta.id!==p.roomId||meta.closeOperationId!==input.operationId||meta.closeRequestDigest!==input.operationId||meta.closedByDigest!==closedByDigest)throw Error('Room lifecycle unavailable');return roomCloseResultSchema.parse({closed:true,replayed:true,receipt:{operationId:input.operationId,requestDigest:input.operationId,uid:p.uid,kind:'close',entityId:p.roomId,version:meta.closeEpoch,acceptedAt:meta.closedAt}});}
   refFor(p);bound(p,input);const c=await o.authorize(tx,ref,p);owner(c,p);const publicState=await o.readSnapshot(tx,ref,c.meta),snapshot=roomPublicExportSnapshotSchema.parse(publicState.snapshot);if(input.baseVersion!==(c.meta.lifecycleVersion??0)||await digest(snapshot)!==input.snapshotDigest)throw Error('Room snapshot changed; review a fresh closure');
   const subjects=[...new Set([...Object.keys(c.meta.members??{}),c.meta.ownerUid])],accounts=await Promise.all(subjects.map(uid=>tx.get(o.db.doc('accounts/'+id.parse(uid))))),version=next(c),entry={uid:p.uid,kind:'close' as const,entityId:p.roomId,version,at:Date.now()},applyAudit=await o.audit(tx,ref,entry),now=Date.now(),receipt=roomLifecycleReceiptSchema.parse({operationId:input.operationId,requestDigest:input.operationId,uid:p.uid,kind:'close',entityId:p.roomId,version,acceptedAt:now});
   applyAudit();tx.set(ref,{id:p.roomId,schemaMajor:1,closed:true,closeEpoch:version,closedAt:now,closeOperationId:input.operationId,closeRequestDigest:input.operationId,closedByDigest});for(const account of accounts)if(account.exists){const data=account.data()!;tx.update(account.ref,{ownedRooms:(data.ownedRooms??[]).filter((id:string)=>id!==p.roomId),joinedRooms:(data.joinedRooms??[]).filter((id:string)=>id!==p.roomId)});}tx.set(o.db.doc('roomCleanup/'+p.roomId),{roomId:p.roomId,requestedAt:now,deadlineAt:now+day});return roomCloseResultSchema.parse({closed:true,receipt,replayed:false});
  });
 }
 /** Durable jobs are processed by the central local worker. Explicit scope also keeps independent probes isolated. */
 async function cleanupPending(roomId:string){
  id.parse(roomId);const ref=o.db.doc('rooms/'+roomId),room=await ref.get();if(room.get('closed')===true){await o.store.discardRoom(roomId);for(const collection of await ref.listCollections()){while(true){const docs=await collection.limit(100).get();if(docs.empty)break;const batch=o.db.batch();for(const doc of docs.docs)batch.delete(doc.ref);await batch.commit();}}await o.db.doc('roomCleanup/'+roomId).delete();return;}
  const jobs=await ref.collection('mediaCleanup').limit(200).get();for(const job of jobs.docs){const raw=job.data();if(raw.roomId!==roomId||job.id!==raw.assetId)throw Error('Cleanup room identity mismatch');const assetId=id.parse(raw.assetId),hash=hex.parse(raw.hash),media=await ref.collection('media').doc(assetId).get();if(media.exists&&media.get('withdrawn')===true&&media.get('hash')===hash&&!media.get('payload'))await o.store.discardAsset(roomId,assetId,hash);await job.ref.delete();}
 }
 return{status,export:exportPackage,withdraw,close,cleanupPending};
}
