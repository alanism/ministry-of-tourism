import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createTrip,encodeTrip,TripSession} from '@writers-board/core';
import type {Artwork} from '../artwork/catalog';
const storage=vi.hoisted(()=>({hashBlob:vi.fn(),getBlob:vi.fn(),putBlob:vi.fn()}));
vi.mock('../state/blobs',()=>storage);
import {placeTripArtwork,placeTripUpload} from './trip-assets';
const actor={kind:'human' as const,id:'owner',name:'Owner'},bytes=new Blob(['original image'],{type:'image/png'});
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const settled=(promise:Promise<void>)=>{const state:{done:boolean;error?:unknown}={done:false};void promise.then(()=>{state.done=true;},error=>{state.error=error;state.done=true;});return state;};
const hash=async(blob:Blob)=>Buffer.from(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())).toString('hex');
const pixels=()=>({width:960,height:640,close:vi.fn()}) as unknown as ImageBitmap;
function session(){return new TripSession(createTrip({title:'Cancellation QA',city:'Bilbao',countryCode:'ES',timeZone:null}));}
async function artwork():Promise<Artwork>{const src='https://example.com/preview.webp',original='https://example.com/original.png';return{id:'source-art',styleId:'fcc-editorial',subject:'hotels',city:'barcelona',label:'Source hotel',src,thumb:src,original,width:960,height:640,artRef:{assetId:'source-art',kind:'original-art',category:'hotels',originCityId:'barcelona',countryCode:'ES',thumbnailUrl:src,renditionUrl:src,originalUrl:original,width:960,height:640,mimeType:'image/png',hash:await hash(bytes),credit:'FCC source credit',rightsStatus:'unknown',source:{provider:'fcc',sourceId:'source-art-record',canonicalUrl:'https://example.com/barcelona.html',cityId:'barcelona',countryCode:'ES',kind:'artwork',retrievedAt:'2026-10-29',origin:'artwork'}}};}
beforeEach(()=>{storage.hashBlob.mockReset().mockImplementation(hash);storage.getBlob.mockReset().mockResolvedValue(null);storage.putBlob.mockReset().mockResolvedValue('stored');vi.stubGlobal('fetch',vi.fn(async()=>new Response(bytes)));vi.stubGlobal('createImageBitmap',vi.fn(async()=>pixels()));});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();vi.restoreAllMocks();});
function unchanged(trip:TripSession,before:Uint8Array){expect(encodeTrip(trip.doc)).toEqual(before);expect(storage.getBlob).not.toHaveBeenCalled();expect(storage.putBlob).not.toHaveBeenCalled();}

it('already cancelled art and photo additions do no fetch, decode or storage work',async()=>{
 const trip=session(),art=await artwork(),before=encodeTrip(trip.doc),controller=new AbortController();controller.abort();
 await expect(placeTripArtwork(trip,actor,art,controller.signal)).rejects.toMatchObject({name:'AbortError'});await expect(placeTripUpload(trip,actor,new File(['photo'],'photo.png',{type:'image/png'}),controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(fetch).not.toHaveBeenCalled();expect(createImageBitmap).not.toHaveBeenCalled();expect(storage.hashBlob).not.toHaveBeenCalled();unchanged(trip,before);
});
it('settles an abort-ignoring original fetch and cancels its late body without a write',async()=>{
 const trip=session(),art=await artwork(),before=encodeTrip(trip.doc),pending=deferred<Response>(),controller=new AbortController();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));vi.useFakeTimers();const state=settled(placeTripArtwork(trip,actor,art,controller.signal));controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state).toMatchObject({done:true,error:expect.objectContaining({name:'AbortError'})});
 const response=new Response(bytes),cancel=vi.spyOn(response.body!,'cancel'),body=vi.spyOn(response,'blob');pending.resolve(response);await vi.advanceTimersByTimeAsync(0);expect(cancel).toHaveBeenCalledTimes(1);expect(body).not.toHaveBeenCalled();unchanged(trip,before);
});
it('settles an abort-ignoring original body and refuses late decoding',async()=>{
 const trip=session(),art=await artwork(),before=encodeTrip(trip.doc),pending=deferred<Blob>(),response=new Response(),body=vi.spyOn(response,'blob').mockReturnValue(pending.promise),controller=new AbortController();vi.stubGlobal('fetch',vi.fn(async()=>response));vi.useFakeTimers();const state=settled(placeTripArtwork(trip,actor,art,controller.signal));await vi.advanceTimersByTimeAsync(0);expect(body).toHaveBeenCalled();controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state.done).toBe(true);pending.resolve(bytes);await vi.advanceTimersByTimeAsync(0);expect(createImageBitmap).not.toHaveBeenCalled();unchanged(trip,before);
});
it('settles a stalled original decoder and closes the late bitmap once without hashing or writing',async()=>{
 const trip=session(),art=await artwork(),before=encodeTrip(trip.doc),pending=deferred<ImageBitmap>(),image=pixels(),controller=new AbortController();vi.stubGlobal('createImageBitmap',vi.fn(()=>pending.promise));vi.useFakeTimers();const state=settled(placeTripArtwork(trip,actor,art,controller.signal));await vi.waitFor(()=>expect(createImageBitmap).toHaveBeenCalled());controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state).toMatchObject({done:true,error:expect.objectContaining({name:'AbortError'})});pending.resolve(image);await vi.advanceTimersByTimeAsync(0);expect(image.close).toHaveBeenCalledTimes(1);expect(storage.hashBlob).not.toHaveBeenCalled();unchanged(trip,before);
});
it('the Add deadline settles a stalled hash before any command or storage registration',async()=>{
 const trip=session(),art=await artwork(),before=encodeTrip(trip.doc),pending=deferred<string>(),controller=new AbortController(),reason=Error('Download took too long. Please try again.');storage.hashBlob.mockReturnValue(pending.promise);vi.useFakeTimers();const state=settled(placeTripArtwork(trip,actor,art,controller.signal));await vi.waitFor(()=>expect(storage.hashBlob).toHaveBeenCalled());setTimeout(()=>controller.abort(reason),30000);await vi.advanceTimersByTimeAsync(30000);expect(state).toMatchObject({done:true,error:reason});pending.resolve(art.artRef!.hash!);await vi.advanceTimersByTimeAsync(0);unchanged(trip,before);
});
it('a cancelled personal-photo decoder settles and disposes its late bitmap without registration',async()=>{
 const trip=session(),before=encodeTrip(trip.doc),pending=deferred<ImageBitmap>(),image=pixels(),controller=new AbortController();vi.stubGlobal('createImageBitmap',vi.fn(()=>pending.promise));vi.useFakeTimers();const state=settled(placeTripUpload(trip,actor,new File(['photo'],'photo.png',{type:'image/png'}),controller.signal));controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state).toMatchObject({done:true,error:expect.objectContaining({name:'AbortError'})});pending.resolve(image);await vi.advanceTimersByTimeAsync(0);expect(image.close).toHaveBeenCalledTimes(1);expect(storage.hashBlob).not.toHaveBeenCalled();unchanged(trip,before);
});
it('after command commit an abort does not claim cancellation or undo the pending durable placement',async()=>{
 const trip=session(),art=await artwork(),pending=deferred<string>(),controller=new AbortController();storage.putBlob.mockReturnValue(pending.promise);const run=placeTripArtwork(trip,actor,art,controller.signal),state=settled(run);await vi.waitFor(()=>expect(storage.putBlob).toHaveBeenCalled());expect(trip.parts.assets.size).toBe(1);expect(trip.parts.presentations.size).toBe(1);const committed=encodeTrip(trip.doc);controller.abort();await Promise.resolve();expect(state.done).toBe(false);pending.resolve('stored');await run;expect(state).toMatchObject({done:true});expect(state.error).toBeUndefined();expect(encodeTrip(trip.doc)).toEqual(committed);
});
