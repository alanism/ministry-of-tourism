import {afterEach,describe,expect,it,vi} from 'vitest';
vi.mock('@writers-board/core',async()=>await import('../../../../packages/core/src/index.ts'));
import {createTrip,encodeTrip,exportTripPackage,importTripPackage,readAsset,readTripMeta,TripSession} from '@writers-board/core';
const storage=vi.hoisted(()=>({blobs:new Map<string,Blob>(),writes:0,full:false}));
vi.mock('../state/blobs',()=>({
  hashBlob:async(blob:Blob)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join(''),
  getBlob:async(hash:string)=>storage.blobs.get(hash)??null,
  putBlob:async(blob:Blob)=>{storage.writes++;if(storage.full)throw new Error('QuotaExceededError');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join('');storage.blobs.set(hash,blob);},
}));
const human={kind:'human' as const,id:'owner',name:'Owner'};
const url='https://foreignclubberscorespondence.web.app';
const art=(assetId='tee')=>({assetId,category:'tee',kind:'apparel-mockup' as const,originCityId:'bilbao',
  thumbnailUrl:url+'/assets/tee.png',renditionUrl:url+'/assets/tee.png',width:20,height:25,mimeType:'image/png' as const,
  credit:'Actual FCC credit',rightsStatus:'unknown' as const,source:{provider:'fcc' as const,sourceId:assetId,canonicalUrl:url+'/bilbao.html',cityId:'bilbao',kind:'artwork' as const,retrievedAt:'2026-10-28',origin:'artwork' as const}});
const make=()=>new TripSession(createTrip({title:'Trip',city:'Bilbao',cityId:'bilbao',timeZone:null}));
afterEach(()=>{storage.blobs.clear();storage.writes=0;storage.full=false;vi.unstubAllGlobals();});
describe('actual magazine tee selection',()=>{
  it('caches all supplied originals and commits their classified metadata with the chosen tee once',async()=>{
    const {selectMagazineTee}=await import('./magazine-controls');
    const s=make(),selected=art('mono'),candidates=[art('brush'),selected,art('color')];
    const fetcher=vi.fn(async()=>new Response(new Blob(['real original tee'],{type:'image/png'})));vi.stubGlobal('fetch',fetcher);
    expect(await selectMagazineTee(s,human,selected,candidates,new AbortController().signal)).toEqual({persisted:true});
    expect(s.boardRev).toBe(1);expect(s.parts.assets.size).toBe(3);expect(s.parts.cards.size).toBe(0);
    expect(readTripMeta(s.doc).magazine).toEqual({wornTeeAssetId:'mono',apparelAssetIds:['brush','mono','color']});
    expect([...s.parts.assets.keys()].every(id=>readAsset(s.parts,id)?.apparel?.kind==='apparel-mockup')).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);expect(storage.writes).toBe(1);
  });
  it('rejects unclassified/untrusted/hash-mismatched input and cancellation without doc or persistent writes',async()=>{
    const {selectMagazineTee}=await import('./magazine-controls');
    for(const bad of [{...art(),kind:'map'},{...art(),renditionUrl:'https://evil.example/tee.png'},{...art(),hash:'b'.repeat(64)}]){
      const s=make(),before=encodeTrip(s.doc);vi.stubGlobal('fetch',async()=>new Response(new Blob(['actual'],{type:'image/png'})));
      await expect(selectMagazineTee(s,human,bad as never,[bad] as never,new AbortController().signal)).rejects.toThrow();
      expect(encodeTrip(s.doc)).toEqual(before);expect(storage.writes).toBe(0);
    }
    const s=make(),before=encodeTrip(s.doc),controller=new AbortController();
    let release!:()=>void,began!:()=>void;const waiting=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{began=resolve;});
    vi.stubGlobal('fetch',async()=>{began();await waiting;return new Response(new Blob(['actual'],{type:'image/png'}));});
    const pending=selectMagazineTee(s,human,art(),[art()],controller.signal);await started;controller.abort();release();
    await expect(pending).rejects.toThrow();expect(encodeTrip(s.doc)).toEqual(before);expect(storage.writes).toBe(0);
  });
  it('keeps originals recoverable in this tab when quota prevents durable storage',async()=>{
    const {selectMagazineTee}=await import('./magazine-controls');const {getTripBlob}=await import('./trip-assets');
    storage.full=true;vi.stubGlobal('fetch',async()=>new Response(new Blob(['quota original'],{type:'image/png'})));
    const s=make();expect(await selectMagazineTee(s,human,art('quota'),[art('quota')],new AbortController().signal)).toEqual({persisted:false});
    const hash=String(s.parts.assets.get('quota')!.get('hash'));
    expect(await(await getTripBlob(hash))!.text()).toBe('quota original');expect(s.boardRev).toBe(1);
  });
  it('reopens the cached original and preference without FCC metadata or image network access',async()=>{
    const {selectMagazineTee}=await import('./magazine-controls');const {getTripBlob,storeImportedAssets}=await import('./trip-assets');
    const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0,73,69,78,68,174,66,96,130]);
    vi.stubGlobal('fetch',async()=>new Response(png,{headers:{'content-type':'image/png'}}));
    const s=make(),chosen=art('offline');await selectMagazineTee(s,human,chosen,[chosen]);
    const original=await getTripBlob(String(s.parts.assets.get('offline')!.get('hash')));
    const reopened=await importTripPackage(await exportTripPackage(s.doc,new Map([['offline',new Uint8Array(await original!.arrayBuffer())]]),{includePrivate:false}));
    storage.blobs.clear();await storeImportedAssets(reopened.doc,reopened.assets);
    vi.stubGlobal('fetch',async()=>{throw new Error('offline');});
    vi.stubGlobal('FileReader',class{
      result='';onload:(()=>void)|null=null;
      readAsDataURL(blob:Blob){void blob.arrayBuffer().then(buffer=>{this.result=`data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;this.onload?.();});}
    });
    vi.stubGlobal('createImageBitmap',async()=>({width:20,height:25,close:()=>{}}));
    const {prepareMagazine}=await import('./artifacts');const restored=new TripSession(reopened.doc);
    const magazine=await prepareMagazine(restored,undefined,false);
    expect(readTripMeta(restored.doc).magazine?.wornTeeAssetId).toBe('offline');
    expect(magazine.apparel?.map(item=>item.assetId)).toEqual(['offline']);
    expect(magazine.pages.flatMap(page=>page.assetIds)).toContain('offline');
    expect(magazine.pages.filter(page=>page.section==='style').flatMap(page=>page.assetIds)).toEqual(['offline']);
    expect(magazine.pages.at(-1)?.assetIds).toEqual([]);
    const remoteImages=magazine.pages.flatMap(page=>page.svg.match(/<image\b[^>]*href="https?:/g)??[]);
    expect(remoteImages).toEqual([]);
    expect(await selectMagazineTee(restored,human,magazine.apparel![0]!,magazine.apparel!)).toEqual({persisted:true});
  });
});
