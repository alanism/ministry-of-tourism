import {z} from 'zod';
import {canonicalFileJson} from './file-exchange-json.ts';
import {sha256Hex} from './sha256.ts';
import {roomOwnershipOfferSchema} from './shared-room-transfer.ts';
const id=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),hex=z.string().regex(/^[a-f0-9]{64}$/),version=z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),role=z.enum(['editor','viewer','respondent']);
export const roomTransferKindSchema=z.enum(['transfer-offer','transfer-accept','transfer-cancel']);
const base={roomId:id,schemaMajor:z.literal(1),capability:z.literal('room-transfer/1'),operationId:hex,membershipEpoch:version,sessionId:hex,baseVersion:version};
export const roomTransferOfferRequestSchema=z.object({...base,recipientUid:id,formerOwnerRole:role,ownerAuthenticatedAt:version,confirmed:z.literal(true)}).strict();
export const roomTransferAcceptRequestSchema=z.object({...base,offerId:hex,formerOwnerRole:role,confirmed:z.literal(true)}).strict();
export const roomTransferCancelRequestSchema=z.object({...base,offerId:hex}).strict();
export const roomTransferReceiptSchema=z.object({operationId:hex,uid:id,kind:roomTransferKindSchema,requestDigest:hex,version,acceptedAt:version}).strict();
export const roomTransferOfferResultSchema=z.object({offer:roomOwnershipOfferSchema,version:z.literal(1),admissionVersion:version,receipt:roomTransferReceiptSchema,replayed:z.boolean()}).strict();
export const roomTransferAcceptResultSchema=z.object({transferred:z.literal(true),ownerUid:id,formerOwnerUid:id,formerOwnerRole:role,ownerEpoch:version,formerOwnerEpoch:version,receipt:roomTransferReceiptSchema,replayed:z.boolean()}).strict();
export const roomTransferCancelResultSchema=z.object({cancelled:z.literal(true),admissionVersion:version,receipt:roomTransferReceiptSchema,replayed:z.boolean()}).strict();
export const roomTransferListSchema=z.object({roomId:id,serverTime:version,authenticatedAt:version,admissionVersion:version,offers:z.array(z.object({offer:roomOwnershipOfferSchema,version:z.literal(1)}).strict()).max(1)}).strict();
/** Same domain-separated identity shape as roomAdminOperationId; identity is not authority. */
export async function roomTransferOperationId(uid:string,kind:z.infer<typeof roomTransferKindSchema>,intent:Record<string,unknown>){
 id.parse(uid);roomTransferKindSchema.parse(kind);const roomId=id.parse(intent.roomId);if(Object.hasOwn(intent,'operationId'))throw Error('Hash transfer intent before adding operation identity');
 return sha256Hex(new TextEncoder().encode(canonicalFileJson({uid,roomId,kind,intent})));
}
