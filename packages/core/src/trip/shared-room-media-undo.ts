import {z} from 'zod';
import {sharedRoomCardSchema,type RoomCardRecord} from './shared-room-domain.ts';
import {roomMediaReceiptSchema} from './shared-room-media-wire.ts';
import {roomSharedMediaSchema,type RoomSharedMedia} from './shared-room-media.ts';
import {canonicalFileJson} from './file-exchange-json.ts';
import {sha256Hex} from './sha256.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const roomMediaUndoAdditionSchema=z.object({roomId:id,schemaMajor:z.literal(1),capability:z.literal('room-media/1'),operationId:id,sessionId:hex,membershipEpoch:integer,cardId:id,baseVersion:integer,undoOf:id,beforeCard:sharedRoomCardSchema}).strict();
export const roomMediaUndoReceiptSchema=z.object({operationId:id,uid:id,kind:z.literal('media-undo'),cardId:id,undoOf:id,version:integer,requestDigest:hex,beforeDigest:hex,afterDigest:hex,acceptedAt:integer}).strict();
export const roomMediaUndoResultSchema=z.object({receipt:roomMediaUndoReceiptSchema,replayed:z.boolean()}).strict();
export type RoomMediaUndoAddition=z.infer<typeof roomMediaUndoAdditionSchema>;
export type RoomMediaUndoResult=z.infer<typeof roomMediaUndoResultSchema>;
const digest=(value:unknown)=>sha256Hex(new TextEncoder().encode(canonicalFileJson(value)));
/** Inverse verification only; the caller supplies current trusted records inside its transaction. */
export async function validateRoomMediaInverse(uid:string,card:RoomCardRecord,rawReceipt:unknown,rawBefore:unknown,restored?:RoomSharedMedia){
 const target=roomMediaReceiptSchema.parse(rawReceipt),before=sharedRoomCardSchema.parse(rawBefore);
 if(target.uid!==uid||target.undoOf!==undefined||target.cardId!==card.payload.id||before.id!==target.cardId)throw Error('Media Undo unavailable for this initiator');
 if(card.version!==target.version)throw Error('Stale media Undo target');
 if(await digest(card.payload)!==target.afterDigest||await digest(before)!==target.beforeDigest)throw Error('Media Undo snapshot unavailable');
 if(!restored){
  if(target.previousAssetDigest!==undefined||before.assetIds.includes(target.assetId)||await digest({...before,assetIds:[...before.assetIds,target.assetId]})!==target.afterDigest)throw Error('Media addition Undo unavailable');
  return before;
 }
 const candidate=roomSharedMediaSchema.parse(restored),missing=[...new Set(before.assetIds.filter(id=>!card.payload.assetIds.includes(id)))];
 if(!target.previousAssetDigest||missing.length!==1||before.assetIds.includes(target.assetId)||before.assetIds.includes(candidate.id)||card.payload.assetIds.includes(candidate.id))throw Error('Media replacement Undo unavailable');
 const oldId=missing[0]!;
 if(await digest({...before,assetIds:before.assetIds.map(id=>id===oldId?target.assetId:id)})!==target.afterDigest||await digest({...candidate,id:oldId})!==target.previousAssetDigest)throw Error('Prior media descriptor unavailable');
 return sharedRoomCardSchema.parse({...before,assetIds:before.assetIds.map(id=>id===oldId?candidate.id:id)});
}
