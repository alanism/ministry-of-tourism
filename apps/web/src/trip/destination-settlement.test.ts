import {afterEach,expect,it,vi} from 'vitest';
import {loadDestinations,type DestinationRow} from './destination';
const cities:DestinationRow[]=[{id:'san-sebastian',name:'San Sebastián',countryCode:'ES',timeZone:'Europe/Madrid'}];
const deferred=<T>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};};
const settled=(promise:ReturnType<typeof loadDestinations>)=>{const state:{done:boolean;value?:Awaited<typeof promise>}={done:false};void promise.then(value=>{state.done=true;state.value=value;});return state;};
afterEach(()=>vi.useRealTimers());
it('the existing five-second destination deadline settles uncooperative headers with the included list',async()=>{
 vi.useFakeTimers();const pending=deferred<Response>(),storage={getItem:()=>null,setItem:vi.fn()},state=settled(loadDestinations({bundled:cities,storage,fetcher:vi.fn(()=>pending.promise)}));await vi.advanceTimersByTimeAsync(5000);expect(state).toMatchObject({done:true,value:{status:'bundled',cities}});expect(state.value?.retrievedAt).toBeUndefined();expect(storage.setItem).not.toHaveBeenCalled();
 const response=Response.json({cities}),cancel=vi.spyOn(response.body!,'cancel');pending.resolve(response);await vi.advanceTimersByTimeAsync(0);expect(cancel).toHaveBeenCalledTimes(1);expect(storage.setItem).not.toHaveBeenCalled();
});
it('cancellation settles a stalled body, retaining the exact saved date without late cache writes',async()=>{
 vi.useFakeTimers();const pending=deferred<unknown>(),response=new Response(),body=vi.spyOn(response,'json').mockReturnValue(pending.promise),controller=new AbortController(),saved={schema:'mot.destination-cache/1',cities,retrievedAt:'2026-10-19T00:00:00Z'},storage={getItem:()=>JSON.stringify(saved),setItem:vi.fn()},state=settled(loadDestinations({storage,signal:controller.signal,fetcher:async()=>response}));await vi.advanceTimersByTimeAsync(0);expect(body).toHaveBeenCalled();controller.abort();await vi.advanceTimersByTimeAsync(0);expect(state).toMatchObject({done:true,value:{status:'cached',cities,retrievedAt:saved.retrievedAt}});pending.resolve({cities});await vi.advanceTimersByTimeAsync(0);expect(storage.setItem).not.toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it('a deadline without either saved or included data says unavailable and still settles',async()=>{
 vi.useFakeTimers();const state=settled(loadDestinations({storage:{getItem:()=>null,setItem:vi.fn()},fetcher:()=>new Promise<Response>(()=>{})}));await vi.advanceTimersByTimeAsync(5000);expect(state).toMatchObject({done:true,value:{status:'unavailable',cities:[]}});expect(state.value?.error).toMatch(/retry|name a city/i);expect(state.value?.error).not.toMatch(/unsupported/i);
});
