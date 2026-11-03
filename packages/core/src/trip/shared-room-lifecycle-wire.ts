import {z} from 'zod';
import {canonicalFileJson} from './file-exchange-json.ts';
import {sha256Hex} from './sha256.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const base={roomId:id,schemaMajor:z.literal(1),capability:z.literal('room-lifecycle/1'),operationId:hex,membershipEpoch:version,sessionId:hex,baseVersion:version};
export const roomWithdrawRequestSchema=z.object({...base,cardId:id}).strict();
export const roomCloseRequestSchema=z.object({...base,snapshotDigest:hex,confirmed:z.literal(true)}).strict();
export const roomLifecycleReceiptSchema=z.object({operationId:hex,uid:id,kind:z.enum(['withdraw','close']),entityId:id,version,requestDigest:hex,acceptedAt:version}).strict();
export const roomWithdrawResultSchema=z.object({withdrawn:z.literal(true),cardId:id,lifecycleVersion:version,receipt:roomLifecycleReceiptSchema,replayed:z.boolean()}).strict();
export const roomCloseResultSchema=z.object({closed:z.literal(true),receipt:roomLifecycleReceiptSchema,replayed:z.boolean()}).strict();
export const roomLifecycleStatusSchema=z.object({roomId:id,serverTime:version,lifecycleVersion:version,snapshotDigest:hex,cardCount:version,mediaCount:version,ordinaryReceiptCount:version}).strict();
export async function roomLifecycleOperationId(uid:string,kind:'withdraw'|'close',intent:Record<string,unknown>){id.parse(uid);if(!['withdraw','close'].includes(kind)||Object.hasOwn(intent,'operationId'))throw Error('Invalid lifecycle identity intent');const roomId=id.parse(intent.roomId);return sha256Hex(new TextEncoder().encode(canonicalFileJson({uid,roomId,kind,intent})));}
