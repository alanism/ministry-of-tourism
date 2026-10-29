import { buildMagazine, buildPdf, createDiagnostic, DiagnosticLog, encodeTrip, exportTripPackage, loadCityApparel, loadTrip, MAGAZINE, OperationTracker, presentationScope, readAllCards, readAsset, readMagazineApparel, readPresentations, readTripMeta, rgbPdfImage, tripParts, type DiagnosticReceipt, type MagazineDocument, type OperationState, type TripSession } from '@writers-board/core';
import { getTripBlob } from './trip-assets';
import type { TripArtifact } from './agentApi';
import {artifactSha256,keepArtifact,readArtifact,removeArtifact,type ArtifactInventory,type ArtifactScope,type StoredArtifact} from './artifact-store';
import { svgPdfTextLayer } from './pdf-text-layer';

export const diagnostics=new DiagnosticLog();
let lastOperation:OperationState|undefined;
export const currentTripOperation=()=>lastOperation;
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(blob);});
export interface ArtifactProgress {stage:'collect'|'layout'|'write'|'verify';completed:number;total?:number;unit:'assets'|'cards'|'pages'|'bytes';done:boolean;}
export interface ArtifactOptions {includePrivate?:boolean;variant?:ArtifactScope;onProgress?:(progress:ArtifactProgress)=>void;onState?:(state:OperationState)=>void;onDiagnostic?:(receipt:DiagnosticReceipt)=>void;}
export interface ExportArtifact extends TripArtifact {id:string;createdAt:string;sha256:string;kept:boolean;scope:ArtifactScope;urlExpiresAt:null;inventory:ArtifactInventory;coverSvg?:string;storageDiagnostic?:DiagnosticReceipt;}
const available=new Map<string,{record:StoredArtifact;artifact:ExportArtifact}>();
function selection(doc:import('yjs').Doc,scope:ArtifactScope){
  const parts=tripParts(doc),visible=(value:string)=>scope==='personal'||(scope==='guide'?value==='guide':value!=='private');
  const cards=readAllCards(parts).filter(card=>visible(card.scope)),ids=new Set(cards.map(card=>card.id));
  const placements=readPresentations(parts).filter(p=>visible(presentationScope(parts,p))&&(!p.cardId||ids.has(p.cardId)));
  const assets=[...new Set([...cards.flatMap(card=>card.assetIds),...placements.flatMap(p=>p.assetId?[p.assetId]:[]),...readMagazineApparel(parts,scope==='personal').map(asset=>asset.id)])];
  return {parts,cards,placements,assets};
}
export function artifactInventory(doc:import('yjs').Doc,scope:ArtifactScope='stay'):ArtifactInventory{
  const selected=selection(doc,scope);
  return {cards:selected.cards.length,placements:selected.placements.length,assets:selected.assets.length,notes:selected.cards.filter(card=>card.kind==='note'||card.kind==='brief'||!!card.travelerNote).length,credits:selected.assets.filter(id=>readAsset(selected.parts,id)?.credit?.trim()).length};
}
async function collectAssets(doc:import('yjs').Doc,scope:ArtifactScope,signal?:AbortSignal,onProgress?:ArtifactOptions['onProgress'],stage:ArtifactProgress['stage']='collect'){
  const selected=selection(doc,scope),bytes=new Map<string,Uint8Array>();
  onProgress?.({stage,completed:0,total:selected.assets.length,unit:'assets',done:false});
  for(const id of selected.assets){signal?.throwIfAborted();const asset=readAsset(selected.parts,id),blob=asset?await getTripBlob(asset.hash):null;if(!asset||!blob)throw new Error('A selected image is missing. Restore its original bytes and retry.');if(await artifactSha256(blob)!==asset.hash)throw new Error('A selected image failed its checksum. Restore its original bytes.');bytes.set(id,new Uint8Array(await blob.arrayBuffer()));onProgress?.({stage,completed:bytes.size,total:selected.assets.length,unit:'assets',done:false});}
  signal?.throwIfAborted();onProgress?.({stage,completed:bytes.size,total:selected.assets.length,unit:'assets',done:true});return bytes;
}

export async function prepareMagazine(session:TripSession,signal?:AbortSignal,includePrivate=true,options:Pick<ArtifactOptions,'variant'|'onProgress'>&{onPrepared?:(assets:NonNullable<Parameters<typeof buildMagazine>[1]>)=>void}={}):Promise<MagazineDocument> {
  const doc=loadTrip(encodeTrip(session.doc));
  try {
    const urls=new Map<string,string>(),dimensions=new Map<string,{width:number;height:number}>();
    const scope=options.variant??(includePrivate?'personal':'stay');
    const bytes=await collectAssets(doc,scope,signal,options.onProgress);
    for(const [id,original] of bytes){
      signal?.throwIfAborted();
      const asset=doc.getMap<import('yjs').Map<unknown>>('tripAssets').get(id)!;
      const blob=await getTripBlob(String(asset.get('hash')))??new Blob([original as BlobPart],{type:String(asset.get('mime'))});
      urls.set(id,await dataUrl(blob));
      const image=await new Promise<ImageBitmap>((resolve,reject)=>{
        const stop=()=>reject(signal?.reason??new DOMException('Export cancelled','AbortError'));
        if(signal?.aborted){stop();return;}
        signal?.addEventListener('abort',stop,{once:true});
        Promise.resolve().then(()=>{signal?.throwIfAborted();return createImageBitmap(blob);}).then(
          image=>{signal?.removeEventListener('abort',stop);if(signal?.aborted){image.close();stop();}else resolve(image);},
          error=>{signal?.removeEventListener('abort',stop);reject(error);},
        );
      });
      try{signal?.throwIfAborted();dimensions.set(id,{width:image.width,height:image.height});}finally{image.close();}
    }
    signal?.throwIfAborted();
    const meta=readTripMeta(doc),cityId=meta.cityId??meta.city.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const cached=readMagazineApparel(tripParts(doc),scope==='personal').map(asset=>asset.apparel!);
    let apparel:Awaited<ReturnType<typeof loadCityApparel>>=[...cached];const warnings:string[]=[];
    try{
      const fresh=await loadCityApparel(cityId,{signal});
      apparel=[...cached,...fresh.filter(art=>!cached.some(saved=>saved.assetId===art.assetId))].slice(0,3);
      const downloads=apparel.filter(art=>!urls.has(art.assetId));
      for(const [index,art] of downloads.entries()){
        options.onProgress?.({stage:'collect',completed:bytes.size+index,total:bytes.size+downloads.length,unit:'assets',done:false});
        signal?.throwIfAborted();
        const response=await fetch(art.originalUrl??art.renditionUrl,{signal,credentials:'omit',redirect:'error'});
        if(!response.ok)throw new Error('FCC tee image unavailable');
        const image=await response.blob();if(!/^image\/(png|jpeg|webp|avif)$/.test(image.type))throw new Error('FCC tee image is not a supported raster');
        urls.set(art.assetId,await dataUrl(image));dimensions.set(art.assetId,{width:art.width,height:art.height});
        options.onProgress?.({stage:'collect',completed:bytes.size+index+1,total:bytes.size+downloads.length,unit:'assets',done:index===downloads.length-1});
      }
    }catch(error){if(signal?.aborted)throw error;apparel=[...cached];warnings.push(cached.length?'FCC is unavailable; your cached tee choice is kept.':'FCC tee pages are unavailable; your trip pages are kept.');}
    options.onProgress?.({stage:'layout',completed:0,unit:'pages',done:false});
    const renderOptions:NonNullable<Parameters<typeof buildMagazine>[1]>&{artwork:readonly unknown[]}={assetUrls:urls,assetDimensions:dimensions,includePrivate:scope==='personal',variant:scope,artwork:apparel};
    const magazine=buildMagazine(doc,renderOptions);magazine.warnings.push(...warnings);signal?.throwIfAborted();options.onPrepared?.(renderOptions);
    options.onProgress?.({stage:'layout',completed:magazine.pages.length,total:magazine.pages.length,unit:'pages',done:true});return magazine;
  } finally {doc.destroy();}
}

export async function magazinePdf(magazine:MagazineDocument,signal?:AbortSignal,onProgress?:ArtifactOptions['onProgress']):Promise<Uint8Array> {
  if(!magazine.pages.length)throw new Error('Add a card or artwork before exporting a magazine.');
  const pages=[];
  onProgress?.({stage:'write',completed:0,total:magazine.pages.length,unit:'pages',done:false});
  for(const page of magazine.pages){
    signal?.throwIfAborted();
    const url=URL.createObjectURL(new Blob([page.svg],{type:'image/svg+xml'}));
    try {
      const image=new Image();image.src=url;
      await new Promise<void>((resolve,reject)=>{
        const stop=()=>{image.src='';reject(signal?.reason??new DOMException('Export cancelled','AbortError'));};
        if(signal?.aborted){stop();return;}
        signal?.addEventListener('abort',stop,{once:true});
        image.decode().then(resolve,reject).finally(()=>signal?.removeEventListener('abort',stop));
      });
      const canvas=document.createElement('canvas');canvas.width=MAGAZINE.widthPx;canvas.height=MAGAZINE.heightPx;
      const context=canvas.getContext('2d');if(!context)throw new Error('This browser could not render the PDF.');
      context.drawImage(image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      const textLayer=await svgPdfTextLayer(page.svg,signal);
      pages.push({...rgbPdfImage(pixels.data,canvas.width,canvas.height),pageSize:MAGAZINE.pageSize,fullBleed:true,links:page.links,label:page.pattern,textLayer});
      onProgress?.({stage:'write',completed:pages.length,total:magazine.pages.length,unit:'pages',done:false});
    }finally{URL.revokeObjectURL(url);}
  }
  signal?.throwIfAborted();const bytes=buildPdf(pages,magazine.title,{producer:'Ministry of Tourism'});onProgress?.({stage:'write',completed:pages.length,total:magazine.pages.length,unit:'pages',done:true});return bytes;
}

export async function createTripArtifact(session:TripSession,format:'pdf'|'zip',signal?:AbortSignal,options:ArtifactOptions={}):Promise<ExportArtifact> {
  const snapshot=loadTrip(encodeTrip(session.doc)),frozen=new (session.constructor as typeof import('@writers-board/core').TripSession)(snapshot);
  const id=crypto.randomUUID(),startedAt=new Date().toISOString();
  const diagnostic=(receipt:DiagnosticReceipt)=>{diagnostics.record(receipt);options.onDiagnostic?.(receipt);};
  const tracker=new OperationTracker({id,boardId:frozen.boardId,revision:frozen.boardRev,appVersion:'mot-integration-v2',operation:'export',onChange:state=>{lastOperation=state;options.onState?.(state);},onDiagnostic:diagnostic});
  const cancel=()=>tracker.cancel();signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)tracker.cancel();
  try{
    signal?.throwIfAborted();
    // An explicitly shared caller cannot accidentally select the personal variant.
    const scope:ArtifactScope=options.includePrivate===false?(options.variant==='guide'?'guide':'stay'):options.variant??(options.includePrivate===true?'personal':'stay');
    const inventory=artifactInventory(snapshot,scope);
    let magazine:MagazineDocument|undefined;
    let bytes:Uint8Array;
    if(format==='pdf'){
      magazine=await tracker.run('fetching','validating',()=>prepareMagazine(frozen,signal,scope==='personal',{variant:scope,onProgress:options.onProgress}));
      bytes=await tracker.run('exporting','exported',()=>magazinePdf(magazine!,signal,options.onProgress));
    }else{
      options.onProgress?.({stage:'collect',completed:inventory.cards,total:inventory.cards,unit:'cards',done:true});
      const media=await tracker.run('fetching','validating',()=>collectAssets(snapshot,scope,signal,options.onProgress,'layout'));
      options.onProgress?.({stage:'write',completed:0,unit:'bytes',done:false});
      bytes=await tracker.run('exporting','exported',()=>exportTripPackage(snapshot,media,{includePrivate:scope==='personal',variant:scope==='personal'?'private':scope}));
      options.onProgress?.({stage:'write',completed:bytes.length,total:bytes.length,unit:'bytes',done:true});
    }
    signal?.throwIfAborted();
    const title=readTripMeta(snapshot).title.replace(/[^\p{L}\p{N}-]+/gu,'-').replace(/^-|-$/g,'')||'trip';
    const mime=format==='pdf'?'application/pdf':'application/zip',filename=`${title}.${format==='pdf'?'pdf':'mot.zip'}`;
    options.onProgress?.({stage:'verify',completed:0,total:bytes.length,unit:'bytes',done:false});
    const blob=new Blob([bytes as BlobPart],{type:mime}),readback=new Uint8Array(await blob.arrayBuffer());
    if(readback.length!==bytes.length||!readback.every((byte,index)=>byte===bytes[index]))throw new Error('Export read-back failed. Retry from the unchanged board.');
    const sha256=await artifactSha256(blob),createdAt=new Date().toISOString();signal?.throwIfAborted();
    const record:StoredArtifact={id,filename,mime,byteCount:blob.size,boardId:frozen.boardId,revision:frozen.boardRev,createdAt,sha256,scope,format,blob,inventory,...(magazine?.pages[0]?{coverSvg:magazine.pages[0].svg}:{})};
    let kept=false,storageDiagnostic:DiagnosticReceipt|undefined;
    try{await keepArtifact(record);kept=true;}
    catch(error){storageDiagnostic=createDiagnostic({requestId:id,operation:'keep-export',boardId:frozen.boardId,revision:frozen.boardRev,appVersion:'mot-integration-v2',startedAt,errorClass:'storage',error});diagnostic(storageDiagnostic);}
    if(signal?.aborted){if(kept)try{await removeArtifact(id);}catch{/* The cancelled file is never advertised as ready. */}signal.throwIfAborted();}
    options.onProgress?.({stage:'verify',completed:blob.size,total:blob.size,unit:'bytes',done:true});
    const artifact:ExportArtifact={id,filename,mime,byteCount:blob.size,boardId:frozen.boardId,revision:frozen.boardRev,url:URL.createObjectURL(blob),createdAt,sha256,kept,scope,urlExpiresAt:null,inventory,coverSvg:record.coverSvg,...(storageDiagnostic?{storageDiagnostic}:{})};
    available.set(id,{record,artifact});return artifact;
  }catch(error){tracker.fail(error);throw error;}finally{signal?.removeEventListener('abort',cancel);frozen.destroy();snapshot.destroy();}
}

/** A kept file gets a fresh URL after reload. Tab-only bytes stay available until explicit removal or tab close. */
export async function restoreTripArtifact(id:string):Promise<ExportArtifact>{
  const live=available.get(id);if(live)return live.artifact;
  const record=await readArtifact(id);if(!record)throw new Error('This export is no longer kept in this browser. Make a fresh export.');
  const artifact:ExportArtifact={id:record.id,filename:record.filename,mime:record.mime,byteCount:record.byteCount,boardId:record.boardId,revision:record.revision,url:URL.createObjectURL(record.blob),createdAt:record.createdAt,sha256:record.sha256,kept:true,scope:record.scope,urlExpiresAt:null,inventory:record.inventory??{cards:0,placements:0,assets:0,notes:0,credits:0},coverSvg:record.coverSvg};
  available.set(id,{record,artifact});return artifact;
}
export async function forgetTripArtifact(id:string):Promise<void>{
  const live=available.get(id);if(live?.artifact.kept!==false)await removeArtifact(id);else try{await removeArtifact(id);}catch{/* No verified durable copy exists; remove the tab-only file. */}
  if(live)URL.revokeObjectURL(live.artifact.url);available.delete(id);
}

export function downloadArtifact(artifact:TripArtifact):void {
  const link=document.createElement('a');link.href=artifact.url;link.download=artifact.filename;document.body.append(link);link.click();link.remove();
}
