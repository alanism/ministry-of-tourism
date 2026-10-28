import { beforeEach, describe, expect, it } from 'vitest';
import { createBoard, type Actor } from '../doc/model.ts';
import type { BoardView } from '../commands/board-commands.ts';
import { BoardSession } from '../commands/session.ts';
import { artFor, estimateCost, framePrompt, framesFromCards, framesFromGuide } from './plan.ts';

const writer: Actor = { kind: 'human', id: 'writer', name: 'Writer' };
let session: BoardSession;
const read = () => session.execute<BoardView>(writer, 'board_read');
const card = (type: string, x: number, y: number, text: string, annotation = '') => {
  const { id } = session.execute<{ id: string }>(writer, 'card_create', { type, x, y });
  session.execute(writer, 'card_set_text', { id, text });
  if (annotation) session.execute(writer, 'card_annotate', { id, annotation });
  return id;
};

beforeEach(() => {
  let n = 0;
  session = new BoardSession(createBoard({ starterCards: false }), { newId: () => `id-${++n}` });
});

describe('storyboard planning', () => {
  it('uses ART lines on the back of a card, or else its text', () => {
    const a = card('nouns.character', 0, 0, 'A night-shift baker', 'Her apron is too big.\nART: wide shot, flour in the lamplight');
    const b = card('nouns.setting', 300, 0, 'The bakery at 4am');
    const board = read();
    expect(artFor(board.cards.find((c) => c.id === a)!)).toBe('wide shot, flour in the lamplight');
    expect(artFor(board.cards.find((c) => c.id === b)!)).toBe('Setting: The bakery at 4am');
  });

  it('makes one frame per guide stop from the cards nearest it, laid under the guide', () => {
    const { id: guideId } = session.execute<{ id: string }>(writer, 'guide_create', { preset: 'picture-book', x: 0, y: 0 });
    card('nouns.character', 0, 60, 'A girl and her kite');
    card('form.tension', 480, 60, 'The wind takes the kite');
    card('form.finale', 1080, 60, 'The kite comes home');
    card('idea.thesis', 500, 2000, 'Far from the guide');
    const frames = framesFromGuide(read(), guideId);
    expect(frames.map((f) => f.caption)).toEqual(['Peaceful start', 'Conflict arrives', 'Happy resolution', 'Last page (write it first)']);
    expect(frames[0]!.art).toContain('A girl and her kite');
    expect(frames[1]!.art).toContain('The wind takes the kite');
    expect(frames[3]!.art).toContain('The kite comes home');
    expect(frames.flatMap((f) => f.art)).not.toContain('Far from the guide');
    // Prints sit below the guide and cover nothing: not the cards, not a note, not each other.
    session.execute(writer, 'note_create', { x: 400, y: 400, text: 'In the way' });
    const board = read();
    const placed = framesFromGuide(board, guideId);
    const rects = [
      ...board.cards.map((c) => ({ x: c.x, y: c.y, width: 240, height: 144 })),
      ...board.notes.map((n) => ({ x: n.x, y: n.y, width: 144, height: 144 })),
    ];
    const hit = (p: { x: number; y: number; width: number; height: number }, q: typeof p) =>
      p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;
    for (const [i, f] of placed.entries()) {
      expect(f.y).toBeGreaterThan(0);
      for (const r of rects) expect(hit(f, r)).toBe(false);
      for (const g of placed.slice(i + 1)) expect(hit(f, g)).toBe(false);
    }
    // Along a flat guide the prints keep to one row.
    expect(new Set(placed.map((f) => f.y)).size).toBe(1);
  });

  it('makes one frame per selected card in reading order, below the cards', () => {
    const b = card('form.tension', 600, 0, 'Second');
    const a = card('nouns.character', 0, 100, 'First');
    const frames = framesFromCards(read(), [b, a], '16:9');
    expect(frames.map((f) => f.caption)).toEqual(['First', 'Second']);
    expect(frames[0]!.y).toBeGreaterThan(100);
    expect(frames[0]!.height).toBe(135);
  });

  it('writes sketch and color prompts without text in the picture', () => {
    const sketch = framePrompt({ art: 'a kite over the harbor', caption: 'Start' }, { stage: 'sketch', faceForward: true });
    expect(sketch).toMatch(/black pencil/);
    expect(sketch).toMatch(/toward the right/);
    expect(sketch).toMatch(/No words/);
    const color = framePrompt({ art: 'a kite over the harbor', caption: 'Start' }, { stage: 'color', fromSketch: true, style: 'gouache' });
    expect(color).toMatch(/keep its composition/);
    expect(color).toMatch(/Look: gouache/);
    expect(estimateCost(4, 0.04)).toBe('4 images × $0.040 ≈ $0.16');
  });

  it('keeps art direction and stage on placed frames, and swaps in a colored version', () => {
    const sketchHash = 'a'.repeat(64);
    const colorHash = 'b'.repeat(64);
    const { id } = session.execute<{ id: string }>(writer, 'image_place', {
      blobId: sketchHash, x: 0, y: 0, width: 240, height: 180, frame: 'print', caption: 'Start', art: 'a kite', stage: 'sketch',
    });
    session.execute(writer, 'image_update', { id, blobId: colorHash, stage: 'color' });
    expect(read().images[0]).toMatchObject({ blobId: colorHash, stage: 'color', art: 'a kite' });
    session.undo('writer');
    expect(read().images[0]).toMatchObject({ blobId: sketchHash, stage: 'sketch' });
  });
});
