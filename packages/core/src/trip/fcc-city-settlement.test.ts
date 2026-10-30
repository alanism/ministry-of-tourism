import {afterEach,expect,it,vi} from 'vitest';
import {createFccAdapter,FCC_ORIGIN,MemoryCityCache,type FccCityFeed} from './city-source.ts';
const city='san-sebastian',url=`${FCC_ORIGIN}/feeds/cities/${city}.json`;
const feed:FccCityFeed={schema:'fcc.city.feed',version:1,city:{id:city,name:'San Sebastián',countryCode:'ES',timeZone:'Europe/Madrid'},sourceVersion:'saved-issue',articles:[{id:'story',title:'A public story',body:'Public editorial.',canonicalUrl:`${FCC_ORIGIN}/${city}.html`}],places:[],almanac:[]};
afterEach(()=>vi.useRealTimers());
it('settles a stalled city transport at the existing 20-second ceiling without further retries',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(()=>new Promise<Response>(()=>{})),diagnostics=vi.fn(),adapter=createFccAdapter({feedUrl:()=>url,fetcher,maxRetries:2,onDiagnostic:diagnostics});
 const pending=adapter.getCity(city);await vi.advanceTimersByTimeAsync(20001);
 const value=await Promise.race([pending,Promise.resolve('still pending')]);expect(value).toMatchObject({status:'unavailable',error:{code:'network',message:expect.stringMatching(/timed out/i)}});expect(fetcher).toHaveBeenCalledTimes(1);expect(diagnostics).toHaveBeenCalledWith({operation:'fcc-city-fetch',sourceUrl:url,errorClass:'network'});
});
it('keeps the dated snapshot after a body-read deadline and cannot save a late answer',async()=>{
 vi.useFakeTimers();const cache=new MemoryCityCache();await cache.write(city,{feed,retrievedAt:'2026-10-19T00:00:00Z'});const write=vi.spyOn(cache,'write');let release!:(value:unknown)=>void;
 const response=Response.json(feed);vi.spyOn(response,'json').mockImplementation(()=>new Promise(resolve=>{release=resolve;}));const fetcher=vi.fn(async()=>response),adapter=createFccAdapter({feedUrl:()=>url,cache,fetcher});
 const pending=adapter.getCity(city);await vi.advanceTimersByTimeAsync(20001);const value=await pending;expect(value).toMatchObject({status:'stale',sourceVersion:'saved-issue',retrievedAt:'2026-10-19T00:00:00Z',error:{code:'network'}});
 release({...feed,sourceVersion:'late-answer'});await vi.advanceTimersByTimeAsync(0);expect(write).not.toHaveBeenCalled();expect((await cache.read(city))?.feed?.sourceVersion).toBe('saved-issue');
});
it('settles explicit cancellation even if transport ignores abort, without cache writes or retries',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(()=>new Promise<Response>(()=>{})),cache=new MemoryCityCache(),write=vi.spyOn(cache,'write'),controller=new AbortController(),adapter=createFccAdapter({feedUrl:()=>url,fetcher,cache,maxRetries:2});
 const pending=adapter.getCity(city,{signal:controller.signal});await vi.advanceTimersByTimeAsync(0);controller.abort();await vi.advanceTimersByTimeAsync(0);
 expect(await Promise.race([pending,Promise.resolve('still pending')])).toMatchObject({status:'unavailable',error:{code:'cancelled'}});expect(fetcher).toHaveBeenCalledTimes(1);expect(write).not.toHaveBeenCalled();
});
it('a diagnostic sink failure cannot replace the typed failure or discard the saved issue',async()=>{
 const cache=new MemoryCityCache();await cache.write(city,{feed,retrievedAt:'2026-10-19T00:00:00Z'});const adapter=createFccAdapter({feedUrl:()=>url,cache,maxRetries:0,fetcher:async()=>{throw Error('PRIVATE-TRANSPORT-TEXT');},onDiagnostic:()=>{throw Error('PRIVATE-LOG-TEXT');}});
 await expect(adapter.getCity(city)).resolves.toMatchObject({status:'stale',sourceVersion:'saved-issue',error:{code:'network'}});
});
