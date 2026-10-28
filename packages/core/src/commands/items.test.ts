import { beforeEach, describe, expect, it } from 'vitest';
import { createBoard, type Actor } from '../doc/model.ts';
import { encodeBoard, loadBoard } from '../doc/persist.ts';
import { GUIDE_PRESETS } from '../guides/presets.ts';
import { nearestOnPath, pointAt, samplePath } from '../guides/geometry.ts';
import type { BoardView } from './board-commands.ts';
import { CommandError } from './define.ts';
import { BoardSession } from './session.ts';
import { makeBoardFile, readBoardFiles } from '../doc/board-file.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
const agent: Actor = { kind: 'agent', id: 'agent:x', name: 'Agent' };
const HASH = 'a'.repeat(64);

let session: BoardSession;
const read = () => session.execute<BoardView>(writer, 'board_read');
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as CommandError).code;
  }
  return 'ok';
};

beforeEach(() => {
  let n = 0;
  session = new BoardSession(createBoard({ starterCards: false }), { newId: () => `id-${++n}` });
});

describe('sticky notes, images, ink and yarn', () => {
  it('keeps artwork stickers and their source through save, import and undo', () => {
    const artwork = { assetId: 'fcc:bangkok:cafe-woman', styleId: 'fcc-editorial', sourceUrl: 'https://example.com/person.webp', sourceHash: HASH };
    session.execute(writer, 'image_place', { blobId: HASH, x: 20, y: 30, width: 120, height: 300, frame: 'sticker', caption: 'Café woman', artwork });
    expect(read().images[0]).toMatchObject({ frame: 'sticker', artwork });
    const [file] = readBoardFiles(makeBoardFile(session.doc, { [HASH]: 'data:image/png;base64,YQ==' }));
    const restored = new BoardSession(loadBoard(file!.update));
    expect(restored.execute<BoardView>(writer, 'board_read').images[0]).toMatchObject({ frame: 'sticker', artwork });
    session.undo(writer.id);
    expect(read().images).toHaveLength(0);
    session.redo(writer.id);
    expect(read().images[0]).toMatchObject({ frame: 'sticker', artwork });
    const image = read().images[0]!;
    session.execute(writer, 'image_update', { id: image.id, frame: 'print' });
    session.execute(writer, 'image_update', { id: image.id, frame: 'sticker' });
    expect(read().images[0]?.frame).toBe('sticker');
  });

  it('adds, changes and undoes each kind of item', () => {
    const note = session.execute<{ id: string }>(writer, 'note_create', { x: 10, y: 20, text: 'Ask Gran about the mug' });
    session.execute(writer, 'note_update', { id: note.id, color: '#cdeffd', x: 40 }); // a pre-brand color, taken as Blush Mist
    const image = session.execute<{ id: string }>(writer, 'image_place', { blobId: HASH, x: 300, y: 0, width: 240, height: 180 });
    const stroke = session.execute<{ id: string }>(writer, 'stroke_add', { points: [0, 0, 10, 12, 30, 15] });
    session.execute(writer, 'connection_create', { from: note.id, to: image.id });

    const board = read();
    expect(board.notes[0]).toMatchObject({ text: 'Ask Gran about the mug', color: '#F9EDEB', x: 40, y: 20 });
    expect(board.images[0]).toMatchObject({ blobId: HASH, frame: 'polaroid', width: 240 });
    expect(board.strokes[0]?.points).toHaveLength(6);
    expect(board.connections[0]).toMatchObject({ from: note.id, to: image.id, style: 'yarn' });

    session.execute(writer, 'stroke_delete', { id: stroke.id });
    expect(read().strokes).toHaveLength(0);
    session.undo(writer.id);
    expect(read().strokes).toHaveLength(1);
  });

  it('cuts yarn when either end is removed', () => {
    const note = session.execute<{ id: string }>(writer, 'note_create', { x: 0, y: 0 });
    const card = session.execute<{ id: string }>(writer, 'card_create', { type: 'nouns.object', x: 300, y: 0 });
    session.execute(writer, 'connection_create', { from: note.id, to: card.id, style: 'arrow' });
    session.execute(writer, 'card_delete', { id: card.id });
    expect(read().connections).toHaveLength(0);
    session.undo(writer.id);
    expect(read().connections).toHaveLength(1);
  });

  it('refuses bad input', () => {
    expect(code(() => session.execute(writer, 'connection_create', { from: 'a', to: 'b' }))).toBe('not_found');
    expect(code(() => session.execute(writer, 'stroke_add', { points: [1, 2, 3] }))).toBe('invalid_input');
    expect(code(() => session.execute(writer, 'image_place', { blobId: 'nothex', x: 0, y: 0, width: 1, height: 1 }))).toBe('invalid_input');
  });
});

describe('guides', () => {
  it('places every preset where it is asked, visible and unlocked', () => {
    for (const preset of GUIDE_PRESETS) {
      const { id } = session.execute<{ id: string }>(writer, 'guide_create', { preset: preset.id, x: 100, y: 500 });
      const guide = read().guides.find((g) => g.id === id)!;
      expect(guide).toMatchObject({ preset: preset.id, title: preset.title, visible: true, locked: false });
      expect(Math.min(...guide.points.map((p) => p[0]))).toBe(100);
      expect(Math.min(...guide.points.map((p) => p[1]))).toBe(500);
      expect(guide.stops).toHaveLength(preset.stops.length);
    }
  });

  it('stretches, bends, relabels, hides and locks', () => {
    const { id } = session.execute<{ id: string }>(writer, 'guide_create', { preset: 'timeline', x: 0, y: 0 });
    const guide = () => read().guides.find((g) => g.id === id)!;
    session.execute(writer, 'guide_update', { id, points: [[0, 0], [700, -120], [1400, 0]] });
    expect(guide().points).toEqual([[0, 0], [700, -120], [1400, 0]]);
    const stops = guide().stops.map((s, i) => (i === 0 ? { ...s, label: 'Burnt toast' } : s));
    session.execute(writer, 'guide_update', { id, stops, title: 'Morning' });
    expect(guide()).toMatchObject({ title: 'Morning' });
    expect(guide().stops[0]?.label).toBe('Burnt toast');

    session.execute(writer, 'guide_update', { id, locked: true });
    expect(code(() => session.execute(writer, 'guide_update', { id, points: [[0, 0], [10, 0]] }))).toBe('invalid_input');
    session.execute(writer, 'guide_update', { id, visible: false });
    expect(guide()).toMatchObject({ visible: false, locked: true });

    session.execute(writer, 'guides_set_visible', { visible: true });
    expect(guide().visible).toBe(true);
  });

  it('lets agents add guides too, and survives save and load', () => {
    session.execute(agent, 'guide_create', { preset: 'novelty-importance', x: 0, y: 0 });
    expect(code(() => session.execute(agent, 'guide_create', { preset: 'nope', x: 0, y: 0 }))).toBe('invalid_input');
    const reloaded = new BoardSession(loadBoard(encodeBoard(session.doc)));
    expect(reloaded.execute<BoardView>(writer, 'board_read').guides[0]).toMatchObject({ kind: 'quadrant', axes: ['Novelty', 'Importance'] });
  });
});

describe('guide geometry', () => {
  it('runs a straight path end to end and finds the nearest point', () => {
    const samples = samplePath([[0, 0], [100, 0]]);
    expect(pointAt(samples, 0.5).point).toEqual([50, 0]);
    const near = nearestOnPath(samples, [30, 12]);
    expect(near.point).toEqual([30, 0]);
    expect(near.distance).toBe(12);
    expect(near.t).toBeCloseTo(0.3);
  });

  it('passes a curve through every control point', () => {
    const points: [number, number][] = [[0, 0], [100, -50], [200, 0]];
    const samples = samplePath(points);
    for (const p of points) expect(nearestOnPath(samples, p).distance).toBeLessThan(0.001);
  });
});
