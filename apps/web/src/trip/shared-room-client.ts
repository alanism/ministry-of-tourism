import {roomCardOperationSchema,roomOperationResultSchema,roomSnapshotSchema,roomServiceErrorSchema,type RoomCardOperation,type RoomOperationResult,type RoomSnapshot} from '../../../../packages/core/src/trip/shared-room-domain';
import{roomAdminOperationId,roomCreateRequestSchema,roomInviteRequestSchema,roomClaimRequestSchema,roomApproveRequestSchema,roomRevokeRequestSchema,roomRevokeInviteRequestSchema,roomCreateResultSchema,roomInviteResultSchema,roomPendingClaimResultSchema,roomApprovalResultSchema,roomRevocationResultSchema,roomAdmissionSnapshotSchema,type RoomAdminReceipt}from'../../../../packages/core/src/trip/shared-room-admission';
import type{z}from'zod';
export interface SharedRoomAuth {uid:string;getIdToken:()=>Promise<string>;}
export interface SharedRoomClient {readonly uid:string;read:(roomId:string,signal?:AbortSignal)=>Promise<RoomSnapshot>;operate:(operation:RoomCardOperation,signal?:AbortSignal)=>Promise<RoomOperationResult>;}
export interface SharedRoomClientOptions {baseUrl:string;projectId:string;auth:SharedRoomAuth;fetcher?:typeof fetch;}
export interface SharedRoomServiceClient extends SharedRoomClient{
 create:(input:z.infer<typeof roomCreateRequestSchema>,signal?:AbortSignal)=>Promise<z.infer<typeof roomCreateResultSchema>>;
 invite:(roomId:string,input:z.infer<typeof roomInviteRequestSchema>,signal?:AbortSignal)=>Promise<z.infer<typeof roomInviteResultSchema>>;
 claim:(roomId:string,input:z.infer<typeof roomClaimRequestSchema>,signal?:AbortSignal)=>Promise<z.infer<typeof roomPendingClaimResultSchema>>;
 approve:(roomId:string,input:z.infer<typeof roomApproveRequestSchema>,signal?:AbortSignal)=>Promise<z.infer<typeof roomApprovalResultSchema>>;
 revoke:(roomId:string,input:z.infer<typeof roomRevokeRequestSchema>,signal?:AbortSignal)=>Promise<z.infer<typeof roomRevocationResultSchema>>;
 revokeInvite:(roomId:string,input:z.infer<typeof roomRevokeInviteRequestSchema>,signal?:AbortSignal)=>Promise<z.infer<typeof roomRevocationResultSchema>>;
 admission:(roomId:string,signal?:AbortSignal)=>Promise<z.infer<typeof roomAdmissionSnapshotSchema>>;
}
export type SharedRoomErrorCode='unavailable'|'conflict'|'limit'|'unsupported'|'invalid-response'|'network'|'cancelled';
const messages:Record<SharedRoomErrorCode,string>={unavailable:'Room access is unavailable. Keep your local recovery copy; check your account and access before trying again.',conflict:'The room item changed. Your draft is retained; review the accepted version before preparing a new edit.',limit:'A room limit was reached. Your draft is retained; keep a recovery copy.',unsupported:'This room version or operation is unsupported. Keep your draft and update before trying again.','invalid-response':'The room response could not be verified. Your draft is retained.',network:'Room delivery is unconfirmed. Your draft is retained; retry the same operation to check its acceptance.',cancelled:'Room request stopped. Delivery may be unconfirmed; your draft is retained.'};
export class SharedRoomRequestError extends Error {readonly recoverableDraft=true;readonly code:SharedRoomErrorCode;constructor(code:SharedRoomErrorCode){super(messages[code]);this.code=code;this.name=code==='cancelled'?'AbortError':'SharedRoomRequestError';}}
const fail=(code:SharedRoomErrorCode):never=>{throw new SharedRoomRequestError(code);};
const responseLimit=50*1024*1024;
export function sharedRoomAwait<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)return Promise.reject(new SharedRoomRequestError('cancelled'));
 return new Promise((resolve,reject)=>{const abort=()=>reject(new SharedRoomRequestError('cancelled'));signal.addEventListener('abort',abort,{once:true});Promise.resolve().then(()=>{signal.throwIfAborted();return work();}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));});
}
export async function sharedRoomResponseJson(response:Response,signal:AbortSignal,limit=responseLimit):Promise<unknown>{
 const declared=Number(response.headers.get('content-length'));if(Number.isFinite(declared)&&declared>limit){void response.body?.cancel().catch(()=>{});return fail('limit');}
 if(!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??''))return fail('invalid-response');
 if(!response.body)return fail('invalid-response');
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await sharedRoomAwait(()=>reader.read(),signal);if(part.done)break;size+=part.value.byteLength;if(size>limit)return fail('limit');chunks.push(part.value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
 catch(error){if(error instanceof SharedRoomRequestError)throw error;return fail('invalid-response');}
 finally{void reader.cancel().catch(()=>{});}
}
/** Local emulator connection only. Neither this configuration nor a UI label proves provider enforcement. */
export function sharedRoomLocalUrl(baseUrl:string,projectId:string){const base=new URL(baseUrl);if(base.protocol!=='http:'||!['localhost','127.0.0.1','[::1]'].includes(base.hostname)||base.username||base.password||base.search||base.hash||base.pathname!=='/'||!/^demo-[a-z0-9-]+$/.test(projectId))throw Error('Shared rooms require an explicit local demo emulator connection');return base;}
export function createSharedRoomClient(options:SharedRoomClientOptions):SharedRoomServiceClient {
 const base=sharedRoomLocalUrl(options.baseUrl,options.projectId);
 const uid=roomSnapshotSchema.shape.principal.shape.uid.parse(options.auth.uid),getIdToken=options.auth.getIdToken,fetcher=options.fetcher??fetch;
 async function request(path:string,method:'GET'|'POST',operation:unknown,caller?:AbortSignal){
  if(operation!==undefined&&new TextEncoder().encode(JSON.stringify(operation)).length>65536)return fail('limit');
  const timeout=new AbortController(),signal=caller?AbortSignal.any([caller,timeout.signal]):timeout.signal,timer=setTimeout(()=>timeout.abort(),10000);
  try{
   const token=await sharedRoomAwait(getIdToken,signal);if(!token||token.length>16384||/[\r\n]/.test(token))return fail('unavailable');signal.throwIfAborted();
   const response=await sharedRoomAwait(()=>fetcher(base.origin+path,{method,signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store',headers:{authorization:'Bearer '+token,accept:'application/json',...(operation?{'content-type':'application/json'}:{})},...(operation?{body:JSON.stringify(operation)}:{})}),signal);
   if(response.status===401||response.status===403||response.status===404){void response.body?.cancel().catch(()=>{});return fail('unavailable');}
   const raw=await sharedRoomResponseJson(response,signal);signal.throwIfAborted();
   if(!response.ok){const parsed=roomServiceErrorSchema.safeParse(raw);if(!parsed.success)return fail('invalid-response');return fail(parsed.data.error.code);}
   return raw;
  }catch(error){if(error instanceof SharedRoomRequestError)throw error;if(signal.aborted)return fail('cancelled');return fail('network');}
  finally{clearTimeout(timer);}
 }
 const roomPath=(roomId:string)=>{roomCardOperationSchema.shape.roomId.parse(roomId);return'/rooms/'+encodeURIComponent(roomId);};
 async function admin<I extends{operationId:string},O extends{receipt:RoomAdminReceipt;replayed:boolean}>(roomId:string,kind:RoomAdminReceipt['kind'],path:string,inputSchema:z.ZodType<I>,outputSchema:z.ZodType<O>,raw:unknown,signal?:AbortSignal):Promise<O>{
  const input=inputSchema.parse(raw),{operationId,...intent}=input;
  if(new TextEncoder().encode(JSON.stringify(input)).length>65536)return fail('limit');
  if(await roomAdminOperationId(uid,roomId,kind,intent)!==operationId)return fail('conflict');
  const parsed=outputSchema.safeParse(await request(path,'POST',input,signal));if(!parsed.success)return fail('invalid-response');const receipt=parsed.data.receipt;
  if(receipt.uid!==uid||receipt.operationId!==operationId||receipt.kind!==kind)return fail('invalid-response');return parsed.data;
 }
 return{uid,async read(roomId,signal){
  roomCardOperationSchema.shape.roomId.parse(roomId);
  const raw=await request('/rooms/'+encodeURIComponent(roomId),'GET',undefined,signal),parsed=roomSnapshotSchema.safeParse(raw);
  if(!parsed.success)return fail('invalid-response');if(parsed.data.roomId!==roomId||parsed.data.principal.uid!==uid)return fail('unavailable');return parsed.data;
 },async operate(raw,signal){
  const operation=roomCardOperationSchema.parse(raw);if(new TextEncoder().encode(JSON.stringify(operation)).length>65536)return fail('limit');
  const result=roomOperationResultSchema.safeParse(await request('/rooms/'+encodeURIComponent(operation.roomId)+'/operations','POST',operation,signal));
  if(!result.success)return fail('invalid-response');const r=result.data.receipt;
  if(r.uid!==uid||r.operationId!==operation.operationId||r.cardId!==operation.cardId||r.kind!==operation.kind||r.version!==operation.baseVersion+1)return fail('invalid-response');return result.data;
 },async create(input,signal){const parsed=roomCreateRequestSchema.parse(input),reply=await admin(parsed.roomId,'create','/rooms',roomCreateRequestSchema,roomCreateResultSchema,parsed,signal);if(reply.roomId!==parsed.roomId)return fail('invalid-response');return reply;},
 async invite(roomId,input,signal){const reply=await admin(roomId,'invite',roomPath(roomId)+'/invites',roomInviteRequestSchema,roomInviteResultSchema,input,signal);if(reply.inviteId!==input.inviteDigest||reply.expiresAt!==input.expiresAt)return fail('invalid-response');return reply;},
 claim:(roomId,input,signal)=>admin(roomId,'claim',roomPath(roomId)+'/claims',roomClaimRequestSchema,roomPendingClaimResultSchema,input,signal),
 approve:(roomId,input,signal)=>admin(roomId,'approve',roomPath(roomId)+'/approve',roomApproveRequestSchema,roomApprovalResultSchema,input,signal),
 revoke:(roomId,input,signal)=>admin(roomId,'revoke',roomPath(roomId)+'/revoke',roomRevokeRequestSchema,roomRevocationResultSchema,input,signal),
 revokeInvite:(roomId,input,signal)=>admin(roomId,'revoke-invite',roomPath(roomId)+'/revoke-invite',roomRevokeInviteRequestSchema,roomRevocationResultSchema,input,signal),
 async admission(roomId,signal){const result=roomAdmissionSnapshotSchema.safeParse(await request(roomPath(roomId)+'/admission','GET',undefined,signal));if(!result.success||result.data.roomId!==roomId)return fail('invalid-response');return result.data;},
 };
}
