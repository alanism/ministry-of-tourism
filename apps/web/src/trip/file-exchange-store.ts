import type { FileContextRecord, FileProposalRecord, FileExchangeStore } from '../../../../packages/core/src/trip/file-exchange-types.ts';
const DB = 'mot-file-exchange-v1', IDENTITY = 'mot-file-document-identity/1';
function transact<T>(db:IDBDatabase, table:string, mode:IDBTransactionMode, setup:(store:IDBObjectStore,result:(value:T)=>void,reject:(error:Error)=>void)=>void):Promise<T> {
  return new Promise((resolve,reject)=>{
    let result:T,error:Error|undefined;
    const tx=db.transaction(table,mode);
    tx.oncomplete=()=>resolve(result);
    tx.onabort=tx.onerror=()=>reject(error??tx.error??new Error('File exchange storage did not commit.'));
    const refuse=(failure:Error)=>{error=failure;try{tx.abort();}catch{reject(failure);}};
    try{setup(tx.objectStore(table),value=>{result=value;},refuse);}catch(failure){refuse(failure instanceof Error?failure:new Error('File exchange storage failed.'));}
  });
}
function read<T>(db:IDBDatabase,table:string,key:IDBValidKey):Promise<T|null>{return transact(db,table,'readonly',(store,result,refuse)=>{const request=store.get(key);request.onsuccess=()=>result(request.result===undefined?null:request.result as T);request.onerror=()=>refuse(new Error('File exchange storage could not be read.'));});}
export class IndexeddbFileExchangeStore implements FileExchangeStore {
  async withBoardLock<T>(board:string,work:()=>Promise<T>):Promise<T>{
    if(typeof navigator==='undefined'||!navigator.locks?.request)throw new Error('This browser does not support Web Locks for safe file Apply. Use a supported browser, or inspect and reissue the context there; no changes were applied.');
    return navigator.locks.request('mot-file-exchange:'+board,work);
  }
  private pending:Promise<IDBDatabase>|null=null;
  private database():Promise<IDBDatabase>{
    this.pending??=new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(DB,1);
      request.onupgradeneeded=()=>{for(const name of ['contexts','proposals'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name);};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('Local file exchange storage is unavailable.'));request.onblocked=()=>reject(new Error('Local file exchange storage is blocked.'));
    }).catch(error=>{this.pending=null;throw error;});
    return this.pending;
  }
  private async put(table:string,key:IDBValidKey,record:FileContextRecord|FileProposalRecord,expected:number|null):Promise<void>{
    const copy=structuredClone(record);
    if(!Number.isSafeInteger(copy.version)||copy.version!==(expected===null?0:expected+1))throw new Error('Invalid file journal version.');
    const db=await this.database();
    await transact<void>(db,table,'readwrite',(store,result,refuse)=>{
      const prior=store.get(key);
      prior.onerror=()=>refuse(new Error('The file reservation could not be read.'));
      prior.onsuccess=()=>{
        if((prior.result===undefined?null:(prior.result as {version:number}).version)!==expected){refuse(new Error('File journal CAS conflict; inspect the existing reservation.'));return;}
        const writing=store.put(copy,key);writing.onerror=()=>refuse(new Error('The file journal could not be committed.'));writing.onsuccess=()=>result();
      };
    });
    if(JSON.stringify(await read(db,table,key))!==JSON.stringify(copy))throw new Error('File journal read-back did not match; no Apply is authorized.');
  }
  async getContext(board:string,id:string):Promise<FileContextRecord|null> { return read(await this.database(),'contexts',[board,id]); }
  async putContext(record:FileContextRecord,expected:number|null):Promise<void> { return this.put('contexts',[record.boardId,record.contextRequestId],record,expected); }
  async getProposal(board:string,id:string):Promise<FileProposalRecord|null> { return read(await this.database(),'proposals',[board,id]); }
  async putProposal(record:FileProposalRecord,expected:number|null):Promise<void> { return this.put('proposals',[record.boardId,record.proposalId],record,expected); }
  async list(board:string):Promise<FileProposalRecord[]> { return transact(await this.database(),'proposals','readonly',(store,result,refuse)=>{const request=store.getAll();request.onsuccess=()=>result((request.result as FileProposalRecord[]).filter(record=>record.boardId===board));request.onerror=()=>refuse(new Error('The file journal could not be listed.'));}); }
}
/** Native custom metadata stays outside the Y.Doc and is absent from JSON/ZIP imports. */
export async function getFileDocumentIdentity(persistence:{_db:Promise<IDBDatabase>},create=true):Promise<string> {
  const db=await persistence._db;
  const identity=await transact<string>(db,'custom',create?'readwrite':'readonly',(store,result,refuse)=>{
    const request=store.get(IDENTITY);
    request.onerror=()=>refuse(new Error('The native file identity is unavailable.'));
    request.onsuccess=()=>{
      const existing:unknown=request.result;
      if(existing!==undefined){if(typeof existing!=='string'||!/^[a-f0-9-]{36}$/.test(existing)){refuse(new Error('The native file identity is corrupt.'));return;}result(existing);return;}
      if(!create){refuse(new Error('The native file identity is missing; reissue context.'));return;}
      const generated=crypto.randomUUID(),writing=store.put(generated,IDENTITY);writing.onsuccess=()=>result(generated);writing.onerror=()=>refuse(new Error('The native file identity could not be committed.'));
    };
  });
  if(await read(db,'custom',IDENTITY)!==identity)throw new Error('Native file identity read-back failed.');
  return identity;
}
