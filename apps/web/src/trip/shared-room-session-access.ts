import type{z}from'zod';
import{roomAdminOperationId}from'../../../../packages/core/src/trip/shared-room-admission';
import{roomSessionRegisterSchema,roomSessionRevokeSchema,type roomSessionBootstrapSchema}from'../../../../packages/core/src/trip/shared-room-session-wire';
import type{RoomRegisteredSession}from'../../../../packages/core/src/trip/shared-room-sessions';
import{sharedRoomAwait,SharedRoomRequestError,type SharedRoomServiceClient}from'./shared-room-client';
type Registration=z.infer<typeof roomSessionRegisterSchema>;
type Revocation=z.infer<typeof roomSessionRevokeSchema>;
type Pending={kind:'register';request:Registration}|{kind:'revoke';request:Revocation};
export interface SharedRoomSessionView{state:'idle'|'pending'|'ready'|'uncertain'|'rejected'|'limit';roomId?:string;session?:RoomRegisteredSession;sessions:readonly RoomRegisteredSession[];pending?:Pending;message?:string;}
/** One current resource, not a membership engine. Only service-issued sessions reach the content client. */
export function createSharedRoomSessionAccess(client:SharedRoomServiceClient){
 let view:SharedRoomSessionView=Object.freeze({state:'idle',sessions:Object.freeze([])}),bootstrap:z.infer<typeof roomSessionBootstrapSchema>|undefined,bound:SharedRoomServiceClient|undefined,action:Pending|undefined,busy=false,disposed=false,abort:AbortController|undefined;
 const listeners=new Set<()=>void>(),fail=(code:ConstructorParameters<typeof SharedRoomRequestError>[0]):never=>{throw new SharedRoomRequestError(code);};
 function update(patch:Partial<SharedRoomSessionView>){const session=Object.hasOwn(patch,'session')?patch.session:view.session;view=Object.freeze({...view,...patch,session:session?Object.freeze({...session}):undefined,sessions:Object.freeze((patch.sessions??view.sessions).map(record=>Object.freeze({...record})))});for(const listener of listeners){try{listener();}catch{/* A view cannot change service acceptance. */}}}
 function check(signal?:AbortSignal){if(disposed||signal?.aborted)fail('cancelled');}
 async function run(prepare:(signal:AbortSignal)=>Promise<Pending>,caller?:AbortSignal){
  check(caller);if(busy)fail('conflict');busy=true;abort=new AbortController();const signal=caller?AbortSignal.any([caller,abort.signal]):abort.signal;update({state:'pending',message:undefined});
  try{const next=await sharedRoomAwait(()=>prepare(signal),signal);check(signal);action=Object.freeze({...next,request:Object.freeze({...next.request})}) as Pending;update({pending:action});const reply=await sharedRoomAwait(()=>action!.kind==='register'?client.registerSession(action!.request,signal):client.revokeSession(action!.request as Revocation,signal),signal);check(signal);
   if(next.kind==='register'){bound=client.withSession(reply.session);update({session:reply.session,sessions:[...view.sessions.filter(record=>record.id!==reply.session.id),reply.session],state:'ready',pending:undefined});}
   else{if(view.session?.id===reply.session.id){bound=undefined;update({session:undefined});}update({sessions:view.sessions.filter(record=>record.id!==reply.session.id),state:bound?'ready':'idle',pending:undefined});}
   if(bootstrap)bootstrap={...bootstrap,admissionVersion:reply.admissionVersion,sessions:view.sessions.map(record=>({...record}))};action=undefined;return bound;
  }catch(cause){if(!disposed){const error=cause instanceof SharedRoomRequestError?cause:new SharedRoomRequestError('network'),uncertain=!!action&&['network','cancelled','invalid-response'].includes(error.code);update({state:uncertain?'uncertain':error.code==='limit'?'limit':'rejected',message:error.message});}throw cause;}
  finally{busy=false;}
 }
 async function open(roomId:string,signal?:AbortSignal){check(signal);if(busy||action)fail('conflict');if(bound&&view.session){if(view.session.roomId===roomId)return bound;fail('conflict');}const result=await run(async current=>{
   const result=await client.sessions(roomId,current);check(current);bootstrap=result;update({roomId,sessions:result.sessions});if(result.sessions.length>=3)fail('limit');const intent={roomId,schemaMajor:1 as const,capability:'room-sessions/1' as const,membershipEpoch:result.membershipEpoch,baseVersion:result.admissionVersion},request=roomSessionRegisterSchema.parse({...intent,operationId:await roomAdminOperationId(client.uid,roomId,'session-register',intent)});return{kind:'register',request};
  },signal);if(!result)return fail('unavailable');return result;
 }
 async function revoke(id:string,signal?:AbortSignal){check(signal);if(action||busy)fail('conflict');const record=view.sessions.find(record=>record.id===id);if(!record||!bootstrap)return fail('unavailable');await run(async()=>{const intent={roomId:record.roomId,schemaMajor:1 as const,capability:'room-sessions/1' as const,membershipEpoch:record.membershipEpoch,baseVersion:1,sessionId:id};return{kind:'revoke',request:roomSessionRevokeSchema.parse({...intent,operationId:await roomAdminOperationId(client.uid,record.roomId,'session-revoke',intent)})};},signal);}
 async function inspect(signal?:AbortSignal){check(signal);if(busy||action||!view.roomId)return fail('conflict');busy=true;abort=new AbortController();const current=signal?AbortSignal.any([signal,abort.signal]):abort.signal;
  try{const result=await sharedRoomAwait(()=>client.sessions(view.roomId!,current),current);check(current);bootstrap=result;const held=view.session,stillCurrent=held&&result.membershipEpoch===held.membershipEpoch&&result.sessions.some(record=>record.id===held.id);if(!stillCurrent)bound=undefined;update({sessions:result.sessions,session:stillCurrent?held:undefined,state:stillCurrent?'ready':'idle',message:stillCurrent?'Current own session is registered.':'Current membership checked. Open the room explicitly to register; old content drafts must not be replayed.'});}
  finally{busy=false;}
 }
 return{getSnapshot:()=>view,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener);},open,revoke,inspect,
  async retry(signal?:AbortSignal){if(!action||view.state!=='uncertain')return fail('conflict');const held=action;return run(async()=>held,signal);},
  async close(signal?:AbortSignal){if(action||busy)fail('conflict');if(view.session)await revoke(view.session.id,signal);},
  cancel(){abort?.abort();},
  discard(){if(busy)fail('conflict');action=undefined;update({pending:undefined,state:bound?'ready':'idle',message:'Local retry context discarded. A prior server effect may still exist; inspect your own sessions before registering again.'});},
  recoveryData:()=>({type:'room-session-local-recovery',uid:client.uid,roomId:view.roomId,pending:action,session:view.session,note:'No token is included. Session metadata grants no access. Inspect current authenticated sessions; do not replay this file as authority.'}),
  dispose(){if(disposed)return;disposed=true;abort?.abort();bound=undefined;action=undefined;bootstrap=undefined;update({state:'idle',session:undefined,sessions:[],pending:undefined});listeners.clear();},
 };
}
export type SharedRoomSessionAccess=ReturnType<typeof createSharedRoomSessionAccess>;
