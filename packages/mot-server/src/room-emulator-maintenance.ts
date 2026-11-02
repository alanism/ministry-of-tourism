import type {Firestore,DocumentReference} from 'firebase-admin/firestore';
import {z} from 'zod';
import {roomSharedMediaSchema} from '../../core/src/trip/shared-room-media.ts';
import type {createRoomEmulatorByteStore} from './room-emulator-storage.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),day=86400000;
interface Options{db:Firestore;store:ReturnType<typeof createRoomEmulatorByteStore>;lifecycleCleanup(roomId:string):Promise<unknown>;}
/** Internal bounded worker only. Never a client endpoint or an ordinary-content expiration policy. */
export function createRoomMaintenance(o:Options){
 if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9199')throw Error('Explicit loopback emulators required');
 let stopped=false,running:Promise<{expiredStages:number;orphanTargets:number;roomJobs:number;errors:number}>|undefined;
 function roomFor(ref:DocumentReference,roomId:string,collection:string){id.parse(roomId);if(ref.parent.id!==collection||ref.parent.parent?.path!=='rooms/'+roomId)throw Error('Cleanup path outside room');return o.db.doc('rooms/'+roomId);}
 async function expiredStage(ref:DocumentReference){
  return o.db.runTransaction(async tx=>{const doc=await tx.get(ref);if(!doc.exists)return;const stage=doc.data()!,roomId=id.parse(stage.roomId),roomRef=roomFor(ref,roomId,'mediaStages'),room=await tx.get(roomRef),now=Date.now();if(room.get('id')!==roomId||room.get('schemaMajor')!==1||integer.parse(stage.expiresAt)>now)return;
   const uid=id.parse(stage.uid),stageId=hex.parse(stage.id);if(stageId!==ref.id)throw Error('Staging identity mismatch');
   const deadlineAt=integer.parse(stage.expiresAt)+day;tx.set(roomRef.collection('stageCleanup').doc(stageId),{roomId,uid,stageId,deadlineAt});
   if(stage.asset){const asset=roomSharedMediaSchema.parse(stage.asset);if(asset.id!==stage.input?.assetId)throw Error('Orphan asset identity mismatch');tx.set(roomRef.collection('mediaOrphanCleanup').doc(asset.id+'-'+asset.hash),{roomId,assetId:asset.id,hash:asset.hash,bytes:asset.bytes,requestedAt:now,deadlineAt});}
   tx.delete(ref);return true;
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
  const stages=await o.db.collectionGroup('mediaStages').where('expiresAt','<=',Date.now()).limit(50).get();for(const stage of stages.docs){if(!within())break;try{if(await expiredStage(stage.ref))summary.expiredStages++;}catch{summary.errors++;}}
  const stageJobs=await o.db.collectionGroup('stageCleanup').limit(50).get();for(const doc of stageJobs.docs){if(!within())break;try{const job=doc.data(),roomId=id.parse(job.roomId);roomFor(doc.ref,roomId,'stageCleanup');await o.store.discardStage(roomId,id.parse(job.uid),hex.parse(job.stageId));if(Date.now()>=integer.parse(job.deadlineAt))await doc.ref.delete();}catch{summary.errors++;}}
  const orphans=await o.db.collectionGroup('mediaOrphanCleanup').limit(50).get();for(const job of orphans.docs){if(!within())break;try{if(await orphan(job.ref))summary.orphanTargets++;}catch{summary.errors++;}}
  const mediaJobs=await o.db.collectionGroup('mediaCleanup').limit(50).get(),roomJobs=await o.db.collection('roomCleanup').limit(20).get(),rooms=new Set<string>();for(const job of mediaJobs.docs){try{const roomId=id.parse(job.get('roomId'));roomFor(job.ref,roomId,'mediaCleanup');rooms.add(roomId);}catch{summary.errors++;}}for(const job of roomJobs.docs){try{const roomId=id.parse(job.get('roomId'));if(job.id!==roomId)throw Error('Cleanup identity mismatch');rooms.add(roomId);}catch{summary.errors++;}}
  for(const roomId of rooms){if(!within())break;try{const queue=o.db.doc('roomCleanup/'+roomId),before=await queue.get();await o.lifecycleCleanup(roomId);if(before.exists&&Date.now()<integer.parse(before.get('deadlineAt')))await queue.set(before.data()!);summary.roomJobs++;}catch{summary.errors++;}}
  return summary;
 }
 function tick(){if(stopped)return Promise.resolve({expiredStages:0,orphanTargets:0,roomJobs:0,errors:0});if(!running)running=run().finally(()=>{running=undefined;});return running;}
 const timer=setInterval(()=>{void tick().catch(()=>{});},60000);timer.unref();
 return{tick,async close(){stopped=true;clearInterval(timer);await running?.catch(()=>{});}};
}
