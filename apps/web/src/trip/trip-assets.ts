// Trip photos (#6): bytes in the shared SHA-256 blob store, metadata on the trip doc.
import { useEffect, useState } from 'react';
import type * as Y from 'yjs';
import { presentationScope, readAllCards, readAsset, readPresentations, tripParts, type Actor, type TripCard, type TripSession } from '@writers-board/core';
import { getBlob, hashBlob, putBlob } from '../state/blobs';
import type { Artwork } from '../artwork/catalog';

const ephemeral = new Map<string, Blob>();
const tabOnly=()=>{if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('mot-storage-error',{detail:'In this tab only: image storage is full. Download a full ZIP backup before closing this tab.'}));};
async function insufficientStorage(bytes:number):Promise<boolean>{
  try{if(typeof navigator==='undefined'||!navigator.storage?.estimate)return false;const {quota,usage}=await navigator.storage.estimate();return typeof quota==='number'&&typeof usage==='number'&&bytes>Math.max(0,quota-usage);}catch{return false;}
}
export async function storeTripBlob(blob: Blob): Promise<{hash:string;persisted:boolean}> {
  const hash=await hashBlob(blob);
  return persistTripBlob(blob,hash);
}
async function persistTripBlob(blob:Blob,hash:string):Promise<{hash:string;persisted:boolean}> {
  try { if(!await getBlob(hash)){if(await insufficientStorage(blob.size))throw new DOMException('Insufficient image storage','QuotaExceededError');await putBlob(blob);} ephemeral.delete(hash); return {hash,persisted:true}; }
  catch {
    ephemeral.set(hash,blob);
    tabOnly();
    return {hash,persisted:false};
  }
}
async function commitTripBlob(blob:Blob,apply:(hash:string)=>void,signal?:AbortSignal):Promise<void> {
  const hash=await hashBlob(blob);
  signal?.throwIfAborted();
  const previous=ephemeral.get(hash);ephemeral.set(hash,blob);
  // No await between cancellation check and command commit. After this point the result is applied,
  // and durable storage may finish or leave a recoverable tab-only copy; there is no orphan write.
  try{apply(hash);}catch(error){if(previous)ephemeral.set(hash,previous);else ephemeral.delete(hash);throw error;}
  await persistTripBlob(blob,hash);
}
/** One apparel choice: stage every original, commit once, then retain a recoverable copy if storage fills. */
export async function commitTripBlobs(blobs:readonly Blob[],apply:(hashes:string[])=>void,signal?:AbortSignal):Promise<{persisted:boolean}>{
  const hashes=await Promise.all(blobs.map(blob=>hashBlob(blob)));
  signal?.throwIfAborted();
  const originals=new Map(hashes.map((hash,index)=>[hash,blobs[index]!]));
  const previous=new Map([...originals.keys()].map(hash=>[hash,ephemeral.get(hash)]));
  for(const [hash,blob] of originals)ephemeral.set(hash,blob);
  try{apply(hashes);}catch(error){for(const [hash,blob] of previous)if(blob)ephemeral.set(hash,blob);else ephemeral.delete(hash);throw error;}
  const results=await Promise.all([...originals].map(([hash,blob])=>persistTripBlob(blob,hash)));
  return{persisted:results.every(result=>result.persisted)};
}
export async function getTripBlob(hash:string):Promise<Blob|null> {
  if(ephemeral.has(hash))return ephemeral.get(hash)!;
  return getBlob(hash);
}
export function hasEphemeralAssets(doc:Y.Doc):boolean {
  return [...tripParts(doc).assets.values()].some(asset=>ephemeral.has(String(asset.get('hash'))));
}

/** Fetch only selected media; the original stays intact and crop is document geometry. */
export async function placeTripArtwork(session:TripSession,actor:Actor,artwork:Artwork,signal:AbortSignal):Promise<void> {
  const response=await fetch(artwork.original??artwork.src,{signal,credentials:'omit'});
  if(!response.ok)throw new Error(`Artwork download failed (${response.status}). Retry or choose another image.`);
  const blob=await response.blob();
  if(!/^image\/(png|jpeg|webp|gif)$/.test(blob.type))throw new Error('This artwork is not a supported image.');
  signal.throwIfAborted();
  const extended=artwork as Artwork&{credit?:string;rightsStatus?:'approved'|'unknown'|'restricted';originCityId?:string;countryCode?:string};
  const width=.38,height=Math.min(.65,.38*artwork.height/artwork.width*148/210);
  await commitTripBlob(blob,hash=>{
    const existing=[...session.parts.assets.keys()].map(id=>readAsset(session.parts,id)).find(asset=>asset?.hash===hash&&asset.source?.id===artwork.id&&asset.source.url===(artwork.original??artwork.src)&&asset.credit===extended.credit&&asset.rightsStatus===(extended.rightsStatus??'unknown'));
    const assetId=existing?.id??crypto.randomUUID();
    const ops:{command:string;input:Record<string,unknown>}[]=existing?[]:[{command:'trip_asset_register',input:{asset:{id:assetId,hash,mime:blob.type,role:'original',width:artwork.width,height:artwork.height,caption:artwork.label,credit:extended.credit,rightsStatus:extended.rightsStatus??'unknown',source:{id:artwork.id,url:artwork.original??artwork.src,retrievedAt:new Date().toISOString(),provider:'fcc',cityId:extended.originCityId??artwork.city,countryCode:extended.countryCode,kind:'artwork',origin:'artwork'}}}}];
    ops.push({command:'trip_presentation_create',input:{assetId,x:.08,y:.08,width,height,crop:artwork.crop??[0,0,1,1],scope:'private'}});
    session.executeAll(actor,ops);
  },signal);
}

/** Stage original bytes in this tab, attach atomically, then persist them by hash. */
export async function attachPhoto(session: TripSession, actor: Actor, cardId: string, blob: Blob): Promise<void> {
  if (!blob.type.startsWith('image/')) throw new Error('Choose an image file.');
  await commitTripBlob(blob,hash=>session.execute(actor, 'trip_asset_attach', { cardId, asset: { id: crypto.randomUUID(), hash, mime: blob.type, role: 'original' } }));
}

/** The card's cover photo: the most recently attached one. */
export function coverAssetId(card: TripCard): string | undefined { return card.assetIds[card.assetIds.length - 1]; }

/** Bytes for every photo on the board that this browser has, keyed by asset id, for export. */
export async function assetBytes(doc: Y.Doc,options:{includePrivate?:boolean}={}): Promise<Map<string, Uint8Array>> {
  const parts = tripParts(doc);
  const out = new Map<string, Uint8Array>();
  const cards=readAllCards(parts).filter(card=>options.includePrivate!==false||card.scope!=='private'),included=new Set(cards.map(card=>card.id));
  const placements=readPresentations(parts).filter(object=>(options.includePrivate!==false||presentationScope(parts,object)!=='private')&&(!object.cardId||included.has(object.cardId)));
  const wanted=new Set([...cards.flatMap(card=>card.assetIds),...placements.flatMap(object=>object.assetId?[object.assetId]:[])]);
  for (const id of wanted) {
    const meta = readAsset(parts, id);
    const blob = meta ? await getTripBlob(meta.hash) : null;
    if (!blob) throw new Error(`Missing image ${id}. Restore its original bytes before exporting.`);
    out.set(id, new Uint8Array(await blob.arrayBuffer()));
  }
  return out;
}

/** Saves imported photo bytes whose hash matches the board's metadata; anything else is skipped. */
export async function storeImportedAssets(doc: Y.Doc, assets: Map<string, Uint8Array>): Promise<number> {
  const parts = tripParts(doc);
  let stored = 0;
  const memoryOnly=await insufficientStorage([...assets.values()].reduce((size,bytes)=>size+bytes.byteLength,0));
  for (const [id, bytes] of assets) {
    const meta = readAsset(parts, id);
    if (!meta) continue;
    const actual = await hashBlob(new Blob([bytes as BlobPart], {type:meta.mime}));
    if(actual!==meta.hash)throw new Error('Imported media hash does not match. Nothing was attached.');
    const blob=new Blob([bytes as BlobPart],{type:meta.mime});
    if(memoryOnly&&!await getBlob(actual).catch(()=>null)){ephemeral.set(actual,blob);tabOnly();stored++;continue;}
    const { hash } = await storeTripBlob(blob);
    if (hash === meta.hash) stored++;
  }
  return stored;
}

/** An object URL for a card photo, or null while loading or when this browser lacks the bytes. */
export function useAssetUrl(session: TripSession, assetId: string | undefined): string | null {
  const hash = assetId ? readAsset(session.parts, assetId)?.hash : undefined;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setUrl(null);
    let created:string|undefined;
    if (hash) void getTripBlob(hash).then(blob => { if(live&&blob){created=URL.createObjectURL(blob);setUrl(created);} }).catch(()=>{if(live)setUrl(null);});
    return () => { live = false;if(created)URL.revokeObjectURL(created); };
  }, [hash]);
  return url;
}

/** Opens the file picker and attaches the chosen photo. */
export function pickPhoto(onFile: (file: File) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = () => { const f = input.files?.[0]; if (f) onFile(f); };
  input.click();
}
