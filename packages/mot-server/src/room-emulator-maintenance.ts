import {FieldPath,type Firestore,type DocumentReference,type Query,type QueryDocumentSnapshot} from 'firebase-admin/firestore';
import {z} from 'zod';
import {roomSharedMediaSchema} from '../../core/src/trip/shared-room-media.ts';
import type {createRoomEmulatorByteStore} from './room-emulator-storage.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),day=86400000;
interface Options{db:Firestore;store:ReturnType<typeof createRoomEmulatorByteStore>;lifecycleCleanup(roomId:string):Promise<unknown>;}
/** Internal bounded worker only. Never a client endpoint or an ordinary-content expiration policy. */
export function createRoomMaintenance(o:Options){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Explicit loopback emulators required');
 let stopped=false,running:Promise<{expiredStages:number;orphanTargets:number;roomJobs:number;errors:number}>|undefined,turn=0;
 const cursors=new Map<string,QueryDocumentSnapshot>();
 async function batch(name:string,limit:number,group=true,expiry?:{field:string;before:number}){
  let query:Query=group?o.db.collectionGroup(name):o.db.collection(name);if(expiry)query=query.where(expiry.field,'<=',expiry.before).orderBy(expiry.field);query=query.orderBy(FieldPath.documentId()).limit(limit);
  const cursor=cursors.get(name);let result=await(cursor?query.startAfter(cursor):query).get();if(result.empty&&cursor){cursors.delete(name);result=await query.get();}return result.docs;
 }
 function roomFor(ref:DocumentReference,roomId:string,collection:string){id.parse(roomId);if(ref.parent.id!==collection||ref.parent.parent?.path!=='rooms/'+roomId)throw Error('Cleanup path outside room');return o.db.doc('rooms/'+roomId);}
 async function expiredStage(ref:DocumentReference){
  return o.db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists)return;const stage=doc.data()!,roomId=id.parse(stage.roomId),roomRef=roomFor(ref,roomId,'mediaStages'),room=await tx.get(roomRef),now=Date.now();if(room.get('id')!==roomId||room.get('schemaMajor')!==1||integer.parse(stage.expiresAt)>now)return;
   const uid=id.parse(stage.uid),stageId=hex.parse(stage.id);if(stageId!==ref.id)throw Error('Staging identity mismatch');
   const deadlineAt=integer.parse(stage.expiresAt)+day;tx.set(roomRef.collection('stageCleanup').doc(stageId),{roomId,uid,stageId,deadlineAt});
   if(stage.asset){const asset=roomSharedMediaSchema.parse(stage.asset);if(asset.id!==stage.input?.assetId)throw Error('Orphan asset identity mismatch');tx.set(roomRef.collection('mediaOrphanCleanup').doc(asset.id+'-'+asset.hash),{roomId,assetId:asset.id,hash:asset.hash,bytes:asset.bytes,requestedAt:now,deadlineAt});}
   tx.delete(ref);return{roomId,uid,stageId};
  });
 }
 async function orphan(ref:DocumentReference){
  const candidate=await o.db.runTransaction(async tx=>{const jobDoc=await tx.get(ref);if(!jobDoc.exists)return;const job=jobDoc.data()!,roomId=id.parse(job.roomId),roomRef=roomFor(ref,roomId,'mediaOrphanCleanup'),assetId=id.parse(job.assetId),hash=hex.parse(job.hash),[room,media,cards,stages]=await Promise.all([tx.get(roomRef),tx.get(roomRef.collection('media').doc(assetId)),tx.get(roomRef.collection('cards').limit(501)),tx.get(roomRef.collection('mediaStages').where('input.assetId','==',assetId).where('expiresAt','>',Date.now()).where('phase','in',['reserved','uploading','uploaded']).limit(1))]);
   if(room.get('id')!==roomId||room.get('schemaMajor')!==1)throw Error('Cleanup room unavailable');if(room.get('closed'))return;if(cards.size>500)throw Error('Unknown room reference boundary');
   const referenced=cards.docs.some(doc=>Array.isArray(doc.get('payload.assetIds'))&&doc.get('payload.assetIds').includes(assetId)),payload=media.get('payload');
   if(referenced&&payload?.hash===hash){tx.delete(ref);return;}
   if(stages.size)return;
   if(!referenced){if(!media.exists||media.get('withdrawn')!==true)tx.set(media.ref,{id:assetId,withdrawn:true,version:1,hash,bytes:integer.parse(job.bytes),withdrawnAt:Date.now()});const epoch=integer.parse(room.get('mediaAdmissionEpoch')??0);if(epoch===Number.MAX_SAFE_INTEGER)throw Error('Media admission version capacity');tx.update(roomRef,{mediaAdmissionEpoch:epoch+1});}
   else if(!media.exists||!payload||payload.hash===hash)return;
   // The accepted record or permanent tombstone prevents future reservations reusing this ID.
   return{roomId,assetId,hash,deadlineAt:integer.parse(job.deadlineAt)};
  });
  if(!candidate)return false;await o.store.discardAsset(candidate.roomId,candidate.assetId,candidate.hash);if(Date.now()>=candidate.deadlineAt)await ref.delete();return true;
 }
 async function run(){
  const summary={expiredStages:0,orphanTargets:0,roomJobs:0,errors:0},started=Date.now(),within=()=>!stopped&&Date.now()-started<5000;
  async function process(name:string,docs:QueryDocumentSnapshot[],action:(doc:QueryDocumentSnapshot)=>Promise<void>){for(const doc of docs){if(!within())break;try{await action(doc);}catch{summary.errors++;}finally{cursors.set(name,doc);}}}
  async function roomJob(doc:QueryDocumentSnapshot,collection:string){const roomId=id.parse(doc.get('roomId'));if(collection==='roomCleanup'){if(doc.id!==roomId)throw Error('Cleanup identity mismatch');}else roomFor(doc.ref,roomId,collection);const queue=o.db.doc('roomCleanup/'+roomId),before=await queue.get();await o.lifecycleCleanup(roomId);if(before.exists&&Date.now()<integer.parse(before.get('deadlineAt')))await queue.set(before.data()!);summary.roomJobs++;}
  async function expireRecords(name:string,field:string,before:number){await process(name,await batch(name,50,true,{field,before}),async doc=>{const room=doc.ref.parent.parent;if(!room||room.parent.id!=='rooms')throw Error('Expiry path outside rooms');id.parse(room.id);const value=integer.parse(doc.get(field));if(value<=before)await doc.ref.delete();});}
  const queues=[
   async()=>process('mediaStages',await batch('mediaStages',50,true,{field:'expiresAt',before:Date.now()}),async doc=>{const expired=await expiredStage(doc.ref);if(expired){summary.expiredStages++;await o.store.discardStage(expired.roomId,expired.uid,expired.stageId);}}),
   async()=>process('stageCleanup',await batch('stageCleanup',50),async doc=>{const job=doc.data(),roomId=id.parse(job.roomId);roomFor(doc.ref,roomId,'stageCleanup');await o.store.discardStage(roomId,id.parse(job.uid),hex.parse(job.stageId));if(Date.now()>=integer.parse(job.deadlineAt))await doc.ref.delete();}),
   async()=>process('mediaOrphanCleanup',await batch('mediaOrphanCleanup',50),async doc=>{if(await orphan(doc.ref))summary.orphanTargets++;}),
   async()=>process('mediaCleanup',await batch('mediaCleanup',50),doc=>roomJob(doc,'mediaCleanup')),
   async()=>process('roomCleanup',await batch('roomCleanup',20,false),doc=>roomJob(doc,'roomCleanup')),
   async()=>expireRecords('securityAudit','at',Date.now()-30*day),
   async()=>expireRecords('invites','expiresAt',Date.now()),
   async()=>expireRecords('claims','expiresAt',Date.now())
  ];const first=turn++%queues.length;for(let index=0;index<queues.length&&within();index++)await queues[(first+index)%queues.length]!();
  return summary;
 }
 function tick(){if(stopped)return Promise.resolve({expiredStages:0,orphanTargets:0,roomJobs:0,errors:0});if(!running)running=run().finally(()=>{running=undefined;});return running;}
 const timer=setInterval(()=>{void tick().catch(()=>{});},60000);timer.unref();
 return{tick,async close(){stopped=true;clearInterval(timer);await running?.catch(()=>{});}};
}
