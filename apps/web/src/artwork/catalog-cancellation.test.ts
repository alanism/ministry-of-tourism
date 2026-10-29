import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {readCatalog,type Manifest} from './catalog';
import {loadCountryArtwork,resolveArtScope,type CountryArtCache} from './country-art';

const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const settled=<T>(promise:Promise<T>)=>{const state:{value?:T;error?:unknown;done:boolean}={done:false};void promise.then(value=>{state.value=value;state.done=true;},error=>{state.error=error;state.done=true;});return state;};
afterEach(()=>vi.useRealTimers());

it('does not fetch a catalog when its signal is already aborted',async()=>{
 const fetcher=vi.fn(async()=>new Response('"late"')),controller=new AbortController();controller.abort();
 await expect(readCatalog('/artwork/index.json',z.string(),controller.signal,fetcher)).rejects.toMatchObject({name:'AbortError'});expect(fetcher).not.toHaveBeenCalled();
});
it('settles abort-ignoring fetch immediately and cancels the late body without parsing it',async()=>{
 vi.useFakeTimers();const pending=deferred<Response>(),fetcher=vi.fn(()=>pending.promise),controller=new AbortController(),validate=vi.fn((value:string)=>value),state=settled(readCatalog('/artwork/index.json',z.string().transform(validate),controller.signal,fetcher));
 const reason=Error('catalog deadline');controller.abort(reason);await vi.advanceTimersByTimeAsync(0);expect(state).toMatchObject({done:true,error:reason});
 const response=new Response('"late"'),cancel=vi.spyOn(response.body!,'cancel'),json=vi.spyOn(response,'json');pending.resolve(response);await vi.advanceTimersByTimeAsync(0);expect(cancel).toHaveBeenCalledTimes(1);expect(json).not.toHaveBeenCalled();expect(validate).not.toHaveBeenCalled();
});
it('settles an abort-ignoring JSON body and never validates its late value',async()=>{
 vi.useFakeTimers();const pending=deferred<unknown>(),response=new Response(),json=vi.spyOn(response,'json').mockReturnValue(pending.promise),controller=new AbortController(),validate=vi.fn((value:string)=>value),state=settled(readCatalog('/artwork/index.json',z.string().transform(validate),controller.signal,async()=>response));
 await vi.advanceTimersByTimeAsync(0);expect(json).toHaveBeenCalledTimes(1);controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state.done).toBe(true);expect(state.error).toMatchObject({name:'AbortError'});pending.resolve('late');await vi.advanceTimersByTimeAsync(0);expect(validate).not.toHaveBeenCalled();
});

const cities=Array.from({length:6},(_,index)=>({id:'city-'+index,name:'City '+index,countryCode:'ES',timeZone:null}));
const manifest:Manifest={version:1,styleId:'fcc-editorial',cities:cities.map(city=>({id:city.id,label:city.name})),subjects:[{id:'objects',label:'Objects'}],catalogs:cities.map(city=>({city:city.id,subject:'objects',count:1,url:'/artwork/'+city.id+'/objects.json'}))};
const scope=resolveArtScope({cityId:cities[0]!.id,countryCode:'ES',category:'objects',mode:'country',destinations:cities,manifest});
const body=(url:string)=>({version:1,styleId:'fcc-editorial',items:[{id:url,styleId:'fcc-editorial',city:url.split('/')[2],subject:'objects',label:'Country drawing',thumb:'https://example.com/thumb.webp',src:'https://example.com/art.webp',width:960,height:640}]});
const good=(async url=>new Response(JSON.stringify(body(String(url))))) as typeof fetch;
it('the existing country deadline settles every stalled worker and keeps the complete dated cache',async()=>{
 const cache:CountryArtCache=new Map(),signal=new AbortController().signal,first=await loadCountryArtwork({scope,manifest,subject:'objects',signal,cache,fetcher:good,now:()=>new Date('2026-10-29T10:00:00Z')});expect(first.status).toBe('ready');const before=structuredClone(cache);
 vi.useFakeTimers();const waits=new Map<string,ReturnType<typeof deferred<Response>>>(),fetcher=vi.fn<typeof fetch>(url=>{const pending=deferred<Response>();waits.set(String(url),pending);return pending.promise;}),state=settled(loadCountryArtwork({scope,manifest,subject:'objects',signal,cache,fetcher}));
 expect(fetcher).toHaveBeenCalledTimes(4);await vi.advanceTimersByTimeAsync(20000);expect(state.done).toBe(true);expect(state.value).toMatchObject({status:'cached',retrievedAt:first.retrievedAt,items:first.items});expect(state.value?.error).toMatch(/timed out/i);expect(cache).toEqual(before);
 for(const [url,pending] of waits)pending.resolve(new Response(JSON.stringify(body(url))));await vi.advanceTimersByTimeAsync(0);expect(fetcher).toHaveBeenCalledTimes(4);expect(cache).toEqual(before);
});
it('Stop settles a stalled country body with no new cache or queued requests',async()=>{
 vi.useFakeTimers();const cache:CountryArtCache=new Map(),controller=new AbortController(),waits:ReturnType<typeof deferred<unknown>>[]=[],fetcher=vi.fn<typeof fetch>(async()=>{const pending=deferred<unknown>();waits.push(pending);const response=new Response();vi.spyOn(response,'json').mockReturnValue(pending.promise);return response;}),state=settled(loadCountryArtwork({scope,manifest,subject:'objects',signal:controller.signal,cache,fetcher}));
 await vi.advanceTimersByTimeAsync(0);controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state.value).toMatchObject({status:'cancelled',items:[]});expect(state.done).toBe(true);for(const pending of waits)pending.resolve(body('/artwork/city-0/objects.json'));await vi.advanceTimersByTimeAsync(0);expect(cache.size).toBe(0);expect(fetcher).toHaveBeenCalledTimes(4);expect(vi.getTimerCount()).toBe(0);
});
it('one failed shard settles abort-ignoring peers and keeps the previous batch intact',async()=>{
 const cache:CountryArtCache=new Map(),signal=new AbortController().signal;await loadCountryArtwork({scope,manifest,subject:'objects',signal,cache,fetcher:good});const before=structuredClone(cache);
 vi.useFakeTimers();const fetcher=vi.fn<typeof fetch>(async url=>String(url)===scope.catalogPaths[0]?new Response(null,{status:503}):await new Promise<Response>(()=>{})),state=settled(loadCountryArtwork({scope,manifest,subject:'objects',signal,cache,fetcher}));
 await vi.advanceTimersByTimeAsync(0);expect(state.done).toBe(true);expect(state.value?.status).toBe('cached');expect(state.value?.error).toMatch(/could not be refreshed/i);expect(cache).toEqual(before);expect(fetcher).toHaveBeenCalledTimes(4);expect(vi.getTimerCount()).toBe(0);
});
