import { describe, expect, it } from 'vitest';
import { createBoard, type Actor } from './model.ts';
import { BoardSession } from '../commands/session.ts';
import type { BoardView } from '../commands/board-commands.ts';
import { loadBoard } from './persist.ts';
import { makeBackupFile, makeBoardFile, readBoardFiles, toBase64 } from './board-file.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };

function board(title: string) {
  const session = new BoardSession(createBoard({ title }));
  session.execute(writer, 'note_create', { x: 0, y: 0, text: `${title} note` });
  return session;
}

describe('board files', () => {
  it('round-trips a board, with its pictures, through a file', () => {
    const session = board('Kettle');
    session.execute(writer, 'board_set_title', { title: 'The Kettle' });
    const file = JSON.parse(JSON.stringify(makeBoardFile(session.doc, { abc: 'data:image/png;base64,AA==' })));
    const [read] = readBoardFiles(file);
    expect(read!.title).toBe('The Kettle');
    expect(read!.images).toEqual({ abc: 'data:image/png;base64,AA==' });
    const restored = new BoardSession(loadBoard(read!.update)).execute<BoardView>(writer, 'board_read');
    expect(restored.notes[0]!.text).toBe('Kettle note');
    expect(restored.title).toBe('The Kettle');
  });

  it('reads every board in a backup', () => {
    const backup = JSON.parse(JSON.stringify(makeBackupFile([makeBoardFile(board('One').doc, {}), makeBoardFile(board('Two').doc, {})])));
    expect(readBoardFiles(backup).map((b) => b.title)).toEqual(['One', 'Two']);
  });

  it('explains files it cannot open', () => {
    expect(() => readBoardFiles({ hello: 'world' })).toThrow('isn’t a Writer’s Board file');
    expect(() => readBoardFiles({ format: 'writers-board', version: 9, title: 'x', document: 'x' })).toThrow('damaged or from a newer version');
    expect(() => readBoardFiles({ format: 'writers-board', version: 1, title: 'Broken', document: toBase64(new Uint8Array([1, 2, 3])) })).toThrow('“Broken” can’t be opened');
  });
});
