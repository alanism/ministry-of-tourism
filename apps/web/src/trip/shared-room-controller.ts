import {roomCardOperationSchema,sharedRoomCardSchema,type RoomSnapshot,type RoomCardOperation,type RoomOperationResult,type SharedRoomCard} from '../../../../packages/core/src/trip/shared-room-domain';
import {SharedRoomRequestError,type SharedRoomClient} from './shared-room-client';
export interface SharedRoomDraft {operation:RoomCardOperation;before:SharedRoomCard;status:'in-memory'|'pending'|'uncertain'|'conflict'|'rejected';message?:string;}
export interface SharedRoomView {access:'loading'|'ready'|'stale'|'unavailable';room?:RoomSnapshot;drafts:readonly SharedRoomDraft[];message:string;latestReceipt?:RoomOperationResult;}
export interface SharedRoomController {getSnapshot:()=>SharedRoomView;subscribe:(listener:()=>void)=>()=>void;refresh:()=>Promise<void>;beginEdit:(cardId:string)=>string;updateDraft:(operationId:string,payload:SharedRoomCard)=>void;sendDraft:(operationId:string)=>Promise<void>;undoLatest:()=>Promise<void>;discardDraft:(operationId:string)=>void;recoveryData:()=>unknown;dispose:()=>void;startPolling:()=>void;stopPolling:()=>void;}
function frozen<T>(value:T):T{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;}
export function createSharedRoomController(options:{client:SharedRoomClient;roomId:string;newOperationId?:()=>string}):SharedRoomController {
 roomCardOperationSchema.shape.roomId.parse(options.roomId);
 let view:SharedRoomView=frozen({access:'loading',drafts:[],message:'Shared room not loaded. Drafts are held in memory only.'}),disposed=false,generation=0,readSequence=0,readAbort:AbortController|undefined,polling=false,timer:ReturnType<typeof setTimeout>|undefined;
 let undo:{operation:RoomCardOperation;before:SharedRoomCard;receipt:RoomOperationResult}|undefined;
 const listeners=new Set<()=>void>(),writes=new Set<AbortController>(),newId=options.newOperationId??(()=>crypto.randomUUID());
 const emit=(patch:Partial<SharedRoomView>)=>{view=frozen({...view,...patch});for(const listener of listeners){try{listener();}catch{/* A view observer cannot change room acceptance. */}}};
 const current=()=>{if(disposed||view.access!=='ready'||!view.room)throw new SharedRoomRequestError('unavailable');return view.room;};
 const writable=()=>{const room=current();if(!['owner','editor'].includes(room.principal.role))throw new SharedRoomRequestError('unavailable');return room;};
 const bytes=(drafts:readonly SharedRoomDraft[])=>new TextEncoder().encode(JSON.stringify(drafts.map(d=>d.operation))).length;
 const validateQueue=(drafts:readonly SharedRoomDraft[])=>{if(drafts.length>100||bytes(drafts)>1024*1024||drafts.some(d=>new TextEncoder().encode(JSON.stringify(d.operation)).length>65536))throw new SharedRoomRequestError('limit');};
 const setDraft=(id:string,patch:Partial<SharedRoomDraft>)=>emit({drafts:view.drafts.map(d=>d.operation.operationId===id?{...d,...patch}:d)});
 async function refresh(){
  if(disposed)return;const sequence=++readSequence,epoch=generation;readAbort?.abort();const abort=new AbortController();readAbort=abort;
  if(!view.room)emit({access:'loading',message:'Checking current room access…'});
  try{const room=await options.client.read(options.roomId,abort.signal);if(disposed||epoch!==generation||sequence!==readSequence)return;
   if(room.roomId!==options.roomId||room.principal.uid!==options.client.uid)throw new SharedRoomRequestError('unavailable');
   emit({access:'ready',room,message:'Current authorized room copy. Drafts remain in memory; server acceptance does not prove another person viewed an edit.'});
  }catch(error){if(disposed||epoch!==generation||sequence!==readSequence)return;const failure=error instanceof SharedRoomRequestError?error:new SharedRoomRequestError('network');
   if(failure.code==='unavailable'){stopPolling();emit({access:'unavailable',room:undefined,latestReceipt:undefined,message:failure.message});}
   else emit({access:view.room?'stale':'unavailable',message:failure.message});
  }
 }
 function beginEdit(cardId:string){
  const room=writable(),card=room.cards.find(c=>c.payload.id===cardId);if(!card)throw new SharedRoomRequestError('unavailable');
  if(view.drafts.length>=100)throw new SharedRoomRequestError('limit');
  const operation=roomCardOperationSchema.parse({roomId:options.roomId,schemaMajor:1,capability:'room-cards/1',operationId:newId(),membershipEpoch:room.principal.membershipEpoch,kind:'edit',cardId,baseVersion:card.version,payload:card.payload});
  const draft:SharedRoomDraft={operation,before:structuredClone(card.payload),status:'in-memory'},drafts=[...view.drafts,draft];validateQueue(drafts);emit({drafts});return operation.operationId;
 }
 function updateDraft(id:string,payload:SharedRoomCard){
  const draft=view.drafts.find(d=>d.operation.operationId===id);if(!draft||draft.status!=='in-memory'||disposed)throw Error('A sent operation is immutable. Prepare a new draft after reviewing the current room.');
  const operation=roomCardOperationSchema.parse({...draft.operation,payload:sharedRoomCardSchema.parse(payload)});if(operation.payload.id!==draft.operation.cardId)throw Error('Draft card identity cannot change');
  const drafts=view.drafts.map(d=>d===draft?{...d,operation}:d);validateQueue(drafts);emit({drafts});
 }
 async function sendDraft(id:string){
  const draft=view.drafts.find(d=>d.operation.operationId===id);if(!draft||draft.status==='pending'||disposed)return;
  try{writable();}catch(error){setDraft(id,{status:'rejected',message:error instanceof Error?error.message:'Room access unavailable.'});return;}
  if(draft.status==='conflict'||draft.status==='rejected')return;
  const operation=structuredClone(draft.operation),epoch=generation,abort=new AbortController();writes.add(abort);setDraft(id,{status:'pending',message:'Pending room service acceptance. Not confirmed shared.'});
  try{const receipt=await options.client.operate(operation,abort.signal);if(disposed||epoch!==generation)return;
   if(operation.kind==='edit')undo={operation,before:structuredClone(draft.before),receipt};else undo=undefined;
   emit({drafts:view.drafts.filter(d=>d.operation.operationId!==id),latestReceipt:receipt,message:receipt.replayed?'The same operation was already accepted; no second effect.':'Accepted by the room service. This is not a local-save or another-viewer receipt.'});
   await refresh();
  }catch(error){if(disposed||epoch!==generation)return;const failure=error instanceof SharedRoomRequestError?error:new SharedRoomRequestError('network');
   setDraft(id,{status:failure.code==='conflict'?'conflict':['network','cancelled','invalid-response'].includes(failure.code)?'uncertain':'rejected',message:failure.message});
   if(failure.code==='unavailable'){stopPolling();emit({access:'unavailable',room:undefined,latestReceipt:undefined,message:failure.message});}
  }finally{writes.delete(abort);}
 }
 async function undoLatest(){
  const room=writable(),target=undo;if(!target||target.receipt.receipt.uid!==options.client.uid)throw Error('No trusted Undo is available in this live session.');
  const prior=view.drafts.find(d=>d.operation.kind==='undo'&&d.operation.undoOf===target.operation.operationId);if(prior){if(prior.status==='uncertain'||prior.status==='in-memory')await sendDraft(prior.operation.operationId);return;}
  const operation=roomCardOperationSchema.parse({...target.operation,operationId:newId(),membershipEpoch:room.principal.membershipEpoch,kind:'undo',baseVersion:target.receipt.receipt.version,undoOf:target.operation.operationId,payload:target.before});
  const draft:SharedRoomDraft={operation,before:structuredClone(target.operation.payload),status:'in-memory'},drafts=[...view.drafts,draft];validateQueue(drafts);emit({drafts});await sendDraft(operation.operationId);
 }
 function stopPolling(){polling=false;clearTimeout(timer);readAbort?.abort();}
 async function tick(){await refresh();if(polling&&!disposed&&view.access!=='unavailable')timer=setTimeout(()=>{void tick();},5000);}
 return{getSnapshot:()=>view,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},refresh,beginEdit,updateDraft,sendDraft,undoLatest,
  discardDraft(id){if(view.drafts.find(d=>d.operation.operationId===id)?.status==='pending')throw Error('Stop or await pending delivery before discarding its recovery copy.');emit({drafts:view.drafts.filter(d=>d.operation.operationId!==id)});},
  recoveryData:()=>({type:'mot-room-local-recovery',version:1,roomId:options.roomId,accountUid:options.client.uid,authority:'Untrusted local recovery copy; not an accepted operation or permission to replay.',drafts:structuredClone(view.drafts)}),
  dispose(){if(disposed)return;disposed=true;generation++;readSequence++;stopPolling();for(const write of writes)write.abort();undo=undefined;emit({access:'unavailable',room:undefined,latestReceipt:undefined,drafts:view.drafts.map(d=>d.status==='pending'?{...d,status:'uncertain',message:'Account or room left; keep this local recovery copy. Never replay it into another account or room.'}:d),message:'Room connection closed. No subscription or write remains bound to another account.'});listeners.clear();},
  startPolling(){if(disposed||polling)return;polling=true;void tick();},stopPolling,
 };
}
