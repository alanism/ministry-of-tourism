import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
const fake={records:new Map<string,unknown>(),hold:false,fail:false,corrupt:false,commits:[] as (()=>void)[]};
function database(){return {objectStoreNames:{contains:()=>true},createObjectStore:()=>{},transaction:(_name:string,mode:string)=>{
  const tx={oncomplete:null as (()=>void)|null,onerror:null as (()=>void)|null,onabort:null as (()=>void)|null,error:null as Error|null,objectStore:()=>({
    put:(value:{id:string})=>request(()=>{fake.records.set(value.id,structuredClone(value));return value.id;}),
    get:(id:string)=>request(()=>{const value=structuredClone(fake.records.get(id)) as {blob?:Blob}|undefined;if(value&&fake.corrupt)value.blob=new Blob(['fake export bytes']);return value;}),
    getAll:()=>request(()=>[...fake.records.values()].map(value=>structuredClone(value))),
    delete:(id:string)=>request(()=>{fake.records.delete(id);return undefined;}),
  })};
  function request(operation:()=>unknown){const req={result:undefined as unknown,error:null as Error|null,onsuccess:null as (()=>void)|null,onerror:null as (()=>void)|null};queueMicrotask(()=>{const commit=()=>{if(fake.fail&&mode==='readwrite'){req.error=tx.error=new Error('QuotaExceededError');req.onerror?.();tx.onabort?.();}else{req.result=operation();req.onsuccess?.();tx.oncomplete?.();}};if(fake.hold&&mode==='readwrite')fake.commits.push(commit);else commit();});return req;}
  return tx;
}};}
beforeEach(()=>{vi.resetModules();fake.records.clear();fake.hold=false;fake.fail=false;fake.corrupt=false;fake.commits=[];vi.stubGlobal('indexedDB',{open:()=>{const req={result:database(),onupgradeneeded:null as (()=>void)|null,onsuccess:null as (()=>void)|null,onerror:null as (()=>void)|null};queueMicrotask(()=>req.onsuccess?.());return req;}});});
afterEach(()=>vi.unstubAllGlobals());
async function record(){const blob=new Blob(['real export bytes'],{type:'application/pdf'});const digest=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return{id:'artifact-1',boardId:'board',revision:7,filename:'trip.pdf',mime:'application/pdf',byteCount:blob.size,createdAt:'2026-10-28T12:00:00Z',sha256:[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join(''),scope:'stay' as const,format:'pdf' as const,blob};}
describe('durable local artifact bytes',()=>{
  it('claims keeping only after transaction commit and successful read-back',async()=>{
    const store=await import('./artifact-store');const value=await record();fake.hold=true;let saved=false;
    const writing=store.keepArtifact(value).then(()=>{saved=true;});await new Promise(resolve=>setTimeout(resolve,0));expect(saved).toBe(false);expect(fake.records.size).toBe(0);
    fake.hold=false;fake.commits.splice(0).forEach(commit=>commit());await writing;expect(saved).toBe(true);expect((await store.readArtifact(value.id))?.sha256).toBe(value.sha256);
  });
  it('rejects quota failures and corrupt read-back rather than claiming kept',async()=>{
    const store=await import('./artifact-store');const value=await record();fake.fail=true;await expect(store.keepArtifact(value)).rejects.toThrow();fake.fail=false;fake.corrupt=true;await expect(store.keepArtifact(value)).rejects.toThrow(/read|checksum|bytes/i);
  });
  it('retrieves saved bytes after module reload and removes them explicitly',async()=>{
    let store=await import('./artifact-store');const value=await record();await store.keepArtifact(value);vi.resetModules();store=await import('./artifact-store');expect(await(await store.readArtifact(value.id))!.blob.text()).toBe('real export bytes');await store.removeArtifact(value.id);expect(await store.readArtifact(value.id)).toBeNull();
  });
});
