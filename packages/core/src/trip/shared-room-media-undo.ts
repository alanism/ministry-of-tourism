import {z} from 'zod';
import {sharedRoomCardSchema} from './shared-room-domain.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),integer=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const roomMediaUndoAdditionSchema=z.object({roomId:id,schemaMajor:z.literal(1),capability:z.literal('room-media/1'),operationId:id,sessionId:hex,membershipEpoch:integer,cardId:id,baseVersion:integer,undoOf:id,beforeCard:sharedRoomCardSchema}).strict();
export const roomMediaUndoReceiptSchema=z.object({operationId:id,uid:id,kind:z.literal('media-undo'),cardId:id,undoOf:id,version:integer,requestDigest:hex,beforeDigest:hex,afterDigest:hex,acceptedAt:integer}).strict();
export const roomMediaUndoResultSchema=z.object({receipt:roomMediaUndoReceiptSchema,replayed:z.boolean()}).strict();
export type RoomMediaUndoAddition=z.infer<typeof roomMediaUndoAdditionSchema>;
export type RoomMediaUndoResult=z.infer<typeof roomMediaUndoResultSchema>;
