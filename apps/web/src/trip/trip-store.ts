// Trip persistence (MOT-15): one y-indexeddb store per trip, named by its board id, honest saved state.
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { validateStoredGroupResponses, createTrip, encodeTrip, loadTrip, loadTripWithMigration, readTripMeta, TRIP_SCHEMA_VERSION, type BoardKind, type TripMeta } from '@writers-board/core';

export const TRIP_PREFIX = 'mot-trip:';
/** Window event carrying a plain message when the open board's storage fails. */
export const STORAGE_ERROR_EVENT = 'mot-storage-error';
export const STORAGE_STATUS_EVENT = 'mot-storage-status';
export type SavedStatus = 'saved' | 'unsaved' | 'error';

export interface OpenTrip {
  doc: Y.Doc;
  persistence: IndexeddbPersistence;
  status: () => SavedStatus;
  whenSaved: () => Promise<void>;
  lastExportedAt: () => string | null;
  markExported: () => void;
  destroy: () => void;
}

export interface NewTrip { title: string; city: string; cityId?:string;countryCode?:string; timeZone: string|null; kind?: BoardKind; dates?: TripMeta['dates']; party?: TripMeta['party']; }

/** Inspect updates without attaching y-indexeddb: its constructor writes a snapshot even on open. */
function readStoredTrip(name:string):Promise<Uint8Array|null>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(name);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('updates'))db.createObjectStore('updates',{autoIncrement:true});if(!db.objectStoreNames.contains('custom'))db.createObjectStore('custom');};
    request.onerror=()=>reject(new Error('Could not read this browser’s trip storage.'));
    request.onsuccess=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains('updates')){db.close();resolve(null);return;}
      try{
        const transaction=db.transaction('updates','readonly');
        const updates=transaction.objectStore('updates').getAll();
        transaction.onabort=transaction.onerror=()=>{db.close();reject(new Error('Could not read the saved trip.'));};
        updates.onsuccess=()=>{
          const doc=new Y.Doc();
          try{for(const update of updates.result as Uint8Array[])Y.applyUpdate(doc,update);resolve(doc.getMap('tripMeta').has('schemaVersion')?encodeTrip(doc):null);}
          catch(error){reject(error);}
          finally{doc.destroy();db.close();}
        };
      }catch(error){db.close();reject(error);}
    };
  });
}

/**
 * Opens (or creates) a trip in its own IndexedDB store. A new store is filled from `init`:
 * fresh trip details, or an existing document (an import or a guest copy) under its own id.
 * Storage failures surface as status 'error', never silently.
 */
export async function openTrip(boardId: string, init?: NewTrip | { from: Y.Doc }): Promise<OpenTrip> {
  const originalName=TRIP_PREFIX+boardId;
  const upgradedName=`${originalName}:v${TRIP_SCHEMA_VERSION}`;
  // A durable upgraded copy wins even if localStorage was unavailable when its marker was written.
  const upgraded=await readStoredTrip(upgradedName);
  const original=upgraded?null:await readStoredTrip(originalName);
  let storageName=upgraded?upgradedName:originalName;
  let doc:Y.Doc;
  let migrated=false;
  if(upgraded||original){
    const loaded=loadTripWithMigration((upgraded??original)!);doc=loaded.doc;migrated=loaded.migrated;
    if(migrated)storageName=upgradedName;
  }else{
    if(!init)throw new Error('Trip not found in this browser.');
    doc='from' in init?loadTrip(encodeTrip(init.from)):createTrip({...init,boardId});
  }
  if(readTripMeta(doc).boardId!==boardId){doc.destroy();throw new Error('Saved trip identity does not match the requested board.');}
  await validateStoredGroupResponses(doc);
  const persistence=new IndexeddbPersistence(storageName,doc);
  let exportedAt:string|null=null;
  let failure:Error|null=null,pending=0,destroyed=false;
  let settled:Promise<void>=Promise.resolve();
  const notify=()=>{if(!destroyed)window.dispatchEvent(new Event(STORAGE_STATUS_EVENT));};
  const fail=(message:string)=>{
    if(failure)return;
    failure=new Error(message);
    // Detach the failed storage writer so RAM edits remain usable for a recovery ZIP.
    void persistence.destroy().catch(()=>{});
    if(!destroyed)window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT,{detail:message}));
    notify();
  };
  const barrier=()=>new Promise<void>((resolve,reject)=>{
    try{
      if(!persistence.db)throw new Error('Trip storage is not open.');
      const transaction=persistence.db.transaction(['updates','custom'],'readonly');
      transaction.oncomplete=()=>resolve();
      transaction.onabort=transaction.onerror=()=>reject(new Error('This browser could not commit the latest change. In this tab only: download a full ZIP backup before closing.'));
    }catch(error){reject(error);}
  });
  const track=(write:Promise<unknown>)=>{
    pending++;notify();
    const completion=write.then(()=>{pending--;notify();},error=>{pending--;fail(error instanceof Error?error.message:'This browser could not save the latest change. Download a full ZIP backup.');throw error;});
    settled=Promise.all([settled,completion]).then(()=>{});
    void settled.catch(()=>{});
  };
  const whenSaved=async()=>{
    while(true){if(failure)throw failure;const current=settled;await current;if(failure)throw failure;if(current===settled&&pending===0)return;}
  };
  // y-indexeddb queues its write first; a readonly transaction on both stores fences its commit.
  const changed=(_update:Uint8Array,origin:unknown)=>{if(origin!==persistence&&!failure)track(barrier());};
  doc.on('update',changed);
  await persistence.whenSynced;
  persistence.db?.addEventListener('abort', (e) => {
    const name = ((e.target as IDBTransaction | null)?.error ?? null)?.name;
    fail(name === 'QuotaExceededError' ? 'This browser is out of storage space, so recent changes are not saved. Export a full backup now.' : 'This browser could not save the latest change. Export a full backup now.');
  });
  persistence.db?.addEventListener('error', () => fail('This browser could not save the latest change. Export a full backup now.'));
  persistence.db?.addEventListener('close', () => fail('This browser closed the board’s storage (it may have been cleared). Export a full backup now.'));
  track(barrier());
  try{
    await whenSaved();
    exportedAt=await persistence.get('last-exported-at') as string|null??null;
    if(migrated)try{localStorage.setItem(`mot-trip-storage:${boardId}`,upgradedName);}catch{/* The durable copy is discoverable without this convenience marker. */}
  }catch{/* Keep the migrated/new document editable in this tab; the original store is untouched. */}
  rememberBoard(readTripMeta(doc));
  return {
    doc, persistence,
    status: () => (failure ? 'error' : pending ? 'unsaved' : 'saved'),
    whenSaved,
    lastExportedAt: () => exportedAt,
    markExported: () => { exportedAt=new Date().toISOString();if(!failure)track(persistence.set('last-exported-at',exportedAt).then(()=>barrier())); },
    destroy: () => { destroyed=true;doc.off('update',changed);void persistence.destroy();doc.destroy(); },
  };
}

/** Byte-exact reload check used by MOT-16: encode -> load -> encode is stable. */
export function reloadTrip(doc: Y.Doc): Y.Doc { return loadTrip(encodeTrip(doc)); }

// Boards on this device (#5). A convenience list: the boards themselves live in IndexedDB.
export interface BoardEntry { id: string; title: string; kind: BoardKind; openedAt: string; }
const BOARDS_KEY = 'mot-boards';
const LAST_KEY = 'mot-last-trip';

export function listBoards(): BoardEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(BOARDS_KEY) ?? '[]') as BoardEntry[];
    // A board opened before this list existed stays reachable.
    const last = lastBoardId();
    if (last && !list.some((b) => b.id === last)) list.push({ id: last, title: 'Earlier board', kind: 'traveler', openedAt: '' });
    return list;
  } catch { return []; }
}

function rememberBoard(meta: TripMeta): void {
  try {
    const list = listBoards().filter((b) => b.id !== meta.boardId);
    list.unshift({ id: meta.boardId, title: meta.title, kind: meta.kind, openedAt: new Date().toISOString() });
    localStorage.setItem(BOARDS_KEY, JSON.stringify(list));
    localStorage.setItem(LAST_KEY, JSON.stringify({ id: meta.boardId }));
  } catch { /* convenience only */ }
}

export function lastBoardId(): string | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const id = raw ? (JSON.parse(raw) as { id?: string }).id : undefined;
    // 'imported' was written by an earlier build that lost the real id.
    return id && id !== 'imported' ? id : null;
  } catch { return null; }
}

export function forgetLastBoard(): void { try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ } }
