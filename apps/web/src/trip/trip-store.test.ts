import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createTrip, encodeTrip, readTripMeta } from '@writers-board/core';
import { openTrip, TRIP_PREFIX } from './trip-store';

const fake=vi.hoisted(()=>({stores:new Map<string,{updates:Uint8Array[];custom:Map<string,unknown>}>(),constructed:[] as string[],hold:false,fail:false,barriers:[] as (()=>void)[]}));
function store(name:string){let value=fake.stores.get(name);if(!value){value={updates:[],custom:new Map()};fake.stores.set(name,value);}return value;}
function database(name:string){
  return {objectStoreNames:{contains:()=>true},createObjectStore:()=>{},close:()=>{},addEventListener:()=>{},
    transaction:()=>{
      let reading=false;
      const transaction={oncomplete:null as (()=>void)|null,onabort:null as (()=>void)|null,onerror:null as (()=>void)|null,error:null as Error|null,
        objectStore:(which:string)=>{reading=true;return {getAll:()=>{const request={result:[] as Uint8Array[],onsuccess:null as (()=>void)|null,onerror:null as (()=>void)|null};queueMicrotask(()=>{request.result=store(name).updates.map(bytes=>bytes.slice());request.onsuccess?.();});return request;},get:(key:string)=>{const request={result:store(name).custom.get(key),onsuccess:null as (()=>void)|null,onerror:null as (()=>void)|null};queueMicrotask(()=>request.onsuccess?.());return request;}};},
      };
      queueMicrotask(()=>{const complete=()=>{if(fake.fail&&!reading){transaction.error=new Error('QuotaExceededError');transaction.onabort?.();}else transaction.oncomplete?.();};if(fake.hold&&!reading)fake.barriers.push(complete);else complete();});
      return transaction;
    },
  };
}
vi.mock('y-indexeddb',()=>({IndexeddbPersistence:class {
  db:ReturnType<typeof database>;whenSynced:Promise<this>;_db:Promise<ReturnType<typeof database>>;
  name:string;doc:Y.Doc;
  private update:(bytes:Uint8Array,origin:unknown)=>void;
  constructor(name:string,doc:Y.Doc){
    this.name=name;this.doc=doc;
    fake.constructed.push(name);this.db=database(name);this._db=Promise.resolve(this.db);
    this.update=(bytes,origin)=>{if(origin!==this&&!fake.fail)store(name).updates.push(bytes.slice());};doc.on('update',this.update);
    this.whenSynced=new Promise(resolve=>queueMicrotask(()=>{for(const bytes of [...store(name).updates])Y.applyUpdate(doc,bytes,this);if(!fake.fail)store(name).updates.push(Y.encodeStateAsUpdate(doc));resolve(this);}));
  }
  async get(key:string){return store(this.name).custom.get(key);}
  async set(key:string,value:unknown){if(fake.fail)throw new Error('QuotaExceededError');store(this.name).custom.set(key,value);return value;}
  async destroy(){this.doc.off('update',this.update);}
}}));

beforeEach(()=>{
  fake.stores.clear();fake.constructed.length=0;fake.hold=false;fake.fail=false;fake.barriers.length=0;
  const local=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(key:string)=>local.get(key)??null,setItem:(key:string,value:string)=>local.set(key,value),removeItem:(key:string)=>local.delete(key)});
  vi.stubGlobal('window',new EventTarget());
  vi.stubGlobal('indexedDB',{open:(name:string)=>{const existed=fake.stores.has(name);store(name);const request={result:database(name),onupgradeneeded:null as (()=>void)|null,onsuccess:null as (()=>void)|null,onerror:null as (()=>void)|null};queueMicrotask(()=>{if(!existed)request.onupgradeneeded?.();request.onsuccess?.();});return request;}});
});

describe('trip browser persistence migration and commit receipts',()=>{
  it('upgrades a v1 board into a separate durable store and keeps the source bytes untouched',async()=>{
    const old=createTrip({title:'Legacy personal journal',city:'bangkok',timeZone:'Asia/Bangkok',boardId:'legacy'});old.getMap('tripMeta').set('schemaVersion',1);
    const original=encodeTrip(old);store(TRIP_PREFIX+'legacy').updates.push(original.slice());
    const opened=await openTrip('legacy');expect(readTripMeta(opened.doc).schemaVersion).toBe(2);expect(readTripMeta(opened.doc).boardId).toBe('legacy');
    await opened.whenSaved();expect(fake.constructed).not.toContain(TRIP_PREFIX+'legacy');expect(store(TRIP_PREFIX+'legacy').updates).toEqual([original]);
    opened.doc.getMap('tripMeta').set('title','Edited migrated copy');await opened.whenSaved();opened.destroy();
    const reopened=await openTrip('legacy');expect(readTripMeta(reopened.doc).title).toBe('Edited migrated copy');expect(store(TRIP_PREFIX+'legacy').updates).toEqual([original]);reopened.destroy();old.destroy();
  });
  it('whenSaved waits for the pending transaction commit rather than the Yjs update',async()=>{
    const opened=await openTrip('new',{title:'New',city:'Unlisted city',timeZone:null});await opened.whenSaved();fake.hold=true;
    opened.doc.getMap('tripMeta').set('title','Pending write');let resolved=false;const receipt=opened.whenSaved().then(()=>{resolved=true;});
    await new Promise(resolve=>setTimeout(resolve,0));expect(resolved).toBe(false);expect(opened.status()).toBe('unsaved');
    fake.hold=false;fake.barriers.splice(0).forEach(complete=>complete());await receipt;expect(opened.status()).toBe('saved');opened.destroy();
  });
  it('rejects whenSaved after quota failure while leaving the editable document and original store intact',async()=>{
    const old=createTrip({title:'Legacy',city:'bangkok',timeZone:'Asia/Bangkok',boardId:'quota'});old.getMap('tripMeta').set('schemaVersion',1);const original=encodeTrip(old);store(TRIP_PREFIX+'quota').updates.push(original);fake.fail=true;
    const opened=await openTrip('quota');expect(opened.status()).toBe('error');await expect(opened.whenSaved()).rejects.toThrow();expect(readTripMeta(opened.doc).title).toBe('Legacy');expect(store(TRIP_PREFIX+'quota').updates).toEqual([original]);opened.destroy();old.destroy();
  });
  it('rejects an unknown future version without attaching a writer to the source store',async()=>{
    const future=createTrip({title:'Future',city:'bangkok',timeZone:'Asia/Bangkok',boardId:'future'});future.getMap('tripMeta').set('schemaVersion',999);const original=encodeTrip(future);store(TRIP_PREFIX+'future').updates.push(original);
    await expect(openTrip('future')).rejects.toThrow(/Unsupported/);expect(fake.constructed).toEqual([]);expect(store(TRIP_PREFIX+'future').updates).toEqual([original]);future.destroy();
  });
});
