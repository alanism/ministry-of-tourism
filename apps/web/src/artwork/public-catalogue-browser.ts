import {CATALOGUE_LIMITS,catalogueItemForPurpose,catalogueManifestSchema,readCatalogueItem,sha256Hex,validateCatalogueDetail,validateCatalogueIndex,type CatalogueIndex} from '@mot/core';
import type {z} from 'zod';
type Manifest=z.infer<typeof catalogueManifestSchema>;
export type CatalogueSnapshot={index:CatalogueIndex;manifest:Manifest;status:'ready'|'cached'|'stale';loadedAt:number;reason?:string};
const TTL=5*60*1000,MANIFEST_BYTES=512*1024,DETAIL_CACHE=8;
/** Public metadata only. No image, trip data or arbitrary URL enters this reader. */
export class PublicCatalogueReader{
 private snapshot?:CatalogueSnapshot;
 private details=new Map<string,unknown>();
 private fetcher:typeof fetch;
 constructor(fetcher:typeof fetch=(...args)=>fetch(...args)){this.fetcher=fetcher;}
 private async bytes(url:string,maxBytes:number,signal:AbortSignal):Promise<Uint8Array>{
  signal.throwIfAborted();const abort=new AbortController(),stop=()=>abort.abort(signal.reason),timer=setTimeout(()=>abort.abort(new Error('Catalogue timed out. Retry when connected.')),20000);signal.addEventListener('abort',stop,{once:true});
  let rejectAbort!:()=>void;const cancelled=new Promise<never>((_,reject)=>{rejectAbort=()=>reject(abort.signal.reason??new DOMException('Cancelled','AbortError'));abort.signal.addEventListener('abort',rejectAbort,{once:true});});
  try{return await Promise.race([(async()=>{
   const response=await this.fetcher(url,{signal:abort.signal,credentials:'omit',redirect:'error'});
   if(abort.signal.aborted){void response.body?.cancel().catch(()=>{});abort.signal.throwIfAborted();}
   if(!response.ok)throw new Error(`Catalogue request failed (${response.status}). Retry when connected.`);
   if(Number(response.headers.get('content-length'))>maxBytes){void response.body?.cancel().catch(()=>{});throw new Error('Catalogue exceeds its byte size limit.');}
   const reader=response.body?.getReader();if(!reader)throw new Error('Catalogue response is empty.');
   const cancelRead=()=>{void reader.cancel().catch(()=>{});};abort.signal.addEventListener('abort',cancelRead,{once:true});
   const chunks:Uint8Array[]=[];let size=0;
   try{while(true){const {value,done}=await reader.read();abort.signal.throwIfAborted();if(done)break;size+=value.length;if(size>maxBytes){await reader.cancel();throw new Error('Catalogue exceeds its byte size limit.');}chunks.push(value);}}
   finally{abort.signal.removeEventListener('abort',cancelRead);reader.releaseLock();}
   const output=new Uint8Array(size);let offset=0;for(const part of chunks){output.set(part,offset);offset+=part.length;}return output;
  })(),cancelled]);}finally{clearTimeout(timer);signal.removeEventListener('abort',stop);abort.signal.removeEventListener('abort',rejectAbort);}
 }
 private parse(bytes:Uint8Array){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)) as unknown;}catch{throw new Error('Catalogue data is unavailable or invalid. Retry when connected.');}}
 async manifest(signal:AbortSignal){return catalogueManifestSchema.parse(this.parse(await this.bytes('/fcc-catalogue/manifest.json',MANIFEST_BYTES,signal)));}
 private async verified(file:{url:string;bytes:number;sha256:string},limit:number,signal:AbortSignal){
  const bytes=await this.bytes(file.url,Math.min(file.bytes,limit),signal);signal.throwIfAborted();
  if(bytes.byteLength!==file.bytes)throw new Error('Catalogue byte size does not match its snapshot.');
  if(await sha256Hex(bytes)!==file.sha256)throw new Error('Catalogue integrity hash does not match its snapshot.');signal.throwIfAborted();return this.parse(bytes);
 }
 async load(signal:AbortSignal,forceRefresh=false):Promise<CatalogueSnapshot>{
  signal.throwIfAborted();const previous=this.snapshot;
  if(previous&&!forceRefresh&&Date.now()-previous.loadedAt>=0&&Date.now()-previous.loadedAt<TTL)return{...previous,status:'cached'};
  try{
   const manifest=await this.manifest(signal);
   const index=validateCatalogueIndex(await this.verified(manifest.index,CATALOGUE_LIMITS.indexBytes,signal));
   if(index.snapshotId!==manifest.snapshotId)throw new Error('Catalogue index belongs to another snapshot.');
   const known=new Set(manifest.shards.map(s=>s.url));if(index.items.some(i=>!known.has(i.detail)))throw new Error('Catalogue detail is missing from the manifest.');
   signal.throwIfAborted();if(previous?.index.snapshotId!==index.snapshotId)this.details.clear();
   this.snapshot={manifest,index,status:'ready',loadedAt:Date.now()};return this.snapshot;
  }catch(error){signal.throwIfAborted();if(previous)return{...previous,status:'stale',reason:'Could not refresh. Showing the last verified catalogue from this session.'};throw error;}
 }
 async detail(id:string,signal:AbortSignal,expectedSnapshot?:string,purpose:'personal-trip'|'host-guide'='personal-trip'){
  signal.throwIfAborted();const snapshot=this.snapshot;if(!snapshot)throw new Error('Load the catalogue before selecting an item.');
  if(expectedSnapshot&&snapshot.index.snapshotId!==expectedSnapshot)throw new Error('The catalogue snapshot changed. Refresh and select the item again.');
  const summary=readCatalogueItem(snapshot.index,id).item;if(!summary)throw new Error('This catalogue identity is unavailable.');
  const file=snapshot.manifest.shards.find(s=>s.url===summary.detail);if(!file)throw new Error('The selected item has no declared detail file.');
  const key=snapshot.index.snapshotId+':'+file.url;let raw=this.details.get(key);
  if(!raw)raw=await this.verified(file,CATALOGUE_LIMITS.detailBytes,signal);
  signal.throwIfAborted();if(this.snapshot?.index.snapshotId!==snapshot.index.snapshotId)throw new Error('Catalogue changed. Select the item again.');
  const item=validateCatalogueDetail(raw,snapshot.index,id);
  this.details.delete(key);this.details.set(key,raw);while(this.details.size>DETAIL_CACHE)this.details.delete(this.details.keys().next().value!);
  return{item:catalogueItemForPurpose(item,purpose),snapshotId:snapshot.index.snapshotId};
 }
}
export const publicCatalogueReader=new PublicCatalogueReader();
