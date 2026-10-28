// Saving to a folder on this computer: pick a folder once, and each board is
// written there as its own board file a few seconds after you stop editing.
// Browsers without folder access (Firefox, Safari) use Export and Back up instead.
import { create } from 'zustand';
import type * as Y from 'yjs';
import { boardFileFor } from '../state/boards';

type DirectoryHandle = FileSystemDirectoryHandle & {
  queryPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'readwrite' }): Promise<PermissionState>;
};

export const folderSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

interface FolderState {
  /** The folder's name when one is chosen. */
  name: string | null;
  /** 'saving' to the folder, 'paused' until you allow it again (after a restart), or 'off'. */
  status: 'off' | 'saving' | 'paused';
  lastSavedAt: number | null;
  error: string;
}

export const useFolder = create<FolderState>(() => ({ name: null, status: 'off', lastSavedAt: null, error: '' }));

// The chosen folder is remembered in IndexedDB (a folder handle can't go in localStorage).
const DB = 'writers-board-settings';
function settings<T>(mode: IDBTransactionMode, use: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const request = use(open.result.transaction('kv', mode).objectStore('kv'));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    };
  });
}

let folder: DirectoryHandle | null = null;
const slug = (title: string) => (title.trim() || 'board').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'board';

/** Picks up a folder chosen in an earlier visit. */
export async function restoreFolder() {
  if (!folderSupported) return;
  try {
    const saved = (await settings<DirectoryHandle | undefined>('readonly', (s) => s.get('folder') as IDBRequest<DirectoryHandle | undefined>)) ?? null;
    if (!saved) return;
    folder = saved;
    const permission = await saved.queryPermission({ mode: 'readwrite' });
    useFolder.setState({ name: saved.name, status: permission === 'granted' ? 'saving' : 'paused' });
  } catch {
    // No saved folder.
  }
}

/** Asks for a folder (needs a click). */
export async function chooseFolder(): Promise<boolean> {
  try {
    const picked = (await (window as unknown as { showDirectoryPicker(o: object): Promise<DirectoryHandle> }).showDirectoryPicker({ id: 'writers-board', mode: 'readwrite' })) as DirectoryHandle;
    folder = picked;
    await settings('readwrite', (s) => s.put(picked, 'folder'));
    useFolder.setState({ name: picked.name, status: 'saving', error: '' });
    return true;
  } catch (error) {
    if ((error as Error).name !== 'AbortError') useFolder.setState({ error: (error as Error).message });
    return false;
  }
}

/** After a restart, the browser asks once more before writing to the folder (needs a click). */
export async function resumeFolder(): Promise<boolean> {
  if (!folder) return false;
  const permission = await folder.requestPermission({ mode: 'readwrite' });
  useFolder.setState({ status: permission === 'granted' ? 'saving' : 'paused' });
  return permission === 'granted';
}

export async function stopFolder() {
  folder = null;
  await settings('readwrite', (s) => s.delete('folder')).catch(() => undefined);
  useFolder.setState({ name: null, status: 'off', lastSavedAt: null, error: '' });
}

const written = new Map<string, string>();

/** Writes one board's file into the folder, replacing its last copy (renames included). */
export async function saveToFolder(id: string, doc: Y.Doc | null) {
  if (!folder || useFolder.getState().status !== 'saving') return;
  try {
    const file = await boardFileFor(id, doc);
    const name = `${slug(file.title)}--${id}.writers-board.json`;
    const handle = await folder.getFileHandle(name, { create: true });
    const stream = await handle.createWritable();
    await stream.write(JSON.stringify(file));
    await stream.close();
    const before = written.get(id);
    if (before && before !== name) await folder.removeEntry(before).catch(() => undefined);
    written.set(id, name);
    useFolder.setState({ lastSavedAt: Date.now(), error: '' });
  } catch (error) {
    useFolder.setState({ error: `Couldn’t save to the folder: ${(error as Error).message}` });
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Saves a few seconds after editing stops, and right away when the page is hidden. */
export function watchForFolderSave(id: string, doc: Y.Doc): () => void {
  const soon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void saveToFolder(id, doc), 4000);
  };
  const now = () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer);
      void saveToFolder(id, doc);
    }
  };
  doc.on('update', soon);
  document.addEventListener('visibilitychange', now);
  return () => {
    clearTimeout(timer);
    doc.off('update', soon);
    document.removeEventListener('visibilitychange', now);
  };
}
