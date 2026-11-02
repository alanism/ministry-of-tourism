import {z} from 'zod';
import {groupPreferencesSchema,groupRoundSchema,groupResponseSchema} from './group-preferences.ts';
import {votingMethodSchema,votingSealSchema} from './voting-contract.ts';
import {canonicalFileJson} from './file-exchange-json.ts';
import {sha256Hex} from './sha256.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),roomId=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base={roomId,schemaMajor:z.literal(1),capability:z.literal('room-votes/1'),operationId:hex,membershipEpoch:integer,sessionId:hex,baseVersion:integer};
export const roomVotingConfigurationSchema=groupPreferencesSchema.refine(g=>g.households.length<=8&&g.rounds.length===1,'One frozen round and at most8 households');
export const roomVotingDeclareSchema=z.object({...base,configuration:roomVotingConfigurationSchema,confirmed:z.literal(true)}).strict();
export const roomVotingAssignmentSchema=z.object({...base,roundEpoch:integer,householdId:id,memberUid:roomId.nullable(),expectedAssignmentEpoch:integer}).strict();
export const roomVotingOpenSchema=z.object({...base,roundEpoch:integer,confirmed:z.literal(true)}).strict();
export const roomVotingCloseSchema=z.object({...base,roundEpoch:integer,snapshotDigest:hex,confirmed:z.literal(true)}).strict();
export const roomVotingResponseSchema=z.object({...base,roundEpoch:integer,assignmentEpoch:integer,response:groupResponseSchema}).strict();
export const roomVotingInvalidateSchema=z.object({...base,roundEpoch:integer,householdId:id,reason:z.string().trim().min(1).max(1000),confirmed:z.literal(true)}).strict();
export const roomVotingKindSchema=z.enum(['declare','assign','open','close','respond','invalidate']);
export type RoomVotingKind=z.infer<typeof roomVotingKindSchema>;
export async function roomVotingOperationId(uid:string,kind:RoomVotingKind,intent:unknown){roomId.parse(uid);roomVotingKindSchema.parse(kind);return sha256Hex(new TextEncoder().encode(canonicalFileJson({uid,kind,intent})));}
export const roomVotingReceiptSchema=z.object({operationId:hex,requestDigest:hex,uid:roomId,kind:roomVotingKindSchema,entityId:roomId,version:integer,acceptedAt:integer,responseId:hex.optional()}).strict();
export const roomVotingResultSchema=z.object({receipt:roomVotingReceiptSchema,submittedOperationId:hex,replayed:z.boolean(),deduplicated:z.boolean()}).strict().refine(r=>r.deduplicated?r.receipt.kind==='respond'&&r.replayed&&r.submittedOperationId!==r.receipt.operationId:r.submittedOperationId===r.receipt.operationId,'Duplicate response acknowledgement must name the original operation explicitly');
export const roomVotingStateSchema=z.object({version:integer,currentRoundId:hex.nullable(),proposalFloor:integer,tripId:id.nullable(),roundEpoch:integer}).strict();
export const roomVotingStoredAssignmentSchema=z.object({householdId:id,memberUid:roomId.nullable(),epoch:integer,version:integer}).strict();
export const roomVotingStoredRoundSchema=z.object({id:hex,version:integer,epoch:integer,configuration:roomVotingConfigurationSchema,method:votingMethodSchema,status:z.enum(['draft','open','closed']),seal:votingSealSchema.optional()}).strict().refine(r=>(r.status==='closed')===(r.seal!==undefined),'Closed round requires its immutable seal');
export const roomVotingStoredResponseSchema=z.object({id:hex,roundId:hex,householdId:id,version:integer,assignmentEpoch:integer,uid:roomId,membershipEpoch:integer,response:groupResponseSchema,receipt:roomVotingReceiptSchema,invalidatedReason:z.string().max(1000).optional()}).strict().refine(r=>r.householdId===r.response.household_id&&r.receipt.responseId===r.response.response_id,'Stored household response identity differs');
export const roomVotingSnapshotSchema=z.object({state:roomVotingStateSchema,assignments:z.array(roomVotingStoredAssignmentSchema).max(8),rounds:z.array(roomVotingStoredRoundSchema).max(100),responses:z.array(roomVotingStoredResponseSchema).max(800),history:z.array(roomVotingStoredResponseSchema).max(1000)}).strict();
export type RoomVotingSnapshot=z.infer<typeof roomVotingSnapshotSchema>;
export type RoomVotingAssignment=z.infer<typeof roomVotingStoredAssignmentSchema>;
export type RoomVotingRound=z.infer<typeof roomVotingStoredRoundSchema>;
export type RoomVotingResponse=z.infer<typeof roomVotingStoredResponseSchema>;
export const roomVotingOwnerViewSchema=z.object({audience:z.literal('owner'),roomId,configurationVersion:integer,round:roomVotingStoredRoundSchema.nullable(),assignments:z.array(roomVotingStoredAssignmentSchema).max(8),responses:z.array(roomVotingStoredResponseSchema).max(8),history:z.array(roomVotingStoredResponseSchema).max(1000),closedRounds:z.array(roomVotingStoredRoundSchema).max(100),tally:z.unknown().nullable(),snapshotDigest:hex}).strict();
export const roomVotingHouseholdViewSchema=z.object({audience:z.literal('household'),roomId,roundId:hex,roundVersion:integer,roundEpoch:integer,status:z.enum(['draft','open','closed']),ballot:z.object({trip_id:id,round:groupRoundSchema,method:votingMethodSchema,household:groupPreferencesSchema.shape.households.element}).strict(),assignmentEpoch:integer,response:roomVotingStoredResponseSchema.nullable()}).strict();
export const roomVotingViewSchema=z.discriminatedUnion('audience',[roomVotingOwnerViewSchema,roomVotingHouseholdViewSchema]);
export type RoomVotingView=z.infer<typeof roomVotingViewSchema>;
/** Measure freshly read typed protected records; no private response is inserted into ordinary feed. */
export function measureRoomVotingState(raw:unknown){const s=roomVotingSnapshotSchema.parse(raw);if(s.state.currentRoundId===null&&s.state.version===0&&s.assignments.length+s.rounds.length+s.responses.length+s.history.length===0)return 0;return new TextEncoder().encode(canonicalFileJson(s)).length;}
export const roomVotingRoundId=(configuration:z.infer<typeof roomVotingConfigurationSchema>)=>{const r=configuration.rounds[0]!;return sha256Hex(new TextEncoder().encode(canonicalFileJson({trip_id:configuration.trip_id,proposal_version:r.proposal_version,round_id:r.round_id})));};
export const roomVotingResponseId=(roundId:string,householdId:string)=>sha256Hex(new TextEncoder().encode(canonicalFileJson({roundId,householdId})));
