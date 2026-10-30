import {afterEach,expect,it,vi} from 'vitest';
import {createFccAdapter,FCC_ORIGIN,MemoryCityCache,type FccAlmanacSnapshot} from './city-source';
const city='san-sebastian',url=`${FCC_ORIGIN}/almanac/city/${city}.json`;
// Synthetic unit snapshot: collection and exchange-rate vintages deliberately differ.
const snapshot:FccAlmanacSnapshot={schema:'fcc.almanac.city/1',asOf:'2026-10-16',slug:city,status:'available',page:'/san-sebastian.html?section=almanac',market:'Spain',labels:{it:[],co:[],me:[],fa:[]},city:{s:city,n:'San Sebastián',c:'Spain',cur:'EUR',r:1,fx:'2026-10-15',it:{},co:{},me:{},fa:{},fu:null},economy:{}};
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const settled=<T>(promise:Promise<T>)=>{const state:{done:boolean;value?:T;error?:unknown}={done:false};void promise.then(value=>{state.done=true;state.value=value;},error=>{state.done=true;state.error=error;});return state;};
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
it('settles a stalled Almanac transport at the existing default and maximum deadlines with no later retry',async()=>{
 for(const [timeoutMs,deadline] of [[undefined,10000],[90000,30000]] as const){
  vi.useFakeTimers();const late=deferred<Response>(),fetcher=vi.fn(()=>late.promise),diagnostics=vi.fn(),adapter=createFccAdapter({feedUrl:()=>'',fetcher,maxRetries:2,timeoutMs,onDiagnostic:diagnostics}),pending=adapter.getAlmanac(city),state=settled(pending);
  try{await vi.advanceTimersByTimeAsync(deadline+1);expect(state).toMatchObject({done:true,value:{status:'unavailable',error:{code:'network',message:expect.stringMatching(/timed out/i)}}});expect(fetcher).toHaveBeenCalledTimes(1);expect(diagnostics).toHaveBeenCalledWith({operation:'fcc-almanac-fetch',sourceUrl:url,errorClass:'network'});}
  finally{late.resolve(Response.json(snapshot));await pending;vi.useRealTimers();}
 }
});
it('keeps the dated Almanac on a stalled body deadline and never caches or validates its late answer',async()=>{
 vi.useFakeTimers();const cache=new MemoryCityCache();await cache.write(`almanac:${city}`,{almanac:snapshot,retrievedAt:'2026-10-19T00:00:00Z',etag:'"saved"'});const before=await cache.read(`almanac:${city}`),write=vi.spyOn(cache,'write'),late=deferred<unknown>(),response=Response.json(snapshot);vi.spyOn(response,'json').mockReturnValue(late.promise);const diagnostics=vi.fn(),adapter=createFccAdapter({feedUrl:()=>'',cache,fetcher:async()=>response,onDiagnostic:diagnostics}),pending=adapter.getAlmanac(city);
 try{await vi.advanceTimersByTimeAsync(10001);expect(diagnostics).toHaveBeenCalledWith({operation:'fcc-almanac-fetch',sourceUrl:url,errorClass:'network'});expect(await pending).toMatchObject({status:'stale',retrievedAt:before!.retrievedAt,value:snapshot,error:{code:'network'}});const read=vi.fn(()=> 'fcc.almanac.city/1');late.resolve(Object.defineProperty({},'schema',{get:read}));await vi.advanceTimersByTimeAsync(0);expect(read).not.toHaveBeenCalled();expect(write).not.toHaveBeenCalled();expect(await cache.read(`almanac:${city}`)).toEqual(before);}
 finally{late.resolve(snapshot);await pending;}
});
it('settles explicit cancellation during an abort-ignoring JSON read and ignores the late value',async()=>{
 vi.useFakeTimers();const late=deferred<unknown>(),response=Response.json(snapshot);vi.spyOn(response,'json').mockReturnValue(late.promise);const cache=new MemoryCityCache(),write=vi.spyOn(cache,'write'),controller=new AbortController(),fetcher=vi.fn(async()=>response),pending=createFccAdapter({feedUrl:()=>'',cache,fetcher,maxRetries:2}).getAlmanac(city,{signal:controller.signal}),state=settled(pending);
 try{await vi.advanceTimersByTimeAsync(0);controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state).toMatchObject({done:true,value:{status:'unavailable',error:{code:'cancelled'}}});late.resolve(snapshot);await vi.advanceTimersByTimeAsync(0);expect(write).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);expect(vi.getTimerCount()).toBe(0);}
 finally{late.resolve(snapshot);await pending;}
});
it('cancels a late transport body instead of parsing it after the caller stops loading',async()=>{
 vi.useFakeTimers();const late=deferred<Response>(),controller=new AbortController(),response=Response.json(snapshot),cancel=vi.spyOn(response.body!,'cancel'),json=vi.spyOn(response,'json'),pending=createFccAdapter({feedUrl:()=>'',fetcher:()=>late.promise}).getAlmanac(city,{signal:controller.signal}),state=settled(pending);
 try{await vi.advanceTimersByTimeAsync(0);controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state).toMatchObject({done:true,value:{status:'unavailable',error:{code:'cancelled'}}});late.resolve(response);await vi.advanceTimersByTimeAsync(0);expect(cancel).toHaveBeenCalledOnce();expect(json).not.toHaveBeenCalled();}
 finally{late.resolve(response);await pending;}
});
it('keeps a typed stale result if a diagnostic sink throws private text',async()=>{
 const cache=new MemoryCityCache();await cache.write(`almanac:${city}`,{almanac:snapshot,retrievedAt:'2026-10-19T00:00:00Z'});const adapter=createFccAdapter({feedUrl:()=>'',cache,maxRetries:0,fetcher:async()=>{throw Error('PRIVATE TRANSPORT CANARY');},onDiagnostic:()=>{throw Error('PRIVATE LOG CANARY');}});
 const result=await adapter.getAlmanac(city).then(value=>value,error=>({leaked:error.message}));expect(result).toMatchObject({status:'stale',value:snapshot,retrievedAt:'2026-10-19T00:00:00Z',error:{code:'network'}});expect(JSON.stringify(result)).not.toContain('CANARY');
});
it('does not start transport if cancellation arrives during the cache lookup',async()=>{
 const late=deferred<undefined>(),controller=new AbortController(),fetcher=vi.fn(async()=>Response.json(snapshot)),pending=createFccAdapter({feedUrl:()=>'',fetcher,cache:{read:()=>late.promise,write:async()=>{}}}).getAlmanac(city,{signal:controller.signal});
 controller.abort();late.resolve(undefined);await expect(pending).resolves.toMatchObject({status:'unavailable',error:{code:'cancelled'}});expect(fetcher).not.toHaveBeenCalled();
});
