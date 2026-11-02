import {canonicalFileJson} from './file-exchange-json.ts';
import {z} from 'zod';
import {tripCardSchema} from './schema.ts';
import {sha256Hex} from './sha256.ts';

// Pure trusted-service transition only. uid must come from verified Firebase Auth,
// never a request-body Actor. Durable adapter must transact membership/entity/receipt together.
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/);
const revision=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const keys=['id','kind','title','body','stage','status','day','time','placeId','location','provenance','assetIds','x','y','boardWidth','boardHeight','boardStack'] as const;
const shape=Object.fromEntries(keys.map(k=>[k,tripCardSchema.shape[k]])) as {[K in typeof keys[number]]:typeof tripCardSchema.shape[K]};
export const sharedRoomCardSchema=z.object({...shape,location:tripCardSchema.shape.location.unwrap().strict().optional()}).strict().superRefine((card,ctx)=>{
  if(card.x<0||card.y<0||card.x+(card.boardWidth??1200)>10000||card.y+(card.boardHeight??900)>10000)ctx.addIssue({code:'custom',message:'Card geometry exceeds board bounds'});
});
export function projectSharedCard(raw:unknown){
  const card=tripCardSchema.parse(raw);if(card.scope==='private')throw Error('Private content cannot be published');
  // Citation/media publication is a separate explicit validated operation. Fail closed
  // rather than strip a credit/source or imply a sanitized media variant exists.
  if(card.source||card.assetIds.length)throw Error('Source/media needs a validated room publication projection');
  return sharedRoomCardSchema.parse(Object.fromEntries(keys.filter(k=>card[k]!==undefined).map(k=>[k,card[k]])));
}
export type SharedRoomCard=z.infer<typeof sharedRoomCardSchema>;
export interface RoomMember {role:'owner'|'editor'|'viewer'|'respondent';epoch:number;active:boolean;}
export interface RoomCardRecord {version:number;authorUid:string;updatedAt:number;payload:SharedRoomCard;}
export interface RoomReceipt {operationId:string;uid:string;kind:'edit'|'undo';cardId:string;version:number;requestDigest:string;beforeDigest:string;afterDigest:string;acceptedAt:number;}
export interface RoomCardState {id:string;schemaMajor:number;ownerUid:string;closed:boolean;receiptCount:number;members:Record<string,RoomMember>;cards:Record<string,RoomCardRecord>;receipts:Record<string,RoomReceipt>;}
export const roomCardOperationSchema=z.object({roomId:id,schemaMajor:z.literal(1),capability:z.literal('room-cards/1'),operationId:id,membershipEpoch:revision,kind:z.enum(['edit','undo']),cardId:id,baseVersion:revision,payload:sharedRoomCardSchema,undoOf:id.optional()}).strict();
const canonical=canonicalFileJson;
const digest=(value:unknown)=>sha256Hex(new TextEncoder().encode(canonical(value)));
/** Caller must discard this result if its atomic server transaction retries/fails. No IO or entropy here. */
export async function applyRoomCardOperation(state:RoomCardState,uid:string,raw:unknown,now:number){
  const encoded=new TextEncoder().encode(JSON.stringify(raw));if(encoded.length>65536)throw Error('Room intent exceeds64KiB; retain local draft');
  const op=roomCardOperationSchema.parse(raw),member=state.members[uid];
  if(state.closed||state.id!==op.roomId||state.schemaMajor!==1||!member?.active||member.epoch!==op.membershipEpoch||!['owner','editor'].includes(member.role)||(member.role==='owner'&&state.ownerUid!==uid))throw Error('Room operation unavailable');
  if(!Number.isSafeInteger(now)||now<0)throw Error('Invalid trusted clock');
  const requestDigest=await digest(op),prior=state.receipts[op.operationId];
  if(prior){if(prior.uid!==uid||prior.requestDigest!==requestDigest)throw Error('Operation identity conflict; retain local draft');return{state,receipt:prior,replayed:true};}
  const entity=state.cards[op.cardId];if(!entity||entity.version!==op.baseVersion)throw Error('Stale entity; retain local draft');
  if(op.payload.id!==op.cardId)throw Error('Entity identity mismatch');
  // No publication, media replacement, scope change or card-kind escalation through edit.
  for(const field of ['kind','provenance','assetIds'] as const)if(canonical(entity.payload[field])!==canonical(op.payload[field]))throw Error('This change requires explicit owner publication/media admission');
  const beforeDigest=await digest(entity.payload),afterDigest=await digest(op.payload);
  if(op.kind==='undo'){
    const target=op.undoOf?state.receipts[op.undoOf]:undefined;
    if(!target||target.uid!==uid||target.cardId!==op.cardId||target.version!==op.baseVersion||target.afterDigest!==beforeDigest||target.beforeDigest!==afterDigest)throw Error('Undo is stale or not initiated by this account; retain local draft');
  }else if(op.undoOf!==undefined)throw Error('Unexpected Undo target');
  if(!Number.isSafeInteger(state.receiptCount)||state.receiptCount<0||state.receiptCount>=20000)throw Error('Room receipt capacity reached; export or explicitly start a new room');
  if(entity.version===Number.MAX_SAFE_INTEGER)throw Error('Entity version capacity reached');
  const receipt:RoomReceipt={operationId:op.operationId,uid,kind:op.kind,cardId:op.cardId,version:entity.version+1,requestDigest,beforeDigest,afterDigest,acceptedAt:now};
  const next={...state,receiptCount:state.receiptCount+1,cards:{...state.cards,[op.cardId]:{version:receipt.version,authorUid:uid,updatedAt:now,payload:op.payload}},receipts:{...state.receipts,[op.operationId]:receipt}};
  return{state:next,receipt,replayed:false};
}

export type RoomCardOperation=z.infer<typeof roomCardOperationSchema>;

const digestSchema=z.string().regex(/^[a-f0-9]{64}$/);
export const roomReceiptSchema=z.object({operationId:id,uid:id,kind:z.enum(['edit','undo']),cardId:id,version:revision,requestDigest:digestSchema,beforeDigest:digestSchema,afterDigest:digestSchema,acceptedAt:revision}).strict();
export const roomOperationResultSchema=z.object({receipt:roomReceiptSchema,replayed:z.boolean()}).strict();
export const roomSnapshotSchema=z.object({serviceMode:z.literal('local-emulator'),schemaMajor:z.literal(1),capabilities:z.tuple([z.literal('room-cards/1')]),roomId:id,principal:z.object({uid:id,role:z.enum(['owner','editor','viewer','respondent']),membershipEpoch:revision,householdId:id.nullable(),householdEpoch:revision.nullable()}).strict(),cards:z.array(z.object({version:revision,authorUid:id,updatedAt:revision,payload:sharedRoomCardSchema}).strict()).max(500),sync:z.literal('accepted')}).strict();
export const roomServiceErrorSchema=z.object({error:z.object({code:z.enum(['unavailable','conflict','limit','unsupported']),message:z.string().min(1).max(500),recoverableDraft:z.literal(true)}).strict()}).strict();
export type RoomSnapshot=z.infer<typeof roomSnapshotSchema>;
export type RoomOperationResult=z.infer<typeof roomOperationResultSchema>;
export type RoomServiceError=z.infer<typeof roomServiceErrorSchema>;
