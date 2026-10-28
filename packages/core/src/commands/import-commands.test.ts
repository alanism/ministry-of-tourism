import { describe, expect, it } from 'vitest';
import { boardParts, createBoard, type Actor } from '../doc/model.ts';
import { makeBackupFile, makeBoardFile } from '../doc/board-file.ts';
import type { BoardView } from './board-commands.ts';
import { BoardSession } from './session.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
const dot: Actor = { kind: 'agent', id: 'agent:dot', name: 'Dot' };

type Imported = {
  title: string;
  added: { cards: number; notes: number; sources: number; connections: number; guides: number; strokes: number; quoteLinks: number; draft: boolean };
  skipped: { pictures: number; quoteLinks: number; connections: number; guides: number; draft: string };
  placedBelowBy: number;
};

let counter = 0;
const fresh = (title = 'Board') => new BoardSession(createBoard({ starterCards: false, title }), { newId: () => `id-${++counter}` });
const read = (s: BoardSession) => s.execute<BoardView>(writer, 'board_read');

/** A board with one of everything the import carries. */
function savedBoard() {
  const s = fresh('Kettle');
  s.execute(writer, 'manuscript_insert', { index: 0, text: 'The kettle sang before dawn.' });
  const thesis = s.execute<{ id: string }>(writer, 'card_create', { type: 'idea.thesis', x: 100, y: 200 });
  s.execute(writer, 'card_set_text', { id: thesis.id, text: 'Gran never said sorry.' });
  s.execute(writer, 'card_annotate', { id: thesis.id, annotation: 'The whole essay turns on this.' });
  s.execute(writer, 'card_score', { id: thesis.id, score: 4, note: 'Clear and earned.' });
  const source = s.execute<{ id: string }>(writer, 'source_add', { title: 'The Mug', author: 'Ann', text: 'My grandmother kept a chipped blue mug by the stove.' });
  const quoted = s.execute<{ cardId: string }>(writer, 'card_create_from_quote', { type: 'nouns.object', sourceId: source.id, quote: 'chipped blue mug', annotation: 'A small thing that holds a life.', x: 400, y: 200 });
  const note = s.execute<{ id: string }>(writer, 'note_create', { x: 700, y: 220, text: 'Ask about the mug', color: '#E8A3B4' });
  s.execute(writer, 'connection_create', { from: thesis.id, to: note.id, style: 'yarn' });
  s.execute(writer, 'connection_create', { from: quoted.cardId, to: thesis.id, style: 'arrow' });
  s.execute(writer, 'stroke_add', { points: [10, 10, 60, 90, 120, 40], color: '#000000', width: 3 });
  s.execute(writer, 'guide_create', { preset: 'timeline', x: 50, y: 600 });
  return s;
}

const exported = (s: BoardSession) => makeBoardFile(s.doc, {});

describe('board_import', () => {
  it.each(['annotation', 'score', 'connection'] as const)('rejects a damaged %s before importing anything', field => {
    const source = savedBoard(), parts = boardParts(source.doc);
    if (field === 'connection') parts.connections.values().next().value!.set('style', 'invalid');
    else parts.cards.values().next().value!.set(field, field === 'annotation' ? 'x'.repeat(2001) : { value: 9, note: '' });
    const target = fresh(), before = JSON.stringify(read(target));
    expect(() => target.execute(writer, 'board_import', { file: exported(source) })).toThrow();
    expect(JSON.stringify(read(target))).toBe(before);
    expect(target.canUndo(writer.id)).toBe(false);
  });

  it('does not leave a partial guide when a guide in the file is skipped', () => {
    const source = savedBoard();
    boardParts(source.doc).guides.values().next().value!.set('title', 'x'.repeat(121));
    const target = fresh();
    const result = target.execute<Imported>(writer, 'board_import', { file: exported(source) });
    expect(result.skipped.guides).toBe(1);
    expect(read(target).guides).toHaveLength(0);
  });

  it('brings a saved board back onto an empty board, link by link', () => {
    const target = fresh('Agent’s board');
    const out = target.execute<Imported>(dot, 'board_import', { file: JSON.parse(JSON.stringify(exported(savedBoard()))) });
    expect(out.added).toMatchObject({ cards: 2, notes: 1, sources: 1, connections: 2, guides: 1, strokes: 1, quoteLinks: 1, draft: true });
    expect(out.skipped).toMatchObject({ pictures: 0, quoteLinks: 0, connections: 0, guides: 0, draft: '' });

    const board = read(target);
    expect(board.title).toBe('Agent’s board'); // its own title is kept
    expect(board.manuscript).toBe('The kettle sang before dawn.');
    const thesis = board.cards.find((c) => c.type === 'idea.thesis')!;
    expect(thesis).toMatchObject({ text: 'Gran never said sorry.', annotation: 'The whole essay turns on this.', createdBy: 'agent:dot' });
    expect(thesis.score).toMatchObject({ value: 4, note: 'Clear and earned.' });
    const quoted = board.cards.find((c) => c.type === 'nouns.object')!;
    expect(quoted.links).toHaveLength(1);
    expect(quoted.links[0]).toMatchObject({ quote: 'chipped blue mug', status: 'intact', current: 'chipped blue mug' });
    expect(board.sources[0]).toMatchObject({ title: 'The Mug', author: 'Ann' });
    expect(board.notes[0]).toMatchObject({ text: 'Ask about the mug', color: '#E8A3B4' });
    expect(board.connections.map((c) => c.style).sort()).toEqual(['arrow', 'yarn']);
    expect(board.strokes).toHaveLength(1);
    expect(board.guides[0]!.preset).toBe('timeline');
  });

  it('accepts the file as JSON text, and undoes as one step', () => {
    const target = fresh();
    target.execute(dot, 'board_import', { file: JSON.stringify(exported(savedBoard())) });
    expect(read(target).cards).toHaveLength(2);
    expect(target.undo(dot.id)).toBe(true);
    const after = read(target);
    expect([after.cards.length, after.notes.length, after.sources.length, after.guides.length, after.manuscript]).toEqual([0, 0, 0, 0, '']);
  });

  it('never overwrites: it adds below what is already there and keeps the board’s own draft', () => {
    const target = fresh('Mine');
    target.execute(writer, 'manuscript_insert', { index: 0, text: 'My own draft.' });
    const own = target.execute<{ id: string }>(writer, 'card_create', { type: 'form.hook', x: 0, y: 1000 });
    const out = target.execute<Imported>(writer, 'board_import', { file: exported(savedBoard()) });
    const board = read(target);
    expect(board.manuscript).toBe('My own draft.');
    expect(out.skipped.draft).toContain('already has a draft');
    expect(board.cards.find((c) => c.id === own.id)).toMatchObject({ x: 0, y: 1000 });
    const mine = board.cards.find((c) => c.id === own.id)!;
    const imported = board.cards.filter((c) => c.id !== own.id);
    expect(out.placedBelowBy).toBeGreaterThan(0);
    for (const c of imported) expect(c.y).toBeGreaterThan(mine.y + 144);
  });

  it('keeps the writer’s words safe from agents, unless the board is empty or Draft for me is on', () => {
    const file = exported(savedBoard());
    const written = fresh();
    written.execute(writer, 'note_create', { x: 0, y: 0, text: 'The writer was here first.' });
    const before = JSON.stringify(read(written));
    expect(() => written.execute(dot, 'board_import', { file })).toThrow(/Coach mode/);
    expect(JSON.stringify(read(written))).toBe(before); // refused cleanly: nothing was added
    written.execute(writer, 'settings_set_draft_for_me', { enabled: true });
    expect(written.execute<Imported>(dot, 'board_import', { file }).added.cards).toBe(2);
    expect(() => fresh().execute(dot, 'board_import', { file })).not.toThrow();
    expect(fresh().execute<Imported>(writer, 'board_import', { file }).added.cards).toBe(2);
  });

  it('works only as a write: Solo mode refuses it', () => {
    const solo = fresh();
    solo.execute(writer, 'settings_set_agent_mode', { mode: 'solo' });
    expect(() => solo.execute(dot, 'board_import', { file: exported(savedBoard()) })).toThrow(/Solo mode/);
  });

  it('reuses a source the board already has word for word', () => {
    const target = fresh();
    const file = exported(savedBoard());
    target.execute(writer, 'source_add', { title: 'The Mug', author: 'Ann', text: 'My grandmother kept a chipped blue mug by the stove.' });
    const out = target.execute<Imported>(writer, 'board_import', { file });
    expect(out.added.sources).toBe(0);
    expect(read(target).sources).toHaveLength(1);
    expect(read(target).cards.find((c) => c.type === 'nouns.object')!.links).toHaveLength(1);
  });

  it('counts the pictures it leaves out', () => {
    const s = savedBoard();
    s.execute(writer, 'image_place', { blobId: 'a'.repeat(64), x: 0, y: 0, width: 200, height: 150 });
    const out = fresh().execute<Imported>(writer, 'board_import', { file: exported(s) });
    expect(out.skipped.pictures).toBe(1);
    expect(read(fresh()).images).toHaveLength(0);
  });

  it('explains files it cannot use, and changes nothing', () => {
    const target = fresh();
    const before = JSON.stringify(read(target));
    expect(() => target.execute(writer, 'board_import', { file: 'not json at all' })).toThrow('isn’t valid JSON');
    expect(() => target.execute(writer, 'board_import', { file: { hello: 'world' } })).toThrow('isn’t a Writer’s Board file');
    const backup = makeBackupFile([exported(savedBoard()), exported(fresh('Two'))]);
    expect(() => target.execute(writer, 'board_import', { file: JSON.parse(JSON.stringify(backup)) })).toThrow(/backup of 2 boards/);
    expect(JSON.stringify(read(target))).toBe(before);
  });
});
