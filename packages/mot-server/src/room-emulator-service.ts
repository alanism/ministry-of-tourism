import {roomSessionRoute} from './room-emulator-sessions.ts';
import {authorizeRoom} from './room-emulator-authority.ts';
import {reconcileRoomAccounting,roomAccountingFields,readRoomPublicSnapshot,mediaRoomAccounting} from './room-emulator-snapshot.ts';
import {createRoomEmulatorByteStore} from './room-emulator-storage.ts';
import {createRoomMediaAdapter} from './room-emulator-media.ts';
import {createRoomTransferAdapter} from './room-emulator-transfer.ts';
import {createRoomLifecycleAdapter} from './room-emulator-lifecycle.ts';
import {createRoomMaintenance} from './room-emulator-maintenance.ts';
import {admitRoomAttempt,prepareRoomAudit,RoomRateLimit} from './room-emulator-budgets.ts';
import {roomAdmissionRoute} from './room-emulator-admission.ts';
import {parseFileJson} from '../../core/src/trip/file-exchange-json.ts';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {applyRoomCardOperation,roomCardOperationSchema,roomSnapshotSchema,roomOperationResultSchema,type RoomCardState} from '../../core/src/trip/shared-room-domain.ts';

/** Local proof adapter ONLY: production credentials/configuration are deliberately unsupported. */
export function createRoomEmulatorService(){
  if(process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099'||(process.env.GCLOUD_PROJECT&&process.env.GCLOUD_PROJECT!=='demo-mot-rooms'))throw Error('Explicit demo-project loopback emulators required');
  const app=initializeApp({projectId:'demo-mot-rooms'},'mot-rooms-'+crypto.randomUUID()),db=getFirestore(app),auth=getAuth(app);
  const store=createRoomEmulatorByteStore(app),media=createRoomMediaAdapter({db,store,authorize:authorizeRoom,accounting:mediaRoomAccounting,publication:async(_tx,_ref,_uid,_cardId,assetId,input)=>({roomId:input.roomId,assetId,scope:'shared',personalOnly:false,privateAncestor:false,...(input.credit!==undefined?{credit:input.credit}:{}),...(input.rightsStatus!==undefined?{rightsStatus:input.rightsStatus}:{})})});
  const transfer=createRoomTransferAdapter({db,authorize:authorizeRoom,audit:prepareRoomAudit}),lifecycle=createRoomLifecycleAdapter({db,store,authorize:authorizeRoom,readSnapshot:readRoomPublicSnapshot,audit:prepareRoomAudit});
  const maintenance=createRoomMaintenance({db,store,lifecycleCleanup:roomId=>lifecycle.cleanupPending(roomId)}),ready=maintenance.tick();
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer'}});
  const unavailable=()=>json({error:{code:'unavailable',message:'Room operation unavailable',recoverableDraft:true}},403);
  async function handle(request:Request,transport?:{networkAddress:string}):Promise<Response>{
    const url=new URL(request.url);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return unavailable();
    const match=/^\/rooms(?:\/([A-Za-z0-9][A-Za-z0-9._:-]{0,199})(\/.*)?)?$/.exec(url.pathname);if(!match||url.search)return unavailable();
    let uid:string,authenticatedAt:number;
    try{const bearer=/^Bearer ([^\s]{1,8192})$/.exec(request.headers.get('authorization')??'');if(!bearer)return unavailable();const token=await auth.verifyIdToken(bearer[1]!,true);if(token.firebase.sign_in_provider==='anonymous'||token.email_verified!==true)return unavailable();uid=token.uid;authenticatedAt=token.auth_time*1000;}catch{return unavailable();}
    try{
      await ready;
      const action=match[2]??'';
      if(request.method==='POST'&&!['/revoke','/revoke-invite','/sessions/revoke','/lifecycle/withdraw','/lifecycle/close','/transfers/cancel'].includes(action)&&!action.endsWith('/discard'))await admitRoomAttempt(db,uid,match[1]??'create',transport?.networkAddress??'unknown',action==='/claims');
      const session=await roomSessionRoute(request,uid,db);if(session!==null)return json(session);
      const sessionId=request.headers.get('x-room-session')??'',membershipEpoch=Number(request.headers.get('x-room-membership-epoch'));
      const principal={uid,roomId:match[1]??'',sessionId,membershipEpoch};
      // A closed room retains only a same-subject/same-intent receipt fence, not membership.
      if(request.method==='POST'&&action==='/lifecycle/close')return json(await lifecycle.close(principal,await readJson(request)));
      if(url.pathname!=='/rooms'&&!url.pathname.endsWith('/claims'))await db.runTransaction(tx=>authorizeRoom(tx,db.doc('rooms/'+principal.roomId),principal));
      const admission=await roomAdmissionRoute(request,uid,db,principal);if(admission!==null)return json(admission);
      const roomId=match[1]!,ref=db.doc('rooms/'+roomId);
      if(request.method==='GET'&&action==='/lifecycle')return json(await lifecycle.status(principal));
      if(request.method==='GET'&&action==='/export'){const zip=await lifecycle.export(principal);return new Response(zip as BodyInit,{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="room-backup.mot.zip"','cache-control':'no-store'}});}
      if(request.method==='POST'&&action==='/lifecycle/withdraw')return json(await lifecycle.withdraw(principal,await readJson(request)));
      if(request.method==='GET'&&action==='/transfers')return json(await transfer.list({...principal,authenticatedAt}));
      if(request.method==='POST'&&/^\/transfers\/(offer|accept|cancel)$/.test(action)){const kind=action.split('/')[2] as 'offer'|'accept'|'cancel';return json(await transfer[kind]({...principal,authenticatedAt},await readJson(request)));}
      if(request.method==='POST'&&action==='/media/stages')return json(await media.reserve(principal,await readJson(request)));
      const stage=/^\/media\/stages\/([a-f0-9]{64})\/(bytes|commit|discard)$/.exec(action);
      if(request.method==='POST'&&stage){if(stage[2]==='bytes'){if(request.headers.get('content-type')!=='image/png')return unavailable();return json(await media.upload(principal,stage[1]!,()=>readBytes(request,10*1024*1024)));}if(stage[2]==='discard'){const raw=await readJson(request);if(!raw||typeof raw!=='object'||Object.keys(raw).length!==0)return unavailable();return json(await media.discard(principal,stage[1]!));}const raw=await readJson(request);if(!raw||typeof raw!=='object'||(raw as {stageId?:unknown}).stageId!==stage[1])return unavailable();return json(await media.commit(principal,raw));}
      const asset=/^\/media\/([A-Za-z0-9][A-Za-z0-9._:-]{0,199})$/.exec(action);if(request.method==='GET'&&asset){const result=await media.read(principal,asset[1]!);return new Response(result.bytes as BodyInit,{headers:{'content-type':'image/png','cache-control':'private,no-store','referrer-policy':'no-referrer'}});}
      if(request.method==='GET'&&!match[2]){
        const snapshot=await db.runTransaction(async tx=>{const{meta,member}=await authorizeRoom(tx,ref,principal),{snapshot}=await readRoomPublicSnapshot(tx,ref,meta);return roomSnapshotSchema.parse({serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1','room-admission/1','room-media/1','room-sessions/1','room-transfer/1','room-export/1','room-lifecycle/1'],roomId,principal:{uid,role:member.role,membershipEpoch:member.epoch,householdId:null,householdEpoch:null},cards:snapshot.cards,assets:snapshot.assets,sync:'accepted'});});return json(snapshot);
      }
      if(request.method!=='POST'||action!=='/operations')return unavailable();
      if(Number(request.headers.get('content-length')??0)>65536)return json({error:{code:'limit',message:'Room intent exceeds64KiB; retain local draft',recoverableDraft:true}},413);
      const reader=request.body?.getReader();if(!reader)return unavailable();const chunks:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){reader.releaseLock();return json({error:{code:'limit',message:'Room intent exceeds64KiB; retain local draft',recoverableDraft:true}},413);}chunks.push(part.value);}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const op=roomCardOperationSchema.parse(parseFileJson(bytes));if(op.roomId!==roomId)return unavailable();
      const now=Date.now();
      const result=await db.runTransaction(async tx=>{
        const cardRef=ref.collection('cards').doc(op.cardId),receiptRef=ref.collection('receipts').doc(op.operationId);
        await authorizeRoom(tx,ref,principal);const [room,card,prior]=await Promise.all([tx.get(ref),tx.get(cardRef),tx.get(receiptRef)]);const meta=room.data();if(!meta)throw Error('unavailable');const receipts:RoomCardState['receipts']={};if(prior.exists)receipts[op.operationId]=prior.data() as RoomCardState['receipts'][string];if(op.undoOf){const undo=await tx.get(ref.collection('receipts').doc(op.undoOf));if(undo.exists)receipts[op.undoOf]=undo.data() as RoomCardState['receipts'][string];}
        const state={...meta,cards:card.exists?{[op.cardId]:card.data()}: {},receipts} as RoomCardState;
        const accepted=await applyRoomCardOperation(state,uid,op,now);const accounting=accepted.replayed?null:await reconcileRoomAccounting(tx,ref,meta,{id:op.cardId,record:accepted.state.cards[op.cardId]!});if(!accepted.replayed){tx.set(cardRef,accepted.state.cards[op.cardId]!);tx.create(receiptRef,accepted.receipt);tx.update(ref,{receiptCount:accepted.state.receiptCount,...roomAccountingFields(accounting!)});}return roomOperationResultSchema.parse({receipt:accepted.receipt,replayed:accepted.replayed});
      });return json(result);
    }catch(error){if(error instanceof RoomRateLimit){const response=json({error:{code:'limit',message:'Room attempt limit reached; retain draft and retry later',recoverableDraft:true}},429);response.headers.set('retry-after',String(Math.max(1,Math.ceil(error.retryAfterMs/1000))));return response;}const message=error instanceof Error?error.message:'';if(/Stale|conflict|Undo|snapshot changed/i.test(message))return json({error:{code:'conflict',message:'Room content changed; retain draft and review current version',recoverableDraft:true}},409);if(/capacity|limit|64KiB/.test(message))return json({error:{code:'limit',message:'Room limit reached; retain draft and recover locally',recoverableDraft:true}},413);return unavailable();}
  }
  return{handle,async close(){await maintenance.close();await db.terminate();await deleteApp(app);}};
}
async function readBytes(request:Request,max:number){if(Number(request.headers.get('content-length')??0)>max)throw Error('Room intent limit');const reader=request.body?.getReader();if(!reader)throw Error('Room intent unavailable');const chunks:Uint8Array[]=[];let n=0;while(true){const part=await reader.read();if(part.done)break;n+=part.value.length;if(n>max){reader.releaseLock();throw Error('Room intent limit');}chunks.push(part.value);}const out=new Uint8Array(n);let at=0;for(const c of chunks){out.set(c,at);at+=c.length;}return out;}
async function readJson(request:Request){if(request.headers.get('content-type')!=='application/json')throw Error('Room intent unavailable');return parseFileJson(await readBytes(request,65536));}
