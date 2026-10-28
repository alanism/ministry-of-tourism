// Image bytes live in the browser's IndexedDB, keyed by their SHA-256 hash.
// The board document only records the hash, so boards stay small and the same
// picture pasted twice is stored once.
const DB_NAME = 'writers-board-blobs';
const STORE = 'blobs';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, mode);
        const request = fn(transaction.objectStore(STORE));
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error ?? new Error('Image storage failed. Please try again.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Image storage failed. Please try again.'));
        request.onerror = () => reject(request.error);
      }),
  );
}

export async function hashBlob(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function putBlob(blob: Blob): Promise<string> {
  const hash = await hashBlob(blob);
  await tx('readwrite', (store) => store.put(blob, hash));
  return hash;
}

/** The stored bytes for an image, or null if this browser doesn't have them. */
export async function getBlob(hash: string): Promise<Blob | null> {
  return (await tx<Blob | undefined>('readonly', (store) => store.get(hash) as IDBRequest<Blob | undefined>)) ?? null;
}

const urls = new Map<string, Promise<string | null>>();

/** An object URL for a stored image, or null if this browser doesn't have it. */
export function blobUrl(hash: string): Promise<string | null> {
  let url = urls.get(hash);
  if (!url) {
    url = tx<Blob | undefined>('readonly', (store) => store.get(hash) as IDBRequest<Blob | undefined>).then((blob) =>
      blob ? URL.createObjectURL(blob) : null,
    );
    urls.set(hash, url);
  }
  return url;
}
