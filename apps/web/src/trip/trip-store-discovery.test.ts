import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Y from 'yjs';
import { createTrip, encodeTrip, readTripMeta, TRIP_SCHEMA_VERSION } from '@mot/core';
import { openTrip, TRIP_PREFIX } from './trip-store';

const fake = vi.hoisted(() => ({
  stores: new Map<string, { updates: Uint8Array[]; custom: Map<string, unknown> }>(),
  constructed: [] as string[],
  hold: false,
  fail: false,
  barriers: [] as (() => void)[],
}));

function store(name: string) {
  let value = fake.stores.get(name);
  if (!value) {
    value = { updates: [], custom: new Map() };
    fake.stores.set(name, value);
  }
  return value;
}

function database(name: string) {
  return {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => {},
    close: () => {},
    addEventListener: () => {},
    transaction: () => {
      let reading = false;
      const transaction = {
        oncomplete: null as (() => void) | null,
        onabort: null as (() => void) | null,
        onerror: null as (() => void) | null,
        error: null as Error | null,
        objectStore: (which: string) => {
          reading = true;
          return {
            getAll: () => {
              const request = {
                result: [] as Uint8Array[],
                onsuccess: null as (() => void) | null,
                onerror: null as (() => void) | null,
              };
              queueMicrotask(() => {
                request.result = store(name).updates.map((bytes) => bytes.slice());
                request.onsuccess?.();
              });
              return request;
            },
            get: (key: string) => {
              const request = {
                result: store(name).custom.get(key),
                onsuccess: null as (() => void) | null,
                onerror: null as (() => void) | null,
              };
              queueMicrotask(() => request.onsuccess?.());
              return request;
            },
          };
        },
      };
      queueMicrotask(() => {
        const complete = () => {
          if (fake.fail && !reading) {
            transaction.error = new Error('QuotaExceededError');
            transaction.onabort?.();
          } else {
            transaction.oncomplete?.();
          }
        };
        if (fake.hold && !reading) fake.barriers.push(complete);
        else complete();
      });
      return transaction;
    },
  };
}

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class {
    db: ReturnType<typeof database>;
    whenSynced: Promise<this>;
    _db: Promise<ReturnType<typeof database>>;
    name: string;
    doc: Y.Doc;
    private update: (bytes: Uint8Array, origin: unknown) => void;
    constructor(name: string, doc: Y.Doc) {
      this.name = name;
      this.doc = doc;
      fake.constructed.push(name);
      this.db = database(name);
      this._db = Promise.resolve(this.db);
      this.update = (bytes, origin) => {
        if (origin !== this && !fake.fail) store(name).updates.push(bytes.slice());
      };
      doc.on('update', this.update);
      this.whenSynced = new Promise((resolve) =>
        queueMicrotask(() => {
          for (const bytes of [...store(name).updates]) Y.applyUpdate(doc, bytes, this);
          if (!fake.fail) store(name).updates.push(Y.encodeStateAsUpdate(doc));
          resolve(this);
        }),
      );
    }
    async get(key: string) {
      return store(this.name).custom.get(key);
    }
    async set(key: string, value: unknown) {
      if (fake.fail) throw new Error('QuotaExceededError');
      store(this.name).custom.set(key, value);
      return value;
    }
    async destroy() {
      this.doc.off('update', this.update);
    }
  },
}));

beforeEach(() => {
  fake.stores.clear();
  fake.constructed.length = 0;
  fake.hold = false;
  fake.fail = false;
  fake.barriers.length = 0;
  const local = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  });
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('indexedDB', {
    open: (name: string) => {
      const existed = fake.stores.has(name);
      store(name);
      const request = {
        result: database(name),
        onupgradeneeded: null as (() => void) | null,
        onsuccess: null as (() => void) | null,
        onerror: null as (() => void) | null,
      };
      queueMicrotask(() => {
        if (!existed) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  });
});

function v2Name(boardId: string): string {
  return `${TRIP_PREFIX}${boardId}:v2`;
}

function missingVersionBytes(boardId: string, title: string): { doc: Y.Doc; bytes: Uint8Array } {
  const doc = new Y.Doc();
  // A nonempty, present Yjs document whose tripMeta deliberately has no
  // schemaVersion: this is present-but-invalid, not an absent store.
  doc.getMap('tripMeta').set('boardId', boardId);
  doc.getMap('tripMeta').set('title', title);
  return { doc, bytes: encodeTrip(doc) };
}

function validTripBytes(boardId: string, title: string): { doc: Y.Doc; bytes: Uint8Array } {
  const doc = createTrip({ title, city: 'bangkok', timeZone: 'Asia/Bangkok', boardId });
  expect(readTripMeta(doc).schemaVersion).toBe(TRIP_SCHEMA_VERSION);
  doc.getMap('tripMeta').set('schemaVersion',2);
  return { doc, bytes: encodeTrip(doc) };
}

function expectStoreUntouched(name: string, originalUpdates: Uint8Array[]): void {
  expect(store(name).updates).toEqual(originalUpdates);
  expect([...store(name).custom.entries()]).toEqual([]);
}

describe('trip store discovery: present-but-invalid candidates are never skipped', () => {
  it('rejects a nonempty unversioned document without schemaVersion instead of reporting it not found', async () => {
    const boardId = 'missing-version';
    const name = TRIP_PREFIX + boardId;
    const { doc, bytes } = missingVersionBytes(boardId, 'Present but invalid');
    store(name).updates.push(bytes.slice());

    await expect(openTrip(boardId)).rejects.toThrow(
      /schemaVersion|schema version|missing.*version|invalid.*(trip|store|document)|corrupt/i,
    );
    // Readonly discovery only: no persistence may be attached and the
    // original candidate bytes must remain byte-for-byte unmodified.
    expect(fake.constructed).toEqual([]);
    expectStoreUntouched(name, [bytes]);
    doc.destroy();
  });

  it('does not create a replacement trip over a present-but-invalid unversioned document when init is supplied', async () => {
    const boardId = 'missing-version-with-init';
    const name = TRIP_PREFIX + boardId;
    const { doc, bytes } = missingVersionBytes(boardId, 'Do not overwrite me');
    store(name).updates.push(bytes.slice());

    await expect(
      openTrip(boardId, { title: 'Replacement', city: 'Unlisted city', timeZone: null }),
    ).rejects.toThrow(/schemaVersion|schema version|missing.*version|invalid.*(trip|store|document)|corrupt/i);
    expect(fake.constructed).toEqual([]);
    expectStoreUntouched(name, [bytes]);
    doc.destroy();
  });

  it('stops at a present-but-invalid :v2 candidate and does not fall back to a valid unversioned store', async () => {
    const boardId = 'v2-invalid-shadows-legacy';
    const upgradedName = v2Name(boardId);
    const originalName = TRIP_PREFIX + boardId;
    const invalid = missingVersionBytes(boardId, 'Invalid v2 candidate');
    const valid = validTripBytes(boardId, 'Valid unversioned trip');
    store(upgradedName).updates.push(invalid.bytes.slice());
    store(originalName).updates.push(valid.bytes.slice());

    await expect(openTrip(boardId)).rejects.toThrow(
      /schemaVersion|schema version|missing.*version|invalid.*(trip|store|document)|corrupt/i,
    );
    expect(fake.constructed).toEqual([]);
    expectStoreUntouched(upgradedName, [invalid.bytes]);
    expectStoreUntouched(originalName, [valid.bytes]);
    invalid.doc.destroy();
    valid.doc.destroy();
  });

  it('rejects a malformed update in the unversioned store without attaching persistence or modifying it', async () => {
    const boardId = 'malformed-unversioned';
    const name = TRIP_PREFIX + boardId;
    const valid = validTripBytes(boardId, 'Truncated source');
    const malformed = valid.bytes.slice(0, Math.max(1, Math.floor(valid.bytes.byteLength / 2)));
    store(name).updates.push(malformed.slice());

    await expect(openTrip(boardId)).rejects.toThrow();
    expect(fake.constructed).toEqual([]);
    expectStoreUntouched(name, [malformed]);
    valid.doc.destroy();
  });

  it('stops at a malformed :v2 update and does not fall back to a valid unversioned store', async () => {
    const boardId = 'v2-malformed-shadows-legacy';
    const upgradedName = v2Name(boardId);
    const originalName = TRIP_PREFIX + boardId;
    const validV2 = validTripBytes(boardId, 'Truncated v2 candidate');
    const malformed = validV2.bytes.slice(0, Math.max(1, Math.floor(validV2.bytes.byteLength / 2)));
    const validLegacy = validTripBytes(boardId, 'Valid unversioned trip');
    store(upgradedName).updates.push(malformed.slice());
    store(originalName).updates.push(validLegacy.bytes.slice());

    await expect(openTrip(boardId)).rejects.toThrow();
    expect(fake.constructed).toEqual([]);
    expectStoreUntouched(upgradedName, [malformed]);
    expectStoreUntouched(originalName, [validLegacy.bytes]);
    validV2.doc.destroy();
    validLegacy.doc.destroy();
  });

  it('prefers a valid :v2 store over a valid unversioned store for the same board', async () => {
    const boardId = 'v2-wins';
    const upgradedName = v2Name(boardId);
    const originalName = TRIP_PREFIX + boardId;
    const upgraded = validTripBytes(boardId, 'Current v2 title');
    const original = validTripBytes(boardId, 'Older unversioned title');
    store(upgradedName).updates.push(upgraded.bytes.slice());
    store(originalName).updates.push(original.bytes.slice());

    const opened = await openTrip(boardId);
    expect(readTripMeta(opened.doc).schemaVersion).toBe(TRIP_SCHEMA_VERSION);
    expect(readTripMeta(opened.doc).title).toBe('Current v2 title');
    expect(fake.constructed).toEqual([`${TRIP_PREFIX}${boardId}:v${TRIP_SCHEMA_VERSION}`]);
    await opened.whenSaved();
    opened.destroy();

    // The losing unversioned candidate is a retained original: never written.
    expectStoreUntouched(originalName, [original.bytes]);
    upgraded.doc.destroy();
    original.doc.destroy();
  });
});
