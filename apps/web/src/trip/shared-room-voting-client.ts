import type{z}from'zod';
import{roomVotingDeclareSchema,roomVotingAssignmentSchema,roomVotingOpenSchema,roomVotingCloseSchema,roomVotingResponseSchema,roomVotingInvalidateSchema,roomVotingViewSchema,roomVotingResultSchema,roomVotingOperationId,type RoomVotingKind}from'../../../../packages/core/src/trip/shared-room-voting-wire';
import type{RoomRegisteredSession}from'../../../../packages/core/src/trip/shared-room-sessions';
import{SharedRoomRequestError}from'./shared-room-client';
interface Transport{uid:string;session?:RoomRegisteredSession;json:(path:string,method:'GET'|'POST',body:unknown,signal?:AbortSignal,protectedRoom?:string)=>Promise<unknown>;}
const fail=(code:ConstructorParameters<typeof SharedRoomRequestError>[0]):never=>{throw new SharedRoomRequestError(code);};
export function sharedRoomVotingMethods(t:Transport){
 const path=(roomId:string)=>{roomVotingDeclareSchema.shape.roomId.parse(roomId);return'/rooms/'+encodeURIComponent(roomId)+'/voting';};
 function current(roomId:string,body?:{sessionId:string;membershipEpoch:number}){const s=t.session;if(!s||!s.active||s.uid!==t.uid||s.roomId!==roomId||body&&(body.sessionId!==s.id||body.membershipEpoch!==s.membershipEpoch))return fail('unavailable');}
 async function change<I extends{roomId:string;operationId:string;sessionId:string;membershipEpoch:number;baseVersion:number}>(kind:RoomVotingKind,schema:z.ZodType<I>,raw:unknown,signal?:AbortSignal){
  const input=schema.parse(raw);current(input.roomId,input);const{operationId,...intent}=input;if(await roomVotingOperationId(t.uid,kind,intent)!==operationId)return fail('conflict');
  const reply=roomVotingResultSchema.safeParse(await t.json(path(input.roomId)+'/'+kind,'POST',input,signal,input.roomId));if(!reply.success)return fail('invalid-response');const r=reply.data.receipt;
  if(reply.data.submittedOperationId!==operationId||r.uid!==t.uid||r.kind!==kind||!reply.data.deduplicated&&(r.operationId!==operationId||r.requestDigest!==operationId||r.version!==(kind==='declare'?1:input.baseVersion+1))||kind==='respond'&&'response'in input&&r.responseId!==(input.response as z.infer<typeof roomVotingResponseSchema>['response']).response_id)return fail('invalid-response');return reply.data;
 }
 return{
  async voting(roomId:string,signal?:AbortSignal){current(roomId);const reply=roomVotingViewSchema.safeParse(await t.json(path(roomId),'GET',undefined,signal,roomId));if(!reply.success||reply.data.roomId!==roomId)return fail('invalid-response');const v=reply.data;if(v.audience==='household'&&v.response&&(v.response.uid!==t.uid||v.response.householdId!==v.ballot.household.household_id||v.response.roundId!==v.roundId||v.response.assignmentEpoch!==v.assignmentEpoch))return fail('invalid-response');return v;},
  declareVoting:(input:z.infer<typeof roomVotingDeclareSchema>,signal?:AbortSignal)=>change('declare',roomVotingDeclareSchema,input,signal),
  assignVoting:(input:z.infer<typeof roomVotingAssignmentSchema>,signal?:AbortSignal)=>change('assign',roomVotingAssignmentSchema,input,signal),
  openVoting:(input:z.infer<typeof roomVotingOpenSchema>,signal?:AbortSignal)=>change('open',roomVotingOpenSchema,input,signal),
  closeVoting:(input:z.infer<typeof roomVotingCloseSchema>,signal?:AbortSignal)=>change('close',roomVotingCloseSchema,input,signal),
  respondVoting:(input:z.infer<typeof roomVotingResponseSchema>,signal?:AbortSignal)=>change('respond',roomVotingResponseSchema,input,signal),
  invalidateVoting:(input:z.infer<typeof roomVotingInvalidateSchema>,signal?:AbortSignal)=>change('invalidate',roomVotingInvalidateSchema,input,signal),
 };
}
export type SharedRoomVotingMethods=ReturnType<typeof sharedRoomVotingMethods>;
