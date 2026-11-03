// Trip persistence (MOT-15/G6): one y-indexeddb store per trip, named by its board id, honest saved state.
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { validateStoredGroupResponses, createTrip, encodeTrip, loadTrip, loadTripWithMigration, readTripMeta, sha256Hex, TRIP_SCHEMA_VERSION, type BoardKind, type TripMeta } from '@writers-board/core';

export const TRIP_PREFIX = 'mot-trip:';
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

export interface NewTrip { title: string; city: string; cityId?: string; countryCode?: string; timeZone: string | null; kind?: BoardKind; dates?: TripMeta['dates']; party?: TripMeta['party']; }

export type ProbeTripStoreResult = { kind: 'absent' } | { kind: 'present'; bytes: Uint8Array };
export interface StoredCandidate { name: string; label: string; }
export interface AcceptedPointer { boardId: string; targetName: string; sourceSha256: string; }

const POINTER_DB = 'mot-trip-pointers';
const POINTER_STORE = 'pointers';

type ContextError = Error & { boardId?: string; storeName?: string; original?: Uint8Array; originalUpdates?: Uint8Array[] };

function contextError(message: string, options: { boardId?: string; storeName?: string; original?: Uint8Array; originalUpdates?: Uint8Array[]; cause?: unknown } = {}): ContextError {
  const base = options.cause instanceof Error ? options.cause : undefined;
  const error = new Error(base && message === base.message ? base.message : message) as ContextError;
  if (base?.name) error.name = base.name;
  if (options.boardId) error.boardId = options.boardId;
  if (options.storeName) error.storeName = options.storeName;
  if (options.original) error.original = options.original.slice();
  if (options.originalUpdates) error.originalUpdates = options.originalUpdates.map((bytes) => bytes.slice());
  if (options.cause !== undefined) (error as Error & { cause?: unknown }).cause = options.cause;
  return error;
}

function enrich(error: unknown, options: { boardId?: string; storeName?: string; original?: Uint8Array; originalUpdates?: Uint8Array[] }): ContextError {
  const wrapped = error instanceof Error ? (error as ContextError) : contextError(String(error), { ...options, cause: error });
  if (options.boardId && !wrapped.boardId) wrapped.boardId = options.boardId;
  if (options.storeName && !wrapped.storeName) wrapped.storeName = options.storeName;
  if (options.original && !wrapped.original) wrapped.original = options.original.slice();
  if (options.originalUpdates && !wrapped.originalUpdates) wrapped.originalUpdates = options.originalUpdates.map((bytes) => bytes.slice());
  return wrapped;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
}

function abortError(stage: string): ContextError {
  const error = contextError(`Repair aborted before ${stage}; the operation was cancelled.`);
  error.name = 'AbortError';
  return error;
}
function checkAborted(signal: AbortSignal | undefined, stage: string): void { if (signal?.aborted) throw abortError(stage); }

async function databaseNamesIfSupported(): Promise<string[] | null> {
  const factory = globalThis.indexedDB as (IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }) | undefined;
  if (!factory || typeof factory.databases !== 'function') return null;
  const databases = await factory.databases();
  return databases.map((database) => database.name).filter((name): name is string => typeof name === 'string');
}

type LockManagerLike = { request: (name: string, callback: () => Promise<unknown>) => Promise<unknown> };

/**
 * Cooperative, optional, exclusive per-board lock covering a whole open or
 * repair-persist operation (not merely the pointer write). Legacy/external
 * writers that do not honour this lock cannot interleave a source write
 * between final validation and pointer publication: publishWithSourceFence
 * holds a live named-source readonly transaction, whose IndexedDB scope
 * serializes queued source readwrite transactions until after the pointer
 * transaction settles. This is not a cross-database atomic transaction, but
 * the readonly serialization gives a valid source state at pointer commit;
 * later source writes proceed after that linearization and do not alter the
 * already accepted repair copy.
 */
async function withBoardLock<T>(boardId: string, operation: () => Promise<T>): Promise<T> {
  const locks = (globalThis as { navigator?: { locks?: LockManagerLike } }).navigator?.locks;
  if (locks && typeof locks.request === 'function') {
    return (await locks.request(`mot-trip:${boardId}`, operation)) as T;
  }
  return operation();
}

/** Open an existing DB without creating it. Resolves null when absent. Native absence is forced by aborting the upgrade transaction. */
function openExistingDatabase(name: string): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try { request = indexedDB.open(name); } catch (error) { reject(contextError('Could not read this browser’s trip storage.', { storeName: name, cause: error })); return; }
    let sawUpgrade = false;
    let abortedByUs = false;
    let settled = false;
    const done = (value: IDBDatabase | null) => { if (!settled) { settled = true; resolve(value); } };
    const fail = (cause?: unknown) => { if (!settled) { settled = true; reject(contextError('Could not read this browser’s trip storage.', { storeName: name, cause })); } };
    request.onupgradeneeded = () => {
      sawUpgrade = true;
      const transaction = (request as IDBOpenDBRequest & { transaction?: { abort?: () => void } | null }).transaction;
      // Older/minimal mocks expose no transaction: feature-detect it and report absent on success, creating no stores here.
      if (transaction && typeof transaction.abort === 'function') { abortedByUs = true; try { transaction.abort(); } catch { /* the resulting error/abort is classified below */ } }
    };
    request.onsuccess = () => {
      if (settled) {
        // e.g. onblocked already rejected: a late success must not leak its handle.
        try { request.result?.close(); } catch { /* closing only */ }
        return;
      }
      if (sawUpgrade) {
        try { request.result?.close(); } catch { /* closing only */ }
        // A native upgrade whose abort we requested does not complete here;
        // reaching success after an upgrade means a mock without a real
        // abortable transaction simulated creation, so report absent either way.
        done(null); return;
      }
      done(request.result);
    };
    request.onerror = () => {
      // Only the AbortError produced by our own upgrade abort proves absence;
      // arbitrary read errors after an upgrade must not be swallowed as absent.
      if (sawUpgrade && abortedByUs && request.error?.name === 'AbortError') done(null);
      else fail(request.error ?? undefined);
    };
    (request as IDBOpenDBRequest & { onabort?: (() => void) | null }).onabort = () => {
      if (sawUpgrade && abortedByUs) done(null);
      else fail(request.error ?? undefined);
    };
    request.onblocked = () => fail(contextError('Opening this browser’s trip storage was blocked by another tab.', { storeName: name }));
  });
}

function readAllUpdates(db: IDBDatabase, name: string): Promise<Uint8Array[]> {
  return new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction('updates', 'readonly');
      const request = transaction.objectStore('updates').getAll();
      let settled = false;
      const fail = () => { if (!settled) { settled = true; reject(contextError('Could not read the saved trip.', { storeName: name })); } };
      transaction.onabort = fail;
      transaction.onerror = fail;
      request.onsuccess = () => { if (!settled) { settled = true; resolve((request.result as Uint8Array[]).map((bytes) => bytes.slice())); } };
      request.onerror = fail;
    } catch (error) { reject(enrich(error, { storeName: name })); }
  });
}

/** Inspect a store without attaching y-indexeddb (its constructor writes even on open). */
export async function probeTripStore(name: string): Promise<ProbeTripStoreResult> {
  const names = await databaseNamesIfSupported().catch((error) => { throw enrich(error, { storeName: name }); });
  let db: IDBDatabase | null;
  if (names) {
    if (!names.includes(name)) return { kind: 'absent' };
    db = await openExistingDatabase(name);
    if (!db) throw contextError('Existing trip store could not be opened.', { storeName: name });
  } else {
    db = await openExistingDatabase(name);
    if (!db) return { kind: 'absent' };
  }
  try {
    if (!db.objectStoreNames.contains('updates')) throw contextError('Stored trip is empty or invalid: it has no updates store.', { storeName: name, original: new Uint8Array(0), originalUpdates: [] });
    if (typeof db.transaction !== 'function') throw contextError('Stored trip is invalid: its database cannot be read.', { storeName: name });
    const updates = await readAllUpdates(db, name);
    if (!updates.length) throw contextError('Stored trip is empty or invalid: it contains no saved updates.', { storeName: name, original: new Uint8Array(0), originalUpdates: [] });
    const doc = new Y.Doc();
    try {
      for (const update of updates) Y.applyUpdate(doc, update);
      const canonical = encodeTrip(doc);
      if (!doc.getMap('tripMeta').has('schemaVersion')) throw contextError('Saved trip is missing schemaVersion.', { storeName: name, original: canonical, originalUpdates: updates });
      return { kind: 'present', bytes: canonical };
    } catch (error) {
      if (error instanceof Error && (error as ContextError).storeName) throw error;
      // A multi-update sequence that cannot be applied has no single honest
      // "original" backup byte string: expose every raw update so the UI can
      // offer a JSON backup of the corrupt sequence. `original` is set only
      // for a lone update, or (above) for a successful canonical snapshot.
      throw contextError(error instanceof Error ? error.message : 'Stored trip is malformed or corrupt.', { storeName: name, original: updates.length === 1 ? updates[0] : undefined, originalUpdates: updates, cause: error });
    } finally { doc.destroy(); }
  } finally {
    try { db.close(); } catch { /* closing only */ }
  }
}

const plainName = (boardId: string) => `${TRIP_PREFIX}${boardId}`;
const versionName = (boardId: string, version: number) => `${TRIP_PREFIX}${boardId}:v${version}`;
function isRepairName(boardId: string, name: string): boolean {
  const prefix = `${plainName(boardId)}:repair:`;
  return name.startsWith(prefix) && name.length > prefix.length && !name.slice(prefix.length).includes('/');
}
function isKnownCandidateName(boardId: string, name: string): boolean {
  return name === plainName(boardId) || name === versionName(boardId, 2) || name === versionName(boardId, TRIP_SCHEMA_VERSION) || isRepairName(boardId, name);
}
function candidateLabel(boardId: string, name: string): string {
  if (name === versionName(boardId, TRIP_SCHEMA_VERSION)) return `Current v${TRIP_SCHEMA_VERSION} store`;
  if (name === versionName(boardId, 2)) return 'Older v2 store';
  if (name === plainName(boardId)) return 'Unversioned legacy original store';
  return 'Unaccepted repair recovery candidate';
}

export async function listStoredCandidates(boardId: string): Promise<StoredCandidate[]> {
  const names = await databaseNamesIfSupported();
  let found: string[];
  if (names) {
    // Exact prefix boundary: candidate names are the plain name itself or that name followed by ':'.
    found = names.filter((name) => isKnownCandidateName(boardId, name));
  } else {
    found = [];
    for (const name of [versionName(boardId, TRIP_SCHEMA_VERSION), versionName(boardId, 2), plainName(boardId)]) {
      try { const result = await probeTripStore(name); if (result.kind === 'present') found.push(name); }
      catch { found.push(name); /* an existing-but-unreadable candidate must not be hidden */ }
    }
  }
  return found.map((name) => ({ name, label: candidateLabel(boardId, name) }));
}

function normalizePointer(value: unknown, boardId: string): AcceptedPointer | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw contextError('Accepted pointer registry contains an invalid pointer.', { boardId });
  const record = value as Partial<AcceptedPointer>;
  // An accepted pointer may only ever target a repair store of this same board.
  if (record.boardId !== boardId || typeof record.targetName !== 'string' || !isRepairName(boardId, record.targetName) || typeof record.sourceSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(record.sourceSha256)) {
    throw contextError('Accepted pointer registry contains an invalid pointer.', { boardId, storeName: typeof record.targetName === 'string' ? record.targetName : undefined });
  }
  return { boardId: record.boardId, targetName: record.targetName, sourceSha256: record.sourceSha256 };
}

function readPointerFromDatabase(db: IDBDatabase, boardId: string): Promise<AcceptedPointer | null> {
  return new Promise((resolve, reject) => {
    try {
      if (!db.objectStoreNames.contains(POINTER_STORE)) throw contextError('Accepted pointer registry is unreadable: it has no pointers store.', { boardId });
      const transaction = db.transaction(POINTER_STORE, 'readonly');
      const request = transaction.objectStore(POINTER_STORE).get(boardId);
      let settled = false;
      const fail = () => { if (!settled) { settled = true; reject(contextError('Accepted pointer registry could not be read.', { boardId })); } };
      transaction.onabort = fail; transaction.onerror = fail;
      request.onsuccess = () => { if (settled) return; settled = true; try { resolve(normalizePointer(request.result, boardId)); } catch (error) { reject(enrich(error, { boardId })); } };
      request.onerror = fail;
    } catch (error) { reject(enrich(error, { boardId })); }
  });
}

export async function readAcceptedPointer(boardId: string): Promise<AcceptedPointer | null> {
  const names = await databaseNamesIfSupported().catch((error) => { throw enrich(error, { boardId }); });
  let db: IDBDatabase | null;
  if (names) {
    if (!names.includes(POINTER_DB)) return null;
    db = await openExistingDatabase(POINTER_DB);
    if (!db) throw contextError('Accepted pointer registry exists but could not be opened.', { boardId });
  } else {
    db = await openExistingDatabase(POINTER_DB);
    if (!db) return null;
  }
  try { return await readPointerFromDatabase(db, boardId); }
  finally { try { db.close(); } catch { /* closing only */ } }
}

function openPointerDatabaseForWrite(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(POINTER_DB);
    request.onupgradeneeded = () => { const db = request.result; if (!db.objectStoreNames.contains(POINTER_STORE)) db.createObjectStore(POINTER_STORE); };
    request.onerror = () => reject(contextError('Accepted pointer registry could not be opened for writing.', { cause: request.error ?? undefined }));
    request.onblocked = () => reject(contextError('Accepted pointer registry could not be opened for writing: the open was blocked by another tab.'));
    request.onsuccess = () => resolve(request.result);
  });
}

async function publishAcceptedPointer(boardId: string, record: AcceptedPointer, expected: AcceptedPointer | null, signal?: AbortSignal): Promise<void> {
  // No lock here: the compare-and-swap inside this single atomic readwrite
  // transaction is sufficient for the pointer itself. The broader per-board
  // lock is held by the caller across the whole persist operation.
  checkAborted(signal, 'publishing the accepted pointer');
  const db = await openPointerDatabaseForWrite();
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let transaction: IDBTransaction;
      const finish = (error?: unknown) => { if (settled) return; settled = true; signal?.removeEventListener('abort', onSignalAbort); if (error === undefined) resolve(); else reject(error); };
      const onSignalAbort = () => { try { transaction?.abort(); } catch { /* abort event rejects below */ } };
      try {
        if (!db.objectStoreNames.contains(POINTER_STORE)) throw contextError('Accepted pointer registry is unreadable: it has no pointers store.', { boardId });
        transaction = db.transaction(POINTER_STORE, 'readwrite');
        signal?.addEventListener('abort', onSignalAbort, { once: true });
        if (signal?.aborted) onSignalAbort();
        const store = transaction.objectStore(POINTER_STORE);
        const getRequest = store.get(boardId);
        getRequest.onsuccess = () => {
          if (settled) return;
          let current: AcceptedPointer | null;
          try { current = normalizePointer(getRequest.result, boardId); } catch (error) { try { transaction.abort(); } catch { /* ignore */ } finish(enrich(error, { boardId })); return; }
          const same = current === expected || (current !== null && expected !== null && current.boardId === expected.boardId && current.targetName === expected.targetName && current.sourceSha256 === expected.sourceSha256);
          if (!same) {
            const error = contextError('Accepted pointer changed while repair was being saved; refusing to overwrite the newer pointer.', { boardId, storeName: record.targetName });
            try { transaction.abort(); } catch { /* ignore */ }
            finish(error); return;
          }
          const putRequest = store.put(record, boardId);
          putRequest.onerror = () => finish(contextError('Accepted pointer could not be written.', { boardId, storeName: record.targetName, cause: putRequest.error ?? undefined }));
        };
        getRequest.onerror = () => finish(contextError('Accepted pointer could not be checked before writing.', { boardId, cause: getRequest.error ?? undefined }));
        transaction.oncomplete = () => finish();
        transaction.onabort = () => finish(signal?.aborted ? abortError('publishing the accepted pointer') : contextError('Accepted pointer transaction was aborted.', { boardId, storeName: record.targetName }));
        transaction.onerror = () => finish(contextError('Accepted pointer transaction failed.', { boardId, storeName: record.targetName, cause: transaction.error ?? undefined }));
      } catch (error) { finish(enrich(error, { boardId, storeName: record.targetName })); }
    });
  } finally { try { db.close(); } catch { /* closing only */ } }
}

async function publishWithSourceFence(boardId: string, sourceStoreName: string, sourceBytes: Uint8Array, record: AcceptedPointer, expected: AcceptedPointer | null, signal?: AbortSignal): Promise<void> {
  checkAborted(signal, 'publishing the accepted pointer');
  if (!isKnownCandidateName(boardId, sourceStoreName)) throw contextError('Repair source store does not belong to the requested board.', { boardId, storeName: sourceStoreName, original: sourceBytes });
  const db = await openExistingDatabase(sourceStoreName);
  if (!db) throw contextError('Repair source changed after its bytes were read; source hash mismatch, so the stale repair was not saved.', { boardId, storeName: sourceStoreName, original: sourceBytes });
  try {
    if (!db.objectStoreNames.contains('updates') || typeof db.transaction !== 'function') throw contextError('Stored trip is invalid: it has no readable updates store.', { boardId, storeName: sourceStoreName, original: sourceBytes });
    let transaction: IDBTransaction;
    try { transaction = db.transaction('updates', 'readonly'); } catch (error) { throw enrich(error, { boardId, storeName: sourceStoreName, original: sourceBytes }); }
    const fence = new AbortController();
    let sourceFailure: unknown = null;
    const forwardSignal = () => { fence.abort(); try { transaction.abort(); } catch { /* abort event handled below */ } };
    if (signal?.aborted) fence.abort(); else signal?.addEventListener('abort', forwardSignal, { once: true });
    const failSource = (cause?: unknown) => { if (!sourceFailure) sourceFailure = cause ?? contextError('Repair source transaction was aborted before the accepted pointer was published.', { boardId, storeName: sourceStoreName, original: sourceBytes }); fence.abort(); };
    transaction.onabort = () => failSource(contextError('Repair source transaction was aborted before the accepted pointer was published.', { boardId, storeName: sourceStoreName, original: sourceBytes }));
    transaction.onerror = () => failSource(transaction.error ?? undefined);
    db.onversionchange = () => { failSource(contextError('Repair source database version changed before the accepted pointer was published.', { boardId, storeName: sourceStoreName, original: sourceBytes })); try { transaction.abort(); } catch { /* abort event handled above */ } };
    try {
      const store = transaction.objectStore('updates');
      const updates = await new Promise<Uint8Array[]>((resolve, reject) => {
        let request: IDBRequest;
        try { request = store.getAll(); } catch (error) { reject(enrich(error, { boardId, storeName: sourceStoreName, original: sourceBytes })); return; }
        request.onsuccess = () => resolve((request.result as Uint8Array[]).map((bytes) => bytes.slice()));
        request.onerror = () => reject(contextError('Could not read the saved trip.', { boardId, storeName: sourceStoreName, original: sourceBytes, cause: request.error ?? undefined }));
      });
      checkAborted(fence.signal, 'publishing the accepted pointer');
      if (sourceFailure) throw enrich(sourceFailure, { boardId, storeName: sourceStoreName, original: sourceBytes });
      const found = new Y.Doc();
      let canonical: Uint8Array;
      try { for (const update of updates) Y.applyUpdate(found, update); canonical = encodeTrip(found); } finally { found.destroy(); }
      if (!bytesEqual(canonical, sourceBytes)) throw contextError('Repair source changed after its bytes were read; source hash mismatch, so the stale repair was not saved.', { boardId, storeName: sourceStoreName, original: sourceBytes });
      // Publish while this same readonly transaction is still live. Enqueue
      // exactly one asynchronous read per completed request until the pointer
      // settles: no busy/synchronous loop, and queued source writes cannot
      // commit until this transaction finishes after pointer settlement.
      let pointerSettled = false;
      const tracked = publishAcceptedPointer(boardId, record, expected, fence.signal).then(() => { pointerSettled = true; }, (error) => { pointerSettled = true; throw error; });
      void tracked.catch(() => {});
      const readOnce = () => new Promise<void>((resolve, reject) => {
        let request: IDBRequest;
        try { request = (typeof store.count === 'function' ? store.count() : store.getAll()) as IDBRequest; } catch (error) { reject(error); return; }
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error ?? contextError('Could not read the saved trip.', { boardId, storeName: sourceStoreName, original: sourceBytes }));
      });
      while (!pointerSettled) {
        if (sourceFailure) { fence.abort(); break; }
        await readOnce().catch((error) => failSource(error));
      }
      await tracked;
      if (signal?.aborted) throw abortError('publishing the accepted pointer');
      if (sourceFailure) throw enrich(sourceFailure, { boardId, storeName: sourceStoreName, original: sourceBytes });
    } finally {
      signal?.removeEventListener('abort', forwardSignal);
      try { db.onversionchange = null; } catch { /* closing only */ }
    }
  } finally { try { db.close(); } catch { /* closing only */ } }
}

/**
 * Attach the y-indexeddb writer to a document. This helper owns the document:
 * the returned OpenTrip.destroy() destroys both writer and document. Raw repair
 * code therefore passes a cloned document, never the caller-owned document.
 */
async function attachWriter(doc: Y.Doc, storageName: string, boardId: string, migrated: boolean): Promise<OpenTrip> {
  const persistence = new IndexeddbPersistence(storageName, doc);
  let exportedAt: string | null = null;
  let failure: Error | null = null, pending = 0, destroyed = false;
  let settled: Promise<void> = Promise.resolve();
  const notify = () => { if (!destroyed) window.dispatchEvent(new Event(STORAGE_STATUS_EVENT)); };
  const fail = (message: string) => {
    if (failure) return;
    failure = new Error(message);
    void persistence.destroy().catch(() => {});
    if (!destroyed) window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: message }));
    notify();
  };
  const barrier = () => new Promise<void>((resolve, reject) => {
    try {
      if (!persistence.db) throw new Error('Trip storage is not open.');
      const transaction = persistence.db.transaction(['updates', 'custom'], 'readonly');
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error('This browser could not commit the latest change. In this tab only: download a full ZIP backup before closing.'));
    } catch (error) { reject(error); }
  });
  const track = (write: Promise<unknown>) => {
    pending++; notify();
    const completion = write.then(() => { pending--; notify(); }, (error) => { pending--; fail(error instanceof Error ? error.message : 'This browser could not save the latest change. Download a full ZIP backup.'); throw error; });
    settled = Promise.all([settled, completion]).then(() => {});
    void settled.catch(() => {});
  };
  const whenSaved = async () => { while (true) { if (failure) throw failure; const current = settled; await current; if (failure) throw failure; if (current === settled && pending === 0) return; } };
  const changed = (_update: Uint8Array, origin: unknown) => { if (origin !== persistence && !failure) track(barrier()); };
  doc.on('update', changed);
  await persistence.whenSynced;
  persistence.db?.addEventListener('abort', (e) => { const name = ((e.target as IDBTransaction | null)?.error ?? null)?.name; fail(name === 'QuotaExceededError' ? 'This browser is out of storage space, so recent changes are not saved. Export a full backup now.' : 'This browser could not save the latest change. Export a full backup now.'); });
  persistence.db?.addEventListener('error', () => fail('This browser could not save the latest change. Export a full backup now.'));
  persistence.db?.addEventListener('close', () => fail('This browser closed the board’s storage (it may have been cleared). Export a full backup now.'));
  track(barrier());
  try {
    await whenSaved();
    exportedAt = await persistence.get('last-exported-at') as string | null ?? null;
    if (migrated) try { localStorage.setItem(`mot-trip-storage:${boardId}`, storageName); } catch { /* durable copy is discoverable without this marker */ }
  } catch { /* Keep the document editable in this tab; the original store is untouched. */ }
  rememberBoard(readTripMeta(doc));
  return {
    doc, persistence,
    status: () => (failure ? 'error' : pending ? 'unsaved' : 'saved'),
    whenSaved,
    lastExportedAt: () => exportedAt,
    markExported: () => { exportedAt = new Date().toISOString(); if (!failure) track(persistence.set('last-exported-at', exportedAt).then(() => barrier())); },
    destroy: () => { destroyed = true; doc.off('update', changed); void persistence.destroy(); doc.destroy(); },
  };
}

export async function openTrip(boardId: string, init?: NewTrip | { from: Y.Doc }): Promise<OpenTrip> {
  return withBoardLock(boardId, () => openTripLocked(boardId, init));
}

async function openTripLocked(boardId: string, init?: NewTrip | { from: Y.Doc }): Promise<OpenTrip> {
  const v3 = versionName(boardId, TRIP_SCHEMA_VERSION);
  const pointer = await readAcceptedPointer(boardId).catch((error) => { throw enrich(error, { boardId }); });
  let storageName: string;
  let doc: Y.Doc;
  let migrated = false;

  if (pointer) {
    const probed = await probeTripStore(pointer.targetName).catch((error) => { throw enrich(error, { boardId, storeName: pointer.targetName }); });
    if (probed.kind === 'absent') throw contextError(`Accepted pointer target is missing: the accepted recovery store could not be found.`, { boardId, storeName: pointer.targetName });
    try {
      // An accepted pointer must already reference a current v3 repair store:
      // load it raw and never migrate a pointed older document into the v3 name.
      doc = new Y.Doc();
      Y.applyUpdate(doc, probed.bytes);
      readTripMeta(doc);
      const validated = loadTrip(probed.bytes); validated.destroy();
      const meta = readTripMeta(doc);
      if (meta.boardId !== boardId) throw contextError('Saved trip identity does not match the requested board.', { boardId, storeName: pointer.targetName, original: probed.bytes });
      if (meta.schemaVersion !== TRIP_SCHEMA_VERSION) throw contextError(`Accepted pointer target has an unsupported schema version: expected v${TRIP_SCHEMA_VERSION}.`, { boardId, storeName: pointer.targetName, original: probed.bytes });
      await validateStoredGroupResponses(doc);
    } catch (error) { try { doc!.destroy(); } catch { /* already destroyed or unassigned */ } if ((error as ContextError)?.storeName) throw enrich(error, { boardId }); throw enrich(error, { boardId, storeName: pointer.targetName, original: probed.bytes }); }
    return attachWriter(doc, pointer.targetName, boardId, false);
  }

  const enumerated = await databaseNamesIfSupported().catch((error) => { throw enrich(error, { boardId }); });
  if (enumerated) {
    const repairs = enumerated.filter((name) => isRepairName(boardId, name));
    if (repairs.length) throw contextError('An unaccepted repair or recovery store exists for this board; explicit repair selection is required before this board can be opened.', { boardId, storeName: repairs[0] });
  }

  const ordered = [v3, versionName(boardId, 2), plainName(boardId)];
  let chosen: { name: string; bytes: Uint8Array } | null = null;
  for (const name of ordered) {
    if (enumerated && !enumerated.includes(name)) continue;
    const probed = await probeTripStore(name).catch((error) => { throw enrich(error, { boardId, storeName: name }); });
    if (probed.kind === 'present') { chosen = { name, bytes: probed.bytes }; break; }
  }

  if (chosen) {
    try {
      const loaded = loadTripWithMigration(chosen.bytes);
      doc = loaded.doc; migrated = loaded.migrated;
    } catch (error) { throw enrich(error, { boardId, storeName: chosen.name, original: chosen.bytes }); }
    if (readTripMeta(doc).boardId !== boardId) { doc.destroy(); throw contextError('Saved trip identity does not match the requested board.', { boardId, storeName: chosen.name, original: chosen.bytes }); }
    try { await validateStoredGroupResponses(doc); } catch (error) { doc.destroy(); throw enrich(error, { boardId, storeName: chosen.name, original: chosen.bytes }); }
    storageName = migrated ? v3 : chosen.name;
    return attachWriter(doc, storageName, boardId, migrated);
  }

  if (!init) throw contextError('Trip not found in this browser.', { boardId });
  doc = 'from' in init ? loadTrip(encodeTrip(init.from)) : createTrip({ ...init, boardId });
  if (readTripMeta(doc).boardId !== boardId) { doc.destroy(); throw contextError('Saved trip identity does not match the requested board.', { boardId }); }
  try { await validateStoredGroupResponses(doc); } catch (error) { doc.destroy(); throw enrich(error, { boardId }); }
  return attachWriter(doc, v3, boardId, false);
}

function randomRepairName(boardId: string): string {
  return `${plainName(boardId)}:repair:${crypto.randomUUID()}`;
}

async function verifyNamedSource(boardId: string, storeName: string, sourceBytes: Uint8Array): Promise<void> {
  if (!isKnownCandidateName(boardId, storeName)) throw contextError('Repair source store does not belong to the requested board.', { boardId, storeName, original: sourceBytes });
  const actual = await probeTripStore(storeName).catch((error) => { throw enrich(error, { boardId, storeName, original: sourceBytes }); });
  if (actual.kind !== 'present' || !bytesEqual(actual.bytes, sourceBytes)) throw contextError('Repair source changed after its bytes were read; source hash mismatch, so the stale repair was not saved.', { boardId, storeName, original: sourceBytes });
}

/**
 * Write exactly one snapshot to a brand-new repair DB using only native
 * IndexedDB (no y-indexeddb promises during staging). The upgrade handler is
 * the freshness check: an already-existing DB opens without an upgrade and is
 * rejected without any write. Resolves only on transaction complete.
 */
function writeFreshRepairSnapshot(name: string, snapshotBytes: Uint8Array, signal?: AbortSignal): Promise<void> {
  checkAborted(signal, 'writing the repair store');
  return new Promise<void>((resolve, reject) => {
    let db: IDBDatabase | null = null;
    let transaction: IDBTransaction | null = null;
    let request: IDBOpenDBRequest;
    let sawUpgrade = false;
    let settled = false;
    const closeDb = () => { try { db?.close(); } catch { /* closing only */ } };
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onSignalAbort);
      closeDb();
      if (error === undefined) resolve();
      else reject(enrich(error, { storeName: name }));
    };
    const onSignalAbort = () => {
      if (transaction) { try { transaction.abort(); } catch { /* abort event rejects below */ } }
      else finish(abortError('writing the repair store'));
    };
    try { request = indexedDB.open(name); } catch (error) { finish(contextError('Repair store could not be opened for writing.', { storeName: name, cause: error })); return; }
    signal?.addEventListener('abort', onSignalAbort, { once: true });
    request.onupgradeneeded = () => {
      sawUpgrade = true;
      const freshDb = request.result;
      if (settled || signal?.aborted) { request.transaction?.abort(); return; }
      if (!freshDb.objectStoreNames.contains('updates')) freshDb.createObjectStore('updates', { autoIncrement: true });
      if (!freshDb.objectStoreNames.contains('custom')) freshDb.createObjectStore('custom');
    };
    request.onerror = () => finish(contextError('Repair store could not be opened for writing.', { storeName: name, cause: request.error ?? undefined }));
    request.onblocked = () => finish(contextError('Repair store could not be opened for writing: the open was blocked by another tab.', { storeName: name }));
    request.onsuccess = () => {
      if (settled) { try { request.result?.close(); } catch { /* closing only */ } return; }
      db = request.result;
      if (!sawUpgrade) { finish(contextError('A generated repair store name collided with an existing store; retry the repair to generate a new name.', { storeName: name })); return; }
      if (signal?.aborted) { onSignalAbort(); return; }
      try {
        transaction = db.transaction('updates', 'readwrite');
        transaction.oncomplete = () => finish();
        transaction.onabort = () => finish(signal?.aborted ? abortError('writing the repair store') : contextError('Repair store transaction was aborted.', { storeName: name, cause: transaction?.error ?? undefined }));
        transaction.onerror = () => finish(contextError('Repair store transaction failed.', { storeName: name, cause: transaction?.error ?? undefined }));
        const addRequest = transaction.objectStore('updates').add(snapshotBytes.slice());
        if (addRequest) {
          addRequest.onsuccess = () => { /* durable commit is only proven by transaction.oncomplete */ };
          addRequest.onerror = () => { try { transaction?.abort(); } catch { /* transaction already ended */ } finish(contextError('Repair snapshot could not be written.', { storeName: name, cause: addRequest.error ?? undefined })); };
        }
        if (signal?.aborted) onSignalAbort();
      } catch (error) { finish(enrich(error, { storeName: name })); }
    };
  });
}

export async function persistRepairedTrip(boardId: string, doc: Y.Doc, source: { bytes: Uint8Array; storeName?: string }, signal?: AbortSignal): Promise<OpenTrip> {
  return withBoardLock(boardId, () => persistRepairedTripLocked(boardId, doc, source, signal));
}

async function persistRepairedTripLocked(boardId: string, doc: Y.Doc, source: { bytes: Uint8Array; storeName?: string }, signal?: AbortSignal): Promise<OpenTrip> {
  checkAborted(signal, 'validating the repaired trip');
  // Validate the caller-supplied current (v3) document before migrating, cloning into storage, or creating any candidate.
  let meta: TripMeta;
  try { meta = readTripMeta(doc); } catch (error) { throw enrich(error, { boardId }); }
  if (meta.boardId !== boardId) throw contextError('Repaired trip identity does not match the requested board.', { boardId });
  if (meta.schemaVersion !== TRIP_SCHEMA_VERSION) throw contextError(`Repaired trip has an unsupported schema version: expected v${TRIP_SCHEMA_VERSION}.`, { boardId });
  await validateStoredGroupResponses(doc).catch((error) => { throw enrich(error, { boardId }); });

  checkAborted(signal, 'reading the accepted pointer');
  const expectedPointer = await readAcceptedPointer(boardId).catch((error) => { throw enrich(error, { boardId }); });
  const sourceBytes = source.bytes.slice();
  const sourceSha256 = await sha256Hex(sourceBytes);

  if (source.storeName) { checkAborted(signal, 'checking the repair source before writing'); await verifyNamedSource(boardId, source.storeName, sourceBytes); }

  checkAborted(signal, 'creating the repair store');
  const repairName = randomRepairName(boardId);
  const existing = await probeTripStore(repairName);
  if (existing.kind !== 'absent') throw contextError('A generated repair store name collided with an existing store; retry the repair to generate a new name.', { boardId, storeName: repairName });

  // Original source bytes and the caller's document are never mutated or owned here: work on a byte-cloned document.
  const cloned = loadTrip(encodeTrip(doc));
  try {
    if (readTripMeta(cloned).boardId !== boardId || readTripMeta(cloned).schemaVersion !== TRIP_SCHEMA_VERSION) throw contextError('Repaired trip failed validation after cloning.', { boardId, storeName: repairName });
    await validateStoredGroupResponses(cloned);
    const snapshotBytes = encodeTrip(cloned);
    const snapshotHash = await sha256Hex(snapshotBytes);

    checkAborted(signal, 'writing the repair store');
    // Staging must not use y-indexeddb (its whenSynced/fetchUpdates promises can
    // hang or reject unhandled on abort) or touch localStorage: write one fresh
    // native snapshot and only accept it after durable commit + verification.
    await writeFreshRepairSnapshot(repairName, snapshotBytes, signal);

    checkAborted(signal, 'verifying the repair store');
    // Reopen read-only (probe attaches no writer) and verify identity/schema and the exact snapshot hash before any pointer is published.
    const verified = await probeTripStore(repairName);
    if (verified.kind !== 'present') throw contextError('Repair store could not be reopened for verification.', { boardId, storeName: repairName });
    const verifiedHash = await sha256Hex(verified.bytes);
    if (verifiedHash !== snapshotHash) throw contextError('Repair store verification failed: stored snapshot hash does not match the repaired trip.', { boardId, storeName: repairName, original: verified.bytes });
    const verifiedDoc = loadTrip(verified.bytes);
    try {
      const verifiedMeta = readTripMeta(verifiedDoc);
      if (verifiedMeta.boardId !== boardId || verifiedMeta.schemaVersion !== TRIP_SCHEMA_VERSION) throw contextError('Repair store verification failed: stored trip identity or schema does not match.', { boardId, storeName: repairName, original: verified.bytes });
      await validateStoredGroupResponses(verifiedDoc);
    } finally { verifiedDoc.destroy(); }

    // Final source validation and pointer publication are fenced by a live
    // readonly transaction on the named source (see publishWithSourceFence):
    // validation is reconstructed inside that transaction, the pointer CAS
    // runs while it is held, and any queued source write serializes after
    // pointer settlement. Without a named source there is nothing to fence.
    checkAborted(signal, 'publishing the accepted pointer');
    if (source.storeName) await publishWithSourceFence(boardId, source.storeName, sourceBytes, { boardId, targetName: repairName, sourceSha256 }, expectedPointer, signal);
    else await publishAcceptedPointer(boardId, { boardId, targetName: repairName, sourceSha256 }, expectedPointer, signal);
    try { cloned.destroy(); } catch { /* clone cleanup only */ }
  } catch (error) {
    if (cloned && cloned !== doc) { try { cloned.destroy(); } catch { /* clone cleanup only */ } }
    throw enrich(error, { boardId, storeName: repairName || undefined });
  }

  checkAborted(signal, 'reopening the repaired trip');
  // Already inside this board's lock: use the unlocked open path (Web Locks
  // are not re-entrant). This normal reopen is what remembers the board.
  const opened = await openTripLocked(boardId);
  try { checkAborted(signal, 'confirming the reopened repaired trip is saved'); await opened.whenSaved(); }
  catch (error) { opened.destroy(); throw enrich(error, { boardId, storeName: repairName }); }
  return opened;
}

export function reloadTrip(doc: Y.Doc): Y.Doc { return loadTrip(encodeTrip(doc)); }

export interface BoardEntry { id: string; title: string; kind: BoardKind; openedAt: string; }
const BOARDS_KEY = 'mot-boards';
const LAST_KEY = 'mot-last-trip';

export function listBoards(): BoardEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(BOARDS_KEY) ?? '[]') as BoardEntry[];
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
    return id && id !== 'imported' ? id : null;
  } catch { return null; }
}

export function forgetLastBoard(): void { try { localStorage.removeItem(LAST_KEY); } catch { /* ignore */ } }
/** Drops a remembered board whose stored trip no longer exists in this browser. */
export function forgetMissingBoard(id: string): void {
  try { localStorage.setItem(BOARDS_KEY, JSON.stringify(listBoards().filter((b) => b.id !== id))); } catch { /* convenience only */ }
  if (lastBoardId() === id) forgetLastBoard();
}
