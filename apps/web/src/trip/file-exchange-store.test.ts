import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {getFileDocumentIdentity,IndexeddbFileExchangeStore} from './file-exchange-store';
import type {FileProposalRecord} from '../../../../packages/core/src/trip/file-exchange-types.ts';

// A committing, serial IDB fake: requests can succeed while a held transaction is not durable yet.
function database(){
 const tables=new Map<string,Map<string,unknown>>();let running=false;const queued:(()=>void)[]=[];const control={fail:false,hold:false,commits:[] as (()=>void)[],tables};
 const begin=()=>{if(!running&&queued.length){running=true;queued.shift()!();}};
 const db={objectStoreNames:{contains:(name:string)=>tables.has(name)},createObjectStore:(name:string)=>{tables.set(name,new Map());},close(){},transaction:(name:string,mode:string)=>{
  let active=false,ended=false,pending=0,waiting=false;const work:(()=>void)[]=[];let shadow:Map<string,unknown>;
  const tx={oncomplete:null as (()=>void)|null,onerror:null as (()=>void)|null,onabort:null as (()=>void)|null,error:null as Error|null,
   abort(){if(ended)return;ended=true;queueMicrotask(()=>{tx.onabort?.();running=false;begin();});},objectStore:()=>({
    get:(key:unknown)=>request(()=>structuredClone(shadow.get(JSON.stringify(key)))),getAll:()=>request(()=>[...shadow.values()].map(value=>structuredClone(value))),
    put:(value:unknown,key:unknown)=>request(()=>{shadow.set(JSON.stringify(key),structuredClone(value));return key;}),
   })};
  const complete=()=>{if(ended||pending||waiting)return;if(control.hold&&mode==='readwrite'){waiting=true;control.commits.push(commit);return;}commit();};
  const commit=()=>{if(ended)return;if(control.fail&&mode==='readwrite'){tx.error=new Error('QuotaExceededError');tx.abort();return;}ended=true;if(mode==='readwrite')tables.set(name,shadow);tx.oncomplete?.();running=false;begin();};
  function request(operation:()=>unknown){pending++;const req={result:undefined as unknown,error:null as Error|null,onsuccess:null as (()=>void)|null,onerror:null as (()=>void)|null};const run=()=>queueMicrotask(()=>{if(ended)return;req.result=operation();req.onsuccess?.();pending--;queueMicrotask(complete);});if(active)run();else work.push(run);return req;}
  queued.push(()=>{active=true;shadow=new Map(tables.get(name));for(const run of work)run();queueMicrotask(complete);});queueMicrotask(begin);return tx;
 }};
 return{db:db as unknown as IDBDatabase,control};
}
let fake:ReturnType<typeof database>;
beforeEach(()=>{fake=database();vi.stubGlobal('indexedDB',{open:()=>{const request={result:fake.db,onupgradeneeded:null as (()=>void)|null,onsuccess:null as (()=>void)|null,onerror:null as (()=>void)|null};queueMicrotask(()=>{request.onupgradeneeded?.();request.onsuccess?.();});return request;}});});
afterEach(()=>vi.unstubAllGlobals());
const record=(board='board',id='proposal',version=0)=>({boardId:board,proposalId:id,version,contextRequestId:'context',envelopeHash:'a'.repeat(64),state:'review'} as FileProposalRecord);
it('resolves a reservation only after durable commit and reads it after a new adapter instance',async()=>{
 const store=new IndexeddbFileExchangeStore();fake.control.hold=true;let saved=false;const writing=store.putProposal(record(),null).then(()=>{saved=true;});void writing.catch(()=>{});await vi.waitFor(()=>expect(fake.control.commits.length).toBe(1));expect(saved).toBe(false);fake.control.hold=false;fake.control.commits.splice(0).forEach(commit=>commit());await writing;expect(saved).toBe(true);expect(await new IndexeddbFileExchangeStore().getProposal('board','proposal')).toMatchObject(record());
});
it('atomically rejects conflicting same-board reservations while allowing the same ID on another board',async()=>{
 const a=new IndexeddbFileExchangeStore(),b=new IndexeddbFileExchangeStore();const results=await Promise.allSettled([a.putProposal(record(),null),b.putProposal({...record(),envelopeHash:'b'.repeat(64)},null)]);expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);await b.putProposal(record('other'),null);expect(await a.list('board')).toHaveLength(1);expect(await a.list('other')).toHaveLength(1);await expect(a.putProposal(record('board','proposal',2),0)).rejects.toThrow();expect((await a.getProposal('board','proposal'))?.version).toBe(0);
});
it('rejects forced transaction failure without claiming a durable reservation',async()=>{
 const store=new IndexeddbFileExchangeStore();fake.control.fail=true;await expect(store.putProposal(record(),null)).rejects.toThrow();fake.control.fail=false;expect(await store.getProposal('board','proposal')).toBeNull();
});
it('stores native identity atomically outside the Y.Doc and retains it across ordinary reopen',async()=>{
 fake.db.createObjectStore('custom');const persistence={_db:Promise.resolve(fake.db)};const [a,b]=await Promise.all([getFileDocumentIdentity(persistence),getFileDocumentIdentity(persistence)]);expect(a).toBe(b);expect(a).toMatch(/^[a-f0-9-]{36}$/);expect(await getFileDocumentIdentity(persistence,false)).toBe(a);const imported=database();imported.db.createObjectStore('custom');expect(await getFileDocumentIdentity({_db:Promise.resolve(imported.db)})).not.toBe(a);
});
it('fails closed for absent/corrupt identity and an aborted identity initialization',async()=>{
 fake.db.createObjectStore('custom');const persistence={_db:Promise.resolve(fake.db)};await expect(getFileDocumentIdentity(persistence,false)).rejects.toThrow();fake.control.fail=true;await expect(getFileDocumentIdentity(persistence)).rejects.toThrow();fake.control.fail=false;expect(fake.control.tables.get('custom')?.size).toBe(0);
});
it('uses a browser board lock and refuses mutation when Web Locks are unavailable',async()=>{
 const store=new IndexeddbFileExchangeStore();vi.stubGlobal('navigator',{});await expect(store.withBoardLock('board',async()=>42)).rejects.toThrow(/Web Locks|browser.*support/i);const request=vi.fn(async(_name:string,work:()=>Promise<number>)=>work());vi.stubGlobal('navigator',{locks:{request}});expect(await store.withBoardLock('board',async()=>42)).toBe(42);expect(request.mock.calls[0]?.[0]).toBe('mot-file-exchange:board');
});
