// Export files have their own storage: a saved board is not proof that an exported file was kept.
export type ArtifactScope='guide'|'stay'|'personal';
export interface ArtifactInventory {cards:number;placements:number;assets:number;notes:number;credits:number;}
export interface StoredArtifact {
  id:string;boardId:string;revision:number;filename:string;mime:string;byteCount:number;createdAt:string;sha256:string;
  scope:ArtifactScope;format:'pdf'|'zip';blob:Blob;coverSvg?:string;inventory?:ArtifactInventory;
}
const DB='mot-export-artifacts',STORE='artifacts';
let pendingDb:Promise<IDBDatabase>|null=null;
function database():Promise<IDBDatabase>{
  pendingDb??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error??new Error('Export storage is unavailable.'));
  }).catch(error=>{pendingDb=null;throw error;});
  return pendingDb;
}
async function transact<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await database();
  return new Promise<T>((resolve,reject)=>{
    const transaction=db.transaction(STORE,mode),request=action(transaction.objectStore(STORE));
    transaction.oncomplete=()=>resolve(request.result);
    transaction.onabort=transaction.onerror=()=>reject(transaction.error??new Error('The export file could not be kept in this browser.'));
    request.onerror=()=>reject(request.error??new Error('Export storage failed.'));
  });
}
export async function artifactSha256(blob:Blob):Promise<string>{
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function validRecord(value:unknown):value is StoredArtifact{
  if(!value||typeof value!=='object')return false;
  const record=value as StoredArtifact;
  return typeof record.id==='string'&&typeof record.boardId==='string'&&typeof record.filename==='string'&&typeof record.createdAt==='string'&&Number.isSafeInteger(record.revision)&&['guide','stay','personal'].includes(record.scope)&&['pdf','zip'].includes(record.format)&&record.blob instanceof Blob&&record.blob.size===record.byteCount&&/^[a-f0-9]{64}$/.test(record.sha256);
}
export async function readArtifact(id:string):Promise<StoredArtifact|null>{
  const raw=await transact('readonly',store=>store.get(id) as IDBRequest<unknown>);
  if(raw===undefined)return null;
  if(!validRecord(raw)||await artifactSha256(raw.blob)!==raw.sha256)throw new Error('The kept export failed its read-back checksum. Make a fresh export from your board.');
  return raw;
}
export async function keepArtifact(record:StoredArtifact):Promise<void>{
  if(!validRecord(record)||await artifactSha256(record.blob)!==record.sha256)throw new Error('Export bytes do not match their receipt.');
  await transact('readwrite',store=>store.put(record));
  const back=await readArtifact(record.id);
  if(!back||back.sha256!==record.sha256||back.byteCount!==record.byteCount||back.boardId!==record.boardId||back.revision!==record.revision||back.filename!==record.filename||back.mime!==record.mime||back.scope!==record.scope)throw new Error('Export storage read-back did not match its receipt.');
}
export async function listArtifacts(boardId:string):Promise<StoredArtifact[]>{
  const records=await transact('readonly',store=>store.getAll() as IDBRequest<unknown[]>);
  return records.filter(validRecord).filter(record=>record.boardId===boardId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
export async function removeArtifact(id:string):Promise<void>{await transact('readwrite',store=>store.delete(id));}
