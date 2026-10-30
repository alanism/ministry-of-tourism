import {afterEach,expect,it,vi} from 'vitest';
import {createFccAdapter,FCC_ORIGIN,type CachedCity} from './city-source.ts';
const deferred=<T,>()=>{let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
afterEach(()=>vi.restoreAllMocks());
it.each(['getCity','getAlmanac'] as const)('%s settles caller cancellation while a cache read never answers',async method=>{
 for(const offline of [false,true]){
  const late=deferred<CachedCity|undefined>(),controller=new AbortController(),fetcher=vi.fn(async()=>Response.json({})),cache={read:vi.fn(()=>late.promise),write:vi.fn(async()=>{})},adapter=createFccAdapter({feedUrl:id=>`${FCC_ORIGIN}/feeds/cities/${id}.json`,fetcher,cache});
  const state:{done:boolean;value?:unknown}={done:false};const pending=adapter[method]('san-sebastian',{signal:controller.signal,offline}).then(value=>{state.done=true;state.value=value;return value;});
  try{for(let i=0;i<3;i++)await Promise.resolve();controller.abort();for(let i=0;i<20;i++)await Promise.resolve();expect(state).toMatchObject({done:true,value:{status:'unavailable',error:{code:'cancelled'}}});expect(fetcher).not.toHaveBeenCalled();expect(cache.write).not.toHaveBeenCalled();}
  finally{late.resolve(undefined);await pending;}
 }
});
it.each(['getCity','getAlmanac'] as const)('%s ignores a late cache value after cancellation and removes its listener',async method=>{
 const late=deferred<CachedCity|undefined>(),controller=new AbortController(),parse=vi.fn(()=>undefined),remove=vi.spyOn(controller.signal,'removeEventListener'),fetcher=vi.fn(async()=>Response.json({})),adapter=createFccAdapter({feedUrl:id=>`${FCC_ORIGIN}/feeds/cities/${id}.json`,fetcher,cache:{read:()=>late.promise,write:async()=>{}}});
 const state:{done:boolean;value?:unknown}={done:false},pending=adapter[method]('san-sebastian',{signal:controller.signal}).then(value=>{state.done=true;state.value=value;return value;});
 try{for(let i=0;i<3;i++)await Promise.resolve();controller.abort();for(let i=0;i<20;i++)await Promise.resolve();expect(state).toMatchObject({done:true,value:{error:{code:'cancelled'}}});const entry=Object.defineProperties({retrievedAt:'2026-10-30'}, {feed:{get:parse},almanac:{get:parse}});late.resolve(entry);await pending;for(let i=0;i<5;i++)await Promise.resolve();expect(parse).not.toHaveBeenCalled();expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));expect(fetcher).not.toHaveBeenCalled();}
 finally{late.resolve(undefined);await pending;}
});
it.each(['getCity','getAlmanac'] as const)('%s removes the cache listener after an ordinary offline miss',async method=>{
 const controller=new AbortController(),add=vi.spyOn(controller.signal,'addEventListener'),remove=vi.spyOn(controller.signal,'removeEventListener'),adapter=createFccAdapter({feedUrl:()=>'',cache:{read:async()=>undefined,write:async()=>{}}});
 await expect(adapter[method]('san-sebastian',{signal:controller.signal,offline:true})).resolves.toMatchObject({status:'unavailable',error:{code:'offline'}});expect(add).toHaveBeenCalledWith('abort',expect.any(Function),{once:true});expect(remove).toHaveBeenCalledWith('abort',expect.any(Function));
});
