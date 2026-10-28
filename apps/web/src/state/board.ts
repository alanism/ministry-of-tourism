// Opens the writer's board from browser storage (IndexedDB) and keeps a React
// snapshot of it. Every change goes through the core BoardSession, so the UI,
// keyboard, and agents share one set of commands and one undo history per actor.
import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { BoardSession, FRAMEWORK_CARDS, boardParts, initializeBoard, readBoard, type Actor, type BoardView } from '@writers-board/core';
import { installAgentApi } from './agentApi';
import { countWords, currentBoardId, purgeOldDeleted, recordBoard, storageKey } from './boards';
import { restoreFolder, watchForFolderSave } from '../export/folder';

export const WRITER: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
// Which of the writer's boards this page shows (`?board=id`, or the last one opened).
export const BOARD_ID = currentBoardId();
const BOARD_STORAGE_KEY = storageKey(BOARD_ID);

export interface OpenBoard {
  session: BoardSession;
  view: BoardView;
}

let current: BoardSession | null = null;
let latest: BoardView | null = null;

/** The most recent snapshot of the board, for event handlers outside React. */
export function latestBoard(): BoardView | null {
  return latest;
}

/** The open board's session, for event handlers outside React. */
export function boardSession(): BoardSession {
  if (!current) throw new Error('Board is not open yet');
  return current;
}

/** Runs a command as the writer. Errors are shown, never thrown into React. */
export function run<O = unknown>(name: string, input: unknown = {}): O | undefined {
  try {
    return boardSession().execute<O>(WRITER, name, input);
  } catch (error) {
    console.warn(`[writers-board] ${name} failed:`, error);
    return undefined;
  }
}

export function useBoard(): OpenBoard | null {
  const [open, setOpen] = useState<OpenBoard | null>(null);

  useEffect(() => {
    const doc = new Y.Doc();
    const storage = new IndexeddbPersistence(BOARD_STORAGE_KEY, doc);
    const parts = boardParts(doc);
    let session: BoardSession | null = null;
    let disposed = false;
    let stopFolderWatch = () => {};

    // The board list keeps each board's name and size, and when it was last edited.
    let listTimer: ReturnType<typeof setTimeout> | undefined;
    const updateList = (edited: boolean) => {
      clearTimeout(listTimer);
      listTimer = setTimeout(() => {
        if (!latest) return;
        recordBoard(BOARD_ID, { title: latest.title, cards: latest.cards.length, words: countWords(latest.manuscript), ...(edited ? { updatedAt: Date.now() } : {}) });
      }, edited ? 800 : 0);
    };
    const refresh = (edited = true) => {
      if (!session) return;
      latest = readBoard({ doc, parts });
      setOpen({ session, view: latest });
      updateList(edited);
    };
    const onUpdate = () => refresh(true);

    storage.whenSynced.then(() => {
      if (disposed) return;
      initializeBoard(doc, { title: 'My board' });
      session = new BoardSession(doc);
      if (import.meta.env.DEV && BOARD_ID !== 'default') seedForTesting(session);
      current = session;
      installAgentApi(session);
      doc.on('update', onUpdate);
      recordBoard(BOARD_ID, { openedAt: Date.now() });
      try {
        localStorage.setItem('writers-board:last-board', BOARD_ID);
      } catch {
        // Remembering the last board is a convenience.
      }
      refresh(false);
      void purgeOldDeleted();
      void restoreFolder();
      stopFolderWatch = watchForFolderSave(BOARD_ID, doc);
    });

    return () => {
      disposed = true;
      clearTimeout(listTimer);
      stopFolderWatch();
      doc.off('update', onUpdate);
      session?.destroy();
      if (current === session) current = null;
      void storage.destroy();
      doc.destroy();
    };
  }, []);

  return open;
}

/** Development only: `?board=perf&seed=1000` fills an empty test board with that many written cards. */
function seedForTesting(session: BoardSession) {
  const count = Math.min(5000, Number(new URLSearchParams(location.search).get('seed')) || 0);
  if (!count || session.execute<BoardView>(WRITER, 'board_read').cards.length > 20) return; // only the starter cards so far
  const types = FRAMEWORK_CARDS.map((c) => c.id);
  session.beginRun(WRITER);
  for (let i = 0; i < count; i++) {
    const { id } = session.execute<{ id: string }>(WRITER, 'card_create', { type: types[i % types.length]!, x: (i % 40) * 280, y: Math.floor(i / 40) * 190 });
    session.execute(WRITER, 'card_set_text', { id, text: `Card ${i + 1}: the kettle sang before dawn and nobody moved.` });
  }
  session.endRun(WRITER);
}
