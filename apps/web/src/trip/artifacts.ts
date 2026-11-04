import { selectedAssetClosure, buildMagazine, buildPdf, createDiagnostic, DiagnosticLog, encodeTrip, exportTripPackage, loadTrip, MAGAZINE, OperationTracker, presentationScope, readAllCards, readAsset, readMagazineApparel, readPresentations, readTripMeta, tripParts, type DiagnosticReceipt, type DiagnosticStep, type MagazineDocument, type OperationState, type TripSession } from '@mot/core';
import { getTripBlob } from './trip-assets';
import type { TripArtifact } from './agentApi';
import {artifactSha256,keepArtifact,readArtifact,removeArtifact,type ArtifactInventory,type ArtifactScope,type StoredArtifact} from './artifact-store';
import { svgPdfTextLayer } from './pdf-text-layer';
import {checkedPixels,HTML_LIMITS,rasterDimensions,sanitizedRaster,type EmbeddedMedia} from './standalone-media';
import {cityArtSnapshot,snapshotWarnings,tripCityId,type CityArtSnapshot} from './export-snapshot';
import { exportBitmapDimensions } from './export-image';
/** Shared city art for every export; a failed or absent lookup keeps the trip's own pages. */
async function citySnapshot(doc:import('yjs').Doc,signal?:AbortSignal):Promise<CityArtSnapshot|undefined>{
  const cityId=tripCityId(readTripMeta(doc));if(!cityId)return;
  try{return await cityArtSnapshot(cityId,{signal});}catch(error){if(signal?.aborted)throw error;return;}
}
const snapshotArtwork=(snapshot:CityArtSnapshot|undefined,saved:readonly NonNullable<ReturnType<typeof readMagazineApparel>[number]['apparel']>[]):unknown[]=>[...saved,...(snapshot?.tees??[]).filter(tee=>!saved.some(s=>s.assetId===tee.assetId))].slice(0,3).concat(snapshot?.art as never[]??[]);

export const diagnostics=new DiagnosticLog();
/** Longest magazine page side; larger originals stay in the editable ZIP. */
const HTML_RASTER={maxSide:1680,jpegQuality:0.86};
let lastOperation:OperationState|undefined;
export const currentTripOperation=()=>lastOperation;
const dataUrl=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(blob);});
export interface ArtifactProgress {stage:'collect'|'layout'|'write'|'verify';completed:number;total?:number;unit:'assets'|'cards'|'pages'|'bytes';done:boolean;}
export interface ArtifactOptions {includePrivate?:boolean;variant?:ArtifactScope;onProgress?:(progress:ArtifactProgress)=>void;onState?:(state:OperationState)=>void;onDiagnostic?:(receipt:DiagnosticReceipt)=>void;}
export interface ExportArtifact extends TripArtifact {id:string;createdAt:string;sha256:string;kept:boolean;scope:ArtifactScope;urlExpiresAt:null;inventory:ArtifactInventory;coverSvg?:string;storageDiagnostic?:DiagnosticReceipt;}
const available=new Map<string,{record:StoredArtifact;artifact:ExportArtifact}>();
const restoring=new Map<string,Set<{cancelled:boolean}>>(),removing=new Map<string,Promise<void>>();
function selection(doc:import('yjs').Doc,scope:ArtifactScope,html=false,ancestors=false){
  const parts=tripParts(doc),visible=(value:string)=>scope==='personal'||(scope==='guide'?value==='guide':value!=='private');
  const cards=readAllCards(parts).filter(card=>visible(card.scope)),ids=new Set(cards.map(card=>card.id));
  const placements=readPresentations(parts).filter(p=>(!html||p.surface!=='board')&&visible(presentationScope(parts,p))&&(!p.cardId||ids.has(p.cardId)));
  const assets=[...new Set([...cards.flatMap(card=>card.assetIds),...placements.flatMap(p=>p.assetId?[p.assetId]:[]),...readMagazineApparel(parts,scope==='personal').map(asset=>asset.id)])];
  if(ancestors && scope==='personal') for(const a of selectedAssetClosure(parts,assets))if(!assets.includes(a.id))assets.push(a.id);
  return {parts,cards,placements,assets};
}
export function artifactInventory(doc:import('yjs').Doc,scope:ArtifactScope='stay',format:'html'|'pdf'|'zip'='zip'):ArtifactInventory{
  const selected=selection(doc,scope,format==='html',format==='zip');
  return {cards:selected.cards.length,placements:selected.placements.length,assets:selected.assets.length,notes:selected.cards.filter(card=>card.kind==='note'||card.kind==='brief'||!!card.travelerNote||!!card.body?.trim()).length,credits:selected.assets.filter(id=>readAsset(selected.parts,id)?.credit?.trim()).length};
}
async function collectAssets(doc:import('yjs').Doc,scope:ArtifactScope,signal?:AbortSignal,onProgress?:ArtifactOptions['onProgress'],stage:ArtifactProgress['stage']='collect',classifyErrors=false,html=false,ancestors=false){
  const selected=selection(doc,scope,html,ancestors),bytes=new Map<string,Uint8Array>();
  let total=0;
  onProgress?.({stage,completed:0,total:selected.assets.length,unit:'assets',done:false});
  for(const id of selected.assets){signal?.throwIfAborted();const asset=readAsset(selected.parts,id),blob=asset?await getTripBlob(asset.hash):null;if(!asset||!blob)throw Object.assign(new Error(`A selected image is missing${html?` (${id})`:''}. Restore its original bytes and retry.`),classifyErrors?{code:'unavailable'}:{});total+=blob.size;if(html&&(!blob.size||blob.size>HTML_LIMITS.fileBytes||total>HTML_LIMITS.sourceBytes))throw new Error(`Image ${id} exceeds the HTML source limit. Keep your originals in an editable ZIP.`);if(await artifactSha256(blob)!==asset.hash)throw Object.assign(new Error('A selected image failed its checksum. Restore its original bytes.'),classifyErrors?{code:'invalid_input'}:{});bytes.set(id,new Uint8Array(await blob.arrayBuffer()));onProgress?.({stage,completed:bytes.size,total:selected.assets.length,unit:'assets',done:false});}
  signal?.throwIfAborted();onProgress?.({stage,completed:bytes.size,total:selected.assets.length,unit:'assets',done:true});return bytes;
}

/** HTML pins saved selections and bytes; live catalogue previews never join an export implicitly. */
export async function prepareHtmlMagazine(session:TripSession,signal?:AbortSignal,scope:ArtifactScope='stay',onProgress?:ArtifactOptions['onProgress']):Promise<{magazine:MagazineDocument;media:EmbeddedMedia[]}> {
  const doc=loadTrip(encodeTrip(session.doc));
  try{
    const selected=selection(doc,scope,true);
    const bytes=await collectAssets(doc,scope,signal,onProgress,'collect',true,true),sizes=new Map<string,{width:number;height:number}>();
    let pixels=0;
    for(const [id,original] of bytes){
      const asset=readAsset(selected.parts,id)!;
      try{const size=rasterDimensions(original,asset.mime);pixels+=checkedPixels(size);sizes.set(id,size);}catch(error){throw new Error(`Image ${id}: ${error instanceof Error?error.message:'Unsupported original.'}`);}
      if(asset.source?.provider==='fcc'&&!asset.credit?.trim())throw new Error(`FCC image ${id} needs its actual credit before HTML export.`);
      if(pixels>HTML_LIMITS.totalPixels)throw new Error('Selected images exceed the experimental HTML decode limit (64 megapixels total). Use an editable ZIP to keep the full trip.');
    }
    const urls=new Map<string,string>(),dimensions=new Map<string,{width:number;height:number}>(),media:EmbeddedMedia[]=[];
    let embeddedBytes=0;
    const snapshot=await citySnapshot(doc,signal),warnings=snapshot?snapshotWarnings(snapshot):['City art and FCC tee pages are unavailable; your trip pages are kept.'];
    for(const [id,blob] of snapshot?.blobs??[]){
      signal?.throwIfAborted();if(bytes.has(id))continue;
      try{
        const original=new Uint8Array(await blob.arrayBuffer()),size=rasterDimensions(original,blob.type);
        if(pixels+checkedPixels(size)>HTML_LIMITS.totalPixels)throw new Error('over the HTML pixel budget');
        const png=await sanitizedRaster(blob,size,signal,HTML_RASTER);if(embeddedBytes+png.size>HTML_LIMITS.sourceBytes)throw new Error('over the HTML size budget');
        pixels+=size.width*size.height;embeddedBytes+=png.size;urls.set(id,await dataUrl(png));dimensions.set(id,rasterDimensions(new Uint8Array(await png.arrayBuffer()),png.type));
        media.push({assetId:id,sourceSha256:await artifactSha256(blob),embeddedSha256:await artifactSha256(png),...size});
      }catch(error){signal?.throwIfAborted();warnings.push(`City art ${id} was left out: ${error instanceof Error?error.message:'it could not be embedded'}.`);}
    }
    for(const [id,original] of bytes){
      signal?.throwIfAborted();const asset=readAsset(selected.parts,id)!;
      try{
        const png=await sanitizedRaster(new Blob([original as BlobPart],{type:asset.mime}),sizes.get(id)!,signal,HTML_RASTER);embeddedBytes+=png.size;
        if(embeddedBytes>HTML_LIMITS.sourceBytes)throw new Error('Sanitized images exceed 50 MiB. Keep the originals in an editable ZIP.');
        const data=await dataUrl(png),size=rasterDimensions(new Uint8Array(await png.arrayBuffer()),png.type);urls.set(id,data);dimensions.set(id,size);
        media.push({assetId:id,sourceSha256:asset.hash,embeddedSha256:await artifactSha256(png),...size});
      }catch(error){signal?.throwIfAborted();throw new Error(`Image ${id}: ${error instanceof Error?error.message:'Privacy sanitation failed.'}`);}
    }
    signal?.throwIfAborted();onProgress?.({stage:'layout',completed:0,unit:'pages',done:false});
    const magazine=buildMagazine(doc,{assetUrls:urls,assetDimensions:dimensions,includePrivate:scope==='personal',variant:scope,artwork:snapshotArtwork(snapshot,readMagazineApparel(selected.parts,scope==='personal').map(asset=>asset.apparel!)),limits:{pages:HTML_LIMITS.pages,svgBytes:HTML_LIMITS.outputBytes},signal});magazine.warnings.push(...warnings);
    const missing=magazine.selection?.assets.find(asset=>!asset.pageIds.length);
    if(missing)throw new Error(`Selected image ${missing.id} has no reading representation. Review its placement or keep the complete trip in an editable ZIP.`);
    if(magazine.pages.length>HTML_LIMITS.pages)throw new Error('The magazine exceeds the experimental 128-page HTML limit. Keep the complete trip in an editable ZIP.');
    onProgress?.({stage:'layout',completed:magazine.pages.length,total:magazine.pages.length,unit:'pages',done:true});return {magazine,media};
  }finally{doc.destroy();}
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
      dimensions.set(id,await exportBitmapDimensions(blob,signal));
    }
    signal?.throwIfAborted();
    const cached=readMagazineApparel(tripParts(doc),scope==='personal').map(asset=>asset.apparel!);
    const snapshot=await citySnapshot(doc,signal),warnings=snapshot?snapshotWarnings(snapshot):['City art and FCC tee pages are unavailable; your trip pages are kept.'];
    for(const [id,blob] of snapshot?.blobs??[])if(!urls.has(id)){urls.set(id,await dataUrl(blob));dimensions.set(id,snapshot!.dimensions.get(id)!);}
    const apparel=snapshotArtwork(snapshot,cached);
    options.onProgress?.({stage:'layout',completed:0,unit:'pages',done:false});
    const renderOptions:NonNullable<Parameters<typeof buildMagazine>[1]>&{artwork:readonly unknown[]}={assetUrls:urls,assetDimensions:dimensions,includePrivate:scope==='personal',variant:scope,artwork:apparel};
    const magazine=buildMagazine(doc,renderOptions);magazine.warnings.push(...warnings);signal?.throwIfAborted();options.onPrepared?.(renderOptions);
    options.onProgress?.({stage:'layout',completed:magazine.pages.length,total:magazine.pages.length,unit:'pages',done:true});return magazine;
  } finally {doc.destroy();}
}

const PDF_JPEG_QUALITY=0.84;

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
      context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);
      // Screen PDF: one JPEG per page at the reader's pixel size; the invisible text layer keeps words selectable.
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('This browser could not render the PDF.')),'image/jpeg',PDF_JPEG_QUALITY));
      const jpeg=new Uint8Array(await blob.arrayBuffer());canvas.width=0;canvas.height=0;signal?.throwIfAborted();
      const textLayer=await svgPdfTextLayer(page.svg,signal);
      pages.push({kind:'image' as const,jpeg,width:MAGAZINE.widthPx,height:MAGAZINE.heightPx,pageSize:MAGAZINE.pageSize,fullBleed:true,links:page.links,label:page.pattern,textLayer});
      onProgress?.({stage:'write',completed:pages.length,total:magazine.pages.length,unit:'pages',done:false});
    }finally{URL.revokeObjectURL(url);}
  }
  signal?.throwIfAborted();const bytes=buildPdf(pages,magazine.title,{producer:'Ministry of Tourism'});onProgress?.({stage:'write',completed:pages.length,total:magazine.pages.length,unit:'pages',done:true});return bytes;
}

export async function createTripArtifact(session:TripSession,format:'html'|'pdf'|'zip',signal?:AbortSignal,options:ArtifactOptions={}):Promise<ExportArtifact> {
  const snapshot=loadTrip(encodeTrip(session.doc)),frozen=new (session.constructor as typeof import('@mot/core').TripSession)(snapshot);
  const id=crypto.randomUUID(),startedAt=new Date().toISOString();
  let zipStep:DiagnosticStep='collect';
  const diagnostic=(receipt:DiagnosticReceipt):DiagnosticReceipt=>{const published=format==='zip'?{...createDiagnostic({...receipt,errorClass:receipt.errorClass,step:zipStep}),startedAt:receipt.startedAt,finishedAt:receipt.finishedAt}:receipt;diagnostics.record(published);options.onDiagnostic?.(published);return published;};
  const tracker=new OperationTracker({id,boardId:frozen.boardId,revision:frozen.boardRev,appVersion:'mot-integration-v2',operation:'export',onChange:state=>{lastOperation=state;options.onState?.(state);},onDiagnostic:diagnostic});
  const cancel=()=>tracker.cancel();signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted)tracker.cancel();
  try{
    signal?.throwIfAborted();
    // An explicitly shared caller cannot accidentally select the personal variant.
    const scope:ArtifactScope=options.includePrivate===false?(options.variant==='guide'?'guide':'stay'):options.variant??(options.includePrivate===true?'personal':'stay');
    const inventory=artifactInventory(snapshot,scope,format);
    let magazine:MagazineDocument|undefined;
    let embeddedMedia:EmbeddedMedia[]|undefined;
    let bytes:Uint8Array;
    if(format==='html'){
      const prepared=await tracker.run('fetching','validating',()=>prepareHtmlMagazine(frozen,signal,scope,options.onProgress));magazine=prepared.magazine;embeddedMedia=prepared.media;
      const {standaloneMagazineHtml}=await import('./standalone-html');
      bytes=await tracker.run('exporting','validating',()=>standaloneMagazineHtml(magazine!,signal,(completed,total)=>options.onProgress?.({stage:'write',completed,total,unit:'pages',done:completed===total})));
    }else if(format==='pdf'){
      magazine=await tracker.run('fetching','validating',()=>prepareMagazine(frozen,signal,scope==='personal',{variant:scope,onProgress:options.onProgress}));
      bytes=await tracker.run('exporting','exported',()=>magazinePdf(magazine!,signal,options.onProgress));
    }else{
      zipStep='collect';
      options.onProgress?.({stage:'collect',completed:inventory.cards,total:inventory.cards,unit:'cards',done:true});
      zipStep='layout';
      const media=await tracker.run('fetching','validating',()=>collectAssets(snapshot,scope,signal,options.onProgress,'layout',true,false,true));
      zipStep='write';
      options.onProgress?.({stage:'write',completed:0,unit:'bytes',done:false});
      bytes=await tracker.run('exporting','exported',()=>exportTripPackage(snapshot,media,{includePrivate:scope==='personal',variant:scope==='personal'?'private':scope}));
      options.onProgress?.({stage:'write',completed:bytes.length,total:bytes.length,unit:'bytes',done:true});
    }
    signal?.throwIfAborted();
    const title=readTripMeta(snapshot).title.replace(/[^\p{L}\p{N}-]+/gu,'-').replace(/^-|-$/g,'')||'trip';
    const mime=format==='html'?'text/html;charset=utf-8':format==='pdf'?'application/pdf':'application/zip',filename=`${title}.${format==='html'?'html':format==='pdf'?'pdf':'mot.zip'}`;
    if(format==='zip')zipStep='verify';
    options.onProgress?.({stage:'verify',completed:0,total:bytes.length,unit:'bytes',done:false});
    const blob=new Blob([bytes as BlobPart],{type:mime}),readback=new Uint8Array(await blob.arrayBuffer());
    if(readback.length!==bytes.length||!readback.every((byte,index)=>byte===bytes[index]))throw new Error('Export read-back failed. Retry from the unchanged board.');
    const sha256=await artifactSha256(blob),createdAt=new Date().toISOString();signal?.throwIfAborted();
    const record:StoredArtifact={id,filename,mime,byteCount:blob.size,boardId:frozen.boardId,revision:frozen.boardRev,createdAt,sha256,scope,format,blob,inventory,embeddedMedia,selection:magazine?.selection,...(magazine?.pages[0]?{coverSvg:magazine.pages[0].svg}:{})};
    let kept=false,storageDiagnostic:DiagnosticReceipt|undefined;
    if(format==='zip')zipStep='persist';
    try{await keepArtifact(record);kept=true;}
    catch(error){storageDiagnostic=diagnostic(createDiagnostic({requestId:id,operation:'keep-export',boardId:frozen.boardId,revision:frozen.boardRev,appVersion:'mot-integration-v2',startedAt,errorClass:'storage',error}));}
    if(signal?.aborted){if(kept)try{await removeArtifact(id);}catch{/* The cancelled file is never advertised as ready. */}signal.throwIfAborted();}
    options.onProgress?.({stage:'verify',completed:blob.size,total:blob.size,unit:'bytes',done:true});
    if(format==='html')await tracker.run('validating','exported',async()=>readback);
    if(format==='html'&&signal?.aborted){if(kept)try{await removeArtifact(id);}catch{/* Cancelled bytes are never advertised as ready. */}signal.throwIfAborted();}
    const artifact:ExportArtifact={id,filename,mime,byteCount:blob.size,boardId:frozen.boardId,revision:frozen.boardRev,url:URL.createObjectURL(blob),createdAt,sha256,kept,scope,urlExpiresAt:null,inventory,embeddedMedia,selection:record.selection,coverSvg:record.coverSvg,...(storageDiagnostic?{storageDiagnostic}:{})};
    available.set(id,{record,artifact});return artifact;
  }catch(error){tracker.fail(error);throw error;}finally{signal?.removeEventListener('abort',cancel);frozen.destroy();snapshot.destroy();}
}

/** A kept file gets a fresh URL after reload. Tab-only bytes stay available until explicit removal or tab close. */
export async function restoreTripArtifact(id:string):Promise<ExportArtifact>{
  if(removing.has(id))throw new Error('This export is being removed. Make a fresh export from your board.');
  const live=available.get(id);if(live)return live.artifact;
  const pending={cancelled:false},readers=restoring.get(id)??new Set<{cancelled:boolean}>();readers.add(pending);restoring.set(id,readers);
  try{
    const record=await readArtifact(id);
    if(pending.cancelled)throw new Error('This export was removed while restoring. Make a fresh export.');
    if(!record)throw new Error('This export is no longer kept in this browser. Make a fresh export.');
    const existing=available.get(id);if(existing)return existing.artifact;
    const artifact:ExportArtifact={id:record.id,filename:record.filename,mime:record.mime,byteCount:record.byteCount,boardId:record.boardId,revision:record.revision,url:URL.createObjectURL(record.blob),createdAt:record.createdAt,sha256:record.sha256,kept:true,scope:record.scope,urlExpiresAt:null,inventory:record.inventory??{cards:0,placements:0,assets:0,notes:0,credits:0},embeddedMedia:record.embeddedMedia,selection:record.selection,coverSvg:record.coverSvg};
    available.set(id,{record,artifact});return artifact;
  }finally{readers.delete(pending);if(!readers.size&&restoring.get(id)===readers)restoring.delete(id);}
}
export async function forgetTripArtifact(id:string):Promise<void>{
  const pending=removing.get(id);if(pending)return pending;
  restoring.get(id)?.forEach(reader=>{reader.cancelled=true;});
  const removal=(async()=>{
    const live=available.get(id);if(live?.artifact.kept!==false)await removeArtifact(id);else try{await removeArtifact(id);}catch{/* No verified durable copy exists; remove the tab-only file. */}
    const current=available.get(id);if(current)URL.revokeObjectURL(current.artifact.url);available.delete(id);
  })();
  removing.set(id,removal);
  try{await removal;}finally{if(removing.get(id)===removal)removing.delete(id);}
}

export function downloadArtifact(artifact:TripArtifact):void {
  const link=document.createElement('a');link.href=artifact.url;link.download=artifact.filename;document.body.append(link);link.click();link.remove();
}
