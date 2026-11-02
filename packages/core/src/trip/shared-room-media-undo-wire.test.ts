import {expect,it} from 'vitest';
import {roomMediaReserveSchema,roomMediaCommitSchema,roomMediaReceiptSchema} from './shared-room-media-wire.ts';
import {roomMediaUndoAdditionSchema,roomMediaUndoResultSchema} from './shared-room-media-undo.ts';
const base={roomId:'room',schemaMajor:1,capability:'room-media/1',operationId:'inverse',sessionId:'a'.repeat(64),membershipEpoch:2};
const card={id:'card',kind:'note',title:'Shared',body:'Before',stage:'plan',provenance:'traveler',assetIds:[],x:0,y:0};
it('binds fresh staged replacement Undo to its original receipt and exact before-card',()=>{
 const reserve={...base,cardId:'card',baseVersion:3,assetId:'fresh',replaceAssetId:'current',undoOf:'original',sourceHash:'b'.repeat(64),sourceBytes:99,caption:'',publicationConsent:true};
 expect(roomMediaReserveSchema.parse(reserve).undoOf).toBe('original');
 expect(roomMediaCommitSchema.parse({...base,stageId:'c'.repeat(64),baseVersion:3,undoBeforeCard:card}).undoBeforeCard).toEqual(card);
 expect(roomMediaCommitSchema.safeParse({...base,stageId:'c'.repeat(64),baseVersion:3,undoBeforeCard:{...card,privateHistory:'no'}}).success).toBe(false);
});
it('keeps optional digest-only extension compatible while refusing prior payload in receipts',()=>{
 const receipt={operationId:'original',uid:'owner',kind:'media',cardId:'card',assetId:'current',version:3,requestDigest:'a'.repeat(64),beforeDigest:'b'.repeat(64),afterDigest:'c'.repeat(64),acceptedAt:1};
 expect(roomMediaReceiptSchema.parse(receipt)).toEqual(receipt);
 expect(roomMediaReceiptSchema.parse({...receipt,previousAssetDigest:'d'.repeat(64)}).previousAssetDigest).toBe('d'.repeat(64));
 expect(roomMediaReceiptSchema.safeParse({...receipt,previousAsset:card}).success).toBe(false);
});
it('uses a separate strict reference-removal inverse and redacted accepted result',()=>{
 const input={...base,cardId:'card',baseVersion:3,undoOf:'original',beforeCard:card};
 expect(roomMediaUndoAdditionSchema.parse(input)).toEqual(input);
 expect(roomMediaUndoAdditionSchema.safeParse({...input,assetId:'attacker-choice'}).success).toBe(false);
 const receipt={operationId:'inverse',uid:'owner',kind:'media-undo',cardId:'card',undoOf:'original',version:4,requestDigest:'a'.repeat(64),beforeDigest:'b'.repeat(64),afterDigest:'c'.repeat(64),acceptedAt:1};
 expect(roomMediaUndoResultSchema.parse({receipt,replayed:false})).toEqual({receipt,replayed:false});
 expect(roomMediaUndoResultSchema.safeParse({receipt:{...receipt,beforeCard:card},replayed:false}).success).toBe(false);
});
