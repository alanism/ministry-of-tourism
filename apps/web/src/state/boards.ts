// A writer's boards, in this browser. Each board is its own IndexedDB
// database (`writers-board:<id>`); this keeps the list of them: names, when
// each was last edited, and boards set aside in "Recently deleted". The list
// is rebuilt from the databases themselves, so a board is never lost because
// the list was.
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { boardParts, encodeBoard, initializeBoard, makeBackupFile, makeBoardFile, readBoard, readBoardFiles, type BoardFile, type BoardView } from '@writers-board/core';
import { getBlob, putBlob } from './blobs';
import { blobToDataUrl } from '../ai/images';

export interface BoardEntry {
  id: string;
  title: string;
  createdAt: number;
  /** When its content last changed (0 if not known yet). */
  updatedAt: number;
  openedAt: number;
  cards: number;
  words: number;
  /** Set when the board is in "Recently deleted". */
  deletedAt?: number;
}

const REGISTRY_KEY = 'writers-board:boards';
const LAST_KEY = 'writers-board:last-board';
const PREFIX = 'writers-board:';
/** Boards in "Recently deleted" are removed for good after this long. */
export const KEEP_DELETED_DAYS = 30;

export const storageKey = (id: string) => `${PREFIX}${id}`;
const cleanId = (id: string | null | undefined) => (id ?? '').replace(/[^\w-]/g, '').slice(0, 40);

function readRegistry(): BoardEntry[] {
  try {
    const list = JSON.parse(localStorage.getItem(REGISTRY_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeRegistry(list: BoardEntry[]) {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(list));
  } catch {
    // The list is a convenience; the boards themselves are in IndexedDB.
  }
  window.dispatchEvent(new Event('writers-board:boards'));
}

/** Which board this page shows: the address says, or the last one opened, or the first board. */
export function currentBoardId(): string {
  const fromUrl = cleanId(new URLSearchParams(location.search).get('board'));
  if (fromUrl) return fromUrl;
  try {
    return cleanId(localStorage.getItem(LAST_KEY)) || 'default';
  } catch {
    return 'default';
  }
}

/** Updates (or adds) a board's entry in the list. */
export function recordBoard(id: string, patch: Partial<Omit<BoardEntry, 'id'>>) {
  const list = readRegistry();
  const at = list.findIndex((e) => e.id === id);
  const base: BoardEntry = at >= 0 ? list[at]! : { id, title: 'Untitled board', createdAt: Date.now(), updatedAt: 0, openedAt: 0, cards: 0, words: 0 };
  const next = { ...base, ...patch };
  if (at >= 0) list[at] = next;
  else list.push(next);
  writeRegistry(list);
}

/** Every board in this browser, including any the list had lost track of. */
export async function listBoards(): Promise<BoardEntry[]> {
  const list = readRegistry();
  try {
    const databases = (await indexedDB.databases?.()) ?? [];
    for (const db of databases) {
      const id = db.name?.startsWith(PREFIX) ? cleanId(db.name.slice(PREFIX.length)) : '';
      if (id && !list.some((e) => e.id === id)) {
        list.push({ id, title: id === 'default' ? 'My board' : id, createdAt: 0, updatedAt: 0, openedAt: 0, cards: 0, words: 0 });
      }
    }
  } catch {
    // Some browsers can't list databases; the saved list is still there.
  }
  return list.sort((a, b) => Math.max(b.updatedAt, b.openedAt) - Math.max(a.updatedAt, a.openedAt));
}

/**
 * Boards made before the list kept their numbers (or never opened since)
 * have none; read each one once, quietly, and fill them in.
 */
export async function fillMissingStats(openId: string) {
  for (const entry of await listBoards()) {
    if (entry.id === openId || entry.deletedAt || entry.cards || entry.words) continue;
    try {
      const view = await withBoardDoc(entry.id, (doc) => readBoard({ doc, parts: boardParts(doc) }));
      recordBoard(entry.id, { title: view.title, cards: view.cards.length, words: countWords(view.manuscript), createdAt: entry.createdAt || Date.now() });
    } catch {
      // A board that can't be read keeps what the list knew.
    }
  }
}

/** Opens a board. The page reloads onto it, so every part of the app starts clean. */
export function openBoard(id: string) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    // Opening still works through the address.
  }
  const url = new URL(location.href);
  url.searchParams.set('board', id);
  url.searchParams.delete('seed');
  location.assign(url.toString());
}

const newId = () => `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Writes a document into a new board's own database and waits for it to land. */
async function storeNewBoard(fill: (doc: Y.Doc) => void): Promise<{ id: string; view: BoardView }> {
  const id = newId();
  const doc = new Y.Doc();
  const storage = new IndexeddbPersistence(storageKey(id), doc);
  await storage.whenSynced;
  fill(doc);
  const view = readBoard({ doc, parts: boardParts(doc) });
  // A queued read waits for the preceding update writes to commit. A timed
  // delay can return before commit, letting navigation abort the imported board.
  await new Promise<void>((resolve, reject) => {
    const transaction = storage.db!.transaction('updates', 'readonly');
    transaction.objectStore('updates').count();
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not save the board. Please try again.'));
    transaction.onerror = () => reject(transaction.error);
  });
  await storage.destroy();
  doc.destroy();
  recordBoard(id, { title: view.title, createdAt: Date.now(), updatedAt: Date.now(), cards: view.cards.length, words: countWords(view.manuscript) });
  void protectStorage();
  return { id, view };
}

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

export async function createBoard(title = 'Untitled board'): Promise<string> {
  const { id } = await storeNewBoard((doc) => initializeBoard(doc, { title }));
  return id;
}

/** A new board from a document's bytes (a duplicate or an imported file). */
async function boardFromUpdate(update: Uint8Array, title?: string): Promise<string> {
  const { id } = await storeNewBoard((doc) => {
    Y.applyUpdate(doc, update);
    if (title) boardParts(doc).meta.set('title', title);
  });
  return id;
}

/** Opens a board's document for a moment, without showing it. */
async function withBoardDoc<T>(id: string, use: (doc: Y.Doc) => T): Promise<T> {
  const doc = new Y.Doc();
  const storage = new IndexeddbPersistence(storageKey(id), doc);
  await storage.whenSynced;
  try {
    return use(doc);
  } finally {
    await new Promise((resolve) => setTimeout(resolve, 50));
    await storage.destroy();
    doc.destroy();
  }
}

/** Renames a board that isn't open (the open one is renamed with a command, so it can be undone). */
export async function renameClosedBoard(id: string, title: string) {
  await withBoardDoc(id, (doc) => boardParts(doc).meta.set('title', title));
  recordBoard(id, { title });
}

export async function duplicateBoard(id: string, openDoc: Y.Doc | null): Promise<string> {
  const update = openDoc ? encodeBoard(openDoc) : await withBoardDoc(id, (doc) => encodeBoard(doc));
  const title = openDoc ? readBoard({ doc: openDoc, parts: boardParts(openDoc) }).title : (await listBoards()).find((e) => e.id === id)?.title;
  return boardFromUpdate(update, `${title ?? 'Board'} (copy)`);
}

/** Moves a board to "Recently deleted"; it can be restored for 30 days. */
export function setAside(id: string) {
  recordBoard(id, { deletedAt: Date.now() });
}

export function restore(id: string) {
  const list = readRegistry().map((e) => (e.id === id ? { ...e, deletedAt: undefined } : e));
  writeRegistry(list);
}

/** Removes a board and its saved document for good. */
export async function deleteForever(id: string) {
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(storageKey(id));
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });
  writeRegistry(readRegistry().filter((e) => e.id !== id));
}

/** Clears out boards that have been in "Recently deleted" longer than 30 days. */
export async function purgeOldDeleted() {
  const cutoff = Date.now() - KEEP_DELETED_DAYS * 86_400_000;
  for (const entry of readRegistry()) if (entry.deletedAt && entry.deletedAt < cutoff) await deleteForever(entry.id);
}

async function imagesFor(view: BoardView): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  for (const image of view.images) {
    if (images[image.blobId]) continue;
    const blob = await getBlob(image.blobId);
    if (blob) images[image.blobId] = await blobToDataUrl(blob);
  }
  return images;
}

/** A board file for any board, open or not. */
export async function boardFileFor(id: string, openDoc: Y.Doc | null): Promise<BoardFile> {
  const read = async (doc: Y.Doc) => makeBoardFile(doc, await imagesFor(readBoard({ doc, parts: boardParts(doc) })));
  if (openDoc) return read(openDoc);
  // The document is copied out first, so it isn't held open while pictures load.
  const update = await withBoardDoc(id, (doc) => encodeBoard(doc));
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  try {
    return await read(doc);
  } finally {
    doc.destroy();
  }
}

/** One file holding every board that isn't in "Recently deleted". */
export async function backupFile(openId: string, openDoc: Y.Doc | null): Promise<Blob> {
  const boards = (await listBoards()).filter((e) => !e.deletedAt);
  const files: BoardFile[] = [];
  for (const entry of boards) files.push(await boardFileFor(entry.id, entry.id === openId ? openDoc : null));
  return new Blob([JSON.stringify(makeBackupFile(files))], { type: 'application/json' });
}

/** Adds the boards in a board file or backup as new boards. Returns their ids, in order. */
export async function importBoardFile(file: File): Promise<string[]> {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error(`“${file.name}” isn’t a Writer’s Board file.`);
  }
  const boards = readBoardFiles(json);
  const taken = new Set((await listBoards()).map((e) => e.title));
  const ids: string[] = [];
  for (const board of boards) {
    for (const dataUrl of Object.values(board.images)) await putBlob(await (await fetch(dataUrl)).blob());
    const title = taken.has(board.title) ? `${board.title} (imported)` : board.title;
    taken.add(title);
    ids.push(await boardFromUpdate(board.update, title));
  }
  return ids;
}

/** Asks the browser to keep these boards even when it's short of space. */
export async function protectStorage(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) || ((await navigator.storage?.persist?.()) ?? false);
  } catch {
    return false;
  }
}

export async function storageStatus(): Promise<{ protected: boolean; usedMb: number | null }> {
  try {
    const [persisted, estimate] = await Promise.all([navigator.storage?.persisted?.() ?? false, navigator.storage?.estimate?.()]);
    return { protected: Boolean(persisted), usedMb: estimate?.usage ? Math.round((estimate.usage / 1_048_576) * 10) / 10 : null };
  } catch {
    return { protected: false, usedMb: null };
  }
}
