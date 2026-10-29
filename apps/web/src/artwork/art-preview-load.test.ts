import {afterEach,expect,it,vi} from 'vitest';
import {loadArtworkPreview} from './art-preview';
import type {Artwork} from './catalog';
const artwork={src:'https://example.org/preview.webp',original:'https://example.org/original.png',thumb:'https://example.org/thumb.webp'} as Artwork;
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const bitmap=()=>({width:960,height:640,close:vi.fn()}) as unknown as ImageBitmap;
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('does no work when preview loading was already cancelled',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);const controller=new AbortController();controller.abort();await expect(loadArtworkPreview(artwork,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(fetcher).not.toHaveBeenCalled();
});
it('returns the decoded rendition size, releases its bitmap, and avoids previewing the original URL',async()=>{
 const pixels=bitmap(),blob=new Blob(['pixels'],{type:'image/webp'}),fetcher=vi.fn(async()=>new Response(blob));vi.stubGlobal('fetch',fetcher);vi.stubGlobal('createImageBitmap',vi.fn(async()=>pixels));const controller=new AbortController();
 const result=await loadArtworkPreview({...artwork,src:artwork.original!},controller.signal);expect(result.width).toBe(960);expect(result.height).toBe(640);expect(await result.blob.text()).toBe('pixels');expect(pixels.close).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledWith(artwork.thumb,{signal:controller.signal,credentials:'omit',redirect:'error'});
});
it('settles abort-ignoring fetch and discards a late response without decoding',async()=>{
 const pending=deferred<Response>(),decode=vi.fn();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));vi.stubGlobal('createImageBitmap',decode);const controller=new AbortController(),loading=loadArtworkPreview(artwork,controller.signal);controller.abort();await expect(loading).rejects.toMatchObject({name:'AbortError'});
 const response=new Response(new Blob(['late'])),cancel=vi.spyOn(response.body!,'cancel');pending.resolve(response);await vi.waitFor(()=>expect(cancel).toHaveBeenCalledTimes(1));expect(decode).not.toHaveBeenCalled();
});
it('settles a stalled response body and does not decode it after cancellation',async()=>{
 const pending=deferred<Blob>(),response=new Response(),body=vi.spyOn(response,'blob').mockReturnValue(pending.promise),decode=vi.fn();vi.stubGlobal('fetch',vi.fn(async()=>response));vi.stubGlobal('createImageBitmap',decode);const controller=new AbortController(),loading=loadArtworkPreview(artwork,controller.signal);await vi.waitFor(()=>expect(body).toHaveBeenCalled());controller.abort();await expect(loading).rejects.toMatchObject({name:'AbortError'});pending.resolve(new Blob(['late']));await Promise.resolve();expect(decode).not.toHaveBeenCalled();
});
it('settles an uninterruptible decode promptly and closes its late bitmap exactly once',async()=>{
 const pending=deferred<ImageBitmap>(),decode=vi.fn(()=>pending.promise),pixels=bitmap();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Blob(['pixels']))));vi.stubGlobal('createImageBitmap',decode);const controller=new AbortController(),loading=loadArtworkPreview(artwork,controller.signal);await vi.waitFor(()=>expect(decode).toHaveBeenCalled());controller.abort();await expect(loading).rejects.toMatchObject({name:'AbortError'});pending.resolve(pixels);await vi.waitFor(()=>expect(pixels.close).toHaveBeenCalledTimes(1));
});
it('retains HTTP and decode failures as failures without inventing dimensions',async()=>{
 const decode=vi.fn().mockRejectedValue(Error('decode failed'));vi.stubGlobal('createImageBitmap',decode);vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:503})));await expect(loadArtworkPreview(artwork,new AbortController().signal)).rejects.toThrow('503');expect(decode).not.toHaveBeenCalled();vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Blob(['invalid']))));await expect(loadArtworkPreview(artwork,new AbortController().signal)).rejects.toThrow('decode failed');
});
