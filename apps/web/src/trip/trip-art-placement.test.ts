import {afterEach,expect,it,vi} from 'vitest';
import {createTrip,TripSession,readAsset,readPresentations,readTripMeta,mapProjection} from '@writers-board/core';
import type {Artwork} from '../artwork/catalog';
vi.mock('../state/blobs',()=>{const stored=new Map<string,Blob>(),hashBlob=async(blob:Blob)=>Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');return{hashBlob,getBlob:async(hash:string)=>stored.get(hash)??null,putBlob:async(blob:Blob)=>{stored.set(await hashBlob(blob),blob);}};});
import {placeTripArtwork,placeTripUpload,getTripBlob} from './trip-assets';
const bytes=new Blob(['original alpha image bytes'],{type:'image/png'}),actor={kind:'human' as const,id:'owner',name:'Owner'};
async function fixture():Promise<Artwork>{
 const hash=Buffer.from(await crypto.subtle.digest('SHA-256',await bytes.arrayBuffer())).toString('hex');
 const thumb='https://foreignclubberscorespondence.web.app/preview.webp',original='https://foreignclubberscorespondence.web.app/original.png';
 return{id:'fcc:barcelona:test',styleId:'fcc-editorial',label:'A source drawing',city:'barcelona',subject:'city-ink',thumb,src:thumb,original,width:1200,height:2400,crop:[0,0,.5,1],artRef:{assetId:'fcc:barcelona:test',kind:'original-art',category:'city-ink',originCityId:'barcelona',countryCode:'ES',thumbnailUrl:thumb,renditionUrl:thumb,originalUrl:original,width:1200,height:2400,mimeType:'image/png',hash,credit:'The actual source artist',rightsStatus:'restricted',source:{provider:'fcc',sourceId:'original-source',canonicalUrl:'https://foreignclubberscorespondence.web.app/barcelona.html',cityId:'barcelona',countryCode:'ES',kind:'artwork',retrievedAt:'2026-10-26',origin:'artwork'}}};
}
afterEach(()=>vi.unstubAllGlobals());
function setup(){vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes)));vi.stubGlobal('createImageBitmap',vi.fn(async()=>({width:1200,height:2400,close:()=>undefined})));return new TripSession(createTrip({title:'Trip',city:'Bilbao',countryCode:'ES',timeZone:null}));}
it('retains selected bytes, credit, origin and crop; keeps the destination and one Undo for the whole placement',async()=>{
 const session=setup(),art=await fixture();await placeTripArtwork(session,actor,art,new AbortController().signal);
 const objects=readPresentations(session.parts);expect(objects).toHaveLength(1);const placed=objects[0]!,asset=readAsset(session.parts,placed.assetId!)!;
 expect(asset).toMatchObject({credit:art.artRef!.credit,rightsStatus:'restricted',width:1200,height:2400,source:{cityId:'barcelona',countryCode:'ES',canonicalUrl:art.artRef!.source.canonicalUrl}});
 expect(placed.crop).toEqual(art.crop);expect((placed.width*148)/(placed.height*210)).toBeCloseTo(.25);expect(placed.height).toBeLessThanOrEqual(.65);
 expect(readTripMeta(session.doc).city).toBe('Bilbao');expect(session.parts.cards.size).toBe(0);
 expect(await (await getTripBlob(asset.hash))!.text()).toBe(await bytes.text());
 session.undo(actor.id);expect(readPresentations(session.parts)).toHaveLength(0);expect(session.parts.assets.size).toBe(0);
});
it('rejects a changed original hash or pixel size before any document write',async()=>{
 for(const patch of [{hash:'0'.repeat(64)},{width:600}]){
  const session=setup(),art=await fixture();Object.assign(art.artRef!,patch);if('width' in patch)art.width=patch.width!;
  await expect(placeTripArtwork(session,actor,art,new AbortController().signal)).rejects.toThrow(/changed|match|refresh/i);
  expect(session.parts.assets.size).toBe(0);expect(session.parts.presentations.size).toBe(0);
 }
});
it('refuses apparel before fetching it as decorative art',async()=>{
 const session=setup(),art=await fixture();art.artRef={...art.artRef!,kind:'apparel-mockup',category:'apparel',role:undefined,variant:undefined};
 await expect(placeTripArtwork(session,actor,art,new AbortController().signal)).rejects.toThrow(/apparel|clothing/i);expect(fetch).not.toHaveBeenCalled();
});
it('cancels while decoding without registering bytes or changing the document',async()=>{
 const session=setup(),art=await fixture(),controller=new AbortController();let finish!:(value:{width:number;height:number;close:()=>void})=>void,started!:()=>void;
 const began=new Promise<void>(resolve=>{started=resolve;});vi.stubGlobal('createImageBitmap',()=>{started();return new Promise(resolve=>{finish=resolve;});});
 const run=placeTripArtwork(session,actor,art,controller.signal);await began;controller.abort();finish({width:1200,height:2400,close:()=>undefined});
 await expect(run).rejects.toThrow();expect(session.parts.assets.size).toBe(0);expect(session.parts.presentations.size).toBe(0);
});
it('adds a chosen personal photo from an empty art collection without inventing an FCC source or place',async()=>{
 const session=setup(),photo=new File(['my original photo bytes'],'My photo.png',{type:'image/png'});
 await placeTripUpload(session,actor,photo,new AbortController().signal);
 const object=readPresentations(session.parts)[0]!,asset=readAsset(session.parts,object.assetId!)!;
 expect(asset.source).toBeUndefined();expect(asset.caption).toBe('My photo.png');expect(asset.width).toBe(1200);expect(session.parts.cards.size).toBe(0);expect(readTripMeta(session.doc).city).toBe('Bilbao');
 expect(await (await getTripBlob(asset.hash))!.text()).toBe(await photo.text());session.undo(actor.id);expect(session.parts.presentations.size).toBe(0);expect(session.parts.assets.size).toBe(0);
});
it('keeps another city’s map decorative and out of the trip navigation projection',async()=>{
 const session=setup(),art=await fixture();art.subject='maps';art.artRef={...art.artRef!,kind:'map',category:'maps',role:'map',variant:undefined};
 await placeTripArtwork(session,actor,art,new AbortController().signal);
 expect(mapProjection(session.doc)).toEqual([]);expect(readTripMeta(session.doc).city).toBe('Bilbao');
 expect(readAsset(session.parts,readPresentations(session.parts)[0]!.assetId!)!.source?.cityId).toBe('barcelona');
});
