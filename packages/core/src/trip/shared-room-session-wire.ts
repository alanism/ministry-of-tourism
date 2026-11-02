import {z} from 'zod';
import {roomRegisteredSessionSchema} from './shared-room-sessions.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base={roomId:id,schemaMajor:z.literal(1),capability:z.literal('room-sessions/1'),operationId:hex,membershipEpoch:version,baseVersion:version};
export const roomSessionRegisterSchema=z.object(base).strict();
export const roomSessionRevokeSchema=z.object({...base,sessionId:hex}).strict();
export const roomSessionBootstrapSchema=z.object({roomId:id,uid:id,membershipEpoch:version,admissionVersion:version,sessions:z.array(roomRegisteredSessionSchema).max(3)}).strict();
export const roomSessionResultSchema=z.object({session:roomRegisteredSessionSchema,admissionVersion:version,replayed:z.boolean()}).strict();
