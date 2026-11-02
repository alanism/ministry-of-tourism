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
  const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json','cache-control':'no-store','referrer-policy':'no-referrer'}});
  const unavailable=()=>json({error:{code:'unavailable',message:'Room operation unavailable',recoverableDraft:true}},403);
  async function handle(request:Request):Promise<Response>{
    const url=new URL(request.url);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))return unavailable();
    const match=/^\/rooms(?:\/([A-Za-z0-9][A-Za-z0-9._:-]{0,199})(\/(?:operations|admission|invites|claims|approve|revoke|revoke-invite))?)?$/.exec(url.pathname);if(!match||url.search)return unavailable();
    let uid:string;
    try{const bearer=/^Bearer ([^\s]{1,8192})$/.exec(request.headers.get('authorization')??'');if(!bearer)return unavailable();const token=await auth.verifyIdToken(bearer[1]!,true);if(token.firebase.sign_in_provider==='anonymous'||token.email_verified!==true)return unavailable();uid=token.uid;}catch{return unavailable();}
    try{
      const admission=await roomAdmissionRoute(request,uid,db);if(admission!==null)return json(admission);
      const roomId=match[1]!,ref=db.doc('rooms/'+roomId);
      if(request.method==='GET'&&!match[2]){
        const snapshot=await db.runTransaction(async tx=>{const room=await tx.get(ref);const meta=room.data();const member=meta?.members?.[uid];if(!meta||meta.schemaMajor!==1||meta.closed||!member?.active)throw Error('unavailable');const cards=await tx.get(ref.collection('cards').limit(501));if(cards.size>500)throw Error('unavailable');return roomSnapshotSchema.parse({serviceMode:'local-emulator',schemaMajor:1,capabilities:['room-cards/1'],roomId,principal:{uid,role:member.role,membershipEpoch:member.epoch,householdId:null,householdEpoch:null},cards:cards.docs.map(d=>d.data()),sync:'accepted'});});return json(snapshot);
      }
      if(request.method!=='POST'||!match[2])return unavailable();
      if(Number(request.headers.get('content-length')??0)>65536)return json({error:{code:'limit',message:'Room intent exceeds64KiB; retain local draft',recoverableDraft:true}},413);
      const reader=request.body?.getReader();if(!reader)return unavailable();const chunks:Uint8Array[]=[];let size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>65536){await reader.cancel();return json({error:{code:'limit',message:'Room intent exceeds64KiB; retain local draft',recoverableDraft:true}},413);}chunks.push(part.value);}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}const op=roomCardOperationSchema.parse(parseFileJson(bytes));if(op.roomId!==roomId)return unavailable();
      const now=Date.now();
      const result=await db.runTransaction(async tx=>{
        const cardRef=ref.collection('cards').doc(op.cardId),receiptRef=ref.collection('receipts').doc(op.operationId);
        const [room,card,prior]=await Promise.all([tx.get(ref),tx.get(cardRef),tx.get(receiptRef)]);const meta=room.data();if(!meta)throw Error('unavailable');const receipts:RoomCardState['receipts']={};if(prior.exists)receipts[op.operationId]=prior.data() as RoomCardState['receipts'][string];if(op.undoOf){const undo=await tx.get(ref.collection('receipts').doc(op.undoOf));if(undo.exists)receipts[op.undoOf]=undo.data() as RoomCardState['receipts'][string];}
        const state={...meta,cards:card.exists?{[op.cardId]:card.data()}: {},receipts} as RoomCardState;
        const accepted=await applyRoomCardOperation(state,uid,op,now);if(!accepted.replayed){tx.set(cardRef,accepted.state.cards[op.cardId]!);tx.create(receiptRef,accepted.receipt);tx.update(ref,{receiptCount:accepted.state.receiptCount});}return roomOperationResultSchema.parse({receipt:accepted.receipt,replayed:accepted.replayed});
      });return json(result);
    }catch(error){const message=error instanceof Error?error.message:'';if(/Stale|conflict|Undo/.test(message))return json({error:{code:'conflict',message:'Room content changed; retain draft and review current version',recoverableDraft:true}},409);if(/capacity|limit|64KiB/.test(message))return json({error:{code:'limit',message:'Room limit reached; retain draft and recover locally',recoverableDraft:true}},413);return unavailable();}
  }
  return{handle,async close(){await db.terminate();await deleteApp(app);}};
}
