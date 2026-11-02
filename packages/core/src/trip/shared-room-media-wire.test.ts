import {expect,it} from 'vitest';
import {roomMediaReserveSchema,roomMediaCommitSchema,roomMediaUploadResultSchema} from './shared-room-media-wire.ts';
const base={roomId:'room',schemaMajor:1,capability:'room-media/1',operationId:'op',sessionId:'a'.repeat(64),membershipEpoch:2};
const reserve={...base,cardId:'card',baseVersion:4,assetId:'asset',sourceHash:'b'.repeat(64),sourceBytes:123,publicationConsent:true};
it('requires explicit publication consent and refuses client authority or unknown private fields',()=>{
 expect(roomMediaReserveSchema.parse(reserve)).toEqual(reserve);
 for(const extra of [{publicationConsent:false},{privateAncestor:false},{personalOnly:false},{scope:'shared'},{metadata:{privateCaption:'canary'}}])expect(()=>roomMediaReserveSchema.parse({...reserve,...extra})).toThrow();
 expect(()=>roomMediaReserveSchema.parse({...reserve,source:{provider:'fcc',id:'art',privateText:'canary'}})).toThrow();
});
it('binds wire schema/session/version and preserves intentionally blank authored captions',()=>{
 expect(roomMediaReserveSchema.parse({...reserve,caption:''}).caption).toBe('');
 for(const extra of [{schemaMajor:2},{sessionId:'caller-label'},{sourceBytes:10*1024*1024+1},{baseVersion:-1}])expect(()=>roomMediaReserveSchema.parse({...reserve,...extra})).toThrow();
 expect(roomMediaCommitSchema.parse({...base,stageId:'c'.repeat(64),baseVersion:4})).toMatchObject({baseVersion:4});
 expect(()=>roomMediaCommitSchema.parse({...base,stageId:'c'.repeat(64),baseVersion:4,assetIds:['invented']})).toThrow();
});
it('does not admit original hashes, paths or source-history fields in public uploaded metadata',()=>{
 const result={stageId:'c'.repeat(64),asset:{id:'asset',hash:'d'.repeat(64),mime:'image/png',width:1,height:1,bytes:70}};
 expect(roomMediaUploadResultSchema.parse(result)).toEqual(result);
 for(const extra of [{sourceHash:'b'.repeat(64)},{path:'private/original.png'},{derivedFrom:'private-original'}])expect(()=>roomMediaUploadResultSchema.parse({...result,asset:{...result.asset,...extra}})).toThrow();
});
