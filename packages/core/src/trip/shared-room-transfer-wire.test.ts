import {expect,it} from 'vitest';
import {roomTransferOfferRequestSchema,roomTransferAcceptRequestSchema,roomTransferOperationId} from './shared-room-transfer-wire';
const common={roomId:'room',schemaMajor:1,capability:'room-transfer/1',operationId:'a'.repeat(64),membershipEpoch:1,sessionId:'b'.repeat(64),baseVersion:0};
it('requires explicit owner and recipient confirmation of the exact former-owner role and fixed owner authentication context',()=>{
 const offer={...common,recipientUid:'recipient',formerOwnerRole:'viewer',ownerAuthenticatedAt:1900000000000,confirmed:true};expect(roomTransferOfferRequestSchema.parse(offer)).toEqual(offer);
 for(const patch of [{formerOwnerRole:'owner'},{ownerAuthenticatedAt:undefined},{confirmed:false},{hiddenAdmin:true}])expect(()=>roomTransferOfferRequestSchema.parse({...offer,...patch})).toThrow();
 const accept={...common,baseVersion:1,offerId:'c'.repeat(64),formerOwnerRole:'viewer',confirmed:true};expect(roomTransferAcceptRequestSchema.parse(accept)).toEqual(accept);expect(()=>roomTransferAcceptRequestSchema.parse({...accept,confirmed:undefined})).toThrow();
});
it('binds deterministic operation identity to UID, room, kind and the fixed authentication context',async()=>{
 const {operationId:_,...intent}= {...common,recipientUid:'recipient',formerOwnerRole:'viewer',ownerAuthenticatedAt:1900000000000,confirmed:true};
 const first=await roomTransferOperationId('owner','transfer-offer',intent);expect(first).toMatch(/^[a-f0-9]{64}$/);expect(await roomTransferOperationId('owner','transfer-offer',intent)).toBe(first);expect(await roomTransferOperationId('other','transfer-offer',intent)).not.toBe(first);expect(await roomTransferOperationId('owner','transfer-offer',{...intent,ownerAuthenticatedAt:1900000001000})).not.toBe(first);
 await expect(roomTransferOperationId('owner','transfer-offer',{...intent,operationId:first})).rejects.toThrow();
});
