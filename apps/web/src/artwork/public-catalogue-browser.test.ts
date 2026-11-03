import {afterEach,expect,it,vi} from 'vitest';
import {sha256Hex,searchCatalogue,validateCatalogueIndex} from '@mot/core';
import {PublicCatalogueReader} from './public-catalogue-browser';
const encoder=new TextEncoder();
const permission={allowed:false,reason:'Fixture unavailable'};
async function fixture(){
 const items=['bangkok','rome','tokyo'].map((city,n)=>({id:city+':art',type:'art',title:city+' picture',originCityId:city,countryCode:['TH','IT','JP'][n],sourceId:'source:'+city,sourceVersion:'v1',retrievedAt:'2026-11-02T00:00:00Z',freshness:'ready',rights:{credit:'FCC',evidence:'unknown',policyRef:'MOT-92'},eligibility:{discover:{allowed:true,reason:'Known source'},preview:permission,insert:permission,share:permission,embed:permission,shop:permission},sourceUnit:'asset-row',sourceState:'unresolved',category:'map',line:null,cityLabel:city,countryLabel:city,thumbnailUrl:null,thumbnailRole:null,detail:'/fcc-catalogue/details/'+city+'.json'}));
 const index=validateCatalogueIndex({schema:'mot.public-catalogue.index/1',snapshotId:'snapshot-1',items,coverage:{sourceRows:3,unresolvedRows:3,excludedRows:0,shopProductRecords:0,runtimeExtraRecords:0,cities:0,articles:0,places:0},gaps:[{reason:'Mappings unresolved'}],aliases:[],tombstones:[]});
 const bodies=new Map<string,string>();bodies.set('/fcc-catalogue/index.json',JSON.stringify(index));
 for(const item of index.items)bodies.set(item.detail,JSON.stringify({schema:'mot.public-catalogue.detail/1',snapshotId:index.snapshotId,locator:item.detail,items:[{...item,representations:[],sourceRelations:{matchedMotIds:[],aliasSourceIds:[],frame:null,crop:null},runtimeArtwork:null}]}));
 const files=await Promise.all([...bodies].map(async([url,text])=>({url,bytes:encoder.encode(text).length,sha256:await sha256Hex(encoder.encode(text)),records:1})));
 const {records,...indexFile}=files[0]!;
 bodies.set('/fcc-catalogue/manifest.json',JSON.stringify({schema:'mot.public-catalogue.manifest/1',snapshotId:index.snapshotId,index:indexFile,shards:files.slice(1),sources:[]}));
 const fetcher=vi.fn(async(url:RequestInfo|URL)=>new Response(bodies.get(String(url))??'missing',{status:bodies.has(String(url))?200:404}));
 return{index,bodies,fetcher,reader:new PublicCatalogueReader(fetcher as typeof fetch)};
}
afterEach(()=>vi.useRealTimers());
it('can bind a metadata-only context to the pinned manifest without fetching the complete index',async()=>{
 const {reader,fetcher}=await fixture();expect((await reader.manifest(new AbortController().signal)).snapshotId).toBe('snapshot-1');expect(fetcher).toHaveBeenCalledTimes(1);
});
it('keeps approved personal-only image insertion unavailable in a host-guide detail',async()=>{
 const {reader,bodies}=await fixture();
 const index=JSON.parse(bodies.get('/fcc-catalogue/index.json')!),row=index.items.find((i:{id:string})=>i.id==='tokyo:art');row.personalOnly=true;row.eligibility.insert={allowed:true,reason:'Approved for personal insertion only'};
 const detail=JSON.parse(bodies.get(row.detail)!);detail.items[0]={...detail.items[0],personalOnly:true,eligibility:row.eligibility};
 bodies.set('/fcc-catalogue/index.json',JSON.stringify(index));bodies.set(row.detail,JSON.stringify(detail));
 const manifest=JSON.parse(bodies.get('/fcc-catalogue/manifest.json')!);
 for(const file of [manifest.index,...manifest.shards]){const bytes=encoder.encode(bodies.get(file.url)!);file.bytes=bytes.length;file.sha256=await sha256Hex(bytes);}
 bodies.set('/fcc-catalogue/manifest.json',JSON.stringify(manifest));const signal=new AbortController().signal;await reader.load(signal);
 expect((await reader.detail('tokyo:art',signal,'snapshot-1','host-guide')).item.eligibility.insert.allowed).toBe(false);
 expect((await reader.detail('tokyo:art',signal,'snapshot-1','personal-trip')).item.eligibility.insert.allowed).toBe(true);
});
it('searches complete pinned metadata before any detail/image request and caches verified detail',async()=>{
 const {reader,fetcher}=await fixture(),signal=new AbortController().signal;
 const first=await reader.load(signal);expect(first.status).toBe('ready');expect(fetcher).toHaveBeenCalledTimes(2);
 const page=await searchCatalogue(first.index,{purpose:'personal-trip',query:'tokyo'});expect(page.items.map(x=>x.id)).toEqual(['tokyo:art']);
 expect(fetcher).toHaveBeenCalledTimes(2);expect((await reader.detail('tokyo:art',signal)).item.id).toBe('tokyo:art');
 await reader.detail('tokyo:art',signal);expect(fetcher).toHaveBeenCalledTimes(3);
 expect((await reader.load(signal)).status).toBe('cached');expect(fetcher).toHaveBeenCalledTimes(3);
});
it('rejects changed index bytes before exposing any unverified source',async()=>{
 const {reader,bodies}=await fixture();bodies.set('/fcc-catalogue/index.json',bodies.get('/fcc-catalogue/index.json')!.replace('rome picture','fake picture'));
 await expect(reader.load(new AbortController().signal)).rejects.toThrow(/hash|integrity/i);
});
it('retains only a previously validated snapshot as explicitly stale after a refresh failure',async()=>{
 const {reader,fetcher}=await fixture(),signal=new AbortController().signal;await reader.load(signal);fetcher.mockRejectedValue(new Error('offline'));
 const result=await reader.load(signal,true);expect(result.status).toBe('stale');expect(result.index.snapshotId).toBe('snapshot-1');expect(result.reason).toMatch(/offline|refresh/i);
});
it('rejects unknown detail locators without making an arbitrary request',async()=>{
 const {reader,bodies,fetcher}=await fixture(),manifest=JSON.parse(bodies.get('/fcc-catalogue/manifest.json')!);manifest.index.url='https://private.invalid/secret';bodies.set('/fcc-catalogue/manifest.json',JSON.stringify(manifest));
 await expect(reader.load(new AbortController().signal)).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1);
});
it('refuses details when another consumer has a different visible snapshot, before fetching an image or shard',async()=>{
 const {reader,fetcher}=await fixture(),signal=new AbortController().signal;await reader.load(signal);
 await expect(reader.detail('tokyo:art',signal,'older-visible-snapshot')).rejects.toThrow(/snapshot|changed/i);expect(fetcher).toHaveBeenCalledTimes(2);
});
it('cancels immediately even if the network adapter ignores AbortSignal',async()=>{
 const reader=new PublicCatalogueReader((()=>new Promise(()=>{})) as typeof fetch),controller=new AbortController();const result=reader.load(controller.signal);controller.abort();
 await expect(result).rejects.toThrow();
});
it('rejects oversized streamed bytes and mismatched detail bytes without a partial result',async()=>{
 const {reader,bodies}=await fixture(),signal=new AbortController().signal;await reader.load(signal);bodies.set('/fcc-catalogue/details/tokyo.json',' '.repeat(4*1024*1024+1));
 await expect(reader.detail('tokyo:art',signal)).rejects.toThrow(/size|large|bytes/i);
});
