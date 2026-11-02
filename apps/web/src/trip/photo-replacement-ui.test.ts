import {afterEach,expect,it,vi} from 'vitest';
import {createTrip,readAllCards,readAsset,TripSession} from '@writers-board/core';
import {attachPhoto,getTripBlob} from './trip-assets';
const storage=vi.hoisted(()=>({putBlob:vi.fn(async()=> 'b'.repeat(64))}));
vi.mock('../state/blobs',()=>({hashBlob:async()=> 'b'.repeat(64),getBlob:async()=>null,putBlob:storage.putBlob}));
const actor={kind:'human' as const,id:'owner',name:'Owner'};
function fixture(){const session=new TripSession(createTrip({title:'Trip',city:'Bangkok',timeZone:'Asia/Bangkok',boardId:'trip'}),{newId:()=> 'card'});session.execute(actor,'trip_card_create',{kind:'photo',title:'Photo',body:'',stage:'plan',scope:'stay',provenance:'traveler'});session.execute(actor,'trip_asset_attach',{cardId:'card',asset:{id:'old',hash:'a'.repeat(64),mime:'image/png',role:'original',credit:'Original credit'}});return session;}
function image(){const bytes=new Uint8Array(33);bytes.set([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);const view=new DataView(bytes.buffer);view.setUint32(16,4);view.setUint32(20,3);return new File([bytes],'new.png',{type:'image/png'});}
afterEach(()=>{vi.unstubAllGlobals();storage.putBlob.mockReset();storage.putBlob.mockResolvedValue('b'.repeat(64));});
it('uses explicit replace, registers bounded dimensions, and stages bytes before the command',async()=>{
 const session=fixture();vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:4,height:3,close(){}})));let staged:Promise<Blob|null>|undefined;const execute=session.execute.bind(session);vi.spyOn(session,'execute').mockImplementation((...args)=>{if(args[1]==='trip_asset_replace')staged=getTripBlob('b'.repeat(64));return execute(...args);});
 await attachPhoto(session,actor,'card',image(),{operation:'replace',expectedAssetId:'old',scope:'stay',revision:session.boardRev});
 const card=readAllCards(session.parts)[0]!;expect(card.assetIds).toHaveLength(1);expect(card.assetIds).not.toContain('old');expect(await staged).toBeInstanceOf(Blob);expect(readAsset(session.parts,card.assetIds[0]!)).toMatchObject({width:4,height:3});expect(readAsset(session.parts,'old')?.credit).toBe('Original credit');session.destroy();
});
it('retains recoverable replacement bytes after image storage failure',async()=>{
 const session=fixture();storage.putBlob.mockRejectedValue(new Error('Quota full'));vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:4,height:3,close(){}})));
 await attachPhoto(session,actor,'card',image(),{operation:'replace',expectedAssetId:'old',scope:'stay',revision:session.boardRev});expect((await getTripBlob('b'.repeat(64)))?.size).toBe(33);expect(readAllCards(session.parts)[0]!.assetIds).not.toContain('old');session.destroy();
});
it('rejects stale scope/revision and cancellation after decode with no document mutation',async()=>{
 const session=fixture(),revision=session.boardRev,controller=new AbortController();vi.stubGlobal('createImageBitmap',vi.fn(async()=>{controller.abort();return{width:4,height:3,close(){}};}));
 await expect(attachPhoto(session,actor,'card',image(),{operation:'replace',expectedAssetId:'old',scope:'stay',revision,signal:controller.signal})).rejects.toThrow();expect(session.boardRev).toBe(revision);
 vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:4,height:3,close(){}})));session.execute(actor,'trip_card_update',{id:'card',scope:'private'});const after=session.boardRev;
 await expect(attachPhoto(session,actor,'card',image(),{operation:'replace',expectedAssetId:'old',scope:'stay',revision})).rejects.toThrow(/changed|stale/i);expect(session.boardRev).toBe(after);session.destroy();
});
it('rejects unsafe media before mutation and keeps add separate from replacement',async()=>{
 const session=fixture(),revision=session.boardRev;await expect(attachPhoto(session,actor,'card',new File(['<svg/>'],'a.svg',{type:'image/svg+xml'}),{operation:'replace',expectedAssetId:'old',scope:'stay',revision})).rejects.toThrow();expect(session.boardRev).toBe(revision);
 vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:4,height:3,close(){}})));await attachPhoto(session,actor,'card',image(),{operation:'add',scope:'stay',revision});expect(readAllCards(session.parts)[0]!.assetIds).toHaveLength(2);session.destroy();
});
