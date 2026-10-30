import {afterEach,expect,it,vi} from 'vitest';
import {createMuseAdapter,JOB_LIMITS} from './index.ts';
const env={META_API_KEY:'fictional-transport-only',META_MODEL_ID:'muse-spark-1.3',META_PRIVACY_ACKNOWLEDGED:'true'};
const input={boardId:'board',prompt:'A transport test',cards:[],assetIds:[]};
afterEach(()=>vi.useRealTimers());
it('settles the existing deadline even if transport ignores abort, without starting an overlapping call',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(()=>new Promise<Response>(()=>{})),log=vi.fn(),adapter=createMuseAdapter(env,{fetcher,log});
 const pending=adapter.propose(input);await vi.advanceTimersByTimeAsync(JOB_LIMITS.timeoutMs+1);
 const result=await Promise.race([pending,Promise.resolve('still pending')]);expect(result).toMatchObject({status:'error',error:{code:'timeout'}});
 expect(await adapter.propose(input)).toMatchObject({status:'error',error:{code:'busy'}});expect(fetcher).toHaveBeenCalledTimes(1);expect(log).toHaveBeenCalledTimes(2);
});
it('settles cancellation promptly and ignores a late answer without a second success log',async()=>{
 vi.useFakeTimers();
 let release!:(response:Response)=>void;const fetcher=vi.fn(()=>new Promise<Response>(resolve=>{release=resolve;})),log=vi.fn(),adapter=createMuseAdapter(env,{fetcher,log}),controller=new AbortController();
 const pending=adapter.propose(input,{signal:controller.signal});controller.abort();await vi.advanceTimersByTimeAsync(0);
 expect(await Promise.race([pending,Promise.resolve('still pending')])).toMatchObject({status:'error',error:{code:'cancelled'}});
 release(Response.json({model:'muse-spark-1.3',choices:[{message:{content:'{}'},finish_reason:'stop'}]}));await Promise.resolve();await Promise.resolve();expect(log).toHaveBeenCalledTimes(1);
});
