import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import {
  createTrip,
  encodeTrip,
  loadTrip,
  readTripMeta,
  TRIP_SCHEMA_VERSION,
} from '@mot/core';
import * as tripStore from './trip-store';
import { TRIP_PREFIX, type OpenTrip } from './trip-store';

type StoreRecord = {
  keyPath: string | null;
  autoIncrement: boolean;
  records: Map<unknown, unknown>;
  nextKey: number;
};

type DbRecord = {
  name: string;
  version: number;
  stores: Map<string, StoreRecord>;
};

const fake = vi.hoisted(() => ({
  dbs: new Map<string, DbRecord>(),
  constructed: [] as string[],
  fail: false,
  failWrites: false,
  hold: false,
  barriers: [] as (() => void)[],
}));

function cloneValue<T>(value: T): T {
  if (value instanceof Uint8Array) return value.slice() as T;
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
  return value;
}

function namedError(name: string, message: string): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function emitter<T extends object>(target: T): T & {
  addEventListener: (type: string, listener: (event: never) => void) => void;
  removeEventListener: (type: string, listener: (event: never) => void) => void;
  _emit: (type: string, event?: unknown) => void;
} {
  const listeners = new Map<string, Set<(event: never) => void>>();
  return Object.assign(target, {
    addEventListener(type: string, listener: (event: never) => void) {
      let set = listeners.get(type);
      if (!set) listeners.set(type, (set = new Set()));
      set.add(listener);
    },
    removeEventListener(type: string, listener: (event: never) => void) {
      listeners.get(type)?.delete(listener);
    },
    _emit(type: string, event: unknown = { type, target }) {
      const handler = (target as Record<string, unknown>)[`on${type}`];
      if (typeof handler === 'function') (handler as (e: unknown) => void).call(target, event);
      for (const listener of [...(listeners.get(type) ?? [])]) {
        (listener as (e: unknown) => void)(event);
      }
    },
  });
}

function makeRequest<T = unknown>() {
  return emitter({
    result: undefined as T | undefined,
    error: null as Error | null,
    transaction: null as unknown,
    onsuccess: null as ((event?: unknown) => void) | null,
    onerror: null as ((event?: unknown) => void) | null,
    onabort: null as ((event?: unknown) => void) | null,
    onupgradeneeded: null as ((event?: unknown) => void) | null,
    onblocked: null as ((event?: unknown) => void) | null,
  });
}

function dbData(name: string): DbRecord {
  let data = fake.dbs.get(name);
  if (!data) {
    data = { name, version: 1, stores: new Map() };
    fake.dbs.set(name, data);
  }
  if (!data.stores.has('updates')) {
    data.stores.set('updates', {
      keyPath: null,
      autoIncrement: true,
      records: new Map(),
      nextKey: 1,
    });
  }
  if (!data.stores.has('custom')) {
    data.stores.set('custom', {
      keyPath: null,
      autoIncrement: false,
      records: new Map(),
      nextKey: 1,
    });
  }
  return data;
}

function rawDb(name: string, version = 1): DbRecord {
  let data = fake.dbs.get(name);
  if (!data) {
    data = { name, version, stores: new Map() };
    fake.dbs.set(name, data);
  }
  return data;
}

function ensureStore(data: DbRecord, name: string, options: { keyPath?: string; autoIncrement?: boolean } = {}): StoreRecord {
  let store = data.stores.get(name);
  if (!store) {
    store = {
      keyPath: options.keyPath ?? null,
      autoIncrement: options.autoIncrement ?? false,
      records: new Map(),
      nextKey: 1,
    };
    data.stores.set(name, store);
  }
  return store;
}

function sortedRecords(store: StoreRecord): unknown[] {
  return [...store.records.entries()]
    .sort(([a], [b]) => {
      if (typeof a === 'number' && typeof b === 'number') return a - b;
      return String(a).localeCompare(String(b));
    })
    .map(([, value]) => cloneValue(value));
}

function updatesOf(name: string): Uint8Array[] {
  const data = fake.dbs.get(name);
  const store = data?.stores.get('updates');
  if (!store) return [];
  return sortedRecords(store).map((value) => (value as Uint8Array).slice());
}

function seedUpdates(name: string, updates: Uint8Array[]): void {
  const data = dbData(name);
  const store = data.stores.get('updates')!;
  store.records.clear();
  store.nextKey = 1;
  for (const update of updates) store.records.set(store.nextKey++, update.slice());
}

function replaceUpdates(name: string, updates: Uint8Array[]): void {
  seedUpdates(name, updates);
}

function databaseNames(): string[] {
  return [...fake.dbs.keys()].sort();
}

async function listedDatabaseNames(): Promise<string[]> {
  const databases = await indexedDB.databases();
  return databases.map((database) => database.name).filter((name): name is string => typeof name === 'string').sort();
}

function makeObjectStore(data: DbRecord, storeName: string, transaction: ReturnType<typeof makeTransaction>) {
  const store = () => {
    const found = data.stores.get(storeName);
    if (!found) throw namedError('NotFoundError', `Object store ${storeName} was not found.`);
    return found;
  };

  const run = <T>(operation: () => T, write = false) => {
    const request = makeRequest<T>();
    transaction._pending++;
    queueMicrotask(() => {
      if (transaction._aborted) {
        request.error = transaction.error ?? namedError('AbortError', 'The transaction was aborted.');
        request._emit('error', { target: request });
        transaction._pending--;
        transaction._schedule();
        return;
      }
      if (write && (fake.failWrites || fake.fail)) {
        const error = namedError('QuotaExceededError', 'QuotaExceededError');
        request.error = error;
        transaction._fail(error);
        request._emit('error', { target: request });
        transaction._pending--;
        transaction._schedule();
        return;
      }
      try {
        request.result = cloneValue(operation());
        request._emit('success', { target: request });
      } catch (error) {
        request.error = error instanceof Error ? error : new Error(String(error));
        request._emit('error', { target: request });
        if (write) transaction._fail(request.error);
      }
      transaction._pending--;
      transaction._schedule();
    });
    return request;
  };

  return emitter({
    name: storeName,
    get keyPath() {
      return store().keyPath;
    },
    get autoIncrement() {
      return store().autoIncrement;
    },
    get: (key: unknown) => run(() => store().records.get(key)),
    getAll: () => run(() => sortedRecords(store())),
    getAllKeys: () => run(() => [...store().records.keys()]),
    getKey: (key: unknown) => run(() => (store().records.has(key) ? key : undefined)),
    count: () => run(() => store().records.size),
    put: (value: unknown, key?: unknown) =>
      run(() => {
        const current = store();
        transaction._snapshot(current);
        let actualKey = key;
        if (actualKey === undefined && current.keyPath && value && typeof value === 'object') {
          actualKey = (value as Record<string, unknown>)[current.keyPath];
        }
        if (actualKey === undefined && current.autoIncrement) actualKey = current.nextKey++;
        if (actualKey === undefined) actualKey = value;
        current.records.set(actualKey, cloneValue(value));
        return actualKey;
      }, true),
    add: (value: unknown, key?: unknown) =>
      run(() => {
        const current = store();
        transaction._snapshot(current);
        let actualKey = key;
        if (actualKey === undefined && current.keyPath && value && typeof value === 'object') {
          actualKey = (value as Record<string, unknown>)[current.keyPath];
        }
        if (actualKey === undefined && current.autoIncrement) actualKey = current.nextKey++;
        if (actualKey === undefined) actualKey = value;
        if (current.records.has(actualKey)) throw namedError('ConstraintError', 'The key already exists.');
        current.records.set(actualKey, cloneValue(value));
        return actualKey;
      }, true),
    delete: (key: unknown) =>
      run(() => {
        const current = store();
        transaction._snapshot(current);
        current.records.delete(key);
        return undefined;
      }, true),
    clear: () =>
      run(() => {
        const current = store();
        transaction._snapshot(current);
        current.records.clear();
        current.nextKey = 1;
        return undefined;
      }, true),
  });
}

function makeTransaction(data: DbRecord, storeNames: string[], mode = 'readonly') {
  const snapshots = new Map<StoreRecord, { records: Map<unknown, unknown>; nextKey: number }>();
  const transaction = emitter({
    db: null as unknown,
    mode,
    error: null as Error | null,
    oncomplete: null as ((event?: unknown) => void) | null,
    onabort: null as ((event?: unknown) => void) | null,
    onerror: null as ((event?: unknown) => void) | null,
    _pending: 0,
    _aborted: false,
    _finished: false,
    _snapshot(store: StoreRecord) {
      if (!snapshots.has(store)) {
        snapshots.set(store, { records: new Map(store.records), nextKey: store.nextKey });
      }
    },
    _rollback() {
      for (const [store, snapshot] of snapshots) {
        store.records = new Map(snapshot.records);
        store.nextKey = snapshot.nextKey;
      }
    },
    _fail(error: Error) {
      if (transaction._finished) return;
      transaction.error = error;
      transaction._aborted = true;
      transaction._rollback();
    },
    _schedule() {
      queueMicrotask(() => {
        if (transaction._finished || transaction._pending > 0) return;
        transaction._finished = true;
        if (transaction._aborted) {
          transaction._rollback();
          transaction._emit('abort', { target: transaction });
          transaction._emit('error', { target: transaction });
        } else {
          transaction._emit('complete', { target: transaction });
        }
      });
    },
    abort() {
      if (transaction._finished) return;
      transaction.error = namedError('AbortError', 'The transaction was aborted.');
      transaction._aborted = true;
      transaction._rollback();
      queueMicrotask(() => {
        if (transaction._finished) return;
        transaction._finished = true;
        transaction._emit('abort', { target: transaction });
      });
    },
    objectStore(name: string) {
      if (!data.stores.has(name)) throw namedError('NotFoundError', `Object store ${name} was not found.`);
      return makeObjectStore(data, name, transaction as ReturnType<typeof makeTransaction>);
    },
  });
  // A readonly commit barrier should still schedule completion if no request is made.
  queueMicrotask(() => transaction._schedule());
  return transaction;
}

function objectStoreNames(data: DbRecord) {
  return {
    get length() {
      return data.stores.size;
    },
    contains: (name: string) => data.stores.has(name),
    item: (index: number) => [...data.stores.keys()][index] ?? null,
    [Symbol.iterator]: function* () {
      yield* data.stores.keys();
    },
  };
}

function makeDbHandle(data: DbRecord) {
  const handle = emitter({
    name: data.name,
    get version() {
      return data.version;
    },
    objectStoreNames: objectStoreNames(data),
    createObjectStore(name: string, options: { keyPath?: string; autoIncrement?: boolean } = {}) {
      const store = ensureStore(data, name, options);
      const upgradeTransaction = makeTransaction(data, [name], 'versionchange');
      return makeObjectStore(data, store === data.stores.get(name) ? name : name, upgradeTransaction);
    },
    deleteObjectStore(name: string) {
      data.stores.delete(name);
    },
    transaction(storeNames: string | string[], mode = 'readonly') {
      const names = Array.isArray(storeNames) ? storeNames : [storeNames];
      for (const name of names) {
        if (!data.stores.has(name)) throw namedError('NotFoundError', `Object store ${name} was not found.`);
      }
      const transaction = makeTransaction(data, names, mode);
      transaction.db = handle;
      if (fake.hold && mode !== 'readonly') {
        const originalSchedule = transaction._schedule.bind(transaction);
        transaction._schedule = () => {
          fake.barriers.push(() => originalSchedule());
        };
      }
      return transaction;
    },
    close() {},
  });
  return handle;
}

function fakeOpen(name: string, requestedVersion?: number) {
  const request = makeRequest<ReturnType<typeof makeDbHandle>>();
  queueMicrotask(() => {
    const existing = fake.dbs.get(name);
    if (existing) {
      if (requestedVersion !== undefined && requestedVersion > existing.version) {
        const oldVersion = existing.version;
        existing.version = requestedVersion;
        const handle = makeDbHandle(existing);
        const transaction = makeTransaction(existing, [...existing.stores.keys()], 'versionchange');
        transaction.db = handle;
        request.result = handle;
        request.transaction = transaction;
        request._emit('upgradeneeded', { target: request, oldVersion, newVersion: requestedVersion });
        if ((transaction as { _aborted?: boolean })._aborted) {
          existing.version = oldVersion;
          request.error = namedError('AbortError', 'The upgrade transaction was aborted.');
          request._emit('error', { target: request });
          return;
        }
      } else {
        request.result = makeDbHandle(existing);
      }
      request._emit('success', { target: request });
      return;
    }

    // A newly opened database is tentative until its upgrade transaction finishes.
    // Aborting that transaction models the native behaviour: no database is created.
    const tentative = rawDb(name, requestedVersion ?? 1);
    const handle = makeDbHandle(tentative);
    const transaction = makeTransaction(tentative, [], 'versionchange');
    transaction.db = handle;
    request.result = handle;
    request.transaction = transaction;
    request._emit('upgradeneeded', { target: request, oldVersion: 0, newVersion: tentative.version });
    if ((transaction as { _aborted?: boolean })._aborted) {
      fake.dbs.delete(name);
      request.result = undefined;
      request.error = namedError('AbortError', 'The upgrade transaction was aborted.');
      request._emit('abort', { target: request });
      request._emit('error', { target: request });
      return;
    }
    request._emit('success', { target: request });
  });
  return request;
}

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    db: ReturnType<typeof makeDbHandle>;
    whenSynced: Promise<this>;
    _db: Promise<ReturnType<typeof makeDbHandle>>;
    name: string;
    doc: Y.Doc;
    private update: (bytes: Uint8Array, origin: unknown) => void;

    constructor(name: string, doc: Y.Doc) {
      this.name = name;
      this.doc = doc;
      fake.constructed.push(name);
      dbData(name);
      this.db = makeDbHandle(fake.dbs.get(name)!);
      this._db = Promise.resolve(this.db);
      this.update = (bytes, origin) => {
        if (origin !== this && !fake.fail && !fake.failWrites) seedAppend(name, bytes);
      };
      doc.on('update', this.update);
      this.whenSynced = new Promise((resolve) =>
        queueMicrotask(() => {
          for (const bytes of updatesOf(name)) Y.applyUpdate(doc, bytes, this);
          if (!fake.fail && !fake.failWrites) seedAppend(name, Y.encodeStateAsUpdate(doc));
          resolve(this);
        }),
      );
    }

    async get(key: string) {
      const custom = dbData(this.name).stores.get('custom')!;
      return cloneValue(custom.records.get(key));
    }

    async set(key: string, value: unknown) {
      if (fake.fail || fake.failWrites) throw namedError('QuotaExceededError', 'QuotaExceededError');
      dbData(this.name).stores.get('custom')!.records.set(key, cloneValue(value));
      return value;
    }

    async destroy() {
      this.doc.off('update', this.update);
    }
  },
}));

function seedAppend(name: string, bytes: Uint8Array): void {
  const store = dbData(name).stores.get('updates')!;
  store.records.set(store.nextKey++, bytes.slice());
}

function requireFunction<K extends string>(name: K): (...args: never[]) => unknown {
  const candidate = (tripStore as unknown as Record<string, unknown>)[name];
  expect(candidate, `${name} should be exported by trip-store`).toBeTypeOf('function');
  return candidate as (...args: never[]) => unknown;
}

function probeTripStore(name: string) {
  return requireFunction('probeTripStore')(name as never) as Promise<
    { kind: 'absent' } | { kind: 'present'; bytes: Uint8Array }
  >;
}

function listStoredCandidates(boardId: string) {
  return requireFunction('listStoredCandidates')(boardId as never) as Promise<Array<{ name: string; label: string }>>;
}

function readAcceptedPointer(boardId: string) {
  return requireFunction('readAcceptedPointer')(boardId as never) as Promise<{
    boardId: string;
    targetName: string;
    sourceSha256: string;
  } | null>;
}

function persistRepairedTrip(
  boardId: string,
  doc: Y.Doc,
  source: { bytes: Uint8Array; storeName?: string },
  signal?: AbortSignal,
) {
  return requireFunction('persistRepairedTrip')(
    boardId as never,
    doc as never,
    source as never,
    signal as never,
  ) as Promise<OpenTrip>;
}

function validBytes(boardId: string, title: string, schemaVersion = TRIP_SCHEMA_VERSION): Uint8Array {
  const doc = createTrip({ title, city: 'bangkok', timeZone: 'Asia/Bangkok', boardId });
  if (schemaVersion !== TRIP_SCHEMA_VERSION) doc.getMap('tripMeta').set('schemaVersion', schemaVersion);
  const bytes = encodeTrip(doc);
  doc.destroy();
  return bytes;
}

function missingVersionBytes(boardId: string, title: string): Uint8Array {
  const doc = new Y.Doc();
  doc.getMap('tripMeta').set('boardId', boardId);
  doc.getMap('tripMeta').set('title', title);
  const bytes = encodeTrip(doc);
  doc.destroy();
  return bytes;
}

function repairedDoc(boardId: string, title: string): Y.Doc {
  return createTrip({ title, city: 'bangkok', timeZone: 'Asia/Bangkok', boardId });
}

function titleFromBytes(bytes: Uint8Array): string {
  const doc = loadTrip(bytes.slice());
  try {
    return readTripMeta(doc).title;
  } finally {
    doc.destroy();
  }
}

const v3Name = (boardId: string) => `${TRIP_PREFIX}${boardId}:v3`;
const v2Name = (boardId: string) => `${TRIP_PREFIX}${boardId}:v2`;
const plainName = (boardId: string) => `${TRIP_PREFIX}${boardId}`;
const repairName = (boardId: string, id = '123e4567-e89b-42d3-a456-426614174000') =>
  `${TRIP_PREFIX}${boardId}:repair:${id}`;

beforeEach(() => {
  fake.dbs.clear();
  fake.constructed.length = 0;
  fake.fail = false;
  fake.failWrites = false;
  fake.hold = false;
  fake.barriers.length = 0;
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('indexedDB', {
    open: (name: string, version?: number) => fakeOpen(name, version),
    databases: async () => databaseNames().map((name) => ({ name, version: fake.dbs.get(name)?.version ?? 1 })),
    deleteDatabase: (name: string) => {
      const request = makeRequest();
      queueMicrotask(() => {
        fake.dbs.delete(name);
        request._emit('success', { target: request });
      });
      return request;
    },
  });
});

describe('G6 browser storage migration and recovery', () => {
  it('exports the recovery API used by these tests', () => {
    expect(typeof tripStore.probeTripStore).toBe('function');
    expect(typeof tripStore.listStoredCandidates).toBe('function');
    expect(typeof tripStore.readAcceptedPointer).toBe('function');
    expect(typeof tripStore.persistRepairedTrip).toBe('function');
  });

  it('reports a missing database as absent without durably creating it', async () => {
    const name = v3Name('absent-board');
    await expect(probeTripStore(name)).resolves.toEqual({ kind: 'absent' });
    expect(await listedDatabaseNames()).not.toContain(name);
    expect(fake.constructed).toEqual([]);
  });

  it('rejects present-but-empty and malformed databases instead of treating them as absent', async () => {
    seedUpdates(v3Name('empty-board'), []);
    await expect(probeTripStore(v3Name('empty-board'))).rejects.toThrow(/empty|invalid|corrupt|missing/i);

    const malformed = validBytes('malformed-board', 'Truncated').slice(0, 7);
    seedUpdates(v3Name('malformed-board'), [malformed]);
    await expect(probeTripStore(v3Name('malformed-board'))).rejects.toThrow();
    expect(updatesOf(v3Name('malformed-board'))).toEqual([malformed]);
  });

  it('returns decodable bytes for a present valid store without attaching persistence or changing it', async () => {
    const boardId = 'probe-valid';
    const bytes = validBytes(boardId, 'Probe me', 2);
    seedUpdates(v2Name(boardId), [bytes]);

    const result = await probeTripStore(v2Name(boardId));
    expect(result.kind).toBe('present');
    if (result.kind === 'present') expect(titleFromBytes(result.bytes)).toBe('Probe me');
    expect(fake.constructed).toEqual([]);
    expect(updatesOf(v2Name(boardId))).toEqual([bytes]);
  });

  it('lists exact candidate names with useful labels and respects board-id boundaries', async () => {
    const boardId = 'board';
    for (const name of [
      v3Name(boardId),
      v2Name(boardId),
      plainName(boardId),
      repairName(boardId),
      v3Name('board2'),
      repairName('board2', '123e4567-e89b-42d3-a456-426614174999'),
      plainName('board-extra'),
      'mot-trip-pointers',
    ]) {
      dbData(name);
    }

    const candidates = await listStoredCandidates(boardId);
    expect(candidates.map((candidate) => candidate.name).sort()).toEqual(
      [plainName(boardId), repairName(boardId), v2Name(boardId), v3Name(boardId)].sort(),
    );
    const byName = new Map(candidates.map((candidate) => [candidate.name, candidate.label]));
    expect(byName.get(v3Name(boardId))).toMatch(/current|v3|latest/i);
    expect(byName.get(v2Name(boardId))).toMatch(/older|previous|v2|legacy/i);
    expect(byName.get(plainName(boardId))).toMatch(/unversioned|legacy|original|v1/i);
    expect(byName.get(repairName(boardId))).toMatch(/repair|recovery/i);
  });

  it('reads a missing accepted pointer as null without creating the pointer database', async () => {
    await expect(readAcceptedPointer('no-pointer')).resolves.toBeNull();
    expect(await listedDatabaseNames()).not.toContain('mot-trip-pointers');
  });

  it('lets a bad v3 block valid older stores and supplied init, without attaching persistence', async () => {
    const boardId = 'bad-v3-blocks';
    const bad = missingVersionBytes(boardId, 'Bad current store');
    const older = validBytes(boardId, 'Valid older store', 2);
    const unversioned = validBytes(boardId, 'Valid unversioned store', 1);
    seedUpdates(v3Name(boardId), [bad]);
    seedUpdates(v2Name(boardId), [older]);
    seedUpdates(plainName(boardId), [unversioned]);

    await expect(
      tripStore.openTrip(boardId, { title: 'Replacement', city: 'Unlisted city', timeZone: null }),
    ).rejects.toThrow(/schemaVersion|schema version|missing.*version|invalid|corrupt/i);
    expect(fake.constructed).toEqual([]);
    expect(updatesOf(v3Name(boardId))).toEqual([bad]);
    expect(updatesOf(v2Name(boardId))).toEqual([older]);
    expect(updatesOf(plainName(boardId))).toEqual([unversioned]);
  });

  it('prefers valid v2 over unversioned, migrates it into v3, and keeps the v2 source untouched', async () => {
    const boardId = 'v2-wins';
    const v2 = validBytes(boardId, 'Winning v2', 2);
    const legacy = validBytes(boardId, 'Losing legacy', 1);
    seedUpdates(v2Name(boardId), [v2]);
    seedUpdates(plainName(boardId), [legacy]);

    const opened = await tripStore.openTrip(boardId);
    expect(readTripMeta(opened.doc).title).toBe('Winning v2');
    expect(readTripMeta(opened.doc).schemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(fake.constructed).toEqual([v3Name(boardId)]);
    await opened.whenSaved();
    opened.destroy();

    expect(updatesOf(v2Name(boardId))).toEqual([v2]);
    expect(updatesOf(plainName(boardId))).toEqual([legacy]);
    const reopened = await tripStore.openTrip(boardId);
    expect(readTripMeta(reopened.doc).title).toBe('Winning v2');
    reopened.destroy();
  });

  it('lets a future v2 block an older valid store without attaching persistence', async () => {
    const boardId = 'future-v2';
    const future = validBytes(boardId, 'Future v2', 999);
    const legacy = validBytes(boardId, 'Older valid', 1);
    seedUpdates(v2Name(boardId), [future]);
    seedUpdates(plainName(boardId), [legacy]);

    await expect(tripStore.openTrip(boardId)).rejects.toThrow(/unsupported|future|version/i);
    expect(fake.constructed).toEqual([]);
    expect(updatesOf(v2Name(boardId))).toEqual([future]);
    expect(updatesOf(plainName(boardId))).toEqual([legacy]);
  });

  it('rejects a stored document whose board identity does not match the requested board', async () => {
    const requested = 'requested-board';
    const foreign = validBytes('someone-else', 'Foreign board');
    seedUpdates(v3Name(requested), [foreign]);

    await expect(tripStore.openTrip(requested)).rejects.toThrow(/identity|board|match/i);
    expect(fake.constructed).toEqual([]);
    expect(updatesOf(v3Name(requested))).toEqual([foreign]);
  });

  it('does not silently adopt an unaccepted repair candidate when opening normally', async () => {
    const boardId = 'needs-selection';
    const candidate = validBytes(boardId, 'Unaccepted repair');
    seedUpdates(repairName(boardId), [candidate]);

    await expect(tripStore.openTrip(boardId)).rejects.toThrow(/repair|recovery|explicit|select|choose/i);
    expect(fake.constructed).toEqual([]);
    expect(updatesOf(repairName(boardId))).toEqual([candidate]);
  });

  it('lets a corrupt accepted-pointer target block otherwise valid older stores', async () => {
    const boardId = 'pointer-target-corrupt';
    const sourceBytes = validBytes(boardId, 'Recoverable v2', 2);
    seedUpdates(v2Name(boardId), [sourceBytes]);
    const probed = await probeTripStore(v2Name(boardId));
    expect(probed.kind).toBe('present');
    if (probed.kind !== 'present') throw new Error('expected a present source');

    const doc = repairedDoc(boardId, 'Accepted repair');
    const opened = await persistRepairedTrip(boardId, doc, { bytes: probed.bytes, storeName: v2Name(boardId) });
    const pointer = await readAcceptedPointer(boardId);
    expect(pointer?.targetName).toMatch(new RegExp(`^${TRIP_PREFIX}${boardId}:repair:`));
    opened.destroy();

    replaceUpdates(pointer!.targetName, [new Uint8Array([0, 1, 2, 3])]);
    fake.constructed.length = 0;
    await expect(tripStore.openTrip(boardId)).rejects.toThrow();
    expect(fake.constructed).toEqual([]);
    expect(updatesOf(v2Name(boardId))).toEqual([sourceBytes]);
  });

  it('lets a missing accepted-pointer target block init and older stores', async () => {
    const boardId = 'pointer-target-missing';
    const sourceBytes = validBytes(boardId, 'Source remains', 2);
    seedUpdates(v2Name(boardId), [sourceBytes]);
    const doc = repairedDoc(boardId, 'Will be pointed to');
    const opened = await persistRepairedTrip(boardId, doc, { bytes: encodeTrip(doc) });
    const pointer = await readAcceptedPointer(boardId);
    expect(pointer).not.toBeNull();
    opened.destroy();

    fake.dbs.delete(pointer!.targetName);
    fake.constructed.length = 0;
    await expect(
      tripStore.openTrip(boardId, { title: 'Replacement', city: 'Unlisted city', timeZone: null }),
    ).rejects.toThrow(/accepted|pointer|missing|not found|target/i);
    expect(fake.constructed).toEqual([]);
    expect(updatesOf(v2Name(boardId))).toEqual([sourceBytes]);
  });

  it('durably repairs over a bad v3, publishes a pointer, reopens the repair, and retains the bad original', async () => {
    const boardId = 'durable-repair';
    const bad = new Uint8Array([9, 8, 7, 6, 5]);
    seedUpdates(v3Name(boardId), [bad]);
    const doc = repairedDoc(boardId, 'Repaired trip');
    const importedBytes = encodeTrip(doc);

    const opened = await persistRepairedTrip(boardId, doc, { bytes: importedBytes });
    expect(readTripMeta(opened.doc).title).toBe('Repaired trip');
    const pointer = await readAcceptedPointer(boardId);
    expect(pointer).toMatchObject({ boardId });
    expect(pointer?.targetName).toMatch(new RegExp(`^${TRIP_PREFIX}${boardId}:repair:[^:]+$`));
    expect(pointer?.targetName).not.toBe(v3Name(boardId));
    expect(pointer?.sourceSha256).toMatch(/^[a-f0-9]{64}$/i);
    await opened.whenSaved();
    opened.destroy();

    expect(updatesOf(v3Name(boardId))).toEqual([bad]);
    const reopened = await tripStore.openTrip(boardId);
    expect(readTripMeta(reopened.doc).title).toBe('Repaired trip');
    expect(fake.constructed.at(-1)).toBe(pointer!.targetName);
    reopened.destroy();
    expect(updatesOf(v3Name(boardId))).toEqual([bad]);
  });

  it('refuses repair when the named actual source changed after its bytes were read', async () => {
    const boardId = 'source-changed';
    const before = validBytes(boardId, 'Read this source', 2);
    const after = validBytes(boardId, 'Changed source', 2);
    seedUpdates(v2Name(boardId), [before]);
    const probed = await probeTripStore(v2Name(boardId));
    if (probed.kind !== 'present') throw new Error('expected a present source');
    replaceUpdates(v2Name(boardId), [after]);
    const candidatesBefore = databaseNames();

    const doc = repairedDoc(boardId, 'Should not persist');
    await expect(
      persistRepairedTrip(boardId, doc, { bytes: probed.bytes, storeName: v2Name(boardId) }),
    ).rejects.toThrow(/source|changed|hash|mismatch|stale/i);
    doc.destroy();

    expect(databaseNames()).toEqual(candidatesBefore);
    await expect(readAcceptedPointer(boardId)).resolves.toBeNull();
    expect(updatesOf(v2Name(boardId))).toEqual([after]);
  });

  it('does not publish a pointer after a quota-failed save and uses a fresh candidate on retry', async () => {
    const boardId = 'quota-retry';
    const doc = repairedDoc(boardId, 'Retry me');
    const bytes = encodeTrip(doc);

    fake.failWrites = true;
    await expect(persistRepairedTrip(boardId, doc, { bytes })).rejects.toThrow();
    await expect(readAcceptedPointer(boardId)).resolves.toBeNull();
    const failedNames = new Set((await listStoredCandidates(boardId)).map((candidate) => candidate.name));

    fake.failWrites = false;
    const opened = await persistRepairedTrip(boardId, doc, { bytes });
    const pointer = await readAcceptedPointer(boardId);
    expect(pointer?.targetName).toBeTruthy();
    expect(failedNames.has(pointer!.targetName)).toBe(false);
    expect(readTripMeta(opened.doc).title).toBe('Retry me');
    opened.destroy();
  });

  it('writes nothing and publishes no pointer when repair is aborted before writing', async () => {
    const boardId = 'aborted-repair';
    const doc = repairedDoc(boardId, 'Abort me');
    const controller = new AbortController();
    controller.abort();
    const before = databaseNames();

    await expect(persistRepairedTrip(boardId, doc, { bytes: encodeTrip(doc) }, controller.signal)).rejects.toThrow(
      /abort|cancel/i,
    );
    doc.destroy();
    expect(databaseNames()).toEqual(before);
    await expect(readAcceptedPointer(boardId)).resolves.toBeNull();
  });

  it('validates the repaired document schema and board identity before creating a candidate', async () => {
    const boardId = 'validated-repair';
    const before = databaseNames();

    const foreign = repairedDoc('another-board', 'Wrong board');
    await expect(persistRepairedTrip(boardId, foreign, { bytes: encodeTrip(foreign) })).rejects.toThrow(
      /board|identity|match/i,
    );
    foreign.destroy();

    const oldSchema = repairedDoc(boardId, 'Wrong schema');
    oldSchema.getMap('tripMeta').set('schemaVersion', 2);
    await expect(persistRepairedTrip(boardId, oldSchema, { bytes: encodeTrip(oldSchema) })).rejects.toThrow(
      /schema|version|unsupported/i,
    );
    oldSchema.destroy();

    expect(databaseNames()).toEqual(before);
    await expect(readAcceptedPointer(boardId)).resolves.toBeNull();
  });

  it('uses the current v3 store for a genuinely new trip', async () => {
    const boardId = 'fresh-board';
    const opened = await tripStore.openTrip(boardId, {
      title: 'Fresh trip',
      city: 'Unlisted city',
      timeZone: null,
    });
    expect(fake.constructed).toEqual([v3Name(boardId)]);
    expect(readTripMeta(opened.doc).schemaVersion).toBe(TRIP_SCHEMA_VERSION);
    await opened.whenSaved();
    opened.destroy();
  });
});

// A published repair must already be v3; loading it must never perform a new migration.
it('refuses an accepted repair target relabelled to legacy schema',async()=>{
 const id='pointer-legacy'; const doc=repairedDoc(id,'Accepted');
 const opened=await persistRepairedTrip(id,doc,{bytes:encodeTrip(doc)}); opened.destroy();
 const pointer=await readAcceptedPointer(id);
 replaceUpdates(pointer!.targetName,[validBytes(id,'Wrong legacy target',2)]);fake.constructed.length=0;
 await expect(tripStore.openTrip(id)).rejects.toThrow(/schema|version/i);
 expect(fake.constructed).toEqual([]);doc.destroy();
});
