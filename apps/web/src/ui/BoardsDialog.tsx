// Every board in this browser: open, rename, duplicate, export, or set one
// aside in "Recently deleted" (kept 30 days). Also bringing boards in from
// files, backing them all up, and saving to a folder on this computer.
import { useEffect, useRef, useState } from 'react';
import { BOARD_ID, boardSession, run } from '../state/board';
import {
  KEEP_DELETED_DAYS,
  backupFile,
  boardFileFor,
  createBoard,
  deleteForever,
  duplicateBoard,
  fillMissingStats,
  importBoardFile,
  listBoards,
  openBoard,
  protectStorage,
  renameClosedBoard,
  restore,
  setAside,
  storageStatus,
  type BoardEntry,
} from '../state/boards';
import { chooseFolder, folderSupported, resumeFolder, saveToFolder, stopFolder, useFolder } from '../export/folder';
import { useUi } from '../state/ui';

const slug = (title: string) => (title.trim() || 'board').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').toLowerCase() || 'board';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** "edited 3 min ago", or nothing when the list doesn't know. */
export function ago(at: number): string {
  if (!at) return '';
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return 'edited just now';
  if (minutes < 60) return `edited ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `edited ${hours} h ago`;
  return `edited ${new Date(at).toLocaleDateString()}`;
}

const openDocFor = (id: string) => (id === BOARD_ID ? boardSession().doc : null);

/** Keeps the list in step with changes from this tab (and its board as you edit it). */
export function useBoardList(): BoardEntry[] {
  const [boards, setBoards] = useState<BoardEntry[]>([]);
  useEffect(() => {
    const load = () => void listBoards().then(setBoards);
    load();
    window.addEventListener('writers-board:boards', load);
    return () => window.removeEventListener('writers-board:boards', load);
  }, []);
  return boards;
}

function BoardRow({ entry, onError }: { entry: BoardEntry; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const isOpen = entry.id === BOARD_ID;

  // The name comes from the field itself, so a fast Enter can't beat the typing;
  // Enter saves, and the blur that follows doesn't save a second time.
  const saved = useRef(false);
  const rename = async (value: string) => {
    if (saved.current) return;
    saved.current = true;
    setEditing(false);
    const next = value.trim();
    if (!next || next === entry.title) return setTitle(entry.title);
    if (isOpen) run('board_set_title', { title: next });
    else await renameClosedBoard(entry.id, next).catch((e: Error) => onError(e.message));
  };

  return (
    <li className={`board-row${isOpen ? ' is-open' : ''}`}>
      <div className="board-row-name">
        {editing ? (
          <input
            autoFocus
            value={title}
            aria-label="Board name"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => void rename(e.currentTarget.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') void rename((e.target as HTMLInputElement).value);
              if (e.key === 'Escape') {
                setTitle(entry.title);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            className="board-row-title"
            onClick={() => {
              saved.current = false;
              setEditing(true);
            }}
            title="Rename"
          >
            {entry.title}
          </button>
        )}
        <span className="board-row-meta">
          {isOpen && <strong>Open now · </strong>}
          {[`${entry.cards} cards`, `${entry.words} words`, ago(entry.updatedAt)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="board-row-actions">
        {!isOpen && (
          <button className="primary" onClick={() => openBoard(entry.id)}>
            Open
          </button>
        )}
        <button onClick={() => void duplicateBoard(entry.id, openDocFor(entry.id)).catch((e: Error) => onError(e.message))}>Duplicate</button>
        <button
          onClick={() =>
            void boardFileFor(entry.id, openDocFor(entry.id))
              .then((file) => download(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }), `${slug(file.title)}.writers-board.json`))
              .catch((e: Error) => onError(e.message))
          }
        >
          Export
        </button>
        <button
          onClick={async () => {
            setAside(entry.id);
            if (!isOpen) return;
            // The open board was set aside: go to the next most recent, or start a fresh one.
            const next = (await listBoards()).find((e) => !e.deletedAt && e.id !== entry.id);
            openBoard(next ? next.id : await createBoard());
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

function DeletedRow({ entry }: { entry: BoardEntry }) {
  const [confirming, setConfirming] = useState(false);
  const daysLeft = Math.max(0, KEEP_DELETED_DAYS - Math.floor((Date.now() - (entry.deletedAt ?? 0)) / 86_400_000));
  return (
    <li className="board-row is-deleted">
      <div className="board-row-name">
        <span className="board-row-title">{entry.title}</span>
        <span className="board-row-meta">
          {entry.cards} cards · {entry.words} words · removed for good in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
        </span>
      </div>
      <div className="board-row-actions">
        <button onClick={() => restore(entry.id)}>Restore</button>
        {confirming ? (
          <>
            <button className="danger" onClick={() => void deleteForever(entry.id)}>
              Delete forever
            </button>
            <button onClick={() => setConfirming(false)}>Keep</button>
          </>
        ) : (
          <button onClick={() => setConfirming(true)}>Delete forever…</button>
        )}
      </div>
    </li>
  );
}

export function BoardsDialog() {
  const boards = useBoardList();
  const folder = useFolder();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [storage, setStorage] = useState<{ protected: boolean; usedMb: number | null } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const close = () => useUi.getState().setDialog(null);
  const active = boards.filter((b) => !b.deletedAt);
  const deleted = boards.filter((b) => b.deletedAt);

  useEffect(() => void storageStatus().then(setStorage), [boards]);
  useEffect(() => void fillMissingStats(BOARD_ID), []);

  const act = async (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <section className="dialog wide" role="dialog" aria-modal="true" aria-labelledby="boards-title">
        <h2 id="boards-title">Your boards</h2>
        <p className="dialog-note">
          Boards save themselves in this browser as you work
          {storage?.usedMb !== null && storage?.usedMb !== undefined ? ` (${storage.usedMb} MB so far)` : ''}.{' '}
          {storage?.protected ? (
            'The browser keeps them even when it’s short of space.'
          ) : (
            <>
              A browser short of space may clear them.{' '}
              <button className="link" onClick={() => void protectStorage().then(() => storageStatus().then(setStorage))}>
                Ask it to keep them
              </button>
            </>
          )}
        </p>

        <ul className="board-list">
          {active.map((entry) => (
            <BoardRow key={entry.id} entry={entry} onError={setError} />
          ))}
        </ul>

        {deleted.length > 0 && (
          <details className="board-deleted">
            <summary>Recently deleted ({deleted.length})</summary>
            <ul className="board-list">
              {deleted.map((entry) => (
                <DeletedRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </details>
        )}

        <div className="board-tools">
          <button className="primary" disabled={!!busy} onClick={() => void act('new', async () => openBoard(await createBoard()))}>
            New board
          </button>
          <button disabled={!!busy} onClick={() => fileInput.current?.click()}>
            {busy === 'import' ? 'Importing…' : 'Import a board file…'}
          </button>
          <button
            disabled={!!busy}
            onClick={() => void act('backup', async () => download(await backupFile(BOARD_ID, boardSession().doc), `writers-board-backup-${new Date().toISOString().slice(0, 10)}.json`))}
          >
            {busy === 'backup' ? 'Backing up…' : 'Back up all boards'}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void act('import', async () => {
                const ids = await importBoardFile(file);
                if (ids.length === 1) openBoard(ids[0]!);
              });
            }}
          />
        </div>

        <div className="board-folder">
          <h3>Save to a folder</h3>
          {!folderSupported ? (
            <p className="hint">This browser can’t save to a folder by itself. Use Export or Back up all boards to keep copies on this computer.</p>
          ) : folder.status === 'off' ? (
            <>
              <p className="hint">Keep a copy of each board in a folder on this computer, updated a few seconds after you stop editing.</p>
              <button onClick={() => void chooseFolder().then(async (ok) => { if (ok) await saveToFolder(BOARD_ID, boardSession().doc); })}>Choose a folder…</button>
            </>
          ) : folder.status === 'paused' ? (
            <>
              <p className="hint">Saving to “{folder.name}” is paused until you allow it again (browsers ask after a restart).</p>
              <button onClick={() => void resumeFolder().then(async (ok) => { if (ok) await saveToFolder(BOARD_ID, boardSession().doc); })}>Keep saving to “{folder.name}”</button>
              <button onClick={() => void stopFolder()}>Stop</button>
            </>
          ) : (
            <>
              <p className="hint">
                Saving to “{folder.name}”{folder.lastSavedAt ? ` · last saved ${new Date(folder.lastSavedAt).toLocaleTimeString()}` : ''}.
              </p>
              <button onClick={() => void saveToFolder(BOARD_ID, boardSession().doc)}>Save now</button>
              <button onClick={() => void stopFolder()}>Stop saving there</button>
            </>
          )}
          {folder.error && <p className="dialog-error">{folder.error}</p>}
        </div>

        {error && (
          <p className="dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button onClick={close}>Done</button>
        </div>
      </section>
    </div>
  );
}
